import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { FileRec, TextSource } from '../shared/types';
import { UPLOAD_DIR, db, filePath, newId, now, save, summarizeFile } from './store';
import { detectKind, extractText, unsupportedReason } from './extract';
import { readImageWithVision } from './ai/nvidia';
import { ProviderError } from './ai/types';

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, newId() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

/** O multer entrega nomes não-ASCII como latin1; "AULA_1ª.pdf" viraria "AULA_1Âª.pdf". */
const fixName = (name: string) => {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('�') ? name : utf8;
};

export const filesRouter = Router();

filesRouter.post('/files', upload.array('files', 50), async (req, res) => {
  const created: FileRec[] = [];
  const errors: string[] = [];
  for (const up of (req.files as Express.Multer.File[]) ?? []) {
    const name = fixName(up.originalname);
    const kind = detectKind(name, up.mimetype);
    if (!kind) {
      fs.rmSync(up.path, { force: true });
      errors.push(`${name}: ${unsupportedReason(name)}`);
      continue;
    }
    const rec: FileRec = {
      id: path.parse(up.filename).name,
      name,
      kind,
      mime: up.mimetype,
      size: up.size,
      storedName: up.filename,
      createdAt: now(),
      enabled: true,
    };
    try {
      Object.assign(rec, await extractText(up.path, kind));
    } catch (err) {
      errors.push(`${name}: enviado, mas não consegui extrair o texto (${(err as Error).message})`);
    }
    db.files.push(rec);
    created.push(rec);
  }
  save();
  res.json({ files: created.map(summarizeFile), errors });
});

/** Texto colado vira um arquivo como outro qualquer (transcrição, enunciado, anotações…). */
filesRouter.post('/files/text', (req, res) => {
  const { name, content } = req.body as { name?: string; content?: string };
  if (!content?.trim()) return res.status(400).json({ error: 'O texto está vazio.' });
  const id = newId();
  const storedName = `${id}.txt`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), content);
  const rec: FileRec = {
    id,
    name: (name?.trim() || `Texto ${db.files.length + 1}`).replace(/\.txt$/i, '') + '.txt',
    kind: 'text',
    mime: 'text/plain',
    size: Buffer.byteLength(content),
    storedName,
    createdAt: now(),
    enabled: true,
    text: content,
    textSource: 'manual',
  };
  db.files.push(rec);
  save();
  res.json(summarizeFile(rec));
});

const findFile = (id: string) => db.files.find((f) => f.id === id);

filesRouter.get('/files/:id', (req, res) => {
  const f = findFile(req.params.id);
  if (!f) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  res.json(f);
});

filesRouter.get('/files/:id/raw', (req, res) => {
  const f = findFile(req.params.id);
  if (!f) return res.status(404).end();
  res.type(f.mime).sendFile(filePath(f));
});

filesRouter.patch('/files/:id', (req, res) => {
  const f = findFile(req.params.id);
  if (!f) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  const { name, enabled, text, textSource } = req.body as Partial<FileRec> & { textSource?: TextSource };
  if (typeof name === 'string' && name.trim()) f.name = name.trim();
  if (typeof enabled === 'boolean') f.enabled = enabled;
  if (typeof text === 'string') {
    f.text = text;
    f.textSource = textSource === 'transcricao' ? 'transcricao' : 'manual';
  }
  save();
  res.json(summarizeFile(f));
});

filesRouter.delete('/files/:id', (req, res) => {
  const f = findFile(req.params.id);
  if (!f) return res.status(404).end();
  fs.rmSync(filePath(f), { force: true });
  db.files = db.files.filter((x) => x.id !== f.id);
  db.links = db.links.filter((l) => l.fileId !== f.id);
  for (const c of db.chats) c.context.fileIds = c.context.fileIds.filter((id) => id !== f.id);
  save();
  res.status(204).end();
});

/** "Ler imagem com IA" (NVIDIA): gera e salva a leitura da imagem para revisão manual. */
filesRouter.post('/files/:id/vision', async (req, res) => {
  const f = findFile(req.params.id);
  if (!f || f.kind !== 'image') return res.status(404).json({ error: 'Imagem não encontrada.' });
  try {
    await readImageWithVision(f);
    res.json(f);
  } catch (err) {
    res.status(err instanceof ProviderError ? 400 : 500).json({ error: (err as Error).message });
  }
});
