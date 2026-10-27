import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState, ChatContext, RunRequest, StreamEvent } from '../../shared/types';
import { api, streamRun } from './api';
import { transcribe, type TranscribeProgress } from './audio/transcriber';

// Estado global: dados do servidor + execuções em andamento + fila de transcrição.
// As execuções vivem aqui (e não nos componentes) para continuarem quando a pessoa troca de aba.

export type Tab = 'workspace' | 'ferramentas' | 'chat' | 'ajuda';
export const TABS: Tab[] = ['workspace', 'ferramentas', 'chat', 'ajuda'];

export interface RunState {
  running: boolean;
  text: string;
  status?: string;
  warnings: string[];
  error?: string;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'ok';
}

interface Store {
  state: AppState | null;
  loadError?: string;
  refresh: () => Promise<void>;
  setState: React.Dispatch<React.SetStateAction<AppState | null>>;

  tab: Tab;
  setTab: (t: Tab) => void;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  openChatWith: (context: Partial<ChatContext>, title?: string, subjectId?: string) => Promise<void>;

  /** Matéria aberta; null = "Todas". Vale para Workspace, Ferramentas e Chat ao mesmo tempo. */
  subjectId: string | null;
  setSubjectId: (id: string | null) => void;
  inSubject: (item: { subjectId?: string }) => boolean;

  runs: Record<string, RunState>;
  startRun: (key: string, body: RunRequest) => Promise<StreamEvent | undefined>;
  cancelRun: (key: string) => void;
  clearRun: (key: string) => void;

  transcriptions: Record<string, TranscribeProgress | { stage: 'na fila' }>;
  queueTranscription: (fileId: string) => void;

  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;

  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fora do StoreProvider');
  return s;
}

const tabFromHash = (): Tab => {
  const h = location.hash.slice(1) as Tab;
  return TABS.includes(h) ? h : 'workspace';
};

const SUBJECT_KEY = 'caderno-materia';

function storedSubject(): string | null {
  try {
    return localStorage.getItem(SUBJECT_KEY);
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [subjectId, setSubjectIdState] = useState<string | null>(storedSubject);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [transcriptions, setTranscriptions] = useState<Store['transcriptions']>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const queue = useRef<string[]>([]);
  const transcribing = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setLoadError(undefined);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    history.replaceState(null, '', `#${t}`);
  }, []);

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const setSubjectId = useCallback((id: string | null) => {
    setSubjectIdState(id);
    try {
      if (id) localStorage.setItem(SUBJECT_KEY, id);
      else localStorage.removeItem(SUBJECT_KEY);
    } catch {
      /* modo privado: a matéria escolhida só vale nesta sessão */
    }
  }, []);

  // A matéria lembrada pode ter sido apagada (ou ser de outra pasta data/): volta para "Todas".
  useEffect(() => {
    if (state && subjectId && !state.subjects.some((s) => s.id === subjectId)) setSubjectId(null);
  }, [state, subjectId, setSubjectId]);

  const inSubject = useCallback((item: { subjectId?: string }) => subjectId === null || item.subjectId === subjectId, [subjectId]);

  const openChatWith = useCallback(
    async (context: Partial<ChatContext>, title?: string, subjectId?: string) => {
      const chat = await api.createChat(context, title, subjectId);
      await refresh();
      setActiveChatId(chat.id);
      setTab('chat');
    },
    [refresh, setTab],
  );

  const patchRun = (key: string, fn: (r: RunState) => RunState) =>
    setRuns((all) => ({ ...all, [key]: fn(all[key] ?? { running: false, text: '', warnings: [] }) }));

  const startRun = useCallback(
    async (key: string, body: RunRequest) => {
      controllers.current.get(key)?.abort();
      const controller = new AbortController();
      controllers.current.set(key, controller);
      setRuns((all) => ({ ...all, [key]: { running: true, text: '', warnings: [], status: 'Enviando…' } }));
      let final: StreamEvent | undefined;
      try {
        await streamRun(
          body,
          (e) => {
            if (e.type === 'delta') patchRun(key, (r) => ({ ...r, text: r.text + e.text, status: undefined }));
            else if (e.type === 'status') patchRun(key, (r) => ({ ...r, status: e.text }));
            else if (e.type === 'warning') patchRun(key, (r) => ({ ...r, warnings: [...r.warnings, e.text] }));
            else if (e.type === 'error') patchRun(key, (r) => ({ ...r, error: e.message }));
            else if (e.type === 'done') final = e;
          },
          controller.signal,
        );
      } catch (err) {
        if (!controller.signal.aborted) patchRun(key, (r) => ({ ...r, error: (err as Error).message }));
      } finally {
        if (controllers.current.get(key) === controller) controllers.current.delete(key);
        patchRun(key, (r) => ({ ...r, running: false, status: undefined, error: controller.signal.aborted ? 'Cancelado.' : r.error }));
        // Cartões e chats foram salvos no servidor; atualiza para mostrar a versão persistida.
        if (body.kind !== 'tool') await refresh();
      }
      return final;
    },
    [refresh],
  );

  const cancelRun = useCallback((key: string) => controllers.current.get(key)?.abort(), []);
  const clearRun = useCallback((key: string) => setRuns(({ [key]: _, ...rest }) => rest), []);

  // Uma transcrição por vez: o modelo Whisper é pesado e não compensa rodar dois em paralelo.
  const pump = useCallback(async () => {
    if (transcribing.current) return;
    const fileId = queue.current.shift();
    if (!fileId) return;
    transcribing.current = true;
    const s = stateRef.current;
    const file = s?.files.find((f) => f.id === fileId);
    try {
      if (!s || !file) throw new Error('Arquivo não encontrado.');
      const text = await transcribe(api.rawUrl(fileId), s.settings.whisper, (p) => setTranscriptions((t) => ({ ...t, [fileId]: p })));
      if (!text) throw new Error('Nenhuma fala reconhecida no áudio.');
      await api.patchFile(fileId, { text, textSource: 'transcricao' });
      await refresh();
      toast(`Transcrição pronta: ${file.name}`, 'ok');
    } catch (err) {
      toast(`Falha ao transcrever${file ? ` ${file.name}` : ''}: ${(err as Error).message}`, 'error');
    } finally {
      setTranscriptions(({ [fileId]: _, ...rest }) => rest);
      transcribing.current = false;
      pump();
    }
  }, [refresh, toast]);

  const queueTranscription = useCallback(
    (fileId: string) => {
      if (queue.current.includes(fileId) || transcriptions[fileId]) return;
      queue.current.push(fileId);
      setTranscriptions((t) => ({ ...t, [fileId]: { stage: 'na fila' } }));
      pump();
    },
    [pump, transcriptions],
  );

  const value = useMemo<Store>(
    () => ({
      state,
      loadError,
      refresh,
      setState,
      tab,
      setTab,
      activeChatId,
      setActiveChatId,
      openChatWith,
      subjectId,
      setSubjectId,
      inSubject,
      runs,
      startRun,
      cancelRun,
      clearRun,
      transcriptions,
      queueTranscription,
      toasts,
      toast,
      settingsOpen,
      setSettingsOpen,
    }),
    [state, loadError, refresh, tab, setTab, activeChatId, openChatWith, subjectId, setSubjectId, inSubject, runs, startRun, cancelRun, clearRun, transcriptions, queueTranscription, toasts, toast, settingsOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
