-- Penanda klaim refund. Dipakai OrderRepository.refundPaidOrderToWallet sebagai
-- klaim atomik supaya dua proses bersamaan tidak sama-sama membayar refund.
ALTER TABLE `orders` ADD COLUMN `refundedAt` DATETIME(3) NULL;

-- Backfill dari ledger yang sudah ada. Tanpa ini, seluruh order lama bernilai
-- NULL — termasuk yang SUDAH pernah direfund — sehingga klaim akan berhasil dan
-- reconcile membayar refund untuk kedua kalinya.
UPDATE `orders` o
JOIN (
  SELECT `reference` AS orderId, MIN(`createdAt`) AS refundedAt
  FROM `ledger_entries`
  WHERE `type` = 'REFUND' AND `reference` IS NOT NULL
  GROUP BY `reference`
) r ON r.orderId = o.`id`
SET o.`refundedAt` = r.refundedAt;
