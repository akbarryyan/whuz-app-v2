# Testing

Repo ini memakai **Vitest**. Test yang ada saat ini adalah test **integrasi**:
ia berbicara dengan MySQL sungguhan, bukan repository yang di-mock.

## Kenapa integrasi, bukan unit

Bug yang dijaga di sini adalah *lost update* — dua transaksi membaca saldo yang
sama lalu sama-sama menuliskan hasil hitungannya. Itu perilaku isolasi database,
bukan perilaku kode aplikasi. Repository yang di-mock tidak punya transaksi dan
tidak punya kunci baris, jadi ia akan selalu lulus dan tidak membuktikan apa pun.

Buktinya bisa dilihat sendiri: kembalikan `holdWalletBalance` ke pola
baca-lalu-tulis-nilai-absolut, dan `tests/wallet-hold-concurrency.test.ts` akan
melaporkan 10 dari 10 HOLD berhasil atas saldo yang hanya cukup untuk satu.

## Menjalankan

```bash
npm run test:db:up      # container MySQL sekali pakai di port 3399
npm run test:db:push    # terapkan skema Prisma ke database uji
npm test                # jalankan seluruh test
```

`npm run test:db:up` hanya perlu sekali; containernya bisa dibiarkan hidup.
`npm run test:db:push` diulang setiap kali `prisma/schema.prisma` berubah.
`npm run test:db:down` menghapus containernya.

## Pengaman

`tests/setup.ts` menolak berjalan kecuali `DATABASE_URL` menunjuk database
bernama `whuz_test` di port `3399`. Test ini **menghapus isi tabel** di setiap
`beforeEach`, jadi salah arah berarti menghapus data dev atau produksi.
Script `npm test` sudah menyetel URL-nya; jangan menjalankan `vitest` langsung
tanpa itu.

## Menulis test baru

- Taruh di `tests/`, akhiran `.test.ts`.
- Alias `@/` tersedia, sama seperti di aplikasi.
- File test dijalankan berurutan (`fileParallelism: false`) karena berbagi satu
  database. Konkurensi yang diuji adalah konkurensi **di dalam** satu test.
- Untuk menguji race condition, jalankan operasinya lewat `Promise.all` /
  `Promise.allSettled`, lalu periksa keadaan akhir di database — bukan nilai
  kembalian masing-masing pemanggilan.
