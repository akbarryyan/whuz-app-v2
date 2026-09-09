<!--
Sync Impact Report
- Version change: [CONSTITUTION_VERSION] (unfilled template) → 1.0.0
- Bump rationale: first ratified constitution; all placeholder tokens replaced with
  concrete, project-specific governance derived from docs/WHUZPAY_CONSTITUTION.md.
- Modified principles:
  - [PRINCIPLE_1_NAME] → I. Uang Bergerak Atomik di Database (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Idempotensi & Disiplin State Machine (NON-NEGOTIABLE)
  - [PRINCIPLE_3_NAME] → III. Lapisan Tegas: Service Layer & Ports
  - [PRINCIPLE_4_NAME] → IV. Bukti Lewat Test Integrasi (NON-NEGOTIABLE)
  - [PRINCIPLE_5_NAME] → V. Aman Secara Bawaan
- Added sections:
  - [SECTION_2_NAME] → Batasan Teknologi & Runtime
  - [SECTION_3_NAME] → Alur Kerja & Gerbang Kualitas
- Removed sections: none
- Deferred TODOs: none
- Note: docs/WHUZPAY_CONSTITUTION.md tetap menjadi rujukan rinci beserta contoh kode;
  dokumen ini adalah lapisan governance yang mengikat dan memiliki wewenang lebih tinggi.
-->

# Whuzpay Constitution

## Core Principles

### I. Uang Bergerak Atomik di Database (NON-NEGOTIABLE)

Setiap perubahan saldo, klaim, dan penandaan transaksi MUST terjadi dalam satu pernyataan
SQL yang sekaligus memeriksa syaratnya. Pola baca-hitung-tulis DILARANG, termasuk ketika
dibungkus `$transaction`, karena `findUnique` tidak mengunci baris dan di bawah REPEATABLE
READ semua transaksi membaca snapshot yang sama.

- Pengurangan saldo MUST memakai `updateMany` dengan syarat kecukupan (`balance: { gte: amount }`)
  lalu memeriksa `count`; penambahan MUST memakai `increment`.
- `LedgerEntry` adalah sumber kebenaran saldo; `Wallet.balance` hanya pembacaan cepat.
  `balanceBefore`/`balanceAfter` MUST diturunkan dari nilai setelah update, bukan dari
  pembacaan awal.
- Transaksi wallet MUST mengikuti urutan HOLD → eksekusi provider → DEBIT finalize (sukses)
  atau RELEASE (gagal). Debit langsung sebelum provider sukses DILARANG.

**Rasionale**: pola lama terbukti meloloskan sepuluh checkout bersamaan atas saldo yang hanya
cukup untuk satu order, dan sepuluh refund atas satu order yang sama. Ini bukan kekhawatiran
teoretis melainkan kegagalan yang sudah terjadi.

### II. Idempotensi & Disiplin State Machine (NON-NEGOTIABLE)

Semua webhook dan semua pembelian provider MUST idempotent, dan penjaga idempotensinya MUST
ditegakkan database melalui klaim atomik — bukan `findFirst` lalu percabangan di JavaScript.

- Baris `WebhookEvent` dibuat SEBELUM pemrosesan. Hanya event dengan `processed = true` yang
  boleh menghentikan pemrosesan; percobaan gagal MUST dibiarkan terbuka agar kiriman ulang
  gateway dapat menyelesaikannya.
- Anti eksekusi ganda provider MUST memakai klaim atomik `claimForProcessing`
  (PAID → PROCESSING_PROVIDER), bukan penguncian di memori.
- Status order hanya boleh berpindah mengikuti alur yang ditetapkan:
  `CREATED → WAITING_PAYMENT → PAID → PROCESSING_PROVIDER → SUCCESS`,
  `CREATED → WAITING_PAYMENT → EXPIRED`, `PAID → PROCESSING_PROVIDER → FAILED`,
  `FAILED → REFUNDED` (wallet). Lompatan status DILARANG.
- Setiap request/response provider MUST dicatat di `ProviderLog`.

**Rasionale**: gateway dan provider mengirim ulang callback; tanpa idempotensi yang ditegakkan
database, kiriman ulang berubah menjadi pembayaran ganda.

### III. Lapisan Tegas: Service Layer & Ports

Logika transaksi MUST berada di service/usecase, bukan di UI maupun route handler. Route
handler hanya boleh melakukan empat hal: parse input, validasi, panggil service, kembalikan
response.

- Semua sistem eksternal (payment gateway, provider PPOB, repository DB) MUST diakses lewat
  port. Service DILARANG mengimpor SDK provider atau SDK payment secara langsung.
- Service MUST menerima dependensinya lewat constructor agar dapat diuji dengan pengganti.
- Semua input request MUST divalidasi Zod dan semua input service MUST bertipe.
- Input MUST dinormalisasi di batas sistem: `08xxx` → `628xxx`, format gameID/server
  divalidasi, panjang nomor PLN divalidasi.

**Rasionale**: batas yang jelas membuat jalur uang dapat diuji dan mencegah logika transaksi
tersebar ke tempat yang tidak dapat diverifikasi.

### IV. Bukti Lewat Test Integrasi (NON-NEGOTIABLE)

Perilaku database MUST diuji terhadap MySQL sekali pakai, bukan repository tiruan. Repository
tiruan tidak punya transaksi maupun kunci baris, sehingga selalu lulus dan tidak membuktikan
apa pun tentang lost update, race condition, atau idempotensi.

- Setiap perbaikan pada jalur uang MUST disertai test yang GAGAL pada kode sebelum perbaikan
  dan LULUS sesudahnya. Test yang lulus di kedua sisi tidak diterima sebagai bukti.
- Konkurensi MUST diuji dengan pemanggil bersamaan terhadap database nyata.
- Mock provider MUST dapat mensimulasikan pending, delay, failure, success, dan skenario retry.

**Rasionale**: bug yang paling mahal di sistem ini adalah bug isolasi database, dan kelas bug
itu tidak terlihat oleh unit test dengan tiruan.

### V. Aman Secara Bawaan

Otorisasi, bentuk respons, dan penanganan rahasia MUST ditulis eksplisit; tidak boleh ada yang
bergantung pada nilai bawaan yang kebetulan aman.

- Setiap route admin MUST dijaga sebagai statement PERTAMA di handler, di luar blok `try`:
  `requireAdmin()` untuk `GET`, `requireAdminVerified()` untuk `POST`/`PUT`/`PATCH`/`DELETE`.
  Proteksi di `middleware.ts` adalah lapisan kedua, bukan sumber kebenaran. 401 = tanpa sesi;
  403 = ada sesi tetapi bukan admin.
- Baris database DILARANG dikembalikan apa adanya. `...spread` atas hasil query mengirim setiap
  kolom, termasuk kolom yang belum ada saat kode ditulis; bentuk respons MUST ditulis eksplisit.
- Otorisasi MUST dihitung eksplisit (`isAdmin || isOwner || tokenValid`). Cabang yang hanya
  memvalidasi token bila token dikirim DILARANG, karena tidak mengirim apa pun menjadi lebih
  longgar daripada mengirim token salah.
- Jalur yang dapat disalahgunakan MUST dibatasi dengan `enforceRateLimit`: autentikasi,
  checkout, validasi voucher, dan detail order. Webhook gateway TIDAK dibatasi.
- Rahasia (kredensial gateway/provider, `view_token`, password hash, API key) DILARANG keluar
  dari server dan DILARANG masuk ke log. `payoutRefId` MUST tetap tersembunyi dari seller.
- Konfigurasi yang salah MUST gagal keras: `SESSION_SECRET` dan `DATABASE_URL` divalidasi saat
  boot dan server menolak menyala bila tidak sah.

**Rasionale**: `order_code` mudah ditebak dan disisir, sehingga tidak boleh ada yang bernilai
untuk dipanen; sementara `payoutRefId` yang bocor pernah memungkinkan callback penolakan
penarikan dipalsukan.

## Batasan Teknologi & Runtime

- **Stack**: Next.js 16 (App Router), React 19, TypeScript, MySQL via Prisma, Zod untuk
  validasi, iron-session untuk sesi, pino untuk log, Vitest untuk test.
- **Satu proses**: aplikasi berjalan `exec_mode` fork dengan `instances: 1`. Tidak ada worker
  terpisah dan tidak ada Redis. Rate limit disimpan in-memory sebagai konsekuensinya; bila
  pindah ke cluster mode, rate limit MUST dipindahkan ke penyimpanan bersama karena batas
  efektifnya akan menjadi N kali lipat.
- **Tidak ada penjadwalan di memori**: `setTimeout` dan sejenisnya untuk pekerjaan tertunda
  DILARANG — jadwal di memori hilang tanpa jejak setiap deploy, restart, atau crash. Pekerjaan
  tertunda MUST dapat ditemukan kembali dari database. Order tersangkut ditemukan oleh sapuan
  berkala (`sweepStuckOrders`) yang menanyakan ulang ke database.
- **Eksekusi provider inline**: `ExecuteProviderPurchaseService` dipanggil dari callback
  pembayaran dan jalur checkout wallet. Konsekuensi yang diterima sadar: tidak ada retry
  berlapis; jaring pengamannya adalah kiriman ulang gateway dan sapuan berkala.
- **Konfigurasi di database**: kredensial dan mode provider (`mock` / `real`) tersimpan di
  tabel `site_configs` dan diubah lewat `/admin/settings`. Nilai `.env` hanya cadangan ketika
  kunci belum ada di database — nilai DB MENIMPA env.
- **Log terstruktur**: log berformat JSON dan MUST menyertakan `orderId`, `provider`,
  `paymentMethod`, dan `userId` bila ada. Error yang dikembalikan ke klien MUST ramah; detail
  disimpan di log. Gunakan domain error class: `ValidationError`, `InsufficientBalanceError`,
  `ProviderDownError`, `PaymentNotCompletedError`.
- **Penamaan**: file `kebab-case.ts`, folder huruf kecil, service `*.service.ts`, model Prisma
  PascalCase dengan field camelCase.

## Alur Kerja & Gerbang Kualitas

- **Definition of Done**: sebuah fitur selesai bila alur sukses jalan, alur gagal tertangani,
  idempotensi aman, state machine benar, log tersedia, dan mock mode dapat mensimulasikan.
  Untuk perubahan yang menyentuh uang, dua syarat tambahan di Principle IV berlaku dan tidak
  dapat dikesampingkan.
- **Commit & branch**: conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`) dan branch
  `feature/...` atau `hotfix/...`.
- **Review**: setiap PR MUST diperiksa kepatuhannya terhadap constitution ini. Reviewer yang
  menemukan pelanggaran pada Principle I, II, atau IV MUST menahan merge sampai diperbaiki.
- **Gerbang test**: `npm run test:db:up && npm run test:db:push && npm test` MUST lulus sebelum
  merge untuk perubahan yang menyentuh jalur uang, webhook, atau otorisasi.
- **Deploy**: `git pull && npm ci && npm run db:migrate && npm run build`, lalu
  `pm2 restart ecosystem.config.js --update-env`. Migrasi MUST dijalankan sebelum build.

## Governance

Constitution ini menggantikan praktik lain yang bertentangan dengannya. Bila sebuah dokumen,
kebiasaan, atau kode yang ada bertentangan dengan pasal di sini, constitution yang menang dan
kode tersebut dicatat sebagai utang yang harus diperbaiki.

- **Hubungan dengan dokumen lain**: `docs/WHUZPAY_CONSTITUTION.md` adalah rujukan rinci beserta
  contoh kode terlarang dan yang benar; dokumen ini adalah lapisan governance yang mengikat.
  Bila keduanya berbeda, dokumen ini yang berlaku dan `docs/WHUZPAY_CONSTITUTION.md` MUST
  diperbarui agar selaras.
- **Prosedur amandemen**: usulan perubahan diajukan lewat PR yang mengubah file ini, memuat
  alasan, dampak terhadap kode yang ada, dan rencana migrasi bila ada pasal yang dilonggarkan.
  Perubahan pada principle yang bertanda NON-NEGOTIABLE MUST menyertakan bukti konkret —
  insiden, test, atau keterbatasan teknis — bukan preferensi.
- **Kebijakan versi**: semantic versioning. MAJOR untuk penghapusan atau pendefinisian ulang
  principle secara tidak kompatibel; MINOR untuk penambahan principle/section atau perluasan
  panduan yang material; PATCH untuk klarifikasi, perbaikan kata, dan penyempurnaan non-semantik.
- **Tinjauan kepatuhan**: kompleksitas yang menyimpang dari principle MUST dijustifikasi
  tertulis di PR; tanpa justifikasi, penyimpangan ditolak. Constitution ditinjau ulang setiap
  kali sebuah insiden pada jalur uang terjadi, agar pelajarannya masuk sebagai pasal.

**Version**: 1.0.0 | **Ratified**: 2026-03-29 | **Last Amended**: 2026-09-09
