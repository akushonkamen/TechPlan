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
  schedule: 'daily' | 'weekly' | 'monthly' | 'quarterly';
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
  quarterly: 90,
};

const SCHEDULE_TO_SKILL: Record<string, string> = {
  daily: 'report-daily',
  weekly: 'report',
  monthly: 'report-monthly',
  quarterly: 'report-quarterly',
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
    if (!this.db || !this.startExecution || !this.reportHandler) {
      console.error('[Scheduler] Cannot start: missing dependencies');
      return;
    }
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
        const skillName = SCHEDULE_TO_SKILL[topic.schedule] ?? 'report';
        console.log(`[Scheduler] Triggering ${topic.schedule} report for topic "${topic.topicName}" via ${skillName}`);

        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        let timeRangeStart: string, timeRangeEnd: string;
        switch (topic.schedule) {
          case 'daily':
            timeRangeStart = fmt(now);
            timeRangeEnd = fmt(now);
            break;
          case 'monthly': {
            timeRangeStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
            timeRangeEnd = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
            break;
          }
          case 'quarterly': {
            const q = Math.floor(now.getMonth() / 3);
            timeRangeStart = fmt(new Date(now.getFullYear(), q * 3, 1));
            timeRangeEnd = fmt(new Date(now.getFullYear(), q * 3 + 3, 0));
            break;
          }
          default: { // weekly
            const weekAgo = new Date(now.getTime() - 7 * 86400000);
            timeRangeStart = fmt(weekAgo);
            timeRangeEnd = fmt(now);
          }
        }

        const params: Record<string, any> = {
          topicId: topic.topicId,
          topicName: topic.topicName,
          reportType: topic.schedule === 'weekly' ? 'weekly' : topic.schedule,
          timeRangeStart,
          timeRangeEnd,
        };

        try {
          const { executionId, promise } = this.startExecution(skillName, params);
          this.addTrigger(topic, executionId, 'running');

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
    // Support both old schedule column and new *_report_enabled columns
    const topics = await this.db.all(
      `SELECT id, name, schedule,
        COALESCE(daily_report_enabled, CASE WHEN schedule = 'daily' THEN 1 ELSE 0 END) as daily_enabled,
        COALESCE(monthly_report_enabled, CASE WHEN schedule = 'monthly' THEN 1 ELSE 0 END) as monthly_enabled,
        COALESCE(quarterly_report_enabled, CASE WHEN schedule = 'quarterly' THEN 1 ELSE 0 END) as quarterly_enabled
       FROM topics WHERE schedule IS NOT NULL AND schedule != 'disabled'
       OR daily_report_enabled = 1 OR monthly_report_enabled = 1 OR quarterly_report_enabled = 1`
    );
    if (!topics || topics.length === 0) return [];

    // Batch query: Get all last report timestamps for all topic-schedule combinations
    const topicSchedulePairs: Array<{ topicId: string; schedule: string }> = [];
    for (const topic of topics) {
      const schedules: string[] = [];
      if (topic.schedule && topic.schedule !== 'disabled') schedules.push(topic.schedule);
      if (topic.daily_enabled && !schedules.includes('daily')) schedules.push('daily');
      if (topic.monthly_enabled && !schedules.includes('monthly')) schedules.push('monthly');
      if (topic.quarterly_enabled && !schedules.includes('quarterly')) schedules.push('quarterly');

      for (const schedule of schedules) {
        topicSchedulePairs.push({ topicId: topic.id, schedule });
      }
    }

    // Build batch query with UNION ALL
    if (topicSchedulePairs.length === 0) return [];

    const unionQueries = topicSchedulePairs.map(
      (_, i) => `SELECT ? as topic_id, ? as schedule_type, MAX(generated_at) as lastAt FROM reports WHERE topic_id = ? AND type = ?`
    ).join(' UNION ALL ');

    const batchParams = topicSchedulePairs.flatMap(pair => [pair.topicId, pair.schedule, pair.topicId, pair.schedule]);
    const lastReports = await this.db.all(unionQueries, batchParams);

    // Create lookup map: "topicId:schedule" -> lastAt timestamp
    const lastReportMap = new Map<string, string | null>();
    for (const row of lastReports) {
      const key = `${row.topic_id}:${row.schedule_type}`;
      lastReportMap.set(key, row.lastAt);
    }

    const now = Date.now();
    const results: PendingTopic[] = [];

    for (const topic of topics) {
      // Determine which schedules to check for this topic
      const schedules: Array<'daily' | 'weekly' | 'monthly' | 'quarterly'> = [];
      if (topic.schedule && topic.schedule !== 'disabled') {
        schedules.push(topic.schedule as 'daily' | 'weekly' | 'monthly' | 'quarterly');
      }
      if (topic.daily_enabled && !schedules.includes('daily')) schedules.push('daily');
      if (topic.monthly_enabled && !schedules.includes('monthly')) schedules.push('monthly');
      if (topic.quarterly_enabled && !schedules.includes('quarterly')) schedules.push('quarterly');

      for (const schedule of schedules) {
        const key = `${topic.id}:${schedule}`;
        const lastAt = lastReportMap.get(key) ? new Date(lastReportMap.get(key)!).getTime() : 0;
        const intervalDays = SCHEDULE_DAYS[schedule] ?? 7;
        const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
        const dueAt = lastAt + intervalMs;

        if (dueAt <= now) {
          results.push({
            topicId: topic.id,
            topicName: topic.name,
            schedule,
            lastReportAt: lastReportMap.get(key) ?? null,
            dueInMinutes: 0,
          });
        }
      }
    }

    results.sort((a, b) => {
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
