import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Cancel first: the safe default for a destructive prompt.
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // The dialog also closes itself (Escape). Closing it from the parent arrives here with `open` already false.
  return (
    <dialog
      ref={dialogRef}
      className="topcoat-dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={() => {
        if (open) onCancel();
      }}
    >
      <h2 className="topcoat-dialog__title" id={titleId}>
        {title}
      </h2>
      <p className="topcoat-dialog__body" id={bodyId}>
        {children}
      </p>
      <div className="topcoat-dialog__actions">
        <button type="button" className="topcoat-button" ref={cancelRef} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="topcoat-button--cta" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
