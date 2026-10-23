import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, Send, Square, StickyNote, Trash2, X } from 'lucide-react';
import type { Chat as ChatT, ChatContext } from '../../../shared/types';
import { api } from '../api';
import { useStore } from '../store';
import { FileIcon, FilePicker } from '../components/files';
import { Markdown } from '../components/Markdown';
import { CopyButton, RunOutput } from '../components/RunOutput';

export function Chat() {
  const { state, activeChatId, setActiveChatId, refresh } = useStore();
  const chats = state?.chats ?? [];
  const active = chats.find((c) => c.id === activeChatId) ?? null;

  // Sem conversa escolhida: abre a mais recente.
  useEffect(() => {
    if (!active && chats.length) setActiveChatId(chats[0].id);
  }, [active, chats, setActiveChatId]);

  const newChat = async () => {
    const chat = await api.createChat();
    await refresh();
    setActiveChatId(chat.id);
  };

  return (
    <div className="chat">
      <aside className="chat-list" aria-label="Conversas">
        <button className="btn btn-primary btn-block" onClick={newChat}>
          <MessageSquarePlus size={16} /> Nova conversa
        </button>
        <ul>
          {chats.map((c) => (
            <li key={c.id}>
              <button className={`chat-item ${c.id === active?.id ? 'active' : ''}`} onClick={() => setActiveChatId(c.id)}>
                <span className="ellipsis">{c.title}</span>
                <span className="muted small">
                  {c.messages.length} msg · {new Date(c.updatedAt).toLocaleDateString('pt-BR')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {active ? (
        <Conversation key={active.id} chat={active} />
      ) : (
        <div className="empty chat-empty">
          <p className="empty-title">Converse com a IA sobre seus exercícios</p>
          <p>O chat entende o contexto que você escolher: cartões (com a pergunta, a última resposta e os arquivos ligados) e arquivos avulsos.</p>
          <ul>
            <li>
              No Workspace, abra o menu de um cartão e escolha <strong>Discutir no chat</strong>.
            </li>
            <li>Ou crie uma conversa nova e adicione o contexto pela barra de cima.</li>
          </ul>
          <button className="btn btn-primary" onClick={newChat}>
            <MessageSquarePlus size={16} /> Nova conversa
          </button>
        </div>
      )}
    </div>
  );
}

function Conversation({ chat }: { chat: ChatT }) {
  const { state, setState, refresh, runs, startRun, cancelRun, setActiveChatId } = useStore();
  const [input, setInput] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const runKey = `chat:${chat.id}`;
  const run = runs[runKey];
  const files = state?.files ?? [];
  const cards = state?.cards ?? [];

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages.length, run?.text]);

  const setContext = async (context: ChatContext) => {
    await api.patchChat(chat.id, { context });
    refresh();
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const send = async () => {
    const message = input.trim();
    if (!message || run?.running) return;
    setInput('');
    // Mostra a mensagem na hora; o servidor já a salva antes de chamar a IA.
    setState(
      (s) =>
        s && {
          ...s,
          chats: s.chats.map((c) =>
            c.id === chat.id ? { ...c, messages: [...c.messages, { id: 'pending', role: 'user', text: message, createdAt: new Date().toISOString() }] } : c,
          ),
        },
    );
    await startRun(runKey, { kind: 'chat', chatId: chat.id, message });
  };

  const contextCards = cards.filter((c) => chat.context.cardIds.includes(c.id));
  const contextFiles = files.filter((f) => chat.context.fileIds.includes(f.id));

  return (
    <section className="conversation" aria-label={chat.title}>
      <header className="conv-head">
        <input
          key={chat.title}
          className="conv-title"
          defaultValue={chat.title}
          aria-label="Título da conversa"
          onBlur={async (e) => {
            if (e.target.value.trim() && e.target.value !== chat.title) {
              await api.patchChat(chat.id, { title: e.target.value });
              refresh();
            }
          }}
        />
        <button
          className="icon-btn"
          aria-label="Excluir conversa"
          title="Excluir conversa"
          onClick={async () => {
            if (!confirm('Excluir esta conversa?')) return;
            await api.deleteChat(chat.id);
            setActiveChatId(null);
            refresh();
          }}
        >
          <Trash2 size={17} />
        </button>
      </header>

      <div className="context-bar" aria-label="Contexto da conversa">
        <span className="muted small">Contexto:</span>
        {contextCards.map((c) => (
          <span key={c.id} className="chip chip-on chip-card">
            <span className="chip-main as-label">
              <StickyNote size={13} aria-hidden />
              <span className="chip-name">{c.body.trim() || `Cartão geral`}</span>
            </span>
            <button className="chip-x" aria-label="Remover cartão do contexto" onClick={() => setContext({ ...chat.context, cardIds: toggle(chat.context.cardIds, c.id) })}>
              <X size={13} />
            </button>
          </span>
        ))}
        {contextFiles.map((f) => (
          <span key={f.id} className={`chip ${f.enabled ? 'chip-on' : 'chip-off'}`}>
            <span className="chip-main as-label">
              <FileIcon kind={f.kind} size={13} />
              <span className="chip-name">{f.name}</span>
            </span>
            <button className="chip-x" aria-label={`Remover ${f.name} do contexto`} onClick={() => setContext({ ...chat.context, fileIds: toggle(chat.context.fileIds, f.id) })}>
              <X size={13} />
            </button>
          </span>
        ))}
        <CardPicker selected={new Set(chat.context.cardIds)} onToggle={(id) => setContext({ ...chat.context, cardIds: toggle(chat.context.cardIds, id) })} />
        <FilePicker files={files} selected={new Set(chat.context.fileIds)} onToggle={(id) => setContext({ ...chat.context, fileIds: toggle(chat.context.fileIds, id) })} />
        {!contextCards.length && !contextFiles.length && <span className="muted small">nenhum (conversa livre)</span>}
      </div>

      <div className="messages">
        {chat.messages.length === 0 && !run?.running && (
          <div className="empty small-empty">
            <p>Pergunte algo sobre o contexto acima. Exemplos:</p>
            <ul>
              <li>“Não entendi o passo 3, pode explicar de outro jeito?”</li>
              <li>“Me dá um exercício parecido para eu treinar.”</li>
              <li>“Qual conceito eu preciso revisar para resolver isso?”</li>
            </ul>
          </div>
        )}
        {chat.messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="msg msg-user">
              <p>{m.text}</p>
            </div>
          ) : (
            <div key={m.id} className="msg msg-ai">
              <Markdown text={m.text} />
              <div className="msg-meta">
                <span>{m.provider}</span>
                <CopyButton text={m.text} />
              </div>
            </div>
          ),
        )}
        {run && (run.running || run.error) && (
          <div className="msg msg-ai">
            <RunOutput run={run} onCancel={() => cancelRun(runKey)} />
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="chat-composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escreva sua mensagem… (Enter envia, Shift+Enter quebra linha)"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        {run?.running ? (
          <button className="btn" onClick={() => cancelRun(runKey)} aria-label="Parar">
            <Square size={15} />
          </button>
        ) : (
          <button className="btn btn-primary" onClick={send} disabled={!input.trim()} aria-label="Enviar">
            <Send size={16} />
          </button>
        )}
      </div>
    </section>
  );
}

function CardPicker({ selected, onToggle }: { selected: Set<string>; onToggle: (id: string) => void }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const cards = state?.cards ?? [];
  return (
    <div className="picker" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <StickyNote size={14} /> cartão
      </button>
      {open && (
        <div className="picker-pop" role="menu">
          {cards.length === 0 && <p className="muted small">Nenhum cartão no Workspace.</p>}
          {cards.map((c) => (
            <label key={c.id} className="picker-row">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)} />
              <span className="ellipsis">{c.body.trim() || 'Cartão geral'}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
