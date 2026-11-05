import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  title: string;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Si es false, no se cierra con Escape ni tocando fuera. */
  dismissible?: boolean;
  labelId?: string;
}

/** Diálogo accesible: atrapa el foco, Escape para cerrar, devuelve el foco al cerrar. */
export function Modal({ open, title, onClose, children, footer, size = 'md', dismissible = true }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    prev.current = document.activeElement;
    const el = ref.current;
    const focusables = () =>
      Array.from(el?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? []).filter(
        (x) => !x.hasAttribute('disabled'),
      );
    window.setTimeout(() => (focusables()[0] ?? el)?.focus(), 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible && onClose) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (prev.current instanceof HTMLElement) prev.current.focus();
    };
  }, [open, dismissible, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose?.(); }}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header className="modal-head">
          <h2>{title}</h2>
          {dismissible && onClose ? (
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <Icon name="close" />
            </button>
          ) : null}
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmText, onConfirm, onCancel, danger }: {
  open: boolean; title: string; message: ReactNode; confirmText: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-gold'}`} onClick={onConfirm}>{confirmText}</button>
        </>
      }
    >
      <div className="confirm-msg">{message}</div>
    </Modal>
  );
}
