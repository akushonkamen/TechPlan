// Scheduler Service - Periodic report generation based on topic schedules

import type { SkillExecution } from './skillExecutor.js';

export interface SchedulerConfig {
  enabled: boolean;
  checkIntervalMinutes: number; // 5..1440
}

export interface SchedulerStatus {
  running: boolean;
  checkIntervalMinutes: number;
  lastCheckAt: string | null;
  nextCheckAt: string | null;
  pendingTopics: PendingTopic[];
  recentTriggers: RecentTrigger[];
}

export interface PendingTopic {
  topicId: string;
  topicName: string;
  schedule: 'daily' | 'weekly' | 'monthly';
  lastReportAt: string | null;
  dueInMinutes: number;
}

export interface RecentTrigger {
  topicId: string;
  topicName: string;
  triggeredAt: string;
  executionId: string;
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
}

const SCHEDULE_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: SchedulerConfig;
  private lastCheckAt: string | null = null;
  private recentTriggers: RecentTrigger[] = [];
  private maxTriggers = 3; // match MAX_CONCURRENT in SkillExecutor

  // Dependencies injected via setters
  private db: any = null;
  private startExecution: ((skillName: string, params: Record<string, any>) => { executionId: string; promise: Promise<SkillExecution> }) | null = null;
  private reportHandler: ((execution: SkillExecution, params: Record<string, any>) => Promise<void>) | null = null;

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = {
      enabled: config?.enabled ?? false,
      checkIntervalMinutes: config?.checkIntervalMinutes ?? 30,
    };
  }

  /** Inject the database instance. */
  setDb(db: any) { this.db = db; }

  /** Inject the skill executor's startExecution method. */
  setStartExecution(fn: typeof SchedulerService.prototype.startExecution) { this.startExecution = fn; }

  /** Inject the report persistence handler (extracted from server.ts). */
  setReportHandler(fn: (execution: SkillExecution, params: Record<string, any>) => Promise<void>) { this.reportHandler = fn; }

  start() {
    if (this.timer) return;
    if (!this.config.enabled) return;
    const ms = this.config.checkIntervalMinutes * 60 * 1000;
    console.log(`[Scheduler] Starting — interval: ${this.config.checkIntervalMinutes}min`);
    // Run first check immediately
    this.tick();
    this.timer = setInterval(() => this.tick(), ms);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Scheduler] Stopped');
    }
  }

  restart(config: Partial<SchedulerConfig>) {
    this.stop();
    if (config.enabled !== undefined) this.config.enabled = config.enabled;
    if (config.checkIntervalMinutes !== undefined) {
      this.config.checkIntervalMinutes = Math.max(5, Math.min(1440, config.checkIntervalMinutes));
    }
    if (this.config.enabled) this.start();
  }

  getStatus(): SchedulerStatus {
    const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;
    return {
      running: this.timer !== null,
      checkIntervalMinutes: this.config.checkIntervalMinutes,
      lastCheckAt: this.lastCheckAt,
      nextCheckAt: this.lastCheckAt
        ? new Date(new Date(this.lastCheckAt).getTime() + intervalMs).toISOString()
        : null,
      pendingTopics: [],  // populated on-demand via computePendingTopics
      recentTriggers: this.recentTriggers.slice(0, 20),
    };
  }

  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /** Compute and return pending topics (used by status API). */
  async getPendingTopics(): Promise<PendingTopic[]> {
    if (!this.db) return [];
    return this.computePendingTopics();
  }

  // ── internal ──

  private async tick() {
    this.lastCheckAt = new Date().toISOString();
    if (!this.db || !this.startExecution || !this.reportHandler) return;

    try {
      const pending = await this.computePendingTopics();
      const toTrigger = pending.slice(0, this.maxTriggers);

      for (const topic of toTrigger) {
        console.log(`[Scheduler] Triggering report for topic "${topic.topicName}" (${topic.schedule})`);
        const params: Record<string, any> = {
          topicId: topic.topicId,
          topicName: topic.topicName,
          reportType: 'weekly',
        };

        try {
          const { executionId, promise } = this.startExecution('report', params);
          this.addTrigger(topic, executionId, 'running');

          // Handle result asynchronously
          promise.then(async (execution) => {
            await this.reportHandler!(execution, params);
            this.updateTrigger(executionId, execution.status);
          }).catch((err) => {
            console.error(`[Scheduler] Report execution failed for "${topic.topicName}":`, err);
            this.updateTrigger(executionId, 'failed');
          });
        } catch (err) {
          console.error(`[Scheduler] Failed to start execution for "${topic.topicName}":`, err);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Tick error:', err);
    }
  }

  private async computePendingTopics(): Promise<PendingTopic[]> {
    const topics = await this.db.all(
      `SELECT id, name, schedule FROM topics WHERE schedule IS NOT NULL AND schedule != 'disabled'`
    );
    if (!topics || topics.length === 0) return [];

    const now = Date.now();
    const results: PendingTopic[] = [];

    for (const topic of topics) {
      const lastReport = await this.db.get(
        `SELECT MAX(generated_at) as lastAt FROM reports WHERE topic_id = ?`,
        [topic.id]
      );

      const lastAt = lastReport?.lastAt ? new Date(lastReport.lastAt).getTime() : 0;
      const intervalDays = SCHEDULE_DAYS[topic.schedule] ?? 7;
      const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
      const dueAt = lastAt + intervalMs;
      const dueInMinutes = Math.round((dueAt - now) / 60000);

      if (dueAt <= now) {
        results.push({
          topicId: topic.id,
          topicName: topic.name,
          schedule: topic.schedule,
          lastReportAt: lastReport?.lastAt ?? null,
          dueInMinutes: 0, // overdue
        });
      }
    }

    // Sort by most overdue first
    results.sort((a, b) => {
      // No previous report = highest priority
      if (!a.lastReportAt) return -1;
      if (!b.lastReportAt) return 1;
      return new Date(a.lastReportAt).getTime() - new Date(b.lastReportAt).getTime();
    });

    return results;
  }

  private addTrigger(topic: PendingTopic, executionId: string, status: RecentTrigger['status']) {
    this.recentTriggers.unshift({
      topicId: topic.topicId,
      topicName: topic.topicName,
      triggeredAt: new Date().toISOString(),
      executionId,
      status,
    });
    // Keep last 50 triggers
    if (this.recentTriggers.length > 50) this.recentTriggers.length = 50;
  }

  private updateTrigger(executionId: string, status: RecentTrigger['status']) {
    const t = this.recentTriggers.find(r => r.executionId === executionId);
    if (t) t.status = status;
  }
}
