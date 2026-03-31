"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import MerchantSidebar from "@/components/merchant/Sidebar";
import MerchantHeader from "@/components/merchant/Header";
import { ToastContainer } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

interface CatalogRow {
  id: string;
  provider: string;
  providerCode: string;
  name: string;
  brand: string;
  category: string;
  type: string;
  providerPrice: number;
  sellingPrice: number;
  margin: number;
  stock: boolean;
  isSelected: boolean;
  sellerProduct: {
    id: string;
    sellingPrice: number | null;
    commissionType: "PERCENT" | "FIXED";
    commissionValue: number;
    feeType: "PERCENT" | "FIXED";
    feeValue: number;
    isActive: boolean;
  } | null;
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function MerchantProductsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { toasts, removeToast, success, error } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (selectedOnly) params.set("selectedOnly", "true");

      const res = await fetch(`/api/seller/products${params.toString() ? `?${params.toString()}` : ""}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Gagal memuat katalog merchant");
      setRows(json.data);
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : "Gagal memuat katalog merchant";
      error(message);
    } finally {
      setLoading(false);
    }
  }, [error, search, selectedOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addProduct = async (row: CatalogRow) => {
    setProcessingId(row.id);
    try {
      const res = await fetch("/api/seller/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: row.id,
          sellingPrice: row.sellingPrice,
          commissionType: "FIXED",
          commissionValue: Math.max(0, row.sellingPrice - row.providerPrice),
          feeType: "FIXED",
          feeValue: row.sellerProduct?.feeValue ?? 0,
          isActive: true,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Gagal menambahkan produk");
      success("Produk berhasil ditambahkan ke toko merchant.");
      await loadData();
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : "Gagal menambahkan produk";
      error(message);
    } finally {
      setProcessingId(null);
    }
  };

  const removeProduct = async (productId: string) => {
    setProcessingId(productId);
    try {
      const res = await fetch("/api/seller/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Gagal menghapus produk");
      success("Produk dihapus dari toko merchant.");
      await loadData();
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : "Gagal menghapus produk";
      error(message);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <MerchantSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:gap-6">
          <MerchantHeader
            title="Produk Merchant"
            subtitle="Pilih produk dari katalog website untuk dimasukkan ke toko merchant, lalu atur marginnya di halaman pricing."
            onMenuClick={() => setSidebarOpen(true)}
          />

          <section className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Katalog Produk Website</p>
                <p className="text-xs text-slate-400">Produk di bawah ini diambil dari database website/provider yang aktif di Railway.</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={selectedOnly}
                    onChange={(e) => setSelectedOnly(e.target.checked)}
                  />
                  Hanya produk terpilih
                </label>

                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari produk, brand, provider code..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400 sm:w-[320px]"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-10 text-center text-sm text-slate-400">Memuat katalog produk merchant...</div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center sm:rounded-3xl">
                <p className="text-sm font-medium text-slate-600">Belum ada produk yang cocok</p>
                <p className="mt-1 text-xs text-slate-400">Coba ubah kata kunci pencarian atau matikan filter produk terpilih.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rows.map((row) => {
                  const merchantSellingPrice = row.sellerProduct?.sellingPrice ?? row.sellingPrice;
                  const merchantMargin = Math.max(0, merchantSellingPrice - row.providerPrice);

                  return (
                    <div key={row.id} className="rounded-2xl border border-slate-200 p-4 sm:rounded-3xl">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-slate-900">{row.name}</p>
                            {row.isSelected ? (
                              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                                Sudah di toko
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                Belum dipilih
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-sm text-slate-500">
                            {row.brand} • {row.category} • {row.provider} • {row.providerCode}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                              Harga provider: {rupiah(row.providerPrice)}
                            </span>
                            <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
                              Harga website: {rupiah(row.sellingPrice)}
                            </span>
                            <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                              Margin merchant: {rupiah(merchantMargin)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-stretch gap-2 sm:min-w-[220px]">
                          {row.isSelected ? (
                            <>
                              <Link
                                href="/merchant/pricing"
                                className="rounded-2xl bg-emerald-500 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-600"
                              >
                                Atur Margin
                              </Link>
                              <button
                                type="button"
                                onClick={() => removeProduct(row.id)}
                                disabled={processingId === row.id}
                                className="rounded-2xl border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                              >
                                {processingId === row.id ? "Menghapus..." : "Hapus dari Toko"}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addProduct(row)}
                              disabled={processingId === row.id}
                              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                            >
                              {processingId === row.id ? "Menambahkan..." : "Tambah ke Toko"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
