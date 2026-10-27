import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, ClipboardPaste, Copy, Eraser, Folder, FolderOpen, History, MessageCircle, MoreHorizontal, Play, PlayCircle, Trash2, Upload } from 'lucide-react';
import type { Card, CardType, FileSummary } from '../../../shared/types';
import { api } from '../api';
import { useStore } from '../store';
import { Dialog } from '../components/Dialog';
import { FILE_DRAG, FileDrawer, FileIcon, FilePicker, FileStatus, LinkChip, formatSize } from '../components/files';
import { Markdown } from '../components/Markdown';
import { CopyButton, RunOutput } from '../components/RunOutput';
import { SubjectSelect, lessonLabel, lessonNumbers } from '../components/Subjects';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,audio/*,video/*,.txt,.md,.srt,.vtt,.csv,.tex,.docx';

const TYPE_INFO: Record<CardType, { label: string; hint: string; placeholder: string }> = {
  pergunta: { label: 'Pergunta', hint: 'Algo curto que precisa de resposta', placeholder: 'Ex.: Resolva o exercício 4 da lista e explique cada passo.' },
  texto: {
    label: 'Texto',
    hint: 'Enunciado, instrução ou documento longo para trabalhar',
    placeholder: 'Cole aqui um enunciado, uma redação para corrigir, um formulário para preencher…',
  },
  geral: { label: 'Geral', hint: 'Sem texto: a IA analisa os arquivos e resolve o que houver', placeholder: 'Opcional: alguma observação (ex.: "foque na parte 2").' },
};

export function Workspace() {
  const { state, refresh, toast, startRun, runs, tab, subjectId, inSubject } = useStore();
  const [drawerFile, setDrawerFile] = useState<string | null>(null);
  const [hoverFile, setHoverFile] = useState<string | null>(null);
  const [hoverCard, setHoverCard] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  // Por matéria: a aula que recebe os envios ("Enviar para") e quais pastas estão abertas.
  const [uploadTo, setUploadTo] = useState<Record<string, number>>({});
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const subject = state?.subjects.find((s) => s.id === subjectId);
  const uploadLesson = subject ? Math.min(uploadTo[subject.id] ?? 1, subject.lessons) : 0;
  const setUploadLesson = (n: number) => subject && setUploadTo((u) => ({ ...u, [subject.id]: n }));

  const upload = useCallback(
    async (files: File[], lesson = uploadLesson): Promise<FileSummary[]> => {
      if (!files.length) return [];
      setUploading(true);
      try {
        const res = await api.upload(files, subjectId ?? undefined, lesson || undefined);
        res.errors.forEach((e) => toast(e, 'error'));
        if (res.files.length) toast(`${res.files.length} arquivo(s) adicionado(s)${lesson ? ` na ${lessonLabel(lesson)}` : ''}.`, 'ok');
        await refresh();
        return res.files;
      } catch (err) {
        toast((err as Error).message, 'error');
        return [];
      } finally {
        setUploading(false);
      }
    },
    [refresh, toast, subjectId, uploadLesson],
  );

  // Ctrl+V com uma imagem (print de tela, foto copiada) vira arquivo direto, só quando o Workspace está visível.
  useEffect(() => {
    if (tab !== 'workspace') return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      const stamp = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-');
      upload(files.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : `colado-${stamp}${i ? `-${i}` : ''}.png`, { type: f.type })));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [upload, tab]);

  if (!state) return null;
  const { links } = state;
  const files = state.files.filter(inSubject);
  const cards = state.cards.filter(inSubject);
  const linkedToHover = (f: FileSummary) => Boolean(hoverCard && links.some((l) => l.cardId === hoverCard && l.fileId === f.id));

  const answerAll = async () => {
    const todo = cards.filter((c) => (c.body.trim() || c.type === 'geral') && !runs[`card:${c.id}`]?.running);
    if (!todo.length) return toast('Nenhum cartão pronto para responder.');
    if (!confirm(`Responder ${todo.length} cartão(ões), um de cada vez?`)) return;
    for (const c of todo) await startRun(`card:${c.id}`, { kind: 'card', cardId: c.id });
  };

  const moveToLesson = async (fileId: string, lesson: number) => {
    const f = files.find((x) => x.id === fileId);
    if (!f || (f.lesson ?? 0) === lesson) return;
    await api.patchFile(fileId, { lesson: lesson || null });
    await refresh();
  };

  const fileRow = (f: FileSummary) => {
    const linkedCards = links.filter((l) => l.fileId === f.id).length;
    // Em "Todas", cada fonte diz de onde é; dentro de uma matéria, a pasta já diz.
    const fileSubject = !subject && state.subjects.find((s) => s.id === f.subjectId);
    return (
      <li
        key={f.id}
        className={`file-row ${f.enabled ? '' : 'file-off'} ${linkedToHover(f) ? 'file-hl' : ''}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(FILE_DRAG, f.id);
          e.dataTransfer.effectAllowed = 'link';
        }}
        onMouseEnter={() => setHoverFile(f.id)}
        onMouseLeave={() => setHoverFile(null)}
      >
        <FileIcon kind={f.kind} />
        <div className="file-main">
          <button className="file-name" onClick={() => setDrawerFile(f.id)} title="Abrir: ver, editar texto, transcrever, mudar de aula">
            {f.name}
          </button>
          <div className="file-meta">
            <FileStatus file={f} />
            <span>· {formatSize(f.size)}</span>
            {linkedCards > 0 && <span>· {linkedCards === 1 ? '1 cartão' : `${linkedCards} cartões`}</span>}
            {fileSubject && (
              <span className={`file-subject subj-${fileSubject.color}`}>
                · <span className="subject-dot" aria-hidden /> {fileSubject.name}
                {f.lesson ? `, ${lessonLabel(f.lesson)}` : ''}
              </span>
            )}
          </div>
        </div>
        <Switch
          checked={f.enabled}
          label={f.enabled ? `Desligar ${f.name} em todos os cartões` : `Ligar ${f.name}`}
          onChange={async (enabled) => {
            await api.patchFile(f.id, { enabled });
            refresh();
          }}
        />
      </li>
    );
  };

  // "Sem aula" só aparece quando tem algo para organizar.
  const folders = subject
    ? [0, ...lessonNumbers(subject)].map((n) => ({ lesson: n, files: files.filter((f) => (f.lesson ?? 0) === n) })).filter((g) => g.lesson || g.files.length)
    : [];

  return (
    <div className="workspace">
      <aside className="sources" aria-label="Fontes">
        <header className="section-head">
          <h2>Fontes</h2>
          <span className="count">{files.length}</span>
        </header>

        {subject && <LessonSelect label="Enviar para" subjectLessons={subject.lessons} value={uploadLesson} onChange={setUploadLesson} />}
        <Dropzone onFiles={(f) => upload(f)} busy={uploading} />
        <button className="btn btn-ghost btn-block" onClick={() => setPasteOpen(true)}>
          <ClipboardPaste size={15} /> Colar texto ou transcrição
        </button>

        {subject ? (
          <div className="folders">
            {folders.map(({ lesson, files: inFolder }) => {
              const key = `${subject.id}:${lesson}`;
              const open = openFolders[key] ?? inFolder.length > 0;
              return (
                <LessonFolder
                  key={key}
                  lesson={lesson}
                  count={inFolder.length}
                  open={open}
                  highlighted={!open && inFolder.some(linkedToHover)}
                  onToggle={() => setOpenFolders((o) => ({ ...o, [key]: !open }))}
                  onMove={(fileId) => moveToLesson(fileId, lesson)}
                  onUpload={(f) => {
                    setOpenFolders((o) => ({ ...o, [key]: true }));
                    upload(f, lesson);
                  }}
                >
                  {inFolder.map(fileRow)}
                </LessonFolder>
              );
            })}
          </div>
        ) : (
          <ul className="file-list">{files.map(fileRow)}</ul>
        )}
        {files.length > 0 && (
          <p className="muted small hint">
            Arraste um arquivo até um cartão para vincular{subject ? ', ou até outra pasta para mudar de aula' : ''}. O interruptor desliga o arquivo em todos os cartões.
          </p>
        )}
      </aside>

      <section className="cards" aria-label="Cartões">
        <header className="section-head">
          <h2>Cartões</h2>
          <span className="count">{cards.length}</span>
          <span className="spacer" />
          {cards.length > 1 && (
            <button className="btn btn-ghost btn-sm" onClick={answerAll}>
              <PlayCircle size={15} /> Responder todos
            </button>
          )}
        </header>

        <Composer files={files} />

        {cards.length === 0 && (
          <div className="empty">
            <p className="empty-title">{subject ? `Nenhum cartão em ${subject.name} ainda.` : 'Nenhum cartão ainda.'}</p>
            <p>
              Um cartão é uma pergunta, um texto ou um pedido geral. Você liga arquivos a ele{subject ? ' (de quantas aulas quiser)' : ''} e clica em{' '}
              <strong>Responder</strong>. Exemplos:
            </p>
            <ul>
              <li>“Resolva os exercícios 1 a 5 e explique o raciocínio” + a foto da lista</li>
              <li>“Resuma a aula em tópicos” + o áudio transcrito</li>
              <li>Cartão “Geral” + um PDF: a IA descobre o que fazer</li>
            </ul>
          </div>
        )}

        {cards.map((c) => (
          <CardItem
            key={c.id}
            card={c}
            files={files}
            highlighted={Boolean(hoverFile && links.some((l) => l.cardId === c.id && l.fileId === hoverFile))}
            onHover={setHoverCard}
            onUploadTo={upload}
          />
        ))}
      </section>

      <FileDrawer fileId={drawerFile} onClose={() => setDrawerFile(null)} />
      <PasteTextDialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        lessonPicker={subject && <LessonSelect label="Aula" subjectLessons={subject.lessons} value={uploadLesson} onChange={setUploadLesson} />}
        lesson={uploadLesson}
      />
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} title={label} className="switch" onClick={() => onChange(!checked)}>
      <span className="switch-knob" />
    </button>
  );
}

function LessonSelect({ label, subjectLessons, value, onChange }: { label: string; subjectLessons: number; value: number; onChange: (n: number) => void }) {
  return (
    <label className="field inline lesson-select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0}>Sem aula</option>
        {Array.from({ length: subjectLessons }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {lessonLabel(i + 1)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Pasta de uma aula: abre e fecha, recebe arquivos do computador (envio) e fontes arrastadas (muda a aula). */
