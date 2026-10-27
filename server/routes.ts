import { Router } from 'express';
import { DEFAULT_LESSONS, SUBJECT_COLORS, type AppState, type Card, type CardType, type Chat, type ChatContext, type ProviderStatus, type Settings, type Subject, type SubjectColor } from '../shared/types';
import { db, newId, now, nvidiaKey, publicSettings, save, summarizeFile, validSubjectId } from './store';
import { claudeCodeVersion } from './ai/claudeCode';
import { listNvidiaModels } from './ai/nvidia';

export const apiRouter = Router();

apiRouter.get('/state', (_req, res) => {
  const state: AppState = {
    subjects: db.subjects,
    files: db.files.map(summarizeFile),
    cards: db.cards,
    links: db.links,
    chats: db.chats,
    settings: publicSettings(),
  };
  res.json(state);
});

// ---------- Matérias ----------

const findSubject = (id: string) => db.subjects.find((s) => s.id === id);
const isColor = (c: unknown): c is SubjectColor => SUBJECT_COLORS.includes(c as SubjectColor);
const MAX_LESSONS = 60;
const lessonCount = (n: unknown) => (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_LESSONS ? (n as number) : undefined);

apiRouter.post('/subjects', (req, res) => {
  const { name, color, lessons } = req.body as { name?: string; color?: string; lessons?: number };
  if (!name?.trim()) return res.status(400).json({ error: 'Dê um nome à matéria.' });
  const subject: Subject = {
    id: newId(),
    name: name.trim(),
    color: isColor(color) ? color : (SUBJECT_COLORS.find((c) => !db.subjects.some((s) => s.color === c)) ?? SUBJECT_COLORS[db.subjects.length % SUBJECT_COLORS.length]),
    lessons: lessonCount(lessons) ?? DEFAULT_LESSONS,
    createdAt: now(),
  };
  db.subjects.push(subject);
  save();
  res.json(subject);
});

apiRouter.patch('/subjects/:id', (req, res) => {
  const subject = findSubject(req.params.id);
  if (!subject) return res.status(404).json({ error: 'Matéria não encontrada.' });
  const { name, color, lessons } = req.body as { name?: string; color?: string; lessons?: number };
  if (name?.trim()) subject.name = name.trim();
  if (isColor(color)) subject.color = color;
  if (lessonCount(lessons)) {
    subject.lessons = lessonCount(lessons)!;
    // Diminuiu o número de aulas: os arquivos das aulas que sumiram vão para "Sem aula", nada é apagado.
    for (const f of db.files) if (f.subjectId === subject.id && f.lesson && f.lesson > subject.lessons) delete f.lesson;
  }
  save();
  res.json(subject);
});

/** Apagar a matéria não apaga nada dentro dela: arquivos, cartões e conversas voltam para "sem matéria". */
apiRouter.delete('/subjects/:id', (req, res) => {
  db.subjects = db.subjects.filter((s) => s.id !== req.params.id);
  for (const item of [...db.files, ...db.cards, ...db.chats]) if (item.subjectId === req.params.id) delete item.subjectId;
  for (const f of db.files) if (!f.subjectId) delete f.lesson;
  save();
  res.status(204).end();
});

// ---------- Cartões ----------

const CARD_TYPES: CardType[] = ['pergunta', 'texto', 'geral'];
const findCard = (id: string) => db.cards.find((c) => c.id === id);

apiRouter.post('/cards', (req, res) => {
  const { type, body, fileIds, subjectId } = req.body as { type?: CardType; body?: string; fileIds?: string[]; subjectId?: string };
  const card: Card = {
    id: newId(),
    type: CARD_TYPES.includes(type!) ? type! : 'pergunta',
    body: body ?? '',
    createdAt: now(),
    answers: [],
    subjectId: validSubjectId(subjectId),
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
  const { type, body, subjectId } = req.body as Partial<Omit<Card, 'subjectId'>> & { subjectId?: string | null };
  if (type && CARD_TYPES.includes(type)) card.type = type;
  if (typeof body === 'string') card.body = body;
  if (subjectId !== undefined) card.subjectId = validSubjectId(subjectId);
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
  const { title, context, subjectId } = req.body as { title?: string; context?: Partial<ChatContext>; subjectId?: string };
  const chat: Chat = {
    id: newId(),
    title: title?.trim() || 'Nova conversa',
    createdAt: now(),
    updatedAt: now(),
    context: { cardIds: context?.cardIds ?? [], fileIds: context?.fileIds ?? [] },
    messages: [],
    subjectId: validSubjectId(subjectId),
  };
  db.chats.unshift(chat);
  save();
  res.json(chat);
});

apiRouter.patch('/chats/:id', (req, res) => {
  const chat = findChat(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const { title, context, subjectId } = req.body as { title?: string; context?: ChatContext; subjectId?: string | null };
  if (title?.trim()) chat.title = title.trim();
  if (context) chat.context = { cardIds: context.cardIds ?? [], fileIds: context.fileIds ?? [] };
  if (subjectId !== undefined) chat.subjectId = validSubjectId(subjectId);
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
