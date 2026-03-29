"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Quicksand } from "next/font/google";
import AppHeader from "@/components/AppHeader";
import { ToastContainer } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

interface SellerCatalogItem {
  sellerProductId: string;
  sellingPrice: number;
  feeType: string;
  feeValue: number;
  product: {
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
  };
}

interface SellerPageData {
  seller: {
    id: string;
    slug: string;
    displayName: string;
    description: string | null;
  };
  data: SellerCatalogItem[];
}

function slugifyBrand(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function SellerStorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const router = useRouter();
  const toast = useToast();

  const [slug, setSlug] = useState("");
  const [data, setData] = useState<SellerPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStorefront() {
      const { slug: sellerSlug } = await params;
      if (cancelled) return;
      setSlug(sellerSlug);

      try {
        const res = await fetch(`/api/catalog/sellers/${sellerSlug}/products`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Toko merchant tidak ditemukan");
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Gagal memuat toko merchant";
        if (!cancelled) {
          setError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStorefront();
    return () => {
      cancelled = true;
    };
  }, [params, toast]);

  const groupedByBrand = useMemo(() => {
    if (!data) return [];

    const groups = new Map<string, SellerCatalogItem[]>();
    for (const item of data.data) {
      const key = item.product.brand;
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }

    return Array.from(groups.entries())
      .map(([brand, items]) => ({
        brand,
        brandSlug: slugifyBrand(brand),
        items: items.sort((a, b) => a.sellingPrice - b.sellingPrice),
      }))
      .sort((a, b) => a.brand.localeCompare(b.brand));
  }, [data]);

  if (loading) {
    return (
      <div className={`${quicksand.className} flex min-h-screen justify-center bg-[#F5F5F5]`}>
        <div className="w-full max-w-[480px] min-h-screen bg-white shadow-2xl">
          <div className="h-14 w-full bg-[#003D99]" />
          <div className="space-y-4 px-4 pt-6">
            <div className="h-28 animate-pulse rounded-3xl bg-slate-100" />
            <div className="h-40 animate-pulse rounded-3xl bg-slate-100" />
            <div className="h-40 animate-pulse rounded-3xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`${quicksand.className} flex min-h-screen justify-center bg-[#F5F5F5]`}>
        <div className="w-full max-w-[480px] min-h-screen bg-white shadow-2xl">
          <AppHeader onBack={() => router.push("/")} />
          <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
            <p className="text-lg font-bold text-slate-800">{error || "Toko merchant tidak ditemukan"}</p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-5 rounded-2xl bg-[#003D99] px-5 py-3 text-sm font-semibold text-white"
            >
              Kembali ke Beranda
            </button>
          </div>
          <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        </div>
      </div>
    );
  }

  return (
    <div className={`${quicksand.className} flex min-h-screen justify-center bg-[#f5f7fb]`}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="relative w-full max-w-[480px] min-h-screen bg-[#f5f7fb] shadow-2xl">
        <AppHeader onBack={() => router.push("/")} />

        <div className="h-[60px]" />

        <div className="px-4 pb-8 pt-4">
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-600">Storefront Merchant</p>
                <h1 className="mt-3 text-2xl font-bold text-slate-900">{data.seller.displayName}</h1>
              </div>
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M6 7l1.5 11h9L18 7M9 11h6" />
                </svg>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {data.seller.description || "Belanja produk digital dari merchant ini dengan harga jual versi tokonya."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                /seller/{data.seller.slug}
              </div>
              <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {groupedByBrand.length} brand aktif
              </div>
              <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {data.data.length} produk tersedia
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {groupedByBrand.length === 0 ? (
              <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
                <p className="text-sm font-medium text-slate-600">Merchant ini belum memilih produk untuk dijual</p>
                <p className="mt-1 text-xs text-slate-400">Coba lagi nanti saat katalog merchant sudah diperbarui.</p>
              </div>
            ) : (
              groupedByBrand.map((group) => (
                <section key={group.brand} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{group.brand}</p>
                      <p className="text-sm text-slate-500">{group.items.length} produk tersedia</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const first = group.items[0];
                        router.push(`/brand/${group.brandSlug}?seller=${encodeURIComponent(slug)}&sellerProductId=${encodeURIComponent(first.sellerProductId)}`);
                      }}
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Lihat Brand
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {group.items.map((item) => (
                      <div key={item.sellerProductId} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-semibold text-slate-900">{item.product.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.product.provider} • {item.product.providerCode}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                                {item.product.category}
                              </span>
                              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                                Margin {rupiah(Math.max(0, item.sellingPrice - item.product.providerPrice))}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-bold text-slate-900">{rupiah(item.sellingPrice)}</p>
                            <p className="mt-1 text-[11px] text-slate-400">Harga dasar {rupiah(item.product.providerPrice)}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => router.push(`/brand/${group.brandSlug}?seller=${encodeURIComponent(slug)}&sellerProductId=${encodeURIComponent(item.sellerProductId)}`)}
                            className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                          >
                            Beli Produk
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
