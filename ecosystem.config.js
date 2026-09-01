/**
 * Konfigurasi PM2 untuk deployment di /var/www/whuz-app.
 *
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *
 * Setelah mengubah blok `env` di bawah, PM2 tidak otomatis memuatnya ulang:
 *   pm2 restart ecosystem.config.js --update-env
 *
 * Catatan penting soal logging — lihat docs/LOGGING.md:
 *
 * 1. `script` sengaja menunjuk binari langsung, bukan lewat `npm`. Kalau lewat
 *    npm, PM2 mengelola proses npm-nya sementara server Next jalan sebagai
 *    child; sinyal stop tidak selalu diteruskan dan prosesnya bisa tertinggal
 *    hidup setelah `pm2 stop`.
 *
 * 2. `TZ` wajib. Field `time` di log memakai timezone proses — tanpa ini
 *    offsetnya jadi +00:00, bukan +07:00.
 *
 * 3. `LOG_DIR` sengaja absolut. cwd proses PM2 tidak selalu sama dengan folder
 *    app, dan default `./logs` akan resolve ke tempat yang salah.
 *
 * 4. Server dan worker menulis file berbeda (`app.json` vs `worker.json`).
 *    Dua proses tidak boleh menulis file yang sama: masing-masing melacak
 *    ukuran file sendiri lalu me-rename file aktif di bawah kaki yang lain.
 */

const APP_DIR = "/var/www/whuz-app";

/** Variabel yang harus sama di kedua proses. */
const sharedEnv = {
  NODE_ENV: "production",
  TZ: "Asia/Jakarta",
  LOG_DIR: `${APP_DIR}/logs`,
  // Set "true" kalau Anda ingin log tetap terlihat di `pm2 logs`.
  // Default di produksi adalah "false" — log hanya masuk file.
  LOG_TO_STDOUT: "false",
};

module.exports = {
  apps: [
    {
      name: "whuz-app",
      cwd: APP_DIR,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      // Fork + 1 instance: satu penulis untuk logs/app.json.
      // Kalau nanti pindah ke cluster mode, logger otomatis memberi sufiks
      // per instance (app-1.json, app-2.json, …) supaya tidak saling menimpa.
      exec_mode: "fork",
      instances: 1,
      env: sharedEnv,
    },
    {
      name: "whuz-worker",
      cwd: APP_DIR,
      script: "node_modules/.bin/tsx",
      args: "src/infra/queue/bullmq/worker.ts",
      exec_mode: "fork",
      instances: 1,
      env: {
        ...sharedEnv,
        LOG_FILE: "worker.json",

        // Worker dijalankan lewat tsx, BUKAN lewat Next — jadi ia tidak pernah
        // memuat .env.production. Variabel yang dibutuhkannya harus disebut di
        // sini (atau sudah ada di environment shell yang menjalankan PM2).
        // DATABASE_URL: "...",
        // REDIS_URL: "...",
      },
    },
  ],
};
