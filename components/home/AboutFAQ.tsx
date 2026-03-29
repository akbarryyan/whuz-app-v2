"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface FaqItem {
  question: string;
  answer: string;
}

interface HomeContent {
  gameTags: { label: string; href: string }[];
  faqs: FaqItem[];
  aboutText: string;
}

export default function AboutFAQ() {
  const [content, setContent] = useState<HomeContent | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showAllFaq, setShowAllFaq] = useState(false);

  useEffect(() => {
    fetch("/api/home-content")
      .then((r) => r.json())
      .then((d) => { if (d.success) setContent(d.data); })
      .catch(() => {});
  }, []);

  if (!content) {
    return (
      <div className="mt-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm animate-pulse space-y-3">
          <div className="h-4 w-40 bg-slate-200 rounded" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-28 bg-slate-100 rounded-lg" />
            ))}
          </div>
          <div className="h-4 w-48 bg-slate-200 rounded mt-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 w-full bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { gameTags, faqs, aboutText } = content;
  const displayedFaqs = showAllFaq ? faqs : faqs.slice(0, 5);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="mt-4 space-y-8">
      {/* About Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="text-slate-600 text-sm leading-relaxed space-y-3">
          <p>{aboutText}</p>
        </div>

        {/* Game Tags */}
        {gameTags.length > 0 && (
          <div className="mt-8">
            <h2 className="text-[14px] font-bold text-slate-800 mb-2">Top Up Game</h2>
            <div className="flex flex-wrap gap-2">
              {gameTags.map((tag, idx) => (
                <Link
                  key={idx}
                  href={tag.href}
                  className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg text-[13px] font-medium transition-colors"
                >
                  {tag.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* FAQ Section */}
        {faqs.length > 0 && (
          <div className="mt-6">
            <h2 className="text-[14px] font-bold text-slate-800 mb-2">Paling Sering Ditanyakan:</h2>
            <p className="text-slate-500 text-sm mb-6">Temukan jawaban untuk pertanyaan umum seputar layanan kami</p>

            <div className="space-y-3">
              {displayedFaqs.map((faq, idx) => (
                <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-purple-600 font-semibold text-[12px] pr-4">{faq.question}</span>
                    <svg
                      className={`w-5 h-5 text-purple-600 flex-shrink-0 transition-transform duration-300 ${
                        openFaq === idx ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      openFaq === idx ? "max-h-96" : "max-h-0"
                    }`}
                  >
                    <div className="px-4 pb-4 text-slate-600 text-sm leading-relaxed">{faq.answer}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Show More / Less */}
            {!showAllFaq && faqs.length > 5 && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => setShowAllFaq(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#003D99] hover:bg-[#002766] text-white text-[12px] font-semibold rounded-lg transition-colors"
                >
                  Baca Selengkapnya
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            )}
            {showAllFaq && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => { setShowAllFaq(false); setOpenFaq(null); }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#003D99] hover:bg-[#002766] text-white text-[12px] font-semibold rounded-lg transition-colors"
                >
                  Tampilkan Lebih Sedikit
                  <svg className="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}