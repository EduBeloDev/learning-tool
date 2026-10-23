import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** <dialog> nativo: foco preso no modal, Esc fecha e leitores de tela entendem sem esforço extra. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="dialog-inner">
          <header className="dialog-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <div className="dialog-body">{children}</div>
        </div>
      )}
    </dialog>
  );
}
