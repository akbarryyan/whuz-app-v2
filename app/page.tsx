"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Quicksand } from "@/lib/fonts";
import Header from "@/components/home/Header";
import BannerCarousel from "@/components/home/BannerCarousel";
import FlashSale from "@/components/home/FlashSale";
import GameGrid from "@/components/home/GameGrid";
import Categories from "@/components/home/Categories";
import AboutFAQ from "@/components/home/AboutFAQ";
import Footer from "@/components/home/Footer";
import BottomNavigation from "@/components/BottomNavigation";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

/* ────────────────────────────────────────────────────────── */
/*  Skeleton placeholder shown while the page is "loading"   */
/* ────────────────────────────────────────────────────────── */
function HomeSkeleton() {
  return (
    <div className="w-full max-w-[480px] min-h-screen bg-[#F5F5F5] shadow-2xl flex flex-col animate-pulse">
      {/* ── Header skeleton ── */}
      <div className="bg-[#003D99] px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="h-10 w-28 bg-white/15 rounded-lg" />
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-white/15 rounded-full" />
            <div className="w-6 h-6 bg-white/15 rounded-full" />
            <div className="w-6 h-6 bg-white/15 rounded-full" />
          </div>
        </div>
        <div className="mt-2.5 h-9 bg-white/20 rounded-md" />
      </div>

      {/* ── Banner skeleton ── */}
      <div className="bg-white">
        <div className="aspect-[2/1] -mt-10 bg-slate-200" />
        <div className="h-8 bg-[#E5F0FF]" />
      </div>

      {/* ── Flash Sale skeleton ── */}
      <div className="bg-white px-4 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="h-6 w-32 bg-slate-200 rounded" />
          <div className="flex gap-1.5">
            <div className="h-6 w-8 bg-green-200 rounded" />
            <div className="h-6 w-8 bg-green-200 rounded" />
            <div className="h-6 w-8 bg-green-200 rounded" />
          </div>
          <div className="h-4 w-20 bg-slate-200 rounded" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-[140px] flex-shrink-0 rounded-xl bg-slate-100 p-2">
              <div className="aspect-square bg-slate-200 rounded-lg mb-2" />
              <div className="h-3 w-20 bg-slate-200 rounded mb-1.5" />
              <div className="h-3 w-14 bg-slate-200 rounded mb-2" />
              <div className="h-7 bg-slate-200 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Categories skeleton ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex gap-6">
        {[80, 100, 65, 75, 90].map((w, i) => (
          <div key={i} className="h-4 bg-slate-200 rounded flex-shrink-0" style={{ width: w }} />
        ))}
      </div>

      {/* ── Game Grid skeleton ── */}
      <div className="flex-1 px-4 py-6 bg-slate-50">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-28 bg-slate-200 rounded" />
          <div className="h-4 w-24 bg-slate-200 rounded" />
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-2 shadow-sm">
              <div className="aspect-square bg-slate-200 rounded-lg mb-1.5" />
              <div className="h-3 w-14 bg-slate-200 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Nav skeleton ── */}
      <div className="h-16 bg-white border-t border-slate-200 flex items-center justify-around px-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-6 h-6 bg-slate-200 rounded" />
            <div className="h-2.5 w-10 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeTypeGroup, setActiveTypeGroup] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Simulate a short delay so child components can start fetching, then reveal
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`${quicksand.className} flex min-h-screen w-full overflow-x-hidden justify-center bg-[#F5F5F5]`}>
      {/* Skeleton — fades out */}
      <div
        className={`absolute inset-0 flex w-full overflow-x-hidden justify-center z-50 transition-opacity duration-500 ${
          ready ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <HomeSkeleton />
      </div>

      {/* Mobile Container — Fades in */}
      <div
        className={`relative w-full max-w-[480px] min-h-screen overflow-x-hidden bg-[#F5F5F5] shadow-2xl flex flex-col gap-0 transition-opacity duration-500 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      >
        <Header />
        {/* Spacer when header is fixed */}
        {isScrolled && <div className="h-[52px]" />}
        <BannerCarousel />
        <FlashSale />
        <Categories activeCategory={activeTypeGroup} onCategoryChange={setActiveTypeGroup} />

        {/* Main Content */}
        <div className="flex-1 px-4 py-6 bg-slate-50 pb-24">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Link
              href="/seller"
              className="group relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="absolute -right-5 -top-8 h-24 w-24 rounded-full bg-slate-100" />
              <div className="absolute bottom-0 right-10 h-14 w-14 rounded-full bg-blue-50" />

              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-blue-100 bg-blue-50">
                  <svg className="h-6 w-6 text-[#003D99]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M3 7.5l9-4 9 4m-18 0v9l9 4m-9-13l9 4m9-4l-9 4m0 9v-9" />
                  </svg>
                </div>
                <div className="mt-3 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#003D99]">
                  Merchant
                </div>
                <h2 className="mt-2 text-base font-bold leading-tight text-slate-900">
                  Lihat Merchant
                </h2>
                <p className="mt-1.5 min-h-[2.5rem] text-sm leading-relaxed text-slate-500">
                  Jelajahi toko merchant aktif.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#003D99]">
                  <span>Buka</span>
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>

            <Link
              href="/promo"
              className="group relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="absolute -right-5 -top-8 h-24 w-24 rounded-full bg-slate-100" />
              <div className="absolute bottom-0 right-10 h-14 w-14 rounded-full bg-amber-50" />

              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-amber-100 bg-amber-50">
                  <svg className="h-6 w-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                </div>
                <div className="mt-3 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">
                  Promo
                </div>
                <h2 className="mt-2 text-base font-bold leading-tight text-slate-900">
                  Promo Terbaru
                </h2>
                <p className="mt-1.5 min-h-[2.5rem] text-sm leading-relaxed text-slate-500">
                  Cek promo dan penawaran aktif.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                  <span>Lihat</span>
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          </div>

          <GameGrid category={activeTypeGroup} />
          <AboutFAQ />
        </div>
        <Footer />

        <BottomNavigation />
      </div>
    </div>
  );
}
