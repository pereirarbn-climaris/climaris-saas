/** OS vinculada ao wizard de recebimento (pré-preenchimento). */
export type LinkedServiceOrder = {
  serviceOrderId: number;
  clientId: number;
  clientLabel: string;
  totalAmount: number;
  orderNumber?: string;
};

export type ServiceOrderPaymentStatus = 'pendente' | 'pago' | 'parcial';
