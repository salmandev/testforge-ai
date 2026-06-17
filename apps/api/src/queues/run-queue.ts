import { Queue, Worker, type Job } from "bullmq";
import type { RedisOptions } from "ioredis";
import debug from "debug";

const log = debug("testforge:api:run-queue");

/**
 * Job data for a test run execution
 */
export interface RunJobData {
  /** Run ID */
  runId: string;
  /** Suite ID */
  suiteId: string;
  /** Project ID */
  projectId: string;
  /** Runner type to use */
  runner: "web" | "api" | "mobile";
  /** Environment override */
  environment?: string;
  /** Number of parallel workers */
  parallelism?: number;
  /** Whether to enable AI self-healing */
  aiHeal?: boolean;
  /** Whether to record video */
  recordVideo?: boolean;
  /** Trigger source */
  triggeredBy: "manual" | "schedule" | "ci" | "agent";
  /** Git SHA if triggered by CI */
  gitSha?: string;
  /** CI build URL */
  ciUrl?: string;
}

/**
 * Run queue configuration
 */
export interface RunQueueConfig {
  /** Redis connection URL */
  redisUrl?: string;
  /** Redis connection options */
  redisOptions?: RedisOptions;
  /** Number of concurrent workers */
  concurrency?: number;
}

/**
 * Default Redis connection
 */
function getRedisOptions(redisUrl?: string, redisOptions?: RedisOptions): RedisOptions {
  if (redisOptions) return redisOptions;
  if (redisUrl) return { url: redisUrl };
  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    maxRetriesPerRequest: null,
  };
}

/**
 * Queue for managing test run execution jobs
 */
export class RunQueue {
  private readonly _queue: Queue<RunJobData>;
  private _worker: Worker<RunJobData> | null = null;

  constructor(config?: RunQueueConfig) {
    const connection = getRedisOptions(config?.redisUrl, config?.redisOptions);

    this._queue = new Queue<RunJobData>("test-runs", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 86400 }, // Keep completed jobs for 24h
        removeOnFail: { age: 604800 },    // Keep failed jobs for 7 days
      },
    });

    log("RunQueue initialized");
  }

  /**
   * Submit a new run job to the queue
   */
  async submit(data: RunJobData): Promise<string> {
    const job = await this._queue.add(`run:${data.runId}`, data, {
      jobId: data.runId,
      priority: data.triggeredBy === "ci" ? 1 : 5, // CI runs get higher priority
    });

    log("Run job submitted: %s (suite: %s)", data.runId, data.suiteId);
    return job.id ?? data.runId;
  }

  /**
   * Start the worker to process run jobs
   */
  startWorker(
    handler: (data: RunJobData) => Promise<void>,
    config?: { concurrency?: number }
  ): void {
    if (this._worker) {
      log("Worker already running");
      return;
    }

    const connection = getRedisOptions();

    this._worker = new Worker<RunJobData>(
      "test-runs",
      async (job: Job<RunJobData>) => {
        log("Processing run job: %s", job.id);

        try {
          await handler(job.data);
          log("Run job completed: %s", job.id);
        } catch (error) {
          log("Run job failed: %s — %O", job.id, error);
          throw error;
        }
      },
      {
        connection,
        concurrency: config?.concurrency ?? 5,
      }
    );

    this._worker.on("completed", (job: Job<RunJobData>) => {
      log("Job %s completed successfully", job.id);
    });

    this._worker.on("failed", (job: Job<RunJobData> | undefined, err: Error) => {
      log("Job %s failed: %s", job?.id, err.message);
    });

    this._worker.on("error", (err: Error) => {
      log("Worker error: %O", err);
    });

    log("Run worker started (concurrency: %d)", config?.concurrency ?? 5);
  }

  /**
   * Get the status of a specific run job
   */
  async getJobStatus(runId: string): Promise<{
    status: string;
    progress: number;
    completedAt?: number;
    failedReason?: string;
  } | null> {
    const job = await this._queue.getJob(runId);
    if (!job) return null;

    const state = await job.getState();
    return {
      status: state,
      progress: job.progress as number,
      completedAt: job.finishedOn,
      failedReason: job.failedReason,
    };
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this._queue.getWaitingCount(),
      this._queue.getActiveCount(),
      this._queue.getCompletedCount(),
      this._queue.getFailedCount(),
      this._queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Cancel a pending run job
   */
  async cancel(runId: string): Promise<boolean> {
    const job = await this._queue.getJob(runId);
    if (!job) return false;

    const state = await job.getState();
    if (state === "waiting" || state === "delayed") {
      await job.remove();
      log("Run job cancelled: %s", runId);
      return true;
    }

    log("Cannot cancel job %s in state: %s", runId, state);
    return false;
  }

  /**
   * Gracefully shut down the queue and worker
   */
  async close(): Promise<void> {
    if (this._worker) {
      await this._worker.close();
      this._worker = null;
    }
    await this._queue.close();
    log("RunQueue closed");
  }
}
