import type {
  AppState,
  Card,
  CardType,
  Chat,
  ChatContext,
  FileRec,
  FileSummary,
  ProviderStatus,
  PublicSettings,
  RunRequest,
  StreamEvent,
  TextSource,
} from '../../shared/types';

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body instanceof FormData || body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Erro ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  state: () => req<AppState>('GET', '/state'),

  upload(files: File[]) {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return req<{ files: FileSummary[]; errors: string[] }>('POST', '/files', form);
  },
  createText: (name: string, content: string) => req<FileSummary>('POST', '/files/text', { name, content }),
  getFile: (id: string) => req<FileRec>('GET', `/files/${id}`),
  patchFile: (id: string, patch: { name?: string; enabled?: boolean; text?: string; textSource?: TextSource }) =>
    req<FileSummary>('PATCH', `/files/${id}`, patch),
  deleteFile: (id: string) => req<void>('DELETE', `/files/${id}`),
  visionFile: (id: string) => req<FileRec>('POST', `/files/${id}/vision`),
  rawUrl: (id: string) => `/api/files/${id}/raw`,

  createCard: (type: CardType, body: string, fileIds: string[]) => req<Card>('POST', '/cards', { type, body, fileIds }),
  patchCard: (id: string, patch: Partial<Pick<Card, 'type' | 'body'>>) => req<Card>('PATCH', `/cards/${id}`, patch),
  duplicateCard: (id: string) => req<Card>('POST', `/cards/${id}/duplicate`),
  clearAnswers: (id: string) => req<Card>('DELETE', `/cards/${id}/answers`),
  deleteCard: (id: string) => req<void>('DELETE', `/cards/${id}`),

  setLink: (fileId: string, cardId: string, active: boolean) => req<void>('PUT', '/links', { fileId, cardId, active }),
  deleteLink: (fileId: string, cardId: string) =>
    req<void>('DELETE', `/links?fileId=${encodeURIComponent(fileId)}&cardId=${encodeURIComponent(cardId)}`),

  createChat: (context?: Partial<ChatContext>, title?: string) => req<Chat>('POST', '/chats', { context, title }),
  patchChat: (id: string, patch: { title?: string; context?: ChatContext }) => req<Chat>('PATCH', `/chats/${id}`, patch),
  deleteChat: (id: string) => req<void>('DELETE', `/chats/${id}`),

  putSettings: (patch: unknown) => req<PublicSettings>('PUT', '/settings', patch),
  providers: () => req<ProviderStatus>('GET', '/providers'),
  nvidiaModels: () => req<string[]>('GET', '/nvidia/models'),
};

/** POST com resposta SSE (EventSource não aceita POST, então lemos o stream na mão). */
export async function streamRun(body: RunRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal) {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Erro ${res.status} ao iniciar a execução.`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of block.split('\n')) {
        if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)) as StreamEvent);
      }
    }
  }
}
