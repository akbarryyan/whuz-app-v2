"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/admin/Sidebar";
import Header from "@/components/admin/Header";
import { ToastContainer } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

const RichTextEditor = dynamic(() => import("@/components/admin/RichTextEditor"), {
  ssr: false,
  loading: () => (
    <div className="h-32 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

interface PaymentMethod { name: string; img: string; }
interface NavLink       { label: string; href: string; }
interface SocialLink    { platform: string; href: string; }

const SOCIAL_PLATFORMS = ["instagram", "facebook", "youtube", "discord", "tiktok"];

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function safeJSON<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/* ─── LinkEditor (outside component to avoid re-mount) ────────────────────── */
function LinkEditor({
  title, links, setLinks, configKey, saving, onSave,
}: {
  title: string;
  links: NavLink[];
  setLinks: (v: NavLink[]) => void;
  configKey: string;
  saving: string | null;
  onSave: (key: string, value: string, label: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-bold text-slate-700 text-sm">{title}</h2>
        <button
          onClick={() => setLinks([...links, { label: "", href: "#" }])}
          className="text-xs text-blue-600 font-semibold hover:underline"
        >+ Tambah</button>
      </div>
      <div className="px-5 py-4 space-y-2">
        {links.map((link, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={link.label}
              onChange={(e) => { const v = e.target.value; setLinks(links.map((l, j) => j === i ? { ...l, label: v } : l)); }}
              placeholder="Label"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400"
            />
            <input
              value={link.href}
              onChange={(e) => { const v = e.target.value; setLinks(links.map((l, j) => j === i ? { ...l, href: v } : l)); }}
              placeholder="URL / path"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400"
            />
            <button
              onClick={() => setLinks(links.filter((_, j) => j !== i))}
              className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        {links.length === 0 && (
          <p className="text-xs text-slate-400">Belum ada link. Klik &quot;+ Tambah&quot;.</p>
        )}
      </div>
      <div className="px-5 pb-4">
        <button
          onClick={() => onSave(configKey, JSON.stringify(links), title)}
          disabled={saving === configKey}
          className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving === configKey ? "Menyimpan..." : "💾 Simpan"}
        </button>
      </div>
    </div>
  );
}

/* ─── component ───────────────────────────────────────────────────────────── */
export default function AdminFooterPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const toast = useToast();

  // ── raw field states ──────────────────────────────────────────────────────
  const [logoUrl,      setLogoUrl]      = useState("");
  const [tagline,      setTagline]      = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    { name: "GoPay",  img: "" },
    { name: "DANA",   img: "" },
    { name: "Shopee", img: "" },
    { name: "OVO",    img: "" },
    { name: "QRIS",   img: "" },
  ]);
  const [companyName,  setCompanyName]  = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [infoLinks,    setInfoLinks]    = useState<NavLink[]>([
    { label: "Tentang Kami",         href: "#" },
    { label: "Syarat dan Ketentuan", href: "/info/syarat-dan-ketentuan" },
    { label: "Kebijakan Privasi",    href: "/info/kebijakan-privasi" },
  ]);
  const [otherLinks,   setOtherLinks]   = useState<NavLink[]>([{ label: "Karir", href: "#" }]);
  const [socialLinks,  setSocialLinks]  = useState<SocialLink[]>(
    SOCIAL_PLATFORMS.map((p) => ({ platform: p, href: "#" }))
  );
  const [pageContents, setPageContents] = useState<Record<string, string>>({});
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [copyright, setCopyright] = useState(
    "Copyright ©2024 - 2026\nPT. Whuzpay Digital Indonesia - Whuzpay All Right Reserved"
  );

  // ── load from API ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/footer-config")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        const c = d.data;
        setLogoUrl(c.footer_logo_url ?? "");
        setTagline(c.footer_tagline ?? "");
        setPaymentMethods(safeJSON(c.footer_payment_methods, paymentMethods));
        setCompanyName(c.footer_company_name ?? "");
        setContactPhone(c.footer_contact_phone ?? "");
        setContactEmail(c.footer_contact_email ?? "");
        const loadedInfoLinks = safeJSON<NavLink[]>(c.footer_info_links, infoLinks);
        setInfoLinks(loadedInfoLinks);
        setOtherLinks(safeJSON(c.footer_other_links, otherLinks));

        // Load page content for each info link that has /info/ href
        const slugsToLoad = loadedInfoLinks
          .map((l) => l.href.match(/^\/info\/(.+)$/)?.[1])
          .filter(Boolean) as string[];
        if (slugsToLoad.length > 0) {
          Promise.all(
            slugsToLoad.map((s) =>
              fetch(`/api/page-content/${s}`).then((r) => r.json()).then((d) => ({
                slug: s,
                content: d.success ? (d.data.content ?? "") : "",
              })).catch(() => ({ slug: s, content: "" }))
            )
          ).then((results) => {
            const map: Record<string, string> = {};
            results.forEach((r) => { map[r.slug] = r.content; });
            setPageContents(map);
          });
        }
        const loaded = safeJSON<SocialLink[]>(c.footer_social_links, []);
        if (loaded.length > 0) {
          setSocialLinks(
            SOCIAL_PLATFORMS.map((p) => ({
              platform: p,
              href: loaded.find((s) => s.platform === p)?.href ?? "#",
            }))
          );
        }
        setCopyright(c.footer_copyright ?? copyright);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── save helper ───────────────────────────────────────────────────────────
  const save = useCallback(async function save(key: string, value: string, label: string) {
    setSaving(key);
    try {
      const res = await fetch("/api/admin/site-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (!data.success) { toast.error(`Gagal menyimpan ${label}`); return; }
      toast.success(`${label} disimpan`);
    } catch {
      toast.error(`Gagal menyimpan ${label}`);
    } finally {
      setSaving(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:gap-6">
          <Header onMenuClick={() => setSidebarOpen(true)} />

          {/* Page header */}
          <div>
            <h1 className="text-xl font-bold text-slate-800">🦶 Pengaturan Footer</h1>
            <p className="text-sm text-slate-500 mt-0.5">Atur konten footer yang tampil di halaman utama</p>
          </div>

          {/* ── Brand ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-700 text-sm">Brand / Logo</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Kosongkan URL untuk menampilkan badge WZ default.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">URL Logo</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://... (kosongkan untuk badge WZ)"
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400"
                  />
                  <button onClick={() => save("footer_logo_url", logoUrl, "Logo")}
                    disabled={saving === "footer_logo_url"}
                    className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50 flex-shrink-0">
                    {saving === "footer_logo_url" ? "..." : "💾 Simpan"}
                  </button>
                </div>
                {logoUrl && (
                  <div className="mt-2 p-2 bg-slate-50 rounded-xl inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="Logo preview" className="h-8 w-auto object-contain" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Tagline</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400"
                  />
                  <button onClick={() => save("footer_tagline", tagline, "Tagline")}
                    disabled={saving === "footer_tagline"}
                    className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50 flex-shrink-0">
                    {saving === "footer_tagline" ? "..." : "💾 Simpan"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Payment Methods ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-700 text-sm">Pembayaran Lengkap</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Nama dan warna badge (hex) metode pembayaran.</p>
              </div>
              <button
                onClick={() => setPaymentMethods([...paymentMethods, { name: "", img: "" }])}
                className="text-xs text-blue-600 font-semibold hover:underline flex-shrink-0"
              >+ Tambah</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {paymentMethods.map((pm, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={pm.name}
                      onChange={(e) => setPaymentMethods(paymentMethods.map((p, j) => j === i ? { ...p, name: e.target.value } : p))}
                      placeholder="Nama (mis. GoPay)"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400"
                    />
                    <input
                      value={pm.img}
                      onChange={(e) => setPaymentMethods(paymentMethods.map((p, j) => j === i ? { ...p, img: e.target.value } : p))}
                      placeholder="URL gambar logo"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400"
                    />
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-1">
                    {pm.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pm.img} alt={pm.name} className="h-8 w-12 object-contain rounded border border-slate-100 bg-slate-50" />
                    ) : (
                      <div className="h-8 w-12 rounded border border-dashed border-slate-300 flex items-center justify-center">
                        <span className="text-[9px] text-slate-400">No img</span>
                      </div>
                    )}
                    <button
                      onClick={() => setPaymentMethods(paymentMethods.filter((_, j) => j !== i))}
                      className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-4">
              <button
                onClick={() => save("footer_payment_methods", JSON.stringify(paymentMethods), "Pembayaran")}
                disabled={saving === "footer_payment_methods"}
                className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saving === "footer_payment_methods" ? "Menyimpan..." : "💾 Simpan"}
              </button>
            </div>
          </div>

          {/* ── Contact ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-700 text-sm">Layanan Pengaduan Konsumen</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Nama perusahaan, nomor WhatsApp, dan alamat email support.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Nama Perusahaan</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="PT Whuzpay Digital Indonesia"
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400"
                  />
                  <button onClick={() => save("footer_company_name", companyName, "Nama Perusahaan")}
                    disabled={saving === "footer_company_name"}
                    className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50 flex-shrink-0">
                    {saving === "footer_company_name" ? "..." : "💾 Simpan"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Nomor WhatsApp</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="08123-456-7890"
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400"
                  />
                  <button onClick={() => save("footer_contact_phone", contactPhone, "Nomor WA")}
                    disabled={saving === "footer_contact_phone"}
                    className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50 flex-shrink-0">
                    {saving === "footer_contact_phone" ? "..." : "💾 Simpan"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Email Support</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="support@whuzpay.com"
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400"
                  />
                  <button onClick={() => save("footer_contact_email", contactEmail, "Email")}
                    disabled={saving === "footer_contact_email"}
                    className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50 flex-shrink-0">
                    {saving === "footer_contact_email" ? "..." : "💾 Simpan"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Informasi links ── */}
          <LinkEditor
            title="Informasi (link navigasi)"
            links={infoLinks}
            setLinks={setInfoLinks}
            configKey="footer_info_links"
            saving={saving}
            onSave={save}
          />

          {/* ── Konten Halaman Informasi ── */}
          {infoLinks
            .filter((l) => l.href.startsWith("/info/"))
            .map((link) => {
              const slug = link.href.replace("/info/", "");
              const contentKey = `page_content_${slug}`;
              const isOpen = expandedSlug === slug;
              const content = pageContents[slug] ?? "";
              return (
                <div key={slug} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedSlug(isOpen ? null : slug)}
                    className="w-full px-5 py-4 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition"
                  >
                    <div className="text-left">
                      <h2 className="font-bold text-slate-700 text-sm">📝 Konten: {link.label}</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">Atur isi halaman <span className="font-mono text-slate-500">{link.href}</span></p>
                    </div>
                    <svg
                      className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <>
                      <div className="px-5 py-4">
                        <RichTextEditor
                          value={content}
                          onChange={(v) => setPageContents((prev) => ({ ...prev, [slug]: v }))}
                          placeholder={`Tulis konten ${link.label}...`}
                          disabled={saving === contentKey}
                        />
                      </div>
                      <div className="px-5 pb-4">
                        <button
                          onClick={() => save(contentKey, content, `Konten ${link.label}`)}
                          disabled={saving === contentKey}
                          className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          {saving === contentKey ? "Menyimpan..." : "💾 Simpan"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          }

          {/* ── Lainnya links ── */}
          <LinkEditor
            title="Lainnya (link navigasi)"
            links={otherLinks}
            setLinks={setOtherLinks}
            configKey="footer_other_links"
            saving={saving}
            onSave={save}
          />

          {/* ── Social Links ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-700 text-sm">Ikuti Kami di (Sosial Media)</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Isi URL masing-masing platform. Kosongkan untuk menyembunyikan.</p>
            </div>
            <div className="px-5 py-4 space-y-2">
              {socialLinks.map((s, i) => (
                <div key={s.platform} className="flex gap-3 items-center">
                  <span className="w-20 text-xs font-bold text-slate-500 capitalize flex-shrink-0">{s.platform}</span>
                  <input
                    type="url"
                    value={s.href}
                    onChange={(e) => setSocialLinks(socialLinks.map((sl, j) => j === i ? { ...sl, href: e.target.value } : sl))}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400"
                  />
                </div>
              ))}
            </div>
            <div className="px-5 pb-4">
              <button
                onClick={() => save("footer_social_links", JSON.stringify(socialLinks), "Sosial Media")}
                disabled={saving === "footer_social_links"}
                className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saving === "footer_social_links" ? "Menyimpan..." : "💾 Simpan"}
              </button>
            </div>
          </div>

          {/* ── Copyright ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-700 text-sm">Copyright</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Gunakan baris baru (Enter) untuk memisahkan dua baris teks.</p>
            </div>
            <div className="px-5 py-4">
              <textarea
                value={copyright}
                onChange={(e) => setCopyright(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400 resize-none"
              />
            </div>
            <div className="px-5 pb-4">
              <button
                onClick={() => save("footer_copyright", copyright, "Copyright")}
                disabled={saving === "footer_copyright"}
                className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saving === "footer_copyright" ? "Menyimpan..." : "💾 Simpan"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
