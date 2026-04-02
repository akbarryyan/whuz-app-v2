import { getSiteConfig } from "@/lib/site-config";

interface PoppayBankListFilter {
  key: string;
  value: string;
}

interface PoppayBankRecord {
  m_b_c: string;
  m_b_n: string;
  m_b_s: string;
  m_b_cu: string;
  m_b_ia: boolean;
  m_b_ca: string;
  m_b_cb: string;
  m_b_ua: string;
  m_b_im: boolean;
}

interface PoppayBankListResponse {
  success: boolean;
  code: number;
  data?: {
    recordsTotal: number;
    recordsFiltered: number;
    draw: number;
    data: PoppayBankRecord[];
    other: unknown;
  };
  message?: string;
}

interface PoppayCreateIncomingResponse {
  success: boolean;
  code: number;
  data?: {
    ref_id: string;
    ext_ref_id: string;
    agg_ref_id: string;
    checkout_url: string;
    expired_at: string;
    raw_qr: string;
  };
  message?: string;
}

interface PoppayIncomingInquiryResponse {
  success: boolean;
  code: number;
  data?: Record<string, unknown> | null;
  message?: string;
}

export interface ListBanksInput {
  start?: number;
  length?: number;
  filters?: PoppayBankListFilter[];
}

export interface PoppayBank {
  code: string;
  name: string;
  swiftCode: string;
  currency: string;
  isActive: boolean;
  isManual: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface CreateIncomingInput {
  aggRefId: string;
  amount: number;
  notes: string;
  payorName?: string | null;
  payorEmail?: string | null;
  callbackUrl?: string | null;
  expirationInterval?: number;
}

export interface PoppayIncomingTransaction {
  refId: string;
  externalRefId: string;
  aggregatorRefId: string;
  checkoutUrl: string;
  expiredAt: string;
  rawQr: string;
}

export interface PoppayIncomingInquiryResult {
  uid: string;
  status: "pending" | "completed" | "expired" | "failed" | "unknown";
  statusCode?: number;
  raw: Record<string, unknown> | null;
}

function mapPoppayStatusCode(statusCode: number | null | undefined): PoppayIncomingInquiryResult["status"] {
  if (statusCode === 0) return "pending";
  if (statusCode === 1 || statusCode === 2 || statusCode === 4) return "failed";
  if (statusCode === 3) return "expired";
  if (statusCode === 5) return "completed";
  return "unknown";
}

interface PoppayRuntimeConfig {
  baseUrl: string;
  versionPath: string;
  integratorToken: string;
  aggregatorCode: string;
  merchantAccountNumber: string;
  secretKey: string;
}

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildPoppayBaseUrlFromValues(explicitBaseValue: string, hostValue: string, portValue: string): string {
  const explicitBase = normalizeOrigin(explicitBaseValue);
  if (explicitBase) return explicitBase;

  const host = normalizeOrigin(hostValue);
  if (!host) return "";

  const port = portValue.trim();
  if (!port) return host;
  if (/:\d+$/.test(host)) return host;
  return `${host}:${port}`;
}

function buildPoppayVersionPath(value: string): string {
  return value
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

async function getPoppayRuntimeConfig(): Promise<PoppayRuntimeConfig> {
  const [
    dbApiBaseUrl,
    dbHost,
    dbPort,
    dbVersion,
    dbIntegratorToken,
    dbAggregatorCode,
    dbMerchantAccountNumber,
    dbSecretKey,
  ] = await Promise.all([
    getSiteConfig("POPPAY_API_BASE_URL"),
    getSiteConfig("POPPAY_URL"),
    getSiteConfig("POPPAY_PORT"),
    getSiteConfig("POPPAY_VERSION"),
    getSiteConfig("POPPAY_INTEGRATOR_TOKEN"),
    getSiteConfig("POPPAY_AGGREGATOR_CODE"),
    getSiteConfig("POPPAY_MERCHANT_ACCOUNT_NUMBER"),
    getSiteConfig("POPPAY_SECRET_KEY"),
  ]);

  const baseUrl = buildPoppayBaseUrlFromValues(
    dbApiBaseUrl || process.env.POPPAY_API_BASE_URL || "",
    dbHost || process.env.POPPAY_URL || "",
    dbPort || process.env.POPPAY_PORT || ""
  );

  return {
    baseUrl,
    versionPath: buildPoppayVersionPath(dbVersion || process.env.POPPAY_VERSION || ""),
    integratorToken: (dbIntegratorToken || process.env.POPPAY_INTEGRATOR_TOKEN || "").trim(),
    aggregatorCode: (dbAggregatorCode || process.env.POPPAY_AGGREGATOR_CODE || "").trim(),
    merchantAccountNumber: (dbMerchantAccountNumber || process.env.POPPAY_MERCHANT_ACCOUNT_NUMBER || "").trim(),
    secretKey: (dbSecretKey || process.env.POPPAY_SECRET_KEY || "").trim(),
  };
}

export async function isPoppayConfigured(): Promise<boolean> {
  const cfg = await getPoppayRuntimeConfig();
  return Boolean(
    cfg.baseUrl &&
    cfg.versionPath &&
    cfg.integratorToken &&
    cfg.aggregatorCode &&
    cfg.merchantAccountNumber
  );
}

export class PoppayClient {
  private async requireConfig(): Promise<PoppayRuntimeConfig> {
    const cfg = await getPoppayRuntimeConfig();
    if (!cfg.baseUrl || !cfg.versionPath || !cfg.integratorToken) {
      throw new Error(
        "Poppay belum terkonfigurasi. Set POPPAY_API_BASE_URL atau POPPAY_URL/POPPAY_PORT, POPPAY_VERSION, dan POPPAY_INTEGRATOR_TOKEN."
      );
    }
    return cfg;
  }

  async listBanks(input: ListBanksInput = {}): Promise<{
    recordsTotal: number;
    recordsFiltered: number;
    draw: number;
    data: PoppayBank[];
  }> {
    const config = await this.requireConfig();
    const endpoint = `${config.baseUrl}/${config.versionPath}/master/bank/list`;
    const payload = {
      start: input.start ?? 0,
      length: input.length ?? 50,
      filters: input.filters ?? [{ key: "c", value: "IDR" }],
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en",
        Accept: "application/json; charset=UTF-8",
        Authorization: `Bearer ${config.integratorToken}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    let json: PoppayBankListResponse | null = null;
    try {
      json = (await res.json()) as PoppayBankListResponse;
    } catch {
      throw new Error(`Respons Poppay tidak valid (HTTP ${res.status}).`);
    }

    if (!res.ok || !json?.success || !json.data) {
      throw new Error(json?.message || `Gagal mengambil daftar bank Poppay (HTTP ${res.status}).`);
    }

    return {
      recordsTotal: json.data.recordsTotal,
      recordsFiltered: json.data.recordsFiltered,
      draw: json.data.draw,
      data: json.data.data.map((item) => ({
        code: item.m_b_c,
        name: item.m_b_n,
        swiftCode: item.m_b_s,
        currency: item.m_b_cu,
        isActive: item.m_b_ia,
        isManual: item.m_b_im,
        createdAt: item.m_b_ca,
        updatedAt: item.m_b_ua,
        createdBy: item.m_b_cb,
      })),
    };
  }

  async createIncoming(input: CreateIncomingInput): Promise<PoppayIncomingTransaction> {
    const config = await this.requireConfig();
    const endpoint = `${config.baseUrl}/${config.versionPath}/transaction/in/create`;
    const aggCode = config.aggregatorCode;
    const merchantAccNum = config.merchantAccountNumber;

    if (!aggCode || !merchantAccNum) {
      throw new Error("POPPAY_AGGREGATOR_CODE dan POPPAY_MERCHANT_ACCOUNT_NUMBER wajib diisi.");
    }

    const payload = {
      agg_code: aggCode,
      merchant_acc_num: Number(merchantAccNum),
      agg_ref_id: input.aggRefId,
      notes: input.notes,
      amount: input.amount,
      callback_url: input.callbackUrl ?? null,
      payor_email: input.payorEmail ?? null,
      payor_name: input.payorName ?? null,
      expiration_interval: input.expirationInterval ?? 30,
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en",
        Accept: "application/json; charset=UTF-8",
        Authorization: `Bearer ${config.integratorToken}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    let json: PoppayCreateIncomingResponse | null = null;
    try {
      json = (await res.json()) as PoppayCreateIncomingResponse;
    } catch {
      throw new Error(`Respons create incoming Poppay tidak valid (HTTP ${res.status}).`);
    }

    if (!res.ok || !json?.success || !json.data) {
      throw new Error(json?.message || `Gagal membuat QRIS Poppay (HTTP ${res.status}).`);
    }

    const checkoutUrl = /^https?:\/\//i.test(json.data.checkout_url)
      ? json.data.checkout_url
      : `${config.baseUrl}/${json.data.checkout_url.replace(/^\/+/, "")}`;

    return {
      refId: json.data.ref_id,
      externalRefId: json.data.ext_ref_id,
      aggregatorRefId: json.data.agg_ref_id,
      checkoutUrl,
      expiredAt: json.data.expired_at,
      rawQr: json.data.raw_qr,
    };
  }

  async inquireIncoming(uid: string): Promise<PoppayIncomingInquiryResult> {
    const config = await this.requireConfig();
    const safeUid = uid.trim();
    if (!safeUid) {
      throw new Error("uid inquiry wajib diisi.");
    }

    const endpoint = `${config.baseUrl}/${config.versionPath}/transaction/in/inquiry/${encodeURIComponent(safeUid)}`;
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en",
        Accept: "application/json; charset=UTF-8",
        Authorization: `Bearer ${config.integratorToken}`,
      },
      cache: "no-store",
    });

    let json: PoppayIncomingInquiryResponse | null = null;
    try {
      json = (await res.json()) as PoppayIncomingInquiryResponse;
    } catch {
      throw new Error(`Respons inquiry Poppay tidak valid (HTTP ${res.status}).`);
    }

    if (!res.ok || !json?.success) {
      throw new Error(json?.message || `Gagal inquiry transaksi Poppay (HTTP ${res.status}).`);
    }

    const raw = json.data ?? null;
    const rawStatusCode =
      typeof raw?.status === "number"
        ? raw.status
        : typeof raw?.status === "string" && /^\d+$/.test(raw.status)
        ? Number(raw.status)
        : typeof raw?.transaction_status === "number"
        ? raw.transaction_status
        : typeof raw?.transaction_status === "string" && /^\d+$/.test(raw.transaction_status)
        ? Number(raw.transaction_status)
        : typeof raw?.payment_status === "number"
        ? raw.payment_status
        : typeof raw?.payment_status === "string" && /^\d+$/.test(raw.payment_status)
        ? Number(raw.payment_status)
        : null;

    return {
      uid: safeUid,
      status: mapPoppayStatusCode(rawStatusCode),
      statusCode: rawStatusCode ?? undefined,
      raw,
    };
  }
}
