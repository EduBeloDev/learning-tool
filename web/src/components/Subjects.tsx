import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_LESSONS, SUBJECT_COLORS, type FileSummary, type Subject, type SubjectColor } from '../../../shared/types';
import { api } from '../api';
import { useStore } from '../store';
import { Dialog } from './Dialog';
import { FILE_DRAG } from './files';

const COLOR_NAME: Record<SubjectColor, string> = {
  petroleo: 'Petróleo',
  verde: 'Verde',
  vinho: 'Vinho',
  ocre: 'Ocre',
  roxo: 'Roxo',
  grafite: 'Grafite',
};

export const lessonLabel = (n?: number) => (n ? `Aula ${n}` : 'Sem aula');
export const lessonNumbers = (s: Subject) => Array.from({ length: s.lessons }, (_, i) => i + 1);

export interface FileGroup {
  key: string;
  /** Vazio quando nenhum arquivo tem matéria: não há o que separar. */
  label: string;
  files: FileSummary[];
}

/**
 * Agrupa arquivos por matéria e aula, na ordem das matérias e das aulas ("Sem aula" primeiro, "Sem matéria" por último).
 * Com uma matéria só, o rótulo é só a aula; misturando matérias, vira "Cálculo · Aula 3".
 */
export function groupFiles(files: FileSummary[], subjects: Subject[]): FileGroup[] {
  const single = new Set(files.map((f) => f.subjectId)).size <= 1;
  const groups = new Map<string, FileGroup & { order: number }>();
  for (const f of files) {
    const i = subjects.findIndex((s) => s.id === f.subjectId);
    const key = `${i < 0 ? '' : f.subjectId}:${f.lesson ?? 0}`;
    let g = groups.get(key);
    if (!g) {
      const label = i < 0 ? (single ? '' : 'Sem matéria') : single ? lessonLabel(f.lesson) : `${subjects[i].name} · ${lessonLabel(f.lesson)}`;
      g = { key, label, files: [], order: (i < 0 ? subjects.length : i) * 1000 + (f.lesson ?? 0) };
      groups.set(key, g);
    }
    g.files.push(f);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}

/**
 * Abas de matéria no topo da página. A matéria aberta filtra Workspace, Ferramentas e Chat,
 * e tudo que for criado nela já nasce nela. Soltar uma fonte numa aba muda a matéria da fonte.
 */
export function SubjectBar() {
  const { state, subjectId, setSubjectId, refresh, toast } = useStore();
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  if (!state) return null;
  const { subjects } = state;
  const current = subjects.find((s) => s.id === subjectId);

  const moveFile = async (fileId: string, s: Subject) => {
    const f = state.files.find((x) => x.id === fileId);
    if (!f || f.subjectId === s.id) return;
    await api.patchFile(fileId, { subjectId: s.id });
    await refresh();
    toast(`Fonte movida para ${s.name}, em "Sem aula". Abra a matéria e arraste para a pasta da aula.`, 'ok');
  };

  return (
    <>
      <nav className="subjects" aria-label="Matérias">
        {subjects.length > 0 && (
          <button className="subject-tab" aria-pressed={subjectId === null} onClick={() => setSubjectId(null)}>
            Todas
          </button>
        )}
        {subjects.map((s) => (
          <button
            key={s.id}
            className={`subject-tab subj-${s.color} ${dropOn === s.id ? 'drop' : ''}`}
            aria-pressed={s.id === subjectId}
            onClick={() => setSubjectId(s.id)}
            onDoubleClick={() => setEditing(s)}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(FILE_DRAG)) return;
              e.preventDefault();
              setDropOn(s.id);
            }}
            onDragLeave={() => setDropOn(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDropOn(null);
              const id = e.dataTransfer.getData(FILE_DRAG);
              if (id) moveFile(id, s);
            }}
          >
            <span className="subject-dot" aria-hidden /> {s.name}
          </button>
        ))}
        {current && (
          <button className="icon-btn" onClick={() => setEditing(current)} aria-label={`Editar ${current.name}`} title="Renomear, mudar a cor ou excluir">
            <Pencil size={15} />
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing('new')}>
          <Plus size={15} /> {subjects.length ? 'Matéria' : 'Nova matéria'}
        </button>
        {subjects.length === 0 && <span className="muted small">Separe fontes, cartões e conversas por matéria.</span>}
      </nav>
      {editing && <SubjectDialog key={editing === 'new' ? 'new' : editing.id} subject={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function SubjectDialog({ subject, onClose }: { subject: Subject | 'new'; onClose: () => void }) {
  const { state, refresh, toast, setSubjectId } = useStore();
  const subjects = state?.subjects ?? [];
  const isNew = subject === 'new';
  const [name, setName] = useState(isNew ? '' : subject.name);
  const [lessons, setLessons] = useState(String(isNew ? DEFAULT_LESSONS : subject.lessons));
  const lessonsN = Number(lessons);
  const lessonsOk = Number.isInteger(lessonsN) && lessonsN >= 1 && lessonsN <= 60;
  const [color, setColor] = useState<SubjectColor>(() => {
    if (!isNew) return subject.color;
    const used = new Set(subjects.map((s) => s.color));
    return SUBJECT_COLORS.find((c) => !used.has(c)) ?? SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (isNew) {
        const s = await api.createSubject(name, color, lessonsN);
        await refresh();
        setSubjectId(s.id);
      } else {
        const orphans = (state?.files ?? []).filter((f) => f.subjectId === subject.id && f.lesson && f.lesson > lessonsN).length;
        if (orphans && !confirm(`${orphans} arquivo(s) estão em aulas depois da ${lessonsN}. Eles não são apagados: vão para "Sem aula". Continuar?`)) return;
        await api.patchSubject(subject.id, { name, color, lessons: lessonsN });
        await refresh();
      }
      onClose();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const remove = async () => {
    if (isNew) return;
    if (!confirm(`Excluir a matéria "${subject.name}"? Os arquivos, cartões e conversas dela não são apagados: eles ficam sem matéria, em "Todas".`)) return;
    await api.deleteSubject(subject.id);
    setSubjectId(null);
    await refresh();
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title={isNew ? 'Nova matéria' : 'Editar matéria'}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Cálculo I, Física, Redação" autoFocus />
        </label>
        <label className="field">
          <span>Número de aulas</span>
          <input type="number" min={1} max={60} value={lessons} onChange={(e) => setLessons(e.target.value)} className="input-narrow" />
          <span className="muted small">Cada aula vira uma pasta nas Fontes (Aula 1, Aula 2…). Dá para mudar depois.</span>
        </label>
        <div className="field">
          <span id="subject-color">Cor</span>
          <div className="swatches" role="radiogroup" aria-labelledby="subject-color">
            {SUBJECT_COLORS.map((c) => (
              <label key={c} className={`swatch subj-${c}`} title={COLOR_NAME[c]}>
                <input type="radio" name="subject-color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={COLOR_NAME[c]} />
              </label>
            ))}
          </div>
        </div>
        {isNew && <p className="muted small">Ao criar, a matéria abre: o que você enviar ou criar a partir daí já fica nela.</p>}
        <div className="row gap">
          <button className="btn btn-primary" type="submit" disabled={!name.trim() || !lessonsOk}>
            {isNew ? 'Criar matéria' : 'Salvar'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <span className="spacer" />
          {!isNew && (
            <button className="btn btn-danger-ghost" type="button" onClick={remove}>
              <Trash2 size={15} /> Excluir
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Mostra e muda a matéria de um cartão ou conversa; com `withLessons`, de um arquivo (matéria + aula).
 * Some enquanto não existe nenhuma matéria.
 */
export function SubjectSelect({
  value,
  lesson,
  withLessons,
  onChange,
}: {
  value?: string;
  lesson?: number;
  withLessons?: boolean;
  onChange: (subjectId: string | null, lesson: number | null) => Promise<void>;
}) {
  const { state, subjectId, toast } = useStore();
  const subjects = state?.subjects ?? [];
  if (!subjects.length) return null;
  const color = subjects.find((s) => s.id === value)?.color;
  return (
    <div className={`subject-select ${color ? `subj-${color}` : ''}`}>
      <span className="subject-dot" aria-hidden />
      <select
        value={value ? (withLessons ? `${value}:${lesson ?? 0}` : value) : ''}
        aria-label={withLessons ? 'Matéria e aula' : 'Matéria'}
        title={withLessons ? 'Mudar de matéria ou de aula' : 'Mudar de matéria'}
        onChange={async (e) => {
          const [id = '', n = '0'] = e.target.value.split(':');
          await onChange(id || null, Number(n) || null);
          // Com uma matéria aberta, o item some da tela: avisa para onde ele foi.
          if (subjectId !== null && (id || null) !== subjectId) toast(`Movido para ${subjects.find((s) => s.id === id)?.name ?? '"Sem matéria" (veja em Todas)'}.`, 'ok');
        }}
      >
        <option value="">Sem matéria</option>
        {subjects.map((s) =>
          withLessons ? (
            <optgroup key={s.id} label={s.name}>
              {[0, ...lessonNumbers(s)].map((n) => (
                <option key={n} value={`${s.id}:${n}`}>
                  {s.name} · {lessonLabel(n)}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ),
        )}
      </select>
    </div>
  );
}
