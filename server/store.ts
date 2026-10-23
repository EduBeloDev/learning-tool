import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { DB, FileRec, FileSummary, PublicSettings, Settings } from '../shared/types';

// Banco = um JSON. Uma pessoa, poucos milhares de registros no máximo: não precisa de SQLite.
// Se um dia virar multiusuário, esta é a única peça a trocar.

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.CADERNO_DATA ? path.resolve(process.env.CADERNO_DATA) : path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'db.json');

export function defaultSettings(): Settings {
  return {
    provider: 'claude-code',
    claude: { model: '', effort: '' },
    nvidia: {
      apiKey: '',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      textModel: 'meta/llama-3.3-70b-instruct',
      visionModel: 'meta/llama-3.2-90b-vision-instruct',
    },
    whisper: { model: 'onnx-community/whisper-base', language: 'portuguese' },
  };
}

function emptyDb(): DB {
  return { version: 1, files: [], cards: [], links: [], chats: [], settings: defaultSettings() };
}

export let db: DB = emptyDb();

export function loadStore() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) return;
  const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Partial<DB>;
  const base = emptyDb();
  const s = raw.settings ?? base.settings;
  db = {
    ...base,
    ...raw,
    version: 1,
    // Mescla campo a campo para que versões novas ganhem defaults sem perder o que já foi salvo.
    settings: {
      ...base.settings,
      ...s,
      claude: { ...base.settings.claude, ...s.claude },
      nvidia: { ...base.settings.nvidia, ...s.nvidia },
      whisper: { ...base.settings.whisper, ...s.whisper },
    },
  };
}

let timer: NodeJS.Timeout | undefined;

/** Agenda a gravação; várias mudanças seguidas viram uma escrita só. */
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 150);
}

/** Grava em arquivo temporário e renomeia: um crash no meio nunca corrompe o db.json. */
export function flush() {
  clearTimeout(timer);
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    flush();
    process.exit(0);
  });
}

export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export const filePath = (f: FileRec) => path.join(UPLOAD_DIR, f.storedName);

export function summarizeFile(f: FileRec): FileSummary {
  const { text, ...rest } = f;
  return { ...rest, textChars: text?.length ?? 0 };
}

export function nvidiaKey(): string {
  return process.env.NVIDIA_API_KEY || db.settings.nvidia.apiKey;
}

export function publicSettings(): PublicSettings {
  const { apiKey, ...nvidia } = db.settings.nvidia;
  return {
    ...db.settings,
    nvidia: { ...nvidia, hasKey: Boolean(nvidiaKey()), keyFromEnv: Boolean(process.env.NVIDIA_API_KEY) },
  };
}
