"use client";

import { useEffect, useState } from "react";
import MerchantSidebar from "@/components/merchant/Sidebar";
import MerchantHeader from "@/components/merchant/Header";
import { ToastContainer } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

interface WalletData {
  balance: number;
  updatedAt: string | null;
  totalSalesCredits: number;
  totalFeeDeductions: number;
  totalGrossMargin: number;
  totalSuccessfulOrders: number;
  ledger: Array<{
    id: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    reference: string | null;
    description: string | null;
    createdAt: string;
  }>;
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function ledgerMeta(type: string) {
  if (type === "COMMISSION") {
    return { label: "Komisi Masuk", sign: "+", className: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" };
  }
  if (type === "WITHDRAW_HOLD") {
    return { label: "Withdraw Hold", sign: "-", className: "bg-amber-100 text-amber-700 ring-1 ring-amber-200" };
  }
  if (type === "WITHDRAW_RELEASE") {
    return { label: "Release Hold", sign: "+", className: "bg-sky-100 text-sky-700 ring-1 ring-sky-200" };
  }
  if (type === "WITHDRAW_PAID") {
    return { label: "Withdraw Paid", sign: "", className: "bg-fuchsia-100 text-fuchsia-700 ring-1 ring-fuchsia-200" };
  }

  return { label: type, sign: "", className: "bg-slate-100 text-slate-700 ring-1 ring-slate-200" };
}

export default function MerchantWalletPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toasts, removeToast, error: showError } = useToast();

  useEffect(() => {
    fetch("/api/merchant/wallet")
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error || "Gagal memuat saldo merchant");
        setData(json.data);
      })
      .catch((caughtError: unknown) => {
        const message = caughtError instanceof Error ? caughtError.message : "Gagal memuat saldo merchant";
        showError(message);
      })
      .finally(() => setLoading(false));
  }, [showError]);

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <MerchantSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:gap-6">
          <MerchantHeader
            title="Saldo Merchant"
            subtitle="Lihat saldo masuk dari penjualan dan potongan fee platform."
            onMenuClick={() => setSidebarOpen(true)}
          />

          {loading ? (
            <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400 shadow-sm sm:rounded-3xl">
              Memuat saldo merchant...
            </div>
          ) : data ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
                  <p className="text-sm text-slate-500">Saldo Saat Ini</p>
                  <p className="mt-3 text-2xl font-bold text-slate-900">{rupiah(data.balance)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
                  <p className="text-sm text-slate-500">Saldo Masuk Penjualan</p>
                  <p className="mt-3 text-2xl font-bold text-slate-900">{rupiah(data.totalSalesCredits)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
                  <p className="text-sm text-slate-500">Potongan Fee</p>
                  <p className="mt-3 text-2xl font-bold text-slate-900">{rupiah(data.totalFeeDeductions)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
                  <p className="text-sm text-slate-500">Gross Margin</p>
                  <p className="mt-3 text-2xl font-bold text-slate-900">{rupiah(data.totalGrossMargin)}</p>
                </div>
              </div>

              <section className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Ledger Merchant</h2>
                    <p className="text-sm text-slate-500">Riwayat komisi, hold withdraw, dan release saldo.</p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>Total order sukses</p>
                    <p className="mt-1 font-semibold text-slate-600">{data.totalSuccessfulOrders.toLocaleString("id-ID")}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="hidden grid-cols-[1fr_1.4fr_0.8fr_0.9fr_0.9fr_0.8fr] gap-3 px-3 text-xs text-slate-400 md:grid">
                    <span>Tipe</span>
                    <span>Keterangan</span>
                    <span>Nominal</span>
                    <span>Saldo Sebelum</span>
                    <span>Saldo Sesudah</span>
                    <span>Waktu</span>
                  </div>
                  <div className="mt-3 space-y-3">
                  {data.ledger.length === 0 ? (
                    <div className="rounded-3xl bg-slate-50 px-4 py-10 text-center">
                      <p className="text-sm font-medium text-slate-600">Belum ada mutasi saldo merchant</p>
                      <p className="mt-1 text-xs text-slate-400">Komisi penjualan dan proses withdraw akan tercatat otomatis di ledger merchant.</p>
                    </div>
                  ) : (
                    data.ledger.map((entry) => (
                      <div key={entry.id} className="rounded-xl bg-slate-50 p-3 transition-colors hover:bg-slate-100 md:grid md:grid-cols-[1fr_1.4fr_0.8fr_0.9fr_0.9fr_0.8fr] md:items-center md:gap-3 md:rounded-2xl">
                        <div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${ledgerMeta(entry.type).className}`}>
                            {ledgerMeta(entry.type).label}
                          </span>
                        </div>
                        <div className="mt-2 md:mt-0">
                          <p className="text-xs font-medium text-slate-700">{entry.description || "-"}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">{entry.reference || "Tanpa referensi"}</p>
                        </div>
                        <div className="mt-2 text-xs font-bold md:mt-0">
                          <span className={ledgerMeta(entry.type).sign === "-" ? "text-rose-600" : "text-emerald-600"}>
                            {ledgerMeta(entry.type).sign ? `${ledgerMeta(entry.type).sign} ` : ""}
                            {rupiah(entry.amount)}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-slate-500 md:mt-0">{rupiah(entry.balanceBefore)}</div>
                        <div className="mt-2 text-xs text-slate-700 md:mt-0">{rupiah(entry.balanceAfter)}</div>
                        <div className="mt-2 text-xs text-slate-400 md:mt-0">{new Date(entry.createdAt).toLocaleString("id-ID")}</div>
                      </div>
                    ))
                  )}
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
