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
      className={`bg-white border-b border-slate-200 transition-all duration-300 ${
        isSticky ? "sticky z-30 shadow-md" : ""
      }`}
      style={{
        top: isSticky ? "52px" : "0",
      }}
    >
      <div className="overflow-x-auto hide-scrollbar">
        <div className="flex gap-6 px-4 relative">
          {categories.map((category, idx) => (
            <button
              key={idx}
              ref={(el) => {
                tabsRef.current[idx] = el;
              }}
              onClick={() => onCategoryChange(category.value)}
              className={`py-3 text-sm font-medium whitespace-nowrap transition-all duration-300 relative flex-shrink-0 ${
                resolvedIdx === idx
                  ? "text-purple-600 scale-105"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {category.label}
            </button>
          ))}
          {/* Animated underline */}
          <div
            className="absolute bottom-0 h-0.5 bg-purple-600 transition-all duration-300 ease-out"
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
