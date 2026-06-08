"use client";

import { useRef, useState } from "react";

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  folder: "promos" | "brands" | "banners" | "payment-methods" | "sellers" | "site" | "footer";
  label?: string;
  previewClassName?: string;
}

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif";

export default function ImageUploadField({
  value,
  onChange,
  folder,
  label,
  previewClassName = "h-14 w-auto object-contain rounded",
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Gagal mengunggah gambar.");
        return;
      }
      onChange(data.data.url);
    } catch {
      setError("Gagal mengunggah gambar.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      )}
      <div className="flex items-center gap-3">
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Preview" className={`${previewClassName} border border-slate-200 bg-slate-50 flex-shrink-0`} />
        )}
        <div className="flex-1 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="self-start px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {uploading ? "Mengunggah..." : value ? "Ganti Gambar" : "Pilih Gambar"}
          </button>
          {value && !uploading && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="self-start text-[11px] font-semibold text-rose-500 hover:text-rose-600 transition"
            >
              Hapus gambar
            </button>
          )}
          {error && <p className="text-[11px] text-rose-500">{error}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
