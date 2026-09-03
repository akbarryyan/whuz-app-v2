# Whuzpay Coding Constitution (Engineering Rules)

> Dokumen ini adalah "aturan main" agar implementasi Whuzpay konsisten, scalable, dan mudah dirawat.

---

## 1) Core Principles

### 1.1 Clean Separation of Concerns
- UI tidak boleh contain business logic transaksi.
- Route handler tidak boleh contain logic selain:
  - parse input
  - validate
  - call service
  - return response

### 1.2 Service Layer First
Semua logic transaksi ada di service/usecase.

Contoh:
- `CreateCheckoutService`
- `handlePoppayCallback`
- `ExecuteProviderPurchaseService`

### 1.3 Ports & Adapters
Semua external system harus lewat port:
- Payment Gateway
- Provider PPOB
- Repositories (DB)

Port Queue sudah dihapus bersama BullMQ. Lihat 2.2.

Tidak boleh:
- service langsung import SDK provider atau SDK payment.

### 1.4 Deterministic & Testable
- Service menerima dependensinya lewat constructor supaya bisa dites dengan
  repository/provider/payment tiruan.
- **Tetapi jangan memakai tiruan untuk menguji perilaku database.** Lost update,
  race condition, dan idempotensi adalah perilaku isolasi database — repository
  tiruan tidak punya transaksi maupun kunci baris, jadi ia akan selalu lulus dan
  tidak membuktikan apa pun.
- Untuk itu ada test integrasi terhadap MySQL sekali pakai. Lihat
  `docs/TESTING.md`.

---

## 2) Rules for Transactions (Non-Negotiable)

### 2.1 Idempotency
- Semua webhook harus idempotent.
- Semua purchase provider harus idempotent.

Penjaga idempotensi **wajib ditegakkan database**, bukan dibaca lalu diperiksa
di JavaScript. Pola berikut TERLARANG:

```ts
const sudahAda = await tx.ledgerEntry.findFirst({ ... });
if (sudahAda) return;            // dua pemanggil bersamaan sama-sama lolos
```

Yang benar adalah klaim atomik — `updateMany` dengan syarat penandanya masih
kosong, lalu periksa `count`:

```ts
const klaim = await tx.order.updateMany({
  where: { id, refundedAt: null },
  data: { refundedAt: new Date() },
});
if (klaim.count === 0) return;   // pemanggil lain sudah menang
```

Bukti kenapa ini bukan teori: dengan pola lama, sepuluh refund bersamaan atas
order yang sama menghasilkan sepuluh pembayaran.

### 2.1b Webhook: "pernah dicoba" bukan "sudah selesai"
Baris `WebhookEvent` dibuat SEBELUM pemrosesan. Yang boleh menghentikan
pemrosesan hanyalah event dengan `processed = true`. Percobaan yang gagal harus
dibiarkan terbuka agar kiriman ulang gateway masih bisa menyelesaikannya.

### 2.2 Eksekusi Provider & Durabilitas

Aturan lama berbunyi *"provider purchase selalu di worker queue"*. Aturan itu
**sudah tidak berlaku**. BullMQ dihapus karena tidak ada satu pun pengirim job,
sementara worker-nya tetap hidup di PM2 tanpa DATABASE_URL — proses yang
memakan sumber daya dan akan gagal andai benar-benar diberi pekerjaan.

Yang berlaku sekarang:

- Provider dieksekusi **inline** oleh `ExecuteProviderPurchaseService`, dipanggil
  dari callback pembayaran dan dari jalur checkout wallet.
- Anti eksekusi ganda memakai klaim atomik `claimForProcessing` (PAID →
  PROCESSING_PROVIDER), bukan penguncian di memori.
- **TIDAK BOLEH menjadwalkan pekerjaan di memori proses.** `setTimeout` dan
  sejenisnya hilang setiap deploy, restart, atau crash — tanpa jejak. Pekerjaan
  yang tertunda harus bisa ditemukan kembali dari database.
