"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Quicksand } from "next/font/google";
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
    <div className={`${quicksand.className} flex min-h-screen justify-center bg-[#F5F5F5]`}>
      {/* Skeleton — fades out */}
      <div
        className={`absolute inset-0 flex justify-center z-50 transition-opacity duration-500 ${
          ready ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <HomeSkeleton />
      </div>

      {/* Mobile Container — Fades in */}
      <div
        className={`relative w-full max-w-[480px] min-h-screen bg-[#F5F5F5] shadow-2xl flex flex-col gap-0 transition-opacity duration-500 ${
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
          <Link
            href="/seller"
            className="mb-4 flex items-center justify-between rounded-3xl bg-white px-4 py-4 shadow-sm transition hover:shadow-md"
          >
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#003D99]">
                Merchant
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-800">Lihat Merchant Tersedia</h2>
              <p className="mt-1 text-sm text-slate-500">
                Buka toko merchant aktif dan lihat produk yang mereka jual.
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#003D99] text-white">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          <GameGrid category={activeTypeGroup} />
          <AboutFAQ />
        </div>
        <Footer />

        <BottomNavigation />
      </div>
    </div>
  );
}
