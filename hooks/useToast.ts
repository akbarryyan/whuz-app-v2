import { useState, useCallback, useMemo } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback((message: string) => showToast(message, "success"), [showToast]);
  const error = useCallback((message: string) => showToast(message, "error"), [showToast]);
  const info = useCallback((message: string) => showToast(message, "info"), [showToast]);
  const warning = useCallback((message: string) => showToast(message, "warning"), [showToast]);

  // Objek kembalian WAJIB di-memo.
  //
  // Fungsi-fungsi di atas sudah stabil lewat useCallback, tetapi objek literal
  // yang membungkusnya dibuat ulang setiap render. Komponen yang menaruh hasil
  // hook ini di dependency array sebuah useEffect akan melihat dependensinya
  // berubah terus, dan bila effect itu juga menyetel state, loopnya tertutup:
  // effect -> setState -> render -> objek toast baru -> effect lagi.
  //
  // Itu bukan hipotesis. app/seller/[slug]/page.tsx pernah menembak
  // /api/catalog/sellers/[slug]/products berulang kali setiap ~15 ms selama tab
  // toko merchant terbuka, karena persis pola ini.
  return useMemo(
    () => ({ toasts, removeToast, showToast, success, error, info, warning }),
    [toasts, removeToast, showToast, success, error, info, warning],
  );
}