function LessonFolder({
  lesson,
  count,
  open,
  highlighted,
  onToggle,
  onMove,
  onUpload,
  children,
}: {
  lesson: number;
  count: number;
  open: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onMove: (fileId: string) => void;
  onUpload: (files: File[]) => void;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const label = lessonLabel(lesson);
  const Icon = open ? FolderOpen : Folder;
  return (
    <section
      className={`folder ${lesson ? '' : 'folder-loose'} ${over ? 'over' : ''} ${highlighted ? 'folder-hl' : ''}`}
      aria-label={label}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(FILE_DRAG) && !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(FILE_DRAG);
        if (id) onMove(id);
        else onUpload([...e.dataTransfer.files]);
      }}
    >
      <header className="folder-head">
        <button className="folder-toggle" aria-expanded={open} onClick={onToggle}>
          <ChevronRight size={15} className="folder-chevron" aria-hidden />
          <Icon size={17} aria-hidden className="folder-icon" />
          <span className="folder-name">{label}</span>
          <span className="count">{count}</span>
        </button>
        {lesson > 0 && (
          <>
            <button className="icon-btn" onClick={() => input.current?.click()} aria-label={`Enviar arquivos para a ${label}`} title={`Enviar arquivos para a ${label}`}>
              <Upload size={15} />
            </button>
            <input
              ref={input}
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                onUpload([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </>
        )}
      </header>
      {open && (count ? <ul className="file-list">{children}</ul> : <p className="muted small folder-empty">Vazia. Solte arquivos aqui ou use o botão de envio.</p>)}
      {open && !lesson && <p className="muted small folder-empty">Arraste cada arquivo para a pasta da aula.</p>}
    </section>
  );
}

function Dropzone({ onFiles, busy }: { onFiles: (f: File[]) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
    >
      <button className="dropzone-btn" onClick={() => input.current?.click()} disabled={busy}>
        <Upload size={20} />
        <span>
          <strong>{busy ? 'Enviando…' : 'Solte arquivos aqui'}</strong>
          <br />
          <span className="muted small">ou clique · PDF, imagens, áudio, vídeo, .docx, .txt · Ctrl+V cola imagens</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function PasteTextDialog({ open, onClose, lesson, lessonPicker }: { open: boolean; onClose: () => void; lesson: number; lessonPicker?: ReactNode }) {
  const { refresh, toast, subjectId } = useStore();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const submit = async () => {
    try {
      await api.createText(name, content, subjectId ?? undefined, lesson || undefined);
      await refresh();
      setName('');
      setContent('');
      onClose();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Colar texto como fonte">
      <div className="stack">
        <label className="field">
          <span>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Transcrição aula 12" />
        </label>
        {lessonPicker}
        <label className="field">
          <span>Conteúdo</span>
          <textarea rows={12} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Cole a transcrição, o enunciado, suas anotações…" />
        </label>
        <div className="row gap">
          <button className="btn btn-primary" onClick={submit} disabled={!content.trim()}>
            Adicionar às fontes
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function TypeSwitch({ value, onChange }: { value: CardType; onChange: (t: CardType) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Tipo do cartão">
      {(Object.keys(TYPE_INFO) as CardType[]).map((t) => (
        <button key={t} role="radio" aria-checked={value === t} title={TYPE_INFO[t].hint} onClick={() => onChange(t)}>
          {TYPE_INFO[t].label}
        </button>
      ))}
    </div>
  );
}

function Composer({ files }: { files: FileSummary[] }) {
  const { refresh, startRun, toast, subjectId } = useStore();
  const [type, setType] = useState<CardType>('pergunta');
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState<Set<string>>(new Set());

  // Ao trocar de matéria, arquivos marcados em outra matéria somem da lista e não podem ir junto escondidos.
  const attached = [...attach].filter((id) => files.some((f) => f.id === id));
  const toggleAttach = (id: string) =>
    setAttach((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const ready = body.trim() || (type === 'geral' && attached.length > 0);

  const submit = async (answer: boolean) => {
    if (!ready) return toast(type === 'geral' ? 'Selecione pelo menos um arquivo para o cartão geral.' : 'Escreva a pergunta ou o texto.');
    const card = await api.createCard(type, body, attached, subjectId ?? undefined);
    setBody('');
    setAttach(new Set());
    await refresh();
    if (answer) startRun(`card:${card.id}`, { kind: 'card', cardId: card.id });
  };

  return (
    <div className="composer">
      <div className="row gap wrap">
        <TypeSwitch value={type} onChange={setType} />
        <span className="muted small">{TYPE_INFO[type].hint}</span>
      </div>
      <textarea
        className="composer-input"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={TYPE_INFO[type].placeholder}
        rows={type === 'texto' ? 5 : 2}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit(!e.shiftKey);
          }
        }}
      />
      {files.length > 0 && (
        <div className="chips" aria-label="Arquivos para vincular">
          <span className="muted small">Vincular:</span>
          {files
            .filter((f) => attach.has(f.id))
            .map((f) => (
              <LinkChip key={f.id} file={f} active onToggle={() => toggleAttach(f.id)} onRemove={() => toggleAttach(f.id)} />
            ))}
          {/* Em lista separada por aula: dá para juntar arquivos de várias aulas no mesmo cartão. */}
          <FilePicker files={files} selected={new Set(attached)} onToggle={toggleAttach} />
        </div>
      )}
      <div className="row gap">
        <button className="btn btn-primary" onClick={() => submit(true)} disabled={!ready}>
          <Play size={15} /> Adicionar e responder
        </button>
        <button className="btn btn-ghost" onClick={() => submit(false)} disabled={!ready}>
          Só adicionar
        </button>
        <span className="spacer" />
        <kbd className="muted small">Ctrl+Enter</kbd>
      </div>
    </div>
  );
}

function CardItem({
  card,
  files,
  highlighted,
  onHover,
  onUploadTo,
}: {
  card: Card;
  files: FileSummary[];
  highlighted: boolean;
  onHover: (id: string | null) => void;
  onUploadTo: (f: File[]) => Promise<FileSummary[]>;
}) {
  const { state, setState, refresh, runs, startRun, cancelRun, openChatWith, toast } = useStore();
  const [draft, setDraft] = useState(card.body);
  const [menu, setMenu] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const runKey = `card:${card.id}`;
  const run = runs[runKey];

  useEffect(() => setDraft(card.body), [card.body]);

  const links = state!.links.filter((l) => l.cardId === card.id);
  // Busca em todas as fontes, não só nas da matéria aberta: um vínculo ativo nunca pode ficar invisível.
  const linked = links.map((l) => ({ link: l, file: state!.files.find((f) => f.id === l.fileId)! })).filter((x) => x.file);
  const activeCount = linked.filter((x) => x.link.active && x.file.enabled).length;
  const last = card.answers.at(-1);

  const saveBody = async () => {
    if (draft !== card.body) {
      await api.patchCard(card.id, { body: draft });
      await refresh();
    }
  };

  // Alternar vínculo é a ação mais repetida: atualiza a tela na hora e confirma no servidor depois.
  const setLink = async (fileId: string, active: boolean) => {
    setState((s) =>
      s && {
        ...s,
        links: s.links.some((l) => l.cardId === card.id && l.fileId === fileId)
          ? s.links.map((l) => (l.cardId === card.id && l.fileId === fileId ? { ...l, active } : l))
          : [...s.links, { cardId: card.id, fileId, active }],
      },
    );
    await api.setLink(fileId, card.id, active).catch((e) => toast(e.message, 'error'));
    refresh();
  };
  const unlink = async (fileId: string) => {
    await api.deleteLink(fileId, card.id);
    refresh();
  };

  const answer = async () => {
    await saveBody();
    startRun(runKey, { kind: 'card', cardId: card.id });
  };

  return (
    <article
      className={`card card-${card.type} ${highlighted ? 'card-hl' : ''} ${dropOver ? 'card-drop' : ''}`}
      onMouseEnter={() => onHover(card.id)}
      onMouseLeave={() => onHover(null)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(FILE_DRAG) || e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropOver(true);
        }
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDropOver(false);
        const id = e.dataTransfer.getData(FILE_DRAG);
        if (id) return setLink(id, true);
        // Arquivo vindo do computador direto no cartão: envia e já vincula.
        const created = await onUploadTo([...e.dataTransfer.files]);
        for (const f of created) await api.setLink(f.id, card.id, true);
        refresh();
      }}
    >
      <header className="card-head">
        <span className="card-type">{TYPE_INFO[card.type].label}</span>
        <span className="muted small">{new Date(card.createdAt).toLocaleDateString('pt-BR')}</span>
        <span className="spacer" />
        <SubjectSelect
          value={card.subjectId}
          onChange={async (subjectId) => {
            await api.patchCard(card.id, { subjectId });
            await refresh();
          }}
        />
        <div className="menu-wrap">
          <button className="icon-btn" aria-label="Mais ações" aria-expanded={menu} onClick={() => setMenu((m) => !m)} onBlur={() => setTimeout(() => setMenu(false), 150)}>
            <MoreHorizontal size={18} />
          </button>
          {menu && (
            <div className="menu" role="menu">
              {(Object.keys(TYPE_INFO) as CardType[])
                .filter((t) => t !== card.type)
                .map((t) => (
                  <button key={t} role="menuitem" onClick={async () => (await api.patchCard(card.id, { type: t }), refresh())}>
                    Mudar para {TYPE_INFO[t].label}
                  </button>
                ))}
              <button role="menuitem" onClick={() => openChatWith({ cardIds: [card.id] }, card.body.slice(0, 60) || 'Cartão geral', card.subjectId)}>
                <MessageCircle size={15} /> Discutir no chat
              </button>
              <button role="menuitem" onClick={async () => (await api.duplicateCard(card.id), refresh())}>
                <Copy size={15} /> Duplicar
              </button>
              {card.answers.length > 0 && (
                <button role="menuitem" onClick={async () => (await api.clearAnswers(card.id), refresh())}>
                  <Eraser size={15} /> Limpar respostas
                </button>
              )}
              <button
                role="menuitem"
                className="danger"
                onClick={async () => {
                  if (!confirm('Excluir este cartão e as respostas dele?')) return;
                  await api.deleteCard(card.id);
                  refresh();
                }}
              >
                <Trash2 size={15} /> Excluir
              </button>
            </div>
          )}
        </div>
      </header>

      <textarea
        className="card-body"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={saveBody}
        placeholder={TYPE_INFO[card.type].placeholder}
        aria-label="Texto do cartão"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            answer();
          }
        }}
      />

      <div className="chips">
        {linked.map(({ link, file }) => (
          <LinkChip key={file.id} file={file} active={link.active} onToggle={() => setLink(file.id, !link.active)} onRemove={() => unlink(file.id)} />
        ))}
        <FilePicker
          files={files}
          selected={new Set(linked.map((x) => x.file.id))}
          onToggle={(id) => (linked.some((x) => x.file.id === id) ? unlink(id) : setLink(id, true))}
        />
        {linked.length === 0 && <span className="muted small">Nenhum arquivo: arraste um aqui ou use “+ arquivo”.</span>}
      </div>

      <footer className="card-foot">
        {run?.running ? (
          <button className="btn" onClick={() => cancelRun(runKey)}>
            Parar
          </button>
        ) : (
          <button className="btn btn-primary" onClick={answer}>
            <Play size={15} /> {last ? 'Responder de novo' : 'Responder'}
          </button>
        )}
        <span className="muted small">
          {activeCount} de {linked.length} arquivo(s) ativo(s)
        </span>
      </footer>

      {run && (run.running || run.error || run.warnings.length > 0) && (
        <RunOutput run={run.running || run.error ? run : { ...run, text: '' }} onCancel={() => cancelRun(runKey)} />
      )}

      {!run?.running && last && (
        <div className="answer">
          <div className="answer-meta">
            <span>{last.provider}</span>
            <span>· {new Date(last.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            <span>· {last.fileIds.length} arquivo(s)</span>
            <span className="spacer" />
            <CopyButton text={last.text} />
            <button className="btn btn-ghost btn-sm" onClick={() => openChatWith({ cardIds: [card.id] }, card.body.slice(0, 60) || 'Cartão geral', card.subjectId)}>
              <MessageCircle size={15} /> Discutir
            </button>
          </div>
          <Markdown text={last.text} />
          {card.answers.length > 1 && (
            <div className="history">
              <button className="link-btn small" onClick={() => setShowHistory((s) => !s)}>
                <History size={14} /> {showHistory ? 'Esconder' : 'Ver'} {card.answers.length - 1} resposta(s) anterior(es)
              </button>
              {showHistory &&
                card.answers
                  .slice(0, -1)
                  .reverse()
                  .map((a) => (
                    <details key={a.id} className="history-item">
                      <summary>
                        {new Date(a.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {a.provider}
                      </summary>
                      <Markdown text={a.text} />
                    </details>
                  ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
