import { useEffect, useId, useState } from 'react';
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
import {
  SERIES_ACTION_SCOPE_LABELS,
  SERIES_ACTION_TITLES,
  type EditSeriesKind,
  type EditSeriesScope,
  type SeriesBulkAction,
  seriesKindLabel,
} from '../financeEntryEdit';
import { EditSeriesScopeField } from './EditSeriesScopeField';

export type SeriesActionScopeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: SeriesBulkAction;
  seriesKind: EditSeriesKind;
  hint?: string;
  busy?: boolean;
  onConfirm: (scope: EditSeriesScope) => void;
};

export function SeriesActionScopeModal({
  open,
  onOpenChange,
  action,
  seriesKind,
  hint,
  busy = false,
  onConfirm,
}: SeriesActionScopeModalProps) {
  const titleId = useId();
  const descId = useId();
  const [scope, setScope] = useState<EditSeriesScope | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope(null);
    setTouched(false);
  }, [open, action]);

  const kindLabel = seriesKindLabel(seriesKind);
  const verb =
    action === 'delete' ? 'excluir' : action === 'paid' ? 'marcar como pago' : 'cancelar';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent wide labelledBy={titleId} describedBy={descId}>
        <AlertDialogHeader>
          <AlertDialogTitle id={titleId}>{SERIES_ACTION_TITLES[action]}</AlertDialogTitle>
          <AlertDialogDescription id={descId}>
            {hint ? `${hint}. ` : ''}
            Escolha em quais parcelas da série {kindLabel} deseja {verb}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogBody>
          <EditSeriesScopeField
            seriesKind={seriesKind}
            value={scope}
            onChange={(s) => {
              setScope(s);
              setTouched(false);
            }}
            hint={hint}
            invalid={touched && scope == null}
            legend={`Onde ${verb}?`}
            labels={SERIES_ACTION_SCOPE_LABELS}
          />
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={() => onOpenChange(false)}>
            Voltar
          </AlertDialogCancel>
          <Button
            type="button"
            variant={action === 'delete' ? 'destructive' : 'default'}
            disabled={busy}
            onClick={() => {
              if (scope == null) {
                setTouched(true);
                return;
              }
              onConfirm(scope);
            }}
          >
            {busy ? 'Processando…' : 'Confirmar'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
