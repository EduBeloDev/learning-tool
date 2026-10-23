// Contrato entre servidor e interface. Tudo que é salvo em data/db.json passa por aqui.

export type FileKind = 'image' | 'pdf' | 'audio' | 'text' | 'doc';

/** De onde veio o texto associado a um arquivo (mostrado na interface para o usuário confiar nele). */
export type TextSource = 'arquivo' | 'pdf' | 'docx' | 'transcricao' | 'visao' | 'manual';

export interface FileRec {
  id: string;
  name: string;
  kind: FileKind;
  mime: string;
  size: number;
  /** Nome do arquivo dentro de data/uploads. */
  storedName: string;
  createdAt: string;
  /** Desligado = ignorado em todos os cartões, ferramentas e no chat. */
  enabled: boolean;
  text?: string;
  textSource?: TextSource;
  pages?: number;
}

/** Versão enviada para a interface: sem o texto completo (pode ser grande). */
export interface FileSummary extends Omit<FileRec, 'text'> {
  textChars: number;
}

/**
 * pergunta → algo curto que precisa de resposta
 * texto    → enunciado, instrução ou documento longo que precisa ser trabalhado
 * geral    → sem texto: a IA analisa os arquivos e resolve o que houver neles
 */
export type CardType = 'pergunta' | 'texto' | 'geral';

export interface Answer {
  id: string;
  createdAt: string;
  provider: string;
  text: string;
  fileIds: string[];
}

export interface Card {
  id: string;
  type: CardType;
  body: string;
  createdAt: string;
  answers: Answer[];
}

/** Vínculo arquivo ↔ cartão. `active: false` mantém o vínculo mas não envia o arquivo. */
export interface Link {
  fileId: string;
  cardId: string;
  active: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  provider?: string;
  error?: boolean;
}

export interface ChatContext {
  cardIds: string[];
  fileIds: string[];
}

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  context: ChatContext;
  messages: ChatMessage[];
  /** Sessão do Claude Code reaproveitada com --resume enquanto o contexto não muda. */
  claudeSessionId?: string;
  claudeContextKey?: string;
}

export type ProviderId = 'claude-code' | 'nvidia';

export interface Settings {
  provider: ProviderId;
  claude: { model: string; effort: string };
  nvidia: { apiKey: string; baseUrl: string; textModel: string; visionModel: string };
  whisper: { model: string; language: string };
}

export interface PublicSettings extends Omit<Settings, 'nvidia'> {
  nvidia: Omit<Settings['nvidia'], 'apiKey'> & { hasKey: boolean; keyFromEnv: boolean };
}

export interface DB {
  version: 1;
  files: FileRec[];
  cards: Card[];
  links: Link[];
  chats: Chat[];
  settings: Settings;
}

export interface AppState {
  files: FileSummary[];
  cards: Card[];
  links: Link[];
  chats: Chat[];
  settings: PublicSettings;
}

export interface ProviderStatus {
  claudeCode: { available: boolean; version?: string; error?: string };
  nvidia: { hasKey: boolean };
}

export type ToolId = 'resumo' | 'exercicios' | 'explicar' | 'preencher';

export type RunRequest =
  | { kind: 'card'; cardId: string }
  | { kind: 'tool'; tool: ToolId; fileIds: string[]; text?: string; options?: Record<string, string> }
  | { kind: 'chat'; chatId: string; message: string };

/** Eventos enviados por SSE durante uma execução. */
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | { type: 'warning'; text: string }
  | { type: 'done'; text: string; answer?: Answer; message?: ChatMessage }
  | { type: 'error'; message: string };
