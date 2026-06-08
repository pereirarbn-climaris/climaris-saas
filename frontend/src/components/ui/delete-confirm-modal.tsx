import { useId, type ReactNode } from 'react';
import type { ButtonVariant } from './button';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';
import { Button } from './button';

export type DeleteConfirmModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  hint?: string;
  /** Conteúdo extra abaixo da descrição (ex.: resumo do item). */
  detail?: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  confirmVariant?: ButtonVariant;
  busy?: boolean;
  onConfirm: () => void;
};

export function DeleteConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  hint = 'Esta ação não pode ser desfeita.',
  detail,
  confirmLabel = 'Excluir',
  busyLabel = 'Excluindo…',
  confirmVariant = 'destructive',
  busy = false,
  onConfirm,
}: DeleteConfirmModalProps) {
  const titleId = useId();
  const descId = useId();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent labelledBy={titleId} describedBy={descId}>
        <AlertDialogHeader>
          <AlertDialogTitle id={titleId}>{title}</AlertDialogTitle>
          <AlertDialogDescription id={descId}>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {hint || detail ? (
          <AlertDialogBody>
            {hint ? (
              <p style={{ margin: detail ? '0 0 0.75rem' : 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                {hint}
              </p>
            ) : null}
            {detail}
          </AlertDialogBody>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </AlertDialogCancel>
          <Button type="button" variant={confirmVariant} disabled={busy} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
