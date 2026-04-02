"use client";

import { useEffect, useState, useCallback, use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Quicksand } from "next/font/google";
import AppHeader from "@/components/AppHeader";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface TopupDetail {
  id: string;
  topupCode: string;
  amount: number;
  fee: number;
  totalPayment: number;
  paymentMethod: string | null;
  status: string; // PENDING | COMPLETED | EXPIRED | FAILED
  expiredAt: string | null;
  paidAt: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// ── Page ───────────────────────────────────────────────────────────────────────

function TopupStatusPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnStatus = searchParams.get("status"); // "return" when coming back from the QRIS page

  const [topup, setTopup] = useState<TopupDetail | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // ── Fetch wallet balance ────────────────────────────────────────────────────
  const refreshBalance = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.isLoggedIn) setWalletBalance(d.wallet?.balance ?? 0); })
      .catch(() => {});
  }, []);

  // ── Fetch topup detail once ─────────────────────────────────────────────────
  const fetchDetail = useCallback(async (): Promise<TopupDetail | null> => {
    try {
      const res = await fetch(`/api/wallet/topup/${id}`);
      const data = await res.json();
      if (data.success) return data.data as TopupDetail;
    } catch {}
    return null;
  }, [id]);

  // ── Poll until terminal status ──────────────────────────────────────────────
  const startPolling = useCallback(async () => {
    setPolling(true);
    let attempts = 0;
    const maxAttempts = 20; // 20 × 3s = 60s

    const interval = setInterval(async () => {
      attempts++;
      const detail = await fetchDetail();
      if (detail) {
        setTopup(detail);
        if (detail.status === "COMPLETED") {
          clearInterval(interval);
          setPolling(false);
          refreshBalance();
        } else if (detail.status === "FAILED" || detail.status === "EXPIRED") {
          clearInterval(interval);
          setPolling(false);
        }
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setPolling(false);
        setTimedOut(true);
      }
    }, 3000);
  }, [fetchDetail, refreshBalance]);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Auth check
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.isLoggedIn) { router.replace("/login"); return; }
        setWalletBalance(d.wallet?.balance ?? 0);
      })
      .catch(() => router.replace("/login"));

    // Load initial state
    fetchDetail().then((detail) => {
      if (!detail) { router.replace("/topup"); return; }
      setTopup(detail);
      setLoading(false);

      // If user just returned from payment page, start polling
      if (returnStatus === "return" && detail.status === "PENDING") {
        startPolling();
      }
      // If already completed, load fresh balance
      if (detail.status === "COMPLETED") {
        refreshBalance();
      }
    });
  }, [id, returnStatus, fetchDetail, startPolling, refreshBalance, router]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`${quicksand.className} flex min-h-screen justify-center bg-[#F5F5F5]`}>
        <div className="w-full max-w-[480px] min-h-screen bg-white shadow-2xl">
          <div className="w-full h-14" style={{ backgroundColor: "#003D99" }} />
          <div className="px-5 pt-10 flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-slate-100 animate-pulse" />
            <div className="h-6 w-40 rounded bg-slate-100 animate-pulse" />
            <div className="h-4 w-60 rounded bg-slate-100 animate-pulse" />
            <div className="w-full h-32 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const status = topup?.status ?? "PENDING";

  return (
    <div className={`${quicksand.className} flex min-h-screen justify-center bg-[#F5F5F5]`}>
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-2xl flex flex-col">
        <AppHeader onBack={() => router.replace("/topup")} />

        <div className="flex-1 overflow-y-auto pt-[60px] pb-10 px-5 flex flex-col items-center">

          {/* ══════ PROCESSING / PENDING ══════ */}
          {(status === "PENDING") && (
            <div className="flex flex-col items-center justify-center min-h-[420px] gap-6 text-center px-4">
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
                {polling ? (
                  <svg className="w-10 h-10 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">
                  {polling ? "Memverifikasi Pembayaran" : "Menunggu Pembayaran"}
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {polling
                    ? "Kami sedang menunggu konfirmasi dari payment gateway..."
                    : timedOut
                    ? "Belum ada konfirmasi pembayaran. Cek kembali beberapa saat lagi."
                    : "Selesaikan pembayaran di halaman QRIS Poppay."}
                </p>
              </div>

              {/* Detail card */}
              {topup && (
                <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 text-left">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Detail Transaksi</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Kode</span>
                    <span className="font-mono text-xs font-bold text-slate-700">{topup.topupCode}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Nominal</span>
                    <span className="font-bold text-slate-800">{formatRp(topup.amount)}</span>
                  </div>
                  {topup.fee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Biaya Admin</span>
                      <span className="font-semibold text-slate-600">{formatRp(topup.fee)}</span>
                    </div>
                  )}
                  {topup.totalPayment > 0 && (
                    <div className="flex justify-between text-sm border-t border-slate-200 pt-2.5">
                      <span className="font-bold text-slate-700">Total Bayar</span>
                      <span className="font-bold text-[#003D99]">{formatRp(topup.totalPayment)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Retry polling if timed out */}
              {timedOut && !polling && (
                <button
                  onClick={() => { setTimedOut(false); startPolling(); }}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-[#003D99] text-white transition hover:bg-blue-800"
                >
                  Cek Status Sekarang
                </button>
              )}
            </div>
          )}

          {/* ══════ SUCCESS ══════ */}
          {status === "COMPLETED" && topup && (
            <div className="flex flex-col items-center justify-center min-h-[420px] gap-6 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">Top Up Berhasil!</h2>
                <p className="text-slate-400 text-sm">Saldo kamu berhasil ditambah</p>
              </div>

              <div className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl p-5 space-y-3 text-left">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Nominal Top Up</span>
                  <span className="font-bold text-slate-800">{formatRp(topup.amount)}</span>
                </div>
                {topup.fee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Biaya Admin</span>
                    <span className="font-semibold text-slate-600">{formatRp(topup.fee)}</span>
                  </div>
                )}
                {topup.paymentMethod && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Metode</span>
                    <span className="font-semibold text-slate-700 uppercase">{topup.paymentMethod.replace(/_/g, " ")}</span>
                  </div>
                )}
                {topup.paidAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Waktu Bayar</span>
                    <span className="font-semibold text-slate-700">{formatDateTime(topup.paidAt)}</span>
                  </div>
                )}
                {walletBalance !== null && (
                  <div className="flex justify-between text-sm border-t border-emerald-100 pt-3">
                    <span className="text-slate-500">Saldo Sekarang</span>
                    <span className="font-bold text-emerald-600">{formatRp(walletBalance)}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => router.push("/akun")}
                className="w-full py-4 rounded-2xl font-bold text-sm text-white bg-[#003D99] hover:bg-blue-800 transition"
              >
                Kembali ke Akun
              </button>
            </div>
          )}

          {/* ══════ FAILED / EXPIRED ══════ */}
          {(status === "FAILED" || status === "EXPIRED") && (
            <div className="flex flex-col items-center justify-center min-h-[420px] gap-6 text-center">
              <div className="w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">
                  {status === "EXPIRED" ? "Pembayaran Kedaluwarsa" : "Pembayaran Gagal"}
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {status === "EXPIRED"
                    ? "Batas waktu pembayaran sudah habis. Silakan buat transaksi baru."
                    : "Transaksi tidak berhasil diproses. Silakan coba lagi."}
                </p>
              </div>

              {topup?.expiredAt && (
                <p className="text-xs text-slate-400">
                  Kedaluwarsa: {formatDateTime(topup.expiredAt)}
                </p>
              )}

              <button
                onClick={() => router.push("/topup")}
                className="w-full py-4 rounded-2xl font-bold text-sm text-white bg-[#003D99] hover:bg-blue-800 transition"
              >
                Top Up Lagi
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TopupStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <TopupStatusPageContent params={params} />
    </Suspense>
  );
}
