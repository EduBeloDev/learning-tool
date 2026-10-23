import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioLines, Eye, EyeOff, FileText, FileType2, Image as ImageIcon, LoaderCircle, Mic, Plus, ScanText, Trash2, X } from 'lucide-react';
import type { FileKind, FileRec, FileSummary, TextSource } from '../../../shared/types';
import { api } from '../api';
import { useStore } from '../store';
import { Dialog } from './Dialog';

export const KIND_NAME: Record<FileKind, string> = { image: 'Imagem', pdf: 'PDF', audio: 'Áudio', text: 'Texto', doc: 'Word' };

const SOURCE_NAME: Record<TextSource, string> = {
  arquivo: 'conteúdo do arquivo',
  pdf: 'extraído do PDF',
  docx: 'extraído do Word',
  transcricao: 'transcrição automática',
  visao: 'leitura pela IA de visão',
  manual: 'editado por você',
};

export function FileIcon({ kind, size = 18 }: { kind: FileKind; size?: number }) {
  const Icon = { image: ImageIcon, pdf: FileText, audio: AudioLines, text: ScanText, doc: FileType2 }[kind];
  return <Icon size={size} aria-hidden className={`file-icon file-icon-${kind}`} />;
}

export const formatSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`;

/** Uma linha curta dizendo o que a IA vai conseguir aproveitar deste arquivo. */
export function FileStatus({ file }: { file: FileSummary }) {
  const { state, transcriptions, queueTranscription } = useStore();
  const provider = state?.settings.provider;
  const job = transcriptions[file.id];

  if (file.kind === 'audio') {
    if (job) {
      const pct = 'progress' in job && job.progress !== undefined ? ` ${Math.round(job.progress * 100)}%` : '';
      const label = { 'na fila': 'na fila', decodificando: 'lendo áudio…', modelo: 'baixando modelo', transcrevendo: 'transcrevendo' }[job.stage];
      return (
        <span className="file-status busy">
          <LoaderCircle size={13} className="spin" /> {label}
          {pct}
        </span>
      );
    }
    if (file.textChars) return <span className="file-status ok">transcrito</span>;
    return (
      <button className="file-status action" onClick={() => queueTranscription(file.id)}>
        <Mic size={13} /> transcrever
      </button>
    );
  }
  if (file.kind === 'pdf') {
    const pages = file.pages ? `${file.pages} pág.` : '';
    if (file.textChars) return <span className="file-status">{pages} · texto ok</span>;
    return <span className={`file-status ${provider === 'nvidia' ? 'warn' : ''}`}>{pages} · escaneado</span>;
  }
  if (file.kind === 'image') {
    if (provider === 'claude-code') return <span className="file-status">o Claude vê a imagem</span>;
    return <span className="file-status">{file.textChars ? 'lida pela IA' : 'será lida pela IA'}</span>;
  }
  return <span className="file-status">{file.textChars.toLocaleString('pt-BR')} caracteres</span>;
}

/**
 * Vínculo arquivo↔cartão. Ativo = "marca-texto" amarelo; inativo = contorno tracejado.
 * Clicar alterna; o × desfaz o vínculo.
 */
export function LinkChip({
  file,
  active,
  onToggle,
  onRemove,
  dimmed,
}: {
  file: FileSummary;
  active: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  dimmed?: boolean;
}) {
  const globallyOff = !file.enabled;
  return (
    <span className={`chip ${active && !globallyOff ? 'chip-on' : 'chip-off'} ${dimmed ? 'chip-dim' : ''}`}>
      <button
        className="chip-main"
        onClick={onToggle}
        aria-pressed={active}
        title={
          globallyOff
            ? 'Este arquivo está desligado em Fontes; ele não será enviado.'
            : active
              ? 'Ativo: será enviado. Clique para desativar.'
              : 'Inativo: não será enviado. Clique para ativar.'
        }
      >
        <FileIcon kind={file.kind} size={14} />
        <span className="chip-name">{file.name}</span>
        {active ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
      </button>
      {onRemove && (
        <button className="chip-x" onClick={onRemove} aria-label={`Desvincular ${file.name}`} title="Desvincular">
          <X size={13} />
        </button>
      )}
    </span>
  );
}

/** Lista de arquivos com caixas de seleção, aberta por um botão "+ arquivo". */
export function FilePicker({
  files,
  selected,
  onToggle,
  label = 'arquivo',
  children,
}: {
  files: FileSummary[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  label?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="picker" ref={ref}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Plus size={14} /> {label}
      </button>
      {open && (
        <div className="picker-pop" role="menu">
          {files.length === 0 && <p className="muted small">Nenhum arquivo ainda. Envie em "Fontes".</p>}
          {files.map((f) => (
            <label key={f.id} className="picker-row">
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => onToggle(f.id)} />
              <FileIcon kind={f.kind} size={15} />
              <span className="ellipsis">{f.name}</span>
            </label>
          ))}
          {children}
        </div>
      )}
    </div>
  );
}

/** Abre um arquivo: prévia, texto que a IA recebe (editável) e ações. */
export function FileDrawer({ fileId, onClose }: { fileId: string | null; onClose: () => void }) {
  const { state, refresh, toast, queueTranscription, transcriptions } = useStore();
  const [file, setFile] = useState<FileRec | null>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const summary = state?.files.find((f) => f.id === fileId);

  // Recarrega quando o resumo muda (ex.: a transcrição terminou enquanto o painel estava aberto).
  useEffect(() => {
    if (!fileId) return setFile(null);
    api.getFile(fileId).then((f) => {
      setFile(f);
      setText(f.text ?? '');
      setName(f.name);
    });
  }, [fileId, summary?.textChars, summary?.textSource]);

  if (!fileId) return null;
  const provider = state?.settings.provider;
  const dirty = file && (text !== (file.text ?? '') || name !== file.name);

  const saveChanges = async () => {
    if (!file) return;
    await api.patchFile(file.id, { name, ...(text !== (file.text ?? '') ? { text } : {}) });
    await refresh();
    toast('Arquivo atualizado.', 'ok');
  };

  const readVision = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const f = await api.visionFile(file.id);
      setFile(f);
      setText(f.text ?? '');
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!file || !confirm(`Excluir "${file.name}"? Os vínculos com cartões também serão removidos.`)) return;
    await api.deleteFile(file.id);
    await refresh();
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title={file ? <><FileIcon kind={file.kind} /> {file.name}</> : 'Carregando…'} wide>
      {file && (
        <div className="drawer">
          <div className="drawer-preview">
            {file.kind === 'image' && <img src={api.rawUrl(file.id)} alt={file.name} />}
            {file.kind === 'pdf' && <iframe src={api.rawUrl(file.id)} title={file.name} />}
            {file.kind === 'audio' &&
              (file.mime.startsWith('video/') ? <video src={api.rawUrl(file.id)} controls /> : <audio src={api.rawUrl(file.id)} controls />)}
            {(file.kind === 'text' || file.kind === 'doc') && <p className="muted">O conteúdo está no campo ao lado.</p>}
            <p className="muted small">
              {KIND_NAME[file.kind]} · {formatSize(file.size)}
              {file.pages ? ` · ${file.pages} páginas` : ''}
            </p>
          </div>

          <div className="drawer-text">
            <label className="field">
              <span>Nome</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field grow">
              <span>
                Texto que a IA recebe
                {file.textSource && <em className="muted"> · {SOURCE_NAME[file.textSource]}</em>}
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  file.kind === 'audio'
                    ? 'Sem transcrição ainda. Clique em "Transcrever" ou cole a transcrição aqui.'
                    : file.kind === 'image'
                      ? 'Sem leitura ainda. Com a NVIDIA, a imagem é lida automaticamente na primeira vez em que for usada.'
                      : 'Sem texto extraído.'
                }
              />
            </label>
            {provider === 'claude-code' && (file.kind === 'image' || file.kind === 'pdf') && (
              <p className="notice">O Claude Code lê o arquivo original (com figuras e fórmulas). Este texto só é usado quando a IA é a NVIDIA.</p>
            )}
            <div className="row gap wrap">
              <button className="btn btn-primary" disabled={!dirty} onClick={saveChanges}>
                Salvar
              </button>
              {file.kind === 'audio' && (
                <button className="btn" disabled={Boolean(transcriptions[file.id])} onClick={() => queueTranscription(file.id)}>
                  <Mic size={15} /> {file.text ? 'Transcrever de novo' : 'Transcrever'}
                </button>
              )}
              {file.kind === 'image' && provider === 'nvidia' && (
                <button className="btn" disabled={busy} onClick={readVision}>
                  {busy ? <LoaderCircle size={15} className="spin" /> : <ScanText size={15} />} Ler com IA de visão
                </button>
              )}
              <span className="spacer" />
              <button className="btn btn-danger-ghost" onClick={remove}>
                <Trash2 size={15} /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
