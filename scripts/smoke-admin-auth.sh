#!/usr/bin/env bash
#
# Smoke test: setiap route /api/admin/* harus MENOLAK request tanpa cookie.
#
# Aman dijalankan terhadap instance yang hidup: guard adalah statement pertama
# di setiap handler, jadi penolakan terjadi sebelum body di-parse dan sebelum
# query apa pun berjalan. Body {} yang dikirim di bawah tidak pernah sampai ke
# logika bisnis.
#
# Pakai:  bash scripts/smoke-admin-auth.sh [http://localhost:3000]
#
set -u
BASE="${1:-http://localhost:3000}"
fail=0
pass=0

# check <METHOD> <PATH> <status yang diterima...>
check() {
  local m="$1" p="$2"; shift 2
  local code
  if [ "$m" = "GET" ]; then
    code=$(curl -sS -o /dev/null -w '%{http_code}' -X GET "$BASE$p" 2>/dev/null)
  else
    code=$(curl -sS -o /dev/null -w '%{http_code}' -X "$m" \
             -H 'Content-Type: application/json' -d '{}' "$BASE$p" 2>/dev/null)
  fi
  for e in "$@"; do
    if [ "$code" = "$e" ]; then
      printf '  ok   %-6s %-54s %s\n' "$m" "$p" "$code"
      pass=$((pass+1)); return
    fi
  done
  printf 'FAIL   %-6s %-54s dapat=%s harap=%s\n' "$m" "$p" "$code" "$*"
  fail=$((fail+1))
}

DENY="401 403"

echo "== Allowlist: harus tetap terjangkau (kalau tidak, admin tak bisa login) =="
check GET  /api/admin/auth 200
# Body kosong -> gagal validasi, bukan 401. Yang penting BUKAN 401/403.
check POST /api/admin/auth 400 422 500

echo
echo "== Uang =="
check GET    /api/admin/wallet                              $DENY
check POST   /api/admin/wallet                              $DENY
check GET    /api/admin/wallet/ledger                       $DENY
check GET    /api/admin/seller-withdrawals                  $DENY
check PATCH  /api/admin/seller-withdrawals/smoke-id         $DENY
check POST   /api/admin/test-transaction                    $DENY
check POST   /api/admin/payment-gateway/poppay/create       $DENY

echo
echo "== Kredensial & konfigurasi =="
check GET    /api/admin/site-config                         $DENY
check PATCH  /api/admin/site-config                         $DENY
check DELETE "/api/admin/site-config?key=SMOKE_NONEXISTENT" $DENY
check GET    /api/admin/provider-mode                       $DENY
check PATCH  /api/admin/provider-mode                       $DENY
check GET    /api/admin/providers/settings                  $DENY
check PUT    /api/admin/providers/settings                  $DENY
check POST   /api/admin/smtp-test                           $DENY
check GET    /api/admin/payment-gateway/poppay/auth         $DENY
check GET    /api/admin/payment-gateway/poppay/banks        $DENY
check GET    /api/admin/payment-gateway/poppay/inquiry/smk  $DENY
check POST   /api/admin/providers/digiflazz/check-balance   $DENY

echo
echo "== PII, tiket, transaksi =="
check GET    /api/admin/users                               $DENY
check PATCH  /api/admin/users/smoke-id/tier                 $DENY
check GET    /api/admin/tickets                             $DENY
check GET    /api/admin/tickets/smoke-id                    $DENY
check POST   /api/admin/tickets/smoke-id                    $DENY
check PATCH  /api/admin/tickets/smoke-id                    $DENY
check GET    /api/admin/transactions                        $DENY
check GET    /api/admin/transactions/smoke-id               $DENY
check GET    /api/admin/maintenance                         $DENY
check PATCH  /api/admin/maintenance                         $DENY

echo
echo "== Konten & provider =="
for p in banners brands flash-sale home-content payment-methods products \
         promos tiers vouchers providers providers/logs providers/products; do
  check GET "/api/admin/$p" $DENY
done
check PUT    /api/admin/brands                              $DENY
check PATCH  /api/admin/brands                              $DENY
check DELETE /api/admin/brands                              $DENY
check PUT    /api/admin/banners                             $DENY
check POST   /api/admin/payment-methods                     $DENY
check PATCH  /api/admin/payment-methods/smoke-id            $DENY
check DELETE /api/admin/payment-methods/smoke-id            $DENY
check POST   /api/admin/promos                              $DENY
check PUT    /api/admin/promos/smoke-id                     $DENY
check POST   /api/admin/vouchers                            $DENY
check PATCH  /api/admin/vouchers/smoke-id                   $DENY
check POST   /api/admin/tiers                               $DENY
check PUT    /api/admin/tiers/smoke-id                      $DENY
check POST   /api/admin/providers/test                      $DENY
check GET    /api/admin/providers/digiflazz                 $DENY
check GET    /api/admin/providers/digiflazz/products        $DENY
check POST   /api/admin/providers/digiflazz/sync-products   $DENY

echo
echo "== Regresi: route yang sudah ter-guard sebelumnya =="
check GET  /api/admin/dashboard                             $DENY
check GET  /api/admin/reports                               $DENY
check GET  /api/admin/merchants                             $DENY
check GET  /api/admin/profile                               $DENY
check GET  /api/admin/brand-reviews                         $DENY
check GET  /api/admin/providers/summary                     $DENY
check GET  /api/admin/users/smoke-id                        $DENY
check POST /api/admin/transactions/reconcile-all            $DENY

echo
echo "== Tidak ada kredensial yang bocor ke anonim =="
body=$(curl -sS "$BASE/api/admin/site-config" 2>/dev/null)
if printf '%s' "$body" | grep -qE 'POPPAY_|SMTP_PASS|DIGIFLAZZ_API_KEY|VIP_API_KEY|VIP_SIGN'; then
  echo "FAIL   kredensial muncul di respons anonim /api/admin/site-config"
  fail=$((fail+1))
else
  echo "  ok   tidak ada kredensial di respons anonim"
  pass=$((pass+1))
fi

echo
echo "== Endpoint publik tidak boleh ikut terkunci =="
check GET / 200
for p in /api/banners /api/promos /api/home-content /api/flash-sale \
         /api/payment-methods /api/site-branding /api/footer-config \
         /api/catalog/brands; do
  check GET "$p" 200
done

echo
echo "──────────────────────────────────────────────"
echo "lulus=$pass  gagal=$fail"
[ "$fail" = 0 ] && echo "SEMUA LULUS" || echo "ADA KEGAGALAN"
exit "$fail"
