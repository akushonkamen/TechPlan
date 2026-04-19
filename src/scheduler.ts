// Scheduler Service - Periodic report generation based on topic schedules

import type { SkillExecution } from './skillExecutor.js';

interface SchedulerConfig {
  enabled: boolean;
  checkIntervalMinutes: number; // 5..1440
}

interface SchedulerStatus {
  running: boolean;
  checkIntervalMinutes: number;
  lastCheckAt: string | null;
  nextCheckAt: string | null;
  pendingTopics: PendingTopic[];
  recentTriggers: RecentTrigger[];
}

interface PendingTopic {
  topicId: string;
  topicName: string;
  schedule: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  lastReportAt: string | null;
  dueInMinutes: number;
}

interface RecentTrigger {
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
  private collectFn: ((topicId: string, topicName: string, start: string, end: string) => Promise<{ collected: number }>) | null = null;
  private getDocumentsCountInPeriod: ((topicId: string, start: string, end: string) => Promise<number>) | null = null;

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

  /** Inject the data collection function (triggerCollectionForPeriod). */
  setCollectFunction(fn: (topicId: string, topicName: string, start: string, end: string) => Promise<{ collected: number }>) { this.collectFn = fn; }

  /** Inject the document count checker function. */
  setGetDocumentsCountInPeriod(fn: (topicId: string, start: string, end: string) => Promise<number>) { this.getDocumentsCountInPeriod = fn; }

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
      // ── Phase 1: Collect data for topics with collection enabled ──
      await this.collectForAllTopics();

      // ── Phase 2: Generate due reports ──
      const pending = await this.computePendingTopics();
      const toTrigger = pending.slice(0, this.maxTriggers);

      for (const topic of toTrigger) {
        const skillName = SCHEDULE_TO_SKILL[topic.schedule] ?? 'report';
        console.log(`[Scheduler] Triggering ${topic.schedule} report for topic "${topic.topicName}"`);

        const { start: timeRangeStart, end: timeRangeEnd } = this.getReportRange(topic.schedule);

        const params: Record<string, any> = {
          topicId: topic.topicId,
          topicName: topic.topicName,
          reportType: topic.schedule,
          timeRangeStart,
          timeRangeEnd,
        };

        try {
          // Check if we have enough data to generate a meaningful report
          if (this.getDocumentsCountInPeriod) {
            const docCount = await this.getDocumentsCountInPeriod(topic.topicId, timeRangeStart, timeRangeEnd);
            if (docCount === 0) {
              console.warn(`[Scheduler] Skipping report for "${topic.topicName}": no documents in period`);
              continue;
            }
          }

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

  /** Collect data for all topics that have collection enabled and are due at current time. */
  private async collectForAllTopics() {
    if (!this.collectFn) return;
    const topics = await this.db.all(
      `SELECT id, name, schedule, collection_time FROM topics WHERE schedule IS NOT NULL AND schedule != 'disabled'`
    );
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const intervalMin = this.config.checkIntervalMinutes;

    for (const topic of topics) {
      // Check if current time is within the collection time window
      const targetTime = (topic.collection_time || '06:00').split(':').map(Number);
      const targetMinutes = (targetTime[0] || 6) * 60 + (targetTime[1] || 0);
      const diff = Math.abs(currentMinutes - targetMinutes);
      // Allow collection if within one scheduler interval of the target time
      if (diff > intervalMin && (1440 - diff) > intervalMin) continue;

      const { start, end } = this.getCollectionRange(topic.schedule);
      try {
        console.log(`[Scheduler] Collecting data for "${topic.name}" (${start} - ${end})`);
        await this.collectFn(topic.id, topic.name, start, end);
      } catch (err) {
        console.warn(`[Scheduler] Collection failed for "${topic.name}":`, err);
      }
    }
  }

  private getCollectionRange(schedule: string): { start: string; end: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (schedule === 'weekly') {
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      return { start: fmt(weekAgo), end: fmt(now) };
    }
    return { start: fmt(now), end: fmt(now) };
  }

  private getReportRange(schedule: string): { start: string; end: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    switch (schedule) {
      case 'daily':
        return { start: fmt(now), end: fmt(now) };
      case 'monthly': {
        const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        const end = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        return { start, end };
      }
      case 'quarterly': {
        const q = Math.floor(now.getMonth() / 3);
        const start = fmt(new Date(now.getFullYear(), q * 3, 1));
        const end = fmt(new Date(now.getFullYear(), q * 3 + 3, 0));
        return { start, end };
      }
      default: { // weekly
        const weekAgo = new Date(now.getTime() - 7 * 86400000);
        return { start: fmt(weekAgo), end: fmt(now) };
      }
    }
  }

  private async computePendingTopics(): Promise<PendingTopic[]> {
    const topics = await this.db.all(
      `SELECT id, name,
        COALESCE(daily_report_enabled, 0) as daily_enabled,
        COALESCE(weekly_report_enabled, 0) as weekly_enabled,
        COALESCE(monthly_report_enabled, 0) as monthly_enabled,
        COALESCE(quarterly_report_enabled, 0) as quarterly_enabled
       FROM topics WHERE daily_report_enabled = 1 OR weekly_report_enabled = 1
       OR monthly_report_enabled = 1 OR quarterly_report_enabled = 1`
    );
    if (!topics || topics.length === 0) return [];

    // Build report schedule pairs from *_report_enabled flags only
    const reportPairs: Array<{ topicId: string; schedule: string }> = [];
    for (const topic of topics) {
      if (topic.daily_enabled) reportPairs.push({ topicId: topic.id, schedule: 'daily' });
      if (topic.weekly_enabled) reportPairs.push({ topicId: topic.id, schedule: 'weekly' });
      if (topic.monthly_enabled) reportPairs.push({ topicId: topic.id, schedule: 'monthly' });
      if (topic.quarterly_enabled) reportPairs.push({ topicId: topic.id, schedule: 'quarterly' });
    }

    if (reportPairs.length === 0) return [];

    // Batch query last report timestamps
    const unionQueries = reportPairs.map(
      () => `SELECT ? as topic_id, ? as schedule_type, MAX(generated_at) as lastAt FROM reports WHERE topic_id = ? AND type = ?`
    ).join(' UNION ALL ');

    const batchParams = reportPairs.flatMap(pair => [pair.topicId, pair.schedule, pair.topicId, pair.schedule]);
    const lastReports = await this.db.all(unionQueries, batchParams);

    const lastReportMap = new Map<string, string | null>();
    for (const row of lastReports) {
      lastReportMap.set(`${row.topic_id}:${row.schedule_type}`, row.lastAt);
    }

    const now = Date.now();
    const results: PendingTopic[] = [];

    for (const topic of topics) {
      const schedules: Array<'daily' | 'weekly' | 'monthly' | 'quarterly'> = [];
      if (topic.daily_enabled) schedules.push('daily');
      if (topic.weekly_enabled) schedules.push('weekly');
      if (topic.monthly_enabled) schedules.push('monthly');
      if (topic.quarterly_enabled) schedules.push('quarterly');

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
