import { useId } from 'react';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';

export type FinanceDeleteConfirmModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description: string;
  busy?: boolean;
  onConfirm: () => void;
};

export function FinanceDeleteConfirmModal({
  open,
  onOpenChange,
  title = 'Excluir lançamento',
  description,
  busy = false,
  onConfirm,
}: FinanceDeleteConfirmModalProps) {
  const titleId = useId();
  const descId = useId();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent labelledBy={titleId} describedBy={descId}>
        <AlertDialogHeader>
          <AlertDialogTitle id={titleId}>{title}</AlertDialogTitle>
          <AlertDialogDescription id={descId}>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogBody>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Esta ação não pode ser desfeita.
          </p>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? 'Excluindo…' : 'Excluir'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
