"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Quicksand } from "@/lib/fonts";
import BottomNavigation from "@/components/BottomNavigation";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

function formatPrice(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function formatDate(d: string | Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

function buildQrImageUrl(raw: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(raw)}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    SUCCESS:             { label: "Sukses",           cls: "bg-green-100 text-green-700" },
    PAID:                { label: "Dibayar",           cls: "bg-blue-100 text-blue-700" },
    WAITING_PAYMENT:     { label: "Menunggu Bayar",    cls: "bg-yellow-100 text-yellow-700" },
    PROCESSING_PROVIDER: { label: "Sedang Diproses",   cls: "bg-purple-100 text-purple-700" },
    CREATED:             { label: "Dibuat",            cls: "bg-slate-100 text-slate-600" },
    FAILED:              { label: "Gagal",             cls: "bg-red-100 text-red-700" },
    EXPIRED:             { label: "Kedaluwarsa",       cls: "bg-orange-100 text-orange-700" },
    REFUNDED:            { label: "Dikembalikan",      cls: "bg-teal-100 text-teal-700" },
    // Invoice statuses
    PENDING:             { label: "Menunggu",          cls: "bg-yellow-100 text-yellow-700" },
  };
  const info = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.cls}`}>
      {info.label}
    </span>
  );
}

interface OrderDetail {
  orderCode: string;
  status: string;
  amount: number;
  fee: number;
  paymentMethod: string;
  serialNumber: string | null;
  createdAt: string;
  updatedAt: string;
  targetNumber: string;
  targetData: Record<string, unknown> | null;
  product: { name: string; brand: string; category: string };
  paymentInvoice: {
    status: string;
    method: string | null;
    paymentUrl: string | null;
    paymentNumber: string | null;
    expiredAt: string | null;
    paidAt: string | null;
  } | null;
}

function OrderDetailPageContent() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copyingQr, setCopyingQr] = useState(false);

  const fetchOrder = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const qs = token ? `?token=${encodeURIComponent(token)}` : "";
      const res = await fetch(`/api/orders/${encodeURIComponent(params.code)}${qs}`);
      const data = await res.json();
      if (data.success) {
        setOrder(data.data as OrderDetail);
        setError(null);
      } else {
        setError(data.error ?? "Pesanan tidak ditemukan.");
      }
    } catch {
      setError("Gagal memuat pesanan. Periksa koneksi internet kamu.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code, token]);

  useEffect(() => {
    if (!order) return;

    const shouldPoll =
      order.status === "WAITING_PAYMENT" ||
      order.status === "PAID" ||
      order.status === "PROCESSING_PROVIDER";

    if (!shouldPoll) return;

    const interval = setInterval(() => {
      fetchOrder();
    }, 7000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status, order?.paymentInvoice?.status, params.code, token]);

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`${quicksand.className} min-h-screen bg-[#f5f7fb] flex justify-center`}>
        <div className="w-full max-w-[480px] min-h-screen bg-white shadow-2xl flex flex-col">
          <div className="bg-[#003D99] px-4 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-28 bg-white/20 rounded animate-pulse" />
              <div className="h-2.5 w-36 bg-white/20 rounded animate-pulse" />
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="bg-slate-50 rounded-2xl p-4 animate-pulse space-y-2">
              <div className="h-3 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-48 bg-slate-200 rounded" />
              <div className="h-3 w-24 bg-slate-200 rounded" />
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 animate-pulse space-y-2">
              <div className="h-3 w-40 bg-slate-200 rounded" />
              <div className="h-3 w-28 bg-slate-200 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`${quicksand.className} min-h-screen bg-[#f5f7fb] flex justify-center`}>
        <div className="w-full max-w-[480px] min-h-screen bg-white shadow-2xl flex flex-col">
          <header className="bg-[#003D99] px-4 py-4 flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p className="text-sm font-bold text-white">Detail Pesanan</p>
          </header>
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-20">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">{error}</p>
            <p className="text-xs text-slate-400 mb-4">
              Kode: <span className="font-mono font-semibold text-slate-600">{params.code}</span>
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold"
            >
              Kembali ke Beranda
            </button>
          </div>
          <BottomNavigation />
        </div>
      </div>
    );
  }

  if (!order) return null;

  const extraTargetEntries = Object.entries(order.targetData ?? {}).filter(([key, value]) => {
    if (key === "targetNumber") return false;
    if (value == null) return false;
    const normalized = String(value).trim();
    return normalized.length > 0 && normalized !== order.targetNumber;
  });

  const formatTargetLabel = (key: string) =>
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const isPendingPayment =
    order.paymentInvoice?.status === "PENDING" &&
    (!!order.paymentInvoice?.paymentUrl || !!order.paymentInvoice?.paymentNumber);
  const hasInternalQris =
    order.paymentInvoice?.status === "PENDING" &&
    order.paymentInvoice?.method?.toLowerCase() === "qris" &&
    !!order.paymentInvoice?.paymentNumber;

  const handleCopyQrString = async () => {
    if (!order.paymentInvoice?.paymentNumber) return;
    try {
      setCopyingQr(true);
      await navigator.clipboard.writeText(order.paymentInvoice.paymentNumber);
    } finally {
      setCopyingQr(false);
    }
  };

  return (
    <div className={`${quicksand.className} min-h-screen bg-[#f5f7fb] flex justify-center`}>
      <div className="w-full max-w-[480px] min-h-screen bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="bg-[#003D99] px-4 py-4 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">Detail Pesanan</p>
            <p className="text-[11px] text-white/70 font-mono">{order.orderCode}</p>
          </div>
          <button
            onClick={() => fetchOrder(true)}
            disabled={refreshing}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <svg
              className={`w-4 h-4 text-white ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </header>

        <div className="flex-1 px-4 py-4 pb-24 space-y-3 overflow-y-auto">

          {/* ── Status Banner ─────────────────────────────────────────────── */}
          {order.status === "SUCCESS" && (
            <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-green-800">Transaksi Berhasil!</p>
                <p className="text-[11px] text-green-600">Produk sudah berhasil diproses.</p>
              </div>
            </div>
          )}

          {(order.status === "PAID" || order.status === "PROCESSING_PROVIDER") && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-blue-800">Pembayaran Diterima</p>
                <p className="text-[11px] text-blue-600">
                  Produk sedang diproses, harap tunggu sebentar.
                </p>
              </div>
            </div>
          )}

          {order.status === "WAITING_PAYMENT" && isPendingPayment && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-yellow-800">Belum Dibayar</p>
                <p className="text-[11px] text-yellow-700">Selesaikan pembayaran sebelum kedaluwarsa.</p>
              </div>
            </div>
          )}

          {order.status === "FAILED" && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-red-800">Transaksi Gagal</p>
                <p className="text-[11px] text-red-600">Hubungi support jika saldo sudah terpotong.</p>
              </div>
            </div>
          )}

          {order.status === "EXPIRED" && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-400 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-orange-800">Pesanan Kedaluwarsa</p>
                <p className="text-[11px] text-orange-600">Waktu pembayaran habis. Silakan buat pesanan baru.</p>
              </div>
            </div>
          )}

          {/* ── Order Card ────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
            {/* Card header */}
            <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2 border-b border-slate-100">
              <div>
                <p className="text-[11px] text-slate-400 mb-0.5">Kode Pesanan</p>
                <p className="text-sm font-mono font-bold text-purple-700">{order.orderCode}</p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            {/* Card body */}
            <div className="px-4 py-3 space-y-2.5">
              <div className="flex justify-between items-start gap-2">
                <span className="text-xs text-slate-500">Produk</span>
                <span className="text-xs font-semibold text-slate-700 text-right max-w-[60%] leading-relaxed">
                  {order.product.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Brand</span>
                <span className="text-xs text-slate-600">{order.product.brand}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Harga Produk</span>
                <span className="text-xs font-semibold text-slate-700">
                  Rp {formatPrice(order.amount - order.fee)}
                </span>
              </div>
              {order.fee > 0 && (
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Biaya Admin</span>
                  <span className="text-xs text-slate-600">Rp {formatPrice(order.fee)}</span>
                </div>
              )}
              <div className="border-t border-slate-100 pt-2 flex justify-between">
                <span className="text-xs font-bold text-slate-600">Total Bayar</span>
                <span className="text-sm font-black text-slate-800">Rp {formatPrice(order.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Metode</span>
                <span className="text-xs text-slate-600">
                  {order.paymentMethod === "WALLET"
                    ? "Saldo WhuzPay"
                    : (order.paymentInvoice?.method?.toUpperCase() ?? "Payment Gateway")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Waktu</span>
                <span className="text-xs text-slate-600">{formatDate(order.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-600">Data Tujuan</p>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <span className="text-xs text-slate-500">Tujuan Utama</span>
                <span className="text-xs font-semibold text-slate-700 text-right break-all max-w-[65%]">
                  {order.targetNumber}
                </span>
              </div>

              {extraTargetEntries.length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  {extraTargetEntries.map(([key, value]) => (
                    <div key={key} className="flex justify-between items-start gap-3">
                      <span className="text-xs text-slate-500">{formatTargetLabel(key)}</span>
                      <span className="text-xs font-medium text-slate-700 text-right break-all max-w-[65%]">
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Serial Number ─────────────────────────────────────────────── */}
          {order.serialNumber && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
              <p className="text-[11px] font-bold text-green-700 mb-1.5">
                ✅ Serial Number / Kode Voucher
              </p>
              <p className="text-base font-mono font-black text-green-800 tracking-wide break-all">
                {order.serialNumber}
              </p>
              <p className="text-[10px] text-green-600 mt-1.5">
                Screenshot atau salin kode ini sebagai bukti pembelian.
              </p>
            </div>
          )}

          {/* ── Payment Invoice ───────────────────────────────────────────── */}
          {order.paymentInvoice && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-600">Info Pembayaran</p>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Status Invoice</span>
                  <StatusBadge status={order.paymentInvoice.status} />
                </div>
                {order.paymentInvoice.method && (
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Metode</span>
                    <span className="text-xs text-slate-600 font-semibold uppercase">
                      {order.paymentInvoice.method}
                    </span>
                  </div>
                )}
                {order.paymentInvoice.paidAt && (
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Dibayar pada</span>
                    <span className="text-xs text-green-700 font-semibold">
                      {formatDate(order.paymentInvoice.paidAt)}
                    </span>
                  </div>
                )}
                {order.paymentInvoice.expiredAt && order.paymentInvoice.status === "PENDING" && (
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Batas Bayar</span>
                    <span className="text-xs text-orange-600 font-semibold">
                      {formatDate(order.paymentInvoice.expiredAt)}
                    </span>
                  </div>
                )}
              </div>

              {/* CTA — only show when still PENDING */}
              {isPendingPayment && (
                <div className="px-4 pb-4 space-y-3">
                  {hasInternalQris && order.paymentInvoice.paymentNumber && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-700">
                        Scan QRIS untuk membayar
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        QR ditampilkan langsung di aplikasi supaya tidak perlu buka halaman gateway eksternal.
                      </p>
                      <div className="mt-4 flex justify-center">
                        <div className="rounded-[28px] bg-white p-3 shadow-sm">
                          <img
                            src={buildQrImageUrl(order.paymentInvoice.paymentNumber)}
                            alt="QRIS Payment"
                            className="h-64 w-64 rounded-2xl border border-slate-100"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleCopyQrString}
                        className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        {copyingQr ? "Menyalin..." : "Salin String QRIS"}
                      </button>
                    </div>
                  )}

                  {order.paymentInvoice.paymentUrl && (
                    <a
                      href={order.paymentInvoice.paymentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full text-center py-3 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 active:scale-[0.98] transition-all shadow"
                    >
                      Buka Halaman Gateway →
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Processing notice ─────────────────────────────────────────── */}
          {(order.status === "PAID" || order.status === "PROCESSING_PROVIDER") &&
            !order.serialNumber && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex gap-2.5">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Memproses pembelian... Serial number akan muncul di sini setelah berhasil.
                  Tekan tombol refresh untuk memperbarui status.
                </p>
              </div>
            )}

          {/* ── Back to home ──────────────────────────────────────────────── */}
          <button
            onClick={() => router.push("/")}
            className="w-full py-3 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ← Kembali ke Beranda
          </button>
        </div>

        <BottomNavigation />
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={null}>
      <OrderDetailPageContent />
    </Suspense>
  );
}
