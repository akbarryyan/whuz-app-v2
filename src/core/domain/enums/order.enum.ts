export enum OrderStatus {
  CREATED = "CREATED",
  WAITING_PAYMENT = "WAITING_PAYMENT",
  PAID = "PAID",
  PROCESSING_PROVIDER = "PROCESSING_PROVIDER",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
  REFUNDED = "REFUNDED",
}

export enum PaymentMethod {
  WALLET = "WALLET",
  PAYMENT_GATEWAY = "PAYMENT_GATEWAY",
}

export enum InvoiceStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

/**
 * Kosakata tipe LedgerEntry.
 *
 * Kode saat ini menulis literal string, bukan enum ini — jadi enum ini berperan
 * sebagai dokumentasi kosakata yang sah. Empat tipe terakhir sempat tidak
 * tercantum padahal dipakai; daftar di bawah sudah dicocokkan dengan yang
 * benar-benar ditulis kode.
 */
export enum LedgerType {
  HOLD = "HOLD",
  DEBIT = "DEBIT",
  CREDIT = "CREDIT",
  RELEASE = "RELEASE",
  REFUND = "REFUND",
  COMMISSION = "COMMISSION",
  WITHDRAW_HOLD = "WITHDRAW_HOLD",
  WITHDRAW_PAID = "WITHDRAW_PAID",
  WITHDRAW_RELEASE = "WITHDRAW_RELEASE",
}

export enum WebhookSource {
  POPPAY = "POPPAY",
  DIGIFLAZZ = "DIGIFLAZZ",
  VIP_RESELLER = "VIP_RESELLER",
}
