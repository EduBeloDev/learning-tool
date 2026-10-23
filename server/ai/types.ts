import type { FileRec, StreamEvent } from '../../shared/types';

/** Um pedaço de mensagem: texto livre ou um arquivo que cada provedor apresenta do seu jeito. */
export type Part = { type: 'text'; text: string } | { type: 'file'; file: FileRec };

export interface Turn {
  role: 'user' | 'assistant';
  parts: Part[];
}

export interface RunOptions {
  system: string;
  turns: Turn[];
  signal: AbortSignal;
  emit: (e: Extract<StreamEvent, { type: 'delta' | 'status' | 'warning' }>) => void;
  /** Só o Claude Code usa: id da sessão e se deve continuar (--resume) ou criar (--session-id). */
  session?: { id: string; resume: boolean };
}

export interface Provider {
  /** Nome curto mostrado junto das respostas, ex.: "Claude Code · sonnet". */
  label(): string;
  run(opts: RunOptions): Promise<string>;
}

export class ProviderError extends Error {}
