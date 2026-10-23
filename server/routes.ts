import { Router } from 'express';
import type { AppState, Card, CardType, Chat, ChatContext, ProviderStatus, Settings } from '../shared/types';
import { db, newId, now, nvidiaKey, publicSettings, save, summarizeFile } from './store';
import { claudeCodeVersion } from './ai/claudeCode';
import { listNvidiaModels } from './ai/nvidia';

export const apiRouter = Router();

apiRouter.get('/state', (_req, res) => {
  const state: AppState = {
    files: db.files.map(summarizeFile),
    cards: db.cards,
    links: db.links,
    chats: db.chats,
    settings: publicSettings(),
  };
  res.json(state);
});

// ---------- Cartões ----------

const CARD_TYPES: CardType[] = ['pergunta', 'texto', 'geral'];
const findCard = (id: string) => db.cards.find((c) => c.id === id);

apiRouter.post('/cards', (req, res) => {
  const { type, body, fileIds } = req.body as { type?: CardType; body?: string; fileIds?: string[] };
  const card: Card = {
    id: newId(),
    type: CARD_TYPES.includes(type!) ? type! : 'pergunta',
    body: body ?? '',
    createdAt: now(),
    answers: [],
  };
  db.cards.unshift(card);
  for (const fileId of fileIds ?? []) {
    if (db.files.some((f) => f.id === fileId)) db.links.push({ fileId, cardId: card.id, active: true });
  }
  save();
  res.json(card);
});

apiRouter.patch('/cards/:id', (req, res) => {
  const card = findCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado.' });
  const { type, body } = req.body as Partial<Card>;
  if (type && CARD_TYPES.includes(type)) card.type = type;
  if (typeof body === 'string') card.body = body;
  save();
  res.json(card);
});

apiRouter.post('/cards/:id/duplicate', (req, res) => {
  const card = findCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado.' });
  const copy: Card = { ...card, id: newId(), createdAt: now(), answers: [] };
  db.cards.splice(db.cards.indexOf(card), 0, copy);
  for (const l of db.links.filter((l) => l.cardId === card.id)) db.links.push({ ...l, cardId: copy.id });
  save();
  res.json(copy);
});

apiRouter.delete('/cards/:id/answers', (req, res) => {
  const card = findCard(req.params.id);
  if (!card) return res.status(404).end();
  card.answers = [];
  save();
  res.json(card);
});

apiRouter.delete('/cards/:id', (req, res) => {
  db.cards = db.cards.filter((c) => c.id !== req.params.id);
  db.links = db.links.filter((l) => l.cardId !== req.params.id);
  for (const c of db.chats) c.context.cardIds = c.context.cardIds.filter((id) => id !== req.params.id);
  save();
  res.status(204).end();
});

// ---------- Vínculos ----------

/** Cria ou atualiza o vínculo (upsert): a interface não precisa saber se ele já existia. */
apiRouter.put('/links', (req, res) => {
  const { fileId, cardId, active } = req.body as { fileId: string; cardId: string; active?: boolean };
  if (!db.files.some((f) => f.id === fileId) || !findCard(cardId)) return res.status(404).json({ error: 'Arquivo ou cartão não existe.' });
  const link = db.links.find((l) => l.fileId === fileId && l.cardId === cardId);
  if (link) link.active = active ?? link.active;
  else db.links.push({ fileId, cardId, active: active ?? true });
  save();
  res.json({ ok: true });
});

apiRouter.delete('/links', (req, res) => {
  const { fileId, cardId } = req.query as { fileId: string; cardId: string };
  db.links = db.links.filter((l) => !(l.fileId === fileId && l.cardId === cardId));
  save();
  res.status(204).end();
});

// ---------- Chats ----------

const findChat = (id: string) => db.chats.find((c) => c.id === id);

apiRouter.post('/chats', (req, res) => {
  const { title, context } = req.body as { title?: string; context?: Partial<ChatContext> };
  const chat: Chat = {
    id: newId(),
    title: title?.trim() || 'Nova conversa',
    createdAt: now(),
    updatedAt: now(),
    context: { cardIds: context?.cardIds ?? [], fileIds: context?.fileIds ?? [] },
    messages: [],
  };
  db.chats.unshift(chat);
  save();
  res.json(chat);
});

apiRouter.patch('/chats/:id', (req, res) => {
  const chat = findChat(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const { title, context } = req.body as { title?: string; context?: ChatContext };
  if (title?.trim()) chat.title = title.trim();
  if (context) chat.context = { cardIds: context.cardIds ?? [], fileIds: context.fileIds ?? [] };
  chat.updatedAt = now();
  save();
  res.json(chat);
});

apiRouter.delete('/chats/:id', (req, res) => {
  db.chats = db.chats.filter((c) => c.id !== req.params.id);
  save();
  res.status(204).end();
});

// ---------- Ajustes e provedores ----------

apiRouter.get('/settings', (_req, res) => res.json(publicSettings()));

apiRouter.put('/settings', (req, res) => {
  const body = req.body as Partial<Omit<Settings, 'nvidia'>> & { nvidia?: Partial<Settings['nvidia']> & { apiKey?: string | null } };
  const s = db.settings;
  if (body.provider === 'claude-code' || body.provider === 'nvidia') s.provider = body.provider;
  if (body.claude) Object.assign(s.claude, body.claude);
  if (body.whisper) Object.assign(s.whisper, body.whisper);
  if (body.nvidia) {
    const { apiKey, ...rest } = body.nvidia;
    Object.assign(s.nvidia, rest);
    // undefined = não mexe; null = apaga; string = troca.
    if (apiKey === null) s.nvidia.apiKey = '';
    else if (typeof apiKey === 'string' && apiKey.trim()) s.nvidia.apiKey = apiKey.trim();
  }
  save();
  res.json(publicSettings());
});

apiRouter.get('/providers', async (_req, res) => {
  const status: ProviderStatus = { claudeCode: { available: false }, nvidia: { hasKey: Boolean(nvidiaKey()) } };
  try {
    status.claudeCode = { available: true, version: await claudeCodeVersion() };
  } catch (err) {
    status.claudeCode = { available: false, error: (err as Error).message };
  }
  res.json(status);
});

apiRouter.get('/nvidia/models', async (_req, res) => {
  try {
    res.json(await listNvidiaModels());
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