- Order yang tersangkut ditemukan oleh sapuan berkala yang menanyakan ulang ke
  database (`sweepStuckOrders`), bukan oleh jadwal yang disimpan di memori.

Konsekuensi yang diterima sadar: pemenuhan terjadi di dalam request, sehingga
tidak ada retry berlapis seperti yang diberikan queue. Jaring pengamannya adalah
kiriman ulang gateway (lihat 2.1b) dan sapuan berkala.

### 2.3 State Machine Discipline
Order status hanya boleh berubah sesuai flow:

```text
CREATED → WAITING_PAYMENT → PAID → PROCESSING_PROVIDER → SUCCESS
CREATED → WAITING_PAYMENT → EXPIRED
PAID → PROCESSING_PROVIDER → FAILED
FAILED → REFUNDED (wallet)
```

Tidak boleh:
- lompat status tanpa alasan.

### 2.4 Provider Logs
Semua request/response provider wajib dicatat di `ProviderLog`.

---

## 3) Wallet Rules

### 3.1 Ledger is Source of Truth
- Saldo wallet di tabel `Wallet.balance` hanya untuk quick read.
- Audit/trace selalu pakai `LedgerEntry`.

### 3.2 HOLD First, Finalize Later
Saat transaksi wallet:
1) HOLD saldo
2) execute provider
3) SUCCESS → DEBIT finalize
4) FAILED → RELEASE

Tidak boleh:
- langsung debit sebelum provider sukses.

Catatan pembacaan ledger: `HOLD` sudah memotong saldo, dan `DEBIT` hanya
mencatat (balanceBefore = balanceAfter). Jadi saldo diturunkan dari
`-HOLD +RELEASE +REFUND +CREDIT +COMMISSION`, dengan `DEBIT` diabaikan.

### 3.3 Mutasi saldo WAJIB atomik
Membaca saldo, menghitung di JavaScript, lalu menulis kembali nilai absolutnya
adalah TERLARANG — membungkusnya dengan `$transaction` tidak menolong, karena
`findUnique` menghasilkan SELECT tanpa kunci dan di bawah REPEATABLE READ semua
transaksi membaca snapshot yang sama.

Terlarang:

```ts
const w = await tx.wallet.findUnique({ where: { userId } });
if (Number(w.balance) < amount) return null;
await tx.wallet.update({ data: { balance: Number(w.balance) - amount } });
```

Pengurangan — pemeriksaan kecukupan dan pengurangannya dalam SATU pernyataan:

```ts
const { count } = await tx.wallet.updateMany({
  where: { userId, balance: { gte: amount } },
  data: { balance: { decrement: amount } },
});
if (count === 0) return null;   // saldo tidak cukup
```

Penambahan memakai `{ increment: amount }`.

`balanceBefore`/`balanceAfter` pada ledger diturunkan dari nilai SETELAH update
ditambah/dikurangi delta transaksi ini sendiri, bukan dari pembacaan awal.

Bukti kenapa ini non-negotiable: dengan pola lama, sepuluh checkout wallet
bersamaan atas saldo yang hanya cukup untuk satu order **semuanya diterima**,
dan saldo akhirnya tetap terlihat wajar karena semua menulis nilai yang sama.

---

## 4) Guest Checkout Rules

### 4.1 Guest cannot use Wallet
Guest hanya bisa payment gateway.

### 4.2 Guest order access is tokenized
- `order_code` public
- `view_token` secret
- DB simpan `view_token_hash`

`GET /api/orders/[code]` memang boleh diakses tanpa login dan tanpa token —
halaman Lacak Pesanan bergantung padanya. Yang dibatasi adalah ISI responsnya,
bukan aksesnya. Tanpa kredensial (bukan pemilik, bukan admin, tanpa token):

