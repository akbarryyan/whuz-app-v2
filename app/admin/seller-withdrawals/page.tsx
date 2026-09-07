"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/admin/Sidebar";
import Header from "@/components/admin/Header";
import { ToastContainer } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

interface WithdrawalRow {
  id: string;
  amount: number;
  status: string;
  bankCode: string | null;
  bankName: string;
  accountName: string;
  accountNumber: string;
  note: string | null;
  processedNote: string | null;
  processedAt: string | null;
  payoutRefId: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    sellerProfile: { slug: string; displayName: string } | null;
  };
}

type Tab = "PENDING" | "APPROVED" | "PAID" | "ditolak" | "";

const TAB_LABEL: Record<Tab, string> = {
  PENDING: "Menunggu",
  APPROVED: "Diproses",
  PAID: "Selesai",
  ditolak: "Ditolak",
  "": "Semua",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  APPROVED: "bg-blue-50 text-blue-700 ring-blue-200",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
};

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n);
}

function tanggal(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export default function AdminSellerWithdrawalsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("PENDING");
  const [aksiUntuk, setAksiUntuk] = useState<{ row: WithdrawalRow; jenis: "APPROVED" | "REJECTED" } | null>(null);
  const [catatan, setCatatan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const toast = useToast();

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      // Tab "ditolak" menggabungkan REJECTED dan CANCELLED, jadi disaring di sini.
      const qs = tab && tab !== "ditolak" ? `?status=${tab}` : "";
      const res = await fetch(`/api/admin/seller-withdrawals${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Gagal memuat data penarikan");
      const data: WithdrawalRow[] = json.data;
      setRows(tab === "ditolak" ? data.filter((r) => r.status === "REJECTED" || r.status === "CANCELLED") : data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat data penarikan");
    } finally {
      setLoading(false);
    }
    // toast sengaja tidak masuk dependency: lihat catatan di hooks/useToast.ts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => { muat(); }, [muat]);

  const totalMenunggu = useMemo(
    () => rows.filter((r) => r.status === "PENDING").reduce((a, r) => a + r.amount, 0),
    [rows],
  );

  async function kirimAksi() {
    if (!aksiUntuk) return;
    setMengirim(true);
    try {
      const res = await fetch(`/api/admin/seller-withdrawals/${aksiUntuk.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: aksiUntuk.jenis,
          processedNote: catatan.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Aksi gagal diproses");

      toast.success(
        aksiUntuk.jenis === "APPROVED"
          ? "Pencairan dikirim ke Poppay."
          : "Penarikan ditolak dan saldo dikembalikan ke merchant.",
      );
      setAksiUntuk(null);
      setCatatan("");
      await muat();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Aksi gagal diproses");
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-col gap-6">
          <Header onMenuClick={() => setSidebarOpen(true)} />

          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Penarikan Merchant</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Menyetujui berarti dana langsung dikirim ke rekening merchant lewat Poppay.
              </p>
            </div>
            {tab === "PENDING" && rows.length > 0 && (
              <span className="mt-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 sm:mt-0">
                {rows.length} menunggu · {rupiah(totalMenunggu)}
              </span>
            )}
          </div>

          <div className="flex gap-1 self-start rounded-xl border border-slate-200 bg-white p-1 text-sm">
            {(["PENDING", "APPROVED", "PAID", "ditolak", ""] as Tab[]).map((t) => (
              <button
                key={t || "semua"}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                  tab === t ? "bg-[#2563eb] text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="rounded-2xl bg-white p-6 text-sm text-slate-400 shadow-sm">Memuat…</p>
          ) : rows.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-sm text-slate-400 shadow-sm">
              {tab === "PENDING" ? "Tidak ada penarikan yang menunggu persetujuan." : "Belum ada data."}
            </p>
          ) : (
            <div className="grid gap-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-800">
                          {r.user.sellerProfile?.displayName ?? r.user.name ?? "Merchant"}
                        </p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${STATUS_STYLE[r.status] ?? STATUS_STYLE.CANCELLED}`}>
                          {r.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {r.user.email ?? "—"} · diajukan {tanggal(r.createdAt)}
                      </p>
                    </div>
                    <p className="text-lg font-black text-slate-900">{rupiah(r.amount)}</p>
                  </div>

                  <div className="mt-3 grid gap-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                    <p>Bank: <span className="font-semibold text-slate-800">{r.bankName}</span>{r.bankCode ? ` (${r.bankCode})` : ""}</p>
                    <p>Rekening: <span className="font-mono font-semibold text-slate-800">{r.accountNumber}</span></p>
                    <p className="sm:col-span-2">Atas nama: <span className="font-semibold text-slate-800">{r.accountName}</span></p>
                    {r.note && <p className="sm:col-span-2">Catatan merchant: {r.note}</p>}
                    {r.processedNote && <p className="sm:col-span-2">Catatan admin: {r.processedNote}</p>}
                    {r.payoutRefId && <p className="sm:col-span-2">Ref Poppay: <span className="font-mono">{r.payoutRefId}</span></p>}
                    {r.processedAt && <p className="sm:col-span-2">Diproses: {tanggal(r.processedAt)}</p>}
                  </div>

                  {r.status === "PENDING" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => { setAksiUntuk({ row: r, jenis: "APPROVED" }); setCatatan(""); }}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Setujui &amp; cairkan
                      </button>
                      <button
                        onClick={() => { setAksiUntuk({ row: r, jenis: "REJECTED" }); setCatatan(""); }}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        Tolak
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Konfirmasi. Persetujuan memindahkan uang sungguhan dan tidak bisa
          dibatalkan, jadi nominal dan rekening tujuan ditampilkan ulang di sini
          alih-alih mengandalkan ingatan admin atas baris yang tadi diklik. */}
      {aksiUntuk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-slate-800">
              {aksiUntuk.jenis === "APPROVED" ? "Cairkan penarikan ini?" : "Tolak penarikan ini?"}
            </h2>

            {aksiUntuk.jenis === "APPROVED" ? (
              <>
                <p className="mt-1 text-sm text-slate-500">
                  Dana dikirim ke rekening di bawah lewat Poppay begitu tombol ditekan. Transfer
                  yang sudah jalan tidak bisa ditarik kembali.
                </p>
                <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm ring-1 ring-emerald-100">
                  <p className="text-2xl font-black text-emerald-800">{rupiah(aksiUntuk.row.amount)}</p>
                  <p className="mt-1 text-emerald-900">{aksiUntuk.row.bankName}</p>
                  <p className="font-mono text-emerald-900">{aksiUntuk.row.accountNumber}</p>
                  <p className="text-emerald-900">a.n. {aksiUntuk.row.accountName}</p>
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Saldo {rupiah(aksiUntuk.row.amount)} dikembalikan ke dompet merchant dan
                penarikan ditandai ditolak.
              </p>
            )}

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Catatan {aksiUntuk.jenis === "REJECTED" ? "(alasan penolakan)" : "(opsional)"}
              </span>
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAksiUntuk(null)}
                disabled={mengirim}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={kirimAksi}
                disabled={mengirim}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
                  aksiUntuk.jenis === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {mengirim ? "Memproses…" : aksiUntuk.jenis === "APPROVED" ? "Ya, cairkan sekarang" : "Ya, tolak"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
