import {
  DeleteConfirmModal,
  type DeleteConfirmModalProps,
} from '../../../components/ui/delete-confirm-modal';

export type FinanceDeleteConfirmModalProps = Omit<DeleteConfirmModalProps, 'title'> & {
  title?: string;
};

export function FinanceDeleteConfirmModal({
  title = 'Excluir lançamento',
  ...props
}: FinanceDeleteConfirmModalProps) {
  return <DeleteConfirmModal title={title} {...props} />;
}