- `serialNumber` ditahan — itu kode voucher yang benar-benar bisa ditukar
- `targetNumber` disamarkan, `targetData` ditiadakan
- `basePrice` dan `markup` tidak dikirim ke siapa pun; itu margin internal

Alasannya: `order_code` hanya `WP-YYMMDD-` + 3 byte acak dengan prefix tanggal
yang bisa ditebak. Menyisirnya murah, jadi jangan ada yang bernilai untuk
dipanen di sana.

Otorisasi dihitung eksplisit `isAdmin || isOwner || tokenValid` — jangan pernah
memakai cabang yang hanya memvalidasi token *kalau* token dikirim, karena tidak
mengirim apa pun lalu menjadi lebih longgar daripada mengirim token salah.

---

## 5) Environment Switching Rules

### 5.1 Provider switching must be explicit
- Digiflazz dan VIP punya mode masing-masing:
  - `mock`
  - `real`

Mode disimpan di tabel `site_configs` dan diubah lewat /admin/settings; env var
hanya cadangan ketika kuncinya belum ada di database. Artinya nilai di DB
MENIMPA env — sesuatu yang mudah membingungkan saat menelusuri masalah.
Hal yang sama berlaku untuk kredensial provider dan gateway.

### 5.2 Mock must simulate reality
Mock provider wajib bisa:
- pending
- delay
- failure
- success
- retry scenario

---

## 6) Webhook Rules

### 6.1 Payment Gateway Webhook (Poppay)
- Selalu periksa `agg_refid`, `amount`, dan `status`.
- Selalu cross-check ke gateway sebelum menganggap lunas —
  `confirmCompletedViaInquiry` memanggil `inquireIncoming`.

**Uang masuk dan uang keluar berbeda perlakuan.** Cross-check inquiry hanya
tersedia untuk transaksi masuk (topup dan order). Poppay tidak menyediakan
endpoint inquiry untuk transaksi keluar, sehingga callback penarikan tidak punya
pembanding dari sisi mereka.

Untuk penarikan, keaslian ditentukan `refid` — referensi milik Poppay yang
disimpan saat `createOutgoing`. `agg_refid` TIDAK boleh dipakai sebagai bukti:
bentuknya `withdraw-<id>` dan seller mengetahui id penarikannya sendiri, jadi
callback penolakan bisa dipalsukan untuk menarik kembali saldo yang transfernya
sudah jalan.

Konsekuensinya `payoutRefId` tidak boleh bocor ke seller. Lihat
`toSellerWithdrawalView` di `lib/seller.ts`.

Verifikasi tanda tangan callback masih longgar: verdict `invalid` baru dicatat,
belum menolak. Menegakkannya butuh kepastian format dari pihak Poppay.

### 6.2 Provider Webhook
- validate signature jika ada
- idempotent
- update order state

---

## 7) Validation Rules

### 7.1 Zod Everywhere
- Semua input request harus Zod validated.
- Semua service input harus typed.

### 7.2 Normalize Inputs
- noHP: normalisasi `08xxx` → `628xxx`
- gameID/server: validate numeric / format
- PLN: validate length

---

## 8) Error Handling Rules

### 8.1 No leaking internal errors
- response ke client: error friendly
- detail error disimpan di logs

### 8.2 Domain Errors
Gunakan error class:
- `ValidationError`
- `InsufficientBalanceError`
- `ProviderDownError`
- `PaymentNotCompletedError`

---

## 9) Security Rules

### 9.1 Setiap route admin wajib ter-guard
Gunakan `requireAdmin()` / `requireAdminVerified()` dari `lib/admin-auth.ts`.
Guard adalah **statement pertama** di handler — sebelum `await params`, sebelum
`req.json()`, dan **di luar** blok `try`, supaya penolakan tidak pernah tertelan
`catch` lalu berubah menjadi 500.

Aturan pemilihannya mekanis, tidak butuh penilaian per route:

