"use client";

import { useEffect, useState } from "react";
import { FooterLinkItem, normalizeFooterLinks } from "@/lib/footer-links";

interface PaymentMethod {
  name: string;
  img: string;
}

interface FooterBranding {
  footer_logo_url?: string;
  footer_tagline?: string;
  footer_copyright?: string;
  footer_company_name?: string;
  footer_payment_methods?: string; // JSON
  footer_info_links?: string;
  footer_other_links?: string;
}

function safeJSON<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export default function PageFooter() {
  const [branding, setBranding] = useState<FooterBranding>({});

  useEffect(() => {
    fetch("/api/footer-config")
      .then((r) => r.json())
      .then((d) => { if (d.success) setBranding(d.data); })
      .catch(() => {});
  }, []);

  const logoUrl = branding.footer_logo_url || "";
  const tagline = branding.footer_tagline || "Top Up Game Murah & PPOB Terpercaya? Whuzpay Aja!";
  const copyright = branding.footer_copyright || "Copyright ©2024 - 2026\nPT. Whuzpay Digital Indonesia - Whuzpay All Right Reserved";
  const paymentMethods = safeJSON<PaymentMethod[]>(branding.footer_payment_methods ?? "", [
    { name: "GoPay", img: "" },
    { name: "DANA", img: "" },
    { name: "Shopee", img: "" },
    { name: "OVO", img: "" },
    { name: "QRIS", img: "" },
  ]);
  const infoLinks = normalizeFooterLinks(
    safeJSON<FooterLinkItem[]>(branding.footer_info_links ?? "", []),
    [
      { label: "Tentang Kami", type: "page", slug: "tentang-kami", href: "/info/tentang-kami" },
      { label: "Syarat dan Ketentuan", type: "page", slug: "syarat-dan-ketentuan", href: "/info/syarat-dan-ketentuan" },
    ]
  );
  const otherLinks = normalizeFooterLinks(
    safeJSON<FooterLinkItem[]>(branding.footer_other_links ?? "", []),
    []
  );

  return (
    <footer className="bg-white border-t border-slate-100 px-5 pt-6 pb-28">
      {/* Logo + tagline */}
      <div className="mb-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="WhuzPay" className="h-10 w-auto object-contain mb-2" />
        ) : (
          <div className="flex items-center gap-1.5 mb-2">
            <div className="bg-[#003D99] rounded-lg px-2 py-1">
              <span className="text-white font-bold text-sm tracking-wide">WZ</span>
            </div>
            <span className="text-slate-800 font-bold text-base">WhuzPay</span>
          </div>
        )}
        <p className="text-[11px] text-slate-500 font-semibold leading-snug">{tagline}</p>
      </div>

      {(infoLinks.length > 0 || otherLinks.length > 0) && (
        <div className="flex flex-wrap gap-4 mb-4">
          {[...infoLinks, ...otherLinks].map((link) => (
            <a key={`${link.label}-${link.href}`} href={link.href} className="text-[12px] font-semibold text-[#6A7389] hover:text-slate-700 transition-colors">
              {link.label}
            </a>
          ))}
        </div>
      )}

      {/* Help card */}
      <a href="/pusat-bantuan" className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-5 hover:bg-slate-100 transition-colors">
        <div className="w-9 h-9 rounded-full bg-[#003D99] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-lg font-bold">?</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-500 leading-none mb-0.5">Punya Pertanyaan?</p>
          <p className="text-[12px] text-[#003D99] font-semibold">
            Cek Pusat Bantuan{" "}
            <span className="text-[#003D99]">&rsaquo;</span>
          </p>
        </div>
      </a>

      {/* Payment methods — from footer config (same as home Footer) */}
      <div className="mb-2">
        <p className="text-[11px] font-bold text-slate-700">Pembayaran Lengkap</p>
        <div className="flex flex-wrap gap-2 items-center">
          {paymentMethods.map((pm) =>
            pm.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={pm.name}
                src={pm.img}
                alt={pm.name}
                title={pm.name}
                className="h-14 w-auto object-contain rounded"
              />
            ) : (
              <span
                key={pm.name}
                className="bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-[10px] font-bold tracking-wide"
              >
                {pm.name}
              </span>
            )
          )}
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-slate-100 pt-4">
        {copyright.split("\n").map((line, i) => (
          <p key={i} className="text-[10px] text-slate-400 leading-relaxed">{line}</p>
        ))}
      </div>
    </footer>
  );
}
