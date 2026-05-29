import { ApiError } from '../../services/api';

export class FinanceServiceError extends Error {
  readonly code:
    | 'PLANO_INSUFICIENTE'
    | 'CONTA_NAO_ENCONTRADA'
    | 'CONTA_INATIVA'
    | 'VALIDACAO'
    | 'PERIODO_INVALIDO'
    | 'NAO_AUTORIZADO'
    | 'API_ERRO';

  constructor(
    message: string,
    code:
      | 'PLANO_INSUFICIENTE'
      | 'CONTA_NAO_ENCONTRADA'
      | 'CONTA_INATIVA'
      | 'VALIDACAO'
      | 'PERIODO_INVALIDO'
      | 'NAO_AUTORIZADO'
      | 'API_ERRO',
  ) {
    super(message);
    this.name = 'FinanceServiceError';
    this.code = code;
  }
}

/** Converte ApiError / Error genérico em FinanceServiceError. */
export function mapToFinanceServiceError(err: unknown): FinanceServiceError {
  if (err instanceof FinanceServiceError) return err;

  if (err instanceof ApiError) {
    const msg = err.message;
    if (err.status === 403) {
      return new FinanceServiceError(
        msg.includes('plano') ? msg : `${msg} Verifique o plano do workspace.`,
        'PLANO_INSUFICIENTE',
      );
    }
    if (err.status === 404) {
      return new FinanceServiceError(msg, 'CONTA_NAO_ENCONTRADA');
    }
    if (err.status === 400 || err.status === 422) {
      return new FinanceServiceError(msg, 'VALIDACAO');
    }
    if (err.status === 401) {
      return new FinanceServiceError(msg, 'NAO_AUTORIZADO');
    }
    return new FinanceServiceError(msg, 'API_ERRO');
  }

  if (err instanceof Error) {
    const lower = err.message.toLowerCase();
    if (lower.includes('sessão') || lower.includes('sessao') || lower.includes('expirad')) {
      return new FinanceServiceError(err.message, 'NAO_AUTORIZADO');
    }
    if (lower.includes('plano') || lower.includes('permissão') || lower.includes('permissao')) {
      return new FinanceServiceError(err.message, 'PLANO_INSUFICIENTE');
    }
    return new FinanceServiceError(err.message, 'API_ERRO');
  }

  return new FinanceServiceError('Erro inesperado ao comunicar com a API.', 'API_ERRO');
}
