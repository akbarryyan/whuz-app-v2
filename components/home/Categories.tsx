"use client";

import { useState, useRef, useEffect } from "react";

interface CategoriesProps {
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
}

export default function Categories({ activeCategory, onCategoryChange }: CategoriesProps) {
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 });
  const [isSticky, setIsSticky] = useState(false);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // value matches typeGroup param in /api/catalog/brands
  const categories = [
    { label: "Semua", value: null },
    { label: "Top Up Game", value: "game" },
    { label: "Pulsa & Data", value: "pulsa" },
    { label: "E-Wallet", value: "ewallet" },
    { label: "Token Listrik", value: "listrik" },
  ];

  const activeIdx = categories.findIndex((c) => c.value === activeCategory);
  const resolvedIdx = activeIdx === -1 ? 0 : activeIdx;

  useEffect(() => {
    const activeButton = tabsRef.current[resolvedIdx];
    if (activeButton) {
      setUnderlineStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      });
    }
  }, [resolvedIdx]);

  useEffect(() => {
    const handleScroll = () => {
      setIsSticky(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`border-b border-slate-200 bg-white transition-all duration-300 lg:border-0 lg:bg-white ${
        isSticky ? "sticky top-[52px] z-30 shadow-md lg:top-auto lg:shadow-none" : ""
      }`}
    >
      <div className="overflow-x-auto hide-scrollbar lg:overflow-visible">
        <div className="relative flex gap-6 px-4 lg:flex-wrap lg:items-center lg:justify-start lg:gap-4 lg:px-0 lg:py-0">
          {categories.map((category, idx) => (
            <button
              key={idx}
              ref={(el) => {
                tabsRef.current[idx] = el;
              }}
              onClick={() => onCategoryChange(category.value)}
              className={`relative flex-shrink-0 whitespace-nowrap py-3 text-sm font-medium transition-all duration-300 lg:rounded-full lg:px-8 lg:py-3 lg:text-[15px] lg:font-semibold ${
                resolvedIdx === idx
                  ? "scale-105 text-purple-600 lg:scale-100 lg:bg-[#003D99] lg:text-white lg:shadow-sm"
                  : "text-slate-500 hover:text-slate-700 lg:border lg:border-slate-200 lg:bg-slate-50 lg:text-slate-600 lg:hover:border-slate-300 lg:hover:bg-slate-100 lg:hover:text-slate-800"
              }`}
            >
              {category.label}
            </button>
          ))}
          {/* Animated underline */}
          <div
            className="absolute bottom-0 h-0.5 bg-purple-600 transition-all duration-300 ease-out lg:hidden"
            style={{
              left: `${underlineStyle.left}px`,
              width: `${underlineStyle.width}px`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
