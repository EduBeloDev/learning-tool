import { useState } from 'react';
import { AlertTriangle, Check, Copy, Download, LoaderCircle, Square } from 'lucide-react';
import type { RunState } from '../store';
import { Markdown } from './Markdown';

export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check size={15} /> : <Copy size={15} />} {done ? 'Copiado' : label}
    </button>
  );
}

export function DownloadButton({ text, filename }: { text: string; filename: string }) {
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      <Download size={15} /> Baixar .md
    </button>
  );
}

/** Os três estados que costumam ser esquecidos: carregando (com o que está acontecendo), aviso e erro. */
export function RunOutput({ run, onCancel }: { run: RunState; onCancel?: () => void }) {
  return (
    <div className="run" aria-live="polite">
      {run.warnings.map((w, i) => (
        <p key={i} className="notice notice-warn">
          <AlertTriangle size={15} /> {w}
        </p>
      ))}
      {run.running && (
        <div className="run-status">
          <LoaderCircle size={16} className="spin" />
          <span>{run.status ?? 'Escrevendo…'}</span>
          {onCancel && (
            <button className="btn btn-ghost btn-sm" onClick={onCancel}>
              <Square size={13} /> Parar
            </button>
          )}
        </div>
      )}
      {run.text && <Markdown text={run.text} />}
      {run.error && (
        <p className="notice notice-error" role="alert">
          <AlertTriangle size={15} /> {run.error}
        </p>
      )}
    </div>
  );
}
