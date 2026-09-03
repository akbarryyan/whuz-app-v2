/**
 * Pengaman: test integrasi ini MENGHAPUS ISI TABEL. Ia hanya boleh menyentuh
 * database uji sekali pakai, tidak pernah database dev apalagi produksi.
 *
 * Jalankan `npm run test:db:up` lebih dulu untuk menyiapkan containernya.
 */
const url = process.env.DATABASE_URL ?? "";

const EXPECTED_DB = "whuz_test";
const EXPECTED_PORT = "3399";

if (!url) {
  throw new Error(
    "DATABASE_URL kosong. Jalankan lewat `npm test`, yang menyetelnya ke database uji.",
  );
}

if (!url.includes(`/${EXPECTED_DB}`) || !url.includes(`:${EXPECTED_PORT}`)) {
  throw new Error(
    `DATABASE_URL menunjuk database yang salah.\n` +
      `Test ini menghapus isi tabel, jadi hanya boleh dijalankan terhadap\n` +
      `database "${EXPECTED_DB}" di port ${EXPECTED_PORT}.\n` +
      `Dapat: ${url.replace(/:\/\/[^@]*@/, "://***@")}`,
  );
}

// Logger menulis berkas dan berisik saat test; matikan keduanya.
process.env.LOG_TO_FILE = "false";
process.env.LOG_TO_STDOUT = "false";
process.env.LOG_LEVEL = "silent";