| Method | Helper | Biaya |
|---|---|---|
| `GET` | `requireAdmin()` | percaya seal, 0 query |
| `POST` / `PUT` / `PATCH` / `DELETE` | `requireAdminVerified()` | +1 query cek `isActive` & `role` |

Mutasi perlu cek DB karena `role` di cookie hanya snapshot saat login, dan
seal-nya sah sampai 14 hari — admin yang di-demote masih akan lolos selama itu
bila kita hanya percaya cookie.

Proteksi di `middleware.ts` adalah **lapisan kedua**, bukan sumber kebenaran:
Edge runtime tidak bisa menyentuh Prisma, jadi ia hanya bisa membaca cookie.

401 = tidak ada sesi. 403 = ada sesi, tapi bukan admin.

### 9.2 Jangan pernah mengembalikan baris DB apa adanya
`...spread` atas hasil query mengirim SETIAP kolom, termasuk yang belum ada saat
kode ditulis. Bentuk respons harus ditulis eksplisit. Contoh nyata kegagalannya:
`payoutRefId` — nilai yang dipakai memverifikasi callback penarikan — sempat
terkirim ke seller karena tiga endpoint melakukan `...item`.

### 9.3 Rate limit di jalur yang bisa disalahgunakan
`enforceRateLimit` dari `lib/rate-limit.ts`, dipasang di autentikasi, checkout,
validasi voucher, dan detail order.

Webhook gateway **tidak** dibatasi — kiriman ulang dari Poppay dan VIP harus
selalu bisa masuk (lihat 2.1b).

Perhatikan `GET /api/orders/[code]`: ia publik DAN memicu rekonsiliasi yang
menembak API provider. Tanpa pembatas, siapa pun bisa memaksa kita memanggil
Digiflazz/VIP atas biaya sendiri.

Penyimpanannya in-memory karena aplikasi berjalan satu proses (`exec_mode`
fork, `instances` 1). **Kalau pindah ke cluster mode, ini wajib pindah ke
Redis** — dengan N instance, batas efektifnya menjadi N kali lipat.

### 9.4 Rahasia tidak boleh keluar dari server
Kredensial gateway dan provider tersimpan di `site_configs`. Jangan
mengirimkannya ke klien, termasuk ke halaman admin.

### 9.5 Konfigurasi yang salah harus gagal keras
`SESSION_SECRET` dan `DATABASE_URL` divalidasi saat boot. Server menolak menyala
bila salah — lebih baik daripada menyala setengah jalan, ketika storefront
terlihat sehat sementara login dan checkout diam-diam rusak.

---

## 10) Logging Rules

### 10.1 Structured Logs
- log JSON
- include:
  - orderId
  - provider
  - paymentMethod
  - userId (if any)

### 10.2 Never log secrets
Tidak boleh log:
- API keys
- view_token
- password hash

---

## 11) Naming Conventions

### 11.1 Files
- `kebab-case.ts`
- folder: `lowercase`

### 11.2 Services
- `create-checkout.service.ts`
- `execute-provider-purchase.service.ts`

### 11.3 DB
- table: PascalCase model Prisma
- fields: camelCase

---

## 12) Git Rules (Recommended)
- Conventional commits:
  - `feat:`
  - `fix:`
  - `refactor:`
  - `chore:`
- Branch:
  - `feature/...`
  - `hotfix/...`

---

## 13) Definition of Done
Sebuah fitur dianggap selesai kalau:
- flow sukses jalan
- flow gagal tertangani
- idempotency aman
- status machine benar
- logs tersedia
- mock mode bisa simulate

Khusus yang menyentuh uang, tambahan:
- ada test yang **gagal pada kode sebelum perbaikan** dan lulus sesudahnya —
  test yang lulus di kedua sisi tidak membuktikan apa pun
- konkurensi diuji terhadap database nyata, bukan repository tiruan

---

**This constitution is the guardrail. No exceptions.**
