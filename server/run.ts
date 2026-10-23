import { Router, type Response } from 'express';
import type { Answer, Chat, ChatMessage, FileRec, RunRequest, StreamEvent } from '../shared/types';
import { db, newId, now, save } from './store';
import { SYSTEM_BASE, cardPrompt, chatContextParts, toolPrompt } from './prompts';
import { claudeCode } from './ai/claudeCode';
import { nvidia } from './ai/nvidia';
import { ProviderError, type Part, type Provider, type Turn } from './ai/types';

export const runRouter = Router();

const currentProvider = (): Provider => (db.settings.provider === 'nvidia' ? nvidia : claudeCode);

/** Arquivos ligados (e ativos) de um cartão, respeitando o interruptor global de cada arquivo. */
function activeFilesOf(cardId: string): FileRec[] {
  const ids = new Set(db.links.filter((l) => l.cardId === cardId && l.active).map((l) => l.fileId));
  return db.files.filter((f) => ids.has(f.id) && f.enabled);
}

function openStream(res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Comentário SSE periódico: o Claude Code pode passar vários segundos lendo um PDF sem emitir texto.
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  const controller = new AbortController();
  let ended = false;
  res.on('close', () => {
    clearInterval(ping);
    if (!ended) controller.abort();
  });
  return {
    signal: controller.signal,
    send: (e: StreamEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`),
    end: () => {
      ended = true;
      clearInterval(ping);
      res.end();
    },
  };
}

runRouter.post('/run', async (req, res) => {
  const body = req.body as RunRequest;
  const stream = openStream(res);
  const provider = currentProvider();
  const emit = stream.send;

  try {
    if (body.kind === 'card') {
      const card = db.cards.find((c) => c.id === body.cardId);
      if (!card) throw new ProviderError('Cartão não encontrado.');
      const files = activeFilesOf(card.id);
      if (files.length === 0 && card.type === 'geral') throw new ProviderError('Este cartão é "geral" mas não tem nenhum arquivo ativo vinculado.');
      if (!card.body.trim() && card.type !== 'geral') throw new ProviderError('O cartão está vazio. Escreva a pergunta ou o texto primeiro.');

      const text = await provider.run({ system: SYSTEM_BASE, turns: [{ role: 'user', parts: cardPrompt(card, files) }], signal: stream.signal, emit });
      const answer: Answer = { id: newId(), createdAt: now(), provider: provider.label(), text, fileIds: files.map((f) => f.id) };
      card.answers.push(answer);
      save();
      emit({ type: 'done', text, answer });
    } else if (body.kind === 'tool') {
      const files = db.files.filter((f) => body.fileIds.includes(f.id));
      if (files.length === 0 && !body.text?.trim()) throw new ProviderError('Escolha pelo menos um arquivo ou escreva o conteúdo no campo de texto.');
      const parts = toolPrompt(body.tool, files, body.text ?? '', body.options ?? {});
      const text = await provider.run({ system: SYSTEM_BASE, turns: [{ role: 'user', parts }], signal: stream.signal, emit });
      emit({ type: 'done', text });
    } else if (body.kind === 'chat') {
      const chat = db.chats.find((c) => c.id === body.chatId);
      if (!chat) throw new ProviderError('Conversa não encontrada.');
      if (!body.message?.trim()) throw new ProviderError('Mensagem vazia.');
      await runChat(chat, body.message.trim(), provider, stream.signal, emit);
    }
  } catch (err) {
    const message = err instanceof ProviderError ? err.message : `Erro inesperado: ${(err as Error).message}`;
    if (!(err instanceof ProviderError)) console.error(err);
    emit({ type: 'error', message });
  } finally {
    stream.end();
  }
});

async function runChat(chat: Chat, message: string, provider: Provider, signal: AbortSignal, emit: (e: StreamEvent) => void) {
  const userMsg: ChatMessage = { id: newId(), role: 'user', text: message, createdAt: now() };
  chat.messages.push(userMsg);
  if (chat.title === 'Nova conversa') chat.title = message.length > 60 ? `${message.slice(0, 57)}…` : message;
  chat.updatedAt = now();
  save();

  // Contexto = cartões escolhidos (texto + última resposta + seus arquivos ativos) + arquivos avulsos.
  const cards = db.cards.filter((c) => chat.context.cardIds.includes(c.id));
  const fileIds = new Set([...cards.flatMap((c) => activeFilesOf(c.id).map((f) => f.id)), ...chat.context.fileIds]);
  const files = db.files.filter((f) => fileIds.has(f.id) && f.enabled);
  const hasContext = cards.length > 0 || files.length > 0;

  const history = chat.messages.filter((m) => !m.error);
  const turns: Turn[] = history.map((m, i) => {
    const parts: Part[] = [{ type: 'text', text: m.text }];
    if (i === 0 && hasContext) parts.unshift(...chatContextParts(cards, files), { type: 'text', text: '\n---\n# Mensagem da pessoa\n' });
    return { role: m.role, parts };
  });

  // Enquanto o contexto não muda, a sessão do Claude Code é retomada e só a nova mensagem é enviada.
  const contextKey = JSON.stringify([
    cards.map((c) => `${c.id}:${c.answers.at(-1)?.id ?? ''}`).sort(),
    files.map((f) => `${f.id}:${f.text?.length ?? 0}`).sort(),
  ]);
  const canResume = provider === claudeCode && chat.claudeSessionId && chat.claudeContextKey === contextKey && history.length > 1;

  let text: string;
  if (provider === claudeCode) {
    const fresh = async () => {
      const id = newId();
      const t = await provider.run({ system: SYSTEM_BASE, turns, signal, emit, session: { id, resume: false } });
      chat.claudeSessionId = id;
      chat.claudeContextKey = contextKey;
      return t;
    };
    if (canResume) {
      try {
        text = await provider.run({ system: SYSTEM_BASE, turns, signal, emit, session: { id: chat.claudeSessionId!, resume: true } });
      } catch (err) {
        // Sessão apagada ou corrompida no disco: recomeça enviando a conversa inteira.
        if (signal.aborted) throw err;
        emit({ type: 'status', text: 'Sessão anterior indisponível; reenviando a conversa…' });
        text = await fresh();
      }
    } else {
      text = await fresh();
    }
  } else {
    text = await provider.run({ system: SYSTEM_BASE, turns, signal, emit });
  }

  const reply: ChatMessage = { id: newId(), role: 'assistant', text, createdAt: now(), provider: provider.label() };
  chat.messages.push(reply);
  chat.updatedAt = now();
  save();
  emit({ type: 'done', text, message: reply });
}
