/**
 * BullMQ Worker — Transaction Queue
 *
 * Run separately from Next.js:
 *   npm run worker         (tsx watch)
 *   npm run worker:once
 *
 * Proses ini terpisah dari server Next, jadi ia menulis ke logs/worker.json
 * (lewat LOG_FILE di npm script). rotating-file-stream tidak aman dipakai dua
 * proses pada file yang sama — masing-masing melacak ukuran file sendiri lalu
 * me-rename file aktif di bawah kaki yang lain.
 *
 * Instrumentation Next tidak pernah dimuat di sini, jadi tidak ada requestId
 * ambien: setiap log wajib membawa jobId/orderId sendiri.
 */

import { randomUUID } from "node:crypto";
import { Worker, Job, ConnectionOptions } from "bullmq";
import { QUEUE_NAME, JobData, JobName, ExecuteProviderPurchaseData, ReconcileOrderData } from "./jobs";
import { ExecuteProviderPurchaseService } from "@/src/core/services/provider/execute-provider-purchase.service";
import { ReconcileOrderService } from "@/src/core/services/provider/reconcile-order.service";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";
import { getLogger, flushLogs } from "@/lib/logger";
import { runWithContext } from "@/lib/request-context";

const log = getLogger("worker");

const connection: ConnectionOptions = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
};

const orderRepository = new OrderRepository();
const executeService = new ExecuteProviderPurchaseService(orderRepository);
const reconcileService = new ReconcileOrderService(orderRepository);

const worker = new Worker<JobData, void, JobName>(
  QUEUE_NAME,
  async (job: Job<JobData, void, JobName>) =>
    // Correlation id per job — menggantikan requestId yang tidak ada di sini.
    runWithContext({ requestId: randomUUID() }, async () => {
      log.debug({ jobId: job.id, jobName: job.name, attempt: job.attemptsMade }, "job start");

      switch (job.name) {
        case "EXECUTE_PROVIDER_PURCHASE": {
          const { orderId } = job.data as ExecuteProviderPurchaseData;
          await executeService.execute(orderId);
          break;
        }

        case "RECONCILE_ORDER": {
          const { orderId } = job.data as ReconcileOrderData;
          await reconcileService.reconcile(orderId);
          break;
        }

        default:
          log.warn({ jobId: job.id, jobName: job.name }, "unknown job name");
      }
    }),
  {
    connection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  log.debug({ jobId: job.id, jobName: job.name }, "job completed");
});

worker.on("failed", (job, err) => {
  log.error({ err, jobId: job?.id, jobName: job?.name }, "job failed");
});

worker.on("error", (err) => {
  log.error({ err }, "worker error");
});

log.info({ queue: QUEUE_NAME, concurrency: 5 }, "worker listening");

// Proses ini kita kelola sendiri (tidak ada start-server Next di sini), jadi
// aman memasang handler sinyal untuk memberi log kesempatan tertulis.
let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "worker shutting down");
    void worker
      .close()
      .catch((err) => log.error({ err }, "worker close failed"))
      .then(() => flushLogs(1000))
      .then(() => process.exit(0));
  });
}

export { worker };
