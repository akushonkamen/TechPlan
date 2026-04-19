/**
 * 定时采集任务调度服务
 * 使用 node-cron 实现基于 cron 表达式的任务调度
 */

import cron from 'node-cron';
import { fetchRealTimeTechNews } from './agentService.js';
import { saveFetchedDocuments } from './documentService.js';
import { deduplicateDocuments } from '../utils/dedup.js';

export interface ScheduledTask {
  id: string;
  topicId: string;
  topicName: string;
  schedule: 'daily' | 'weekly' | 'monthly';
  cronExpression: string;
  enabled: boolean;
  lastExecution?: string;
  nextExecution?: string;
  executionCount: number;
}

export interface JobExecution {
  id: string;
  taskId: string;
  topicId: string;
  topicName: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt?: string;
  documentsCollected: number;
  documentsSaved: number;
  duplicatesRemoved: number;
  error?: string;
}

// Cron 表达式映射
const SCHEDULE_CRON_MAP: Record<string, string> = {
  daily: '0 9 * * *',      // 每天早上 9 点
  weekly: '0 9 * * 1',     // 每周一早上 9 点
  monthly: '0 9 1 * *'     // 每月 1 号早上 9 点
};

class SchedulerService {
  private db: any;
  private tasks: Map<string, ScheduledTask> = new Map();
  private cronJobs: Map<string, ReturnType<typeof cron.schedule>> = new Map();
  private executions: JobExecution[] = [];
  private isRunning = false;
  private runningExecutions: Set<string> = new Set(); // 用于防止任务重复执行

  constructor(db: any) {
    this.db = db;
  }

  /**
   * 初始化调度器，创建数据库表
   */
  async initialize(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        schedule TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        last_execution TEXT,
        next_execution TEXT,
        execution_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS job_executions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        topic_id TEXT NOT NULL,
        topic_name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        documents_collected INTEGER DEFAULT 0,
        documents_saved INTEGER DEFAULT 0,
        duplicates_removed INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES scheduled_jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_job_executions_task_id ON job_executions(task_id);
      CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);
      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_topic_id ON scheduled_jobs(topic_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);
    `);
  }

  /**
   * 从数据库加载已保存的任务
   */
  async loadTasks(): Promise<void> {
    const rows = await this.db.all(
      'SELECT * FROM scheduled_jobs WHERE enabled = 1'
    );

    for (const row of rows) {
      const task: ScheduledTask = {
        id: row.id,
        topicId: row.topic_id,
        topicName: row.topic_name || '',
        schedule: row.schedule,
        cronExpression: row.cron_expression,
        enabled: Boolean(row.enabled),
        lastExecution: row.last_execution,
        nextExecution: row.next_execution,
        executionCount: row.execution_count || 0
      };
      this.tasks.set(task.id, task);
    }
  }

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    await this.initialize();
    await this.loadTasks();

    // 注册所有任务
    for (const [id, task] of this.tasks.entries()) {
      await this.registerTask(task);
    }

    this.isRunning = true;
    console.log(`[Scheduler] Started with ${this.tasks.size} tasks`);
  }

  /**
   * 停止调度器（优雅关闭，等待正在执行的任务完成）
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[Scheduler] Not running');
      return;
    }

    // 停止所有 cron 任务
    for (const [id, job] of this.cronJobs.entries()) {
      job.stop();
    }
    this.cronJobs.clear();

    // 等待正在执行的任务完成（最多等待 30 秒）
    const maxWait = 30000;
    const start = Date.now();

    while (this.runningExecutions.size > 0 && Date.now() - start < maxWait) {
      console.log(`[Scheduler] Waiting for ${this.runningExecutions.size} running tasks to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.runningExecutions.size > 0) {
      console.warn(`[Scheduler] ${this.runningExecutions.size} tasks still running after timeout`);
    }

    this.isRunning = false;
    console.log('[Scheduler] Stopped');
  }

  /**
   * 获取调度器状态
   */
  getStatus(): {
    isRunning: boolean;
    tasksCount: number;
    activeJobs: number;
    runningExecutions: number;
  } {
    return {
      isRunning: this.isRunning,
      tasksCount: this.tasks.size,
      activeJobs: this.cronJobs.size,
      runningExecutions: this.runningExecutions.size
    };
  }

  /**
   * 重新加载任务配置
   */
  async reload(): Promise<void> {
    // 清除所有现有的 cron 任务
    for (const [id, job] of this.cronJobs.entries()) {
      job.stop();
    }
    this.cronJobs.clear();
    this.tasks.clear();

    // 从数据库重新加载
    await this.loadTasks();

    // 重新注册任务
    for (const [id, task] of this.tasks.entries()) {
      await this.registerTask(task);
    }

    console.log(`[Scheduler] Reloaded ${this.tasks.size} tasks`);
  }

  /**
   * 从主题列表同步并创建任务
   */
  async syncTopics(): Promise<number> {
    const topics = await this.db.all('SELECT * FROM topics WHERE schedule IS NOT NULL');
    let created = 0;

    for (const topic of topics) {
      const existingTask = await this.db.get(
        'SELECT * FROM scheduled_jobs WHERE topic_id = ?',
        [topic.id]
      );

      if (!existingTask) {
        const cronExpression = SCHEDULE_CRON_MAP[topic.schedule] || topic.schedule;
        const taskId = `task_${topic.id}_${Date.now()}`;

        await this.db.run(
          `INSERT INTO scheduled_jobs (id, topic_id, schedule, cron_expression, enabled, execution_count)
           VALUES (?, ?, ?, ?, 1, 0)`,
          [taskId, topic.id, topic.schedule, cronExpression]
        );

        const task: ScheduledTask = {
          id: taskId,
          topicId: topic.id,
          topicName: topic.name,
          schedule: topic.schedule,
          cronExpression,
          enabled: true,
          executionCount: 0
        };

        this.tasks.set(taskId, task);
        await this.registerTask(task);
        created++;
      }
    }

    console.log(`[Scheduler] Synced ${created} new tasks from topics`);
    return created;
  }

  /**
   * 注册一个定时任务
   */
  private async registerTask(task: ScheduledTask): Promise<void> {
    if (!cron.validate(task.cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression for task ${task.id}: ${task.cronExpression}`);
      return;
    }

    const job = cron.schedule(task.cronExpression, async () => {
      await this.executeTask(task.id);
    });

    this.cronJobs.set(task.id, job);
    job.start();

    // 计算下次执行时间
    task.nextExecution = this.calculateNextExecution(task.cronExpression);
    await this.updateTaskInDb(task);

    console.log(`[Scheduler] Registered task ${task.id} (${task.topicName}) with schedule: ${task.cronExpression}`);
  }

  /**
   * 注销一个任务
   */
  async unregisterTask(taskId: string): Promise<void> {
    const job = this.cronJobs.get(taskId);
    if (job) {
      job.stop();
      this.cronJobs.delete(taskId);
    }
    this.tasks.delete(taskId);
    await this.db.run('DELETE FROM scheduled_jobs WHERE id = ?', [taskId]);
    console.log(`[Scheduler] Unregistered task ${taskId}`);
  }

  /**
   * 执行任务（幂等性保证）
   */
  private async executeTask(taskId: string): Promise<void> {
    // 幂等性检查：如果任务正在执行，跳过
    if (this.runningExecutions.has(taskId)) {
      console.log(`[Scheduler] Task ${taskId} is already running, skipping`);
      return;
    }

    const task = this.tasks.get(taskId);
    if (!task) {
      console.error(`[Scheduler] Task ${taskId} not found`);
      return;
    }

    // 获取主题信息
    const topic = await this.db.get('SELECT * FROM topics WHERE id = ?', [task.topicId]);
    if (!topic) {
      console.error(`[Scheduler] Topic ${task.topicId} not found for task ${taskId}`);
      return;
    }

    // 标记任务正在执行
    this.runningExecutions.add(taskId);

    // 创建执行记录
    const executionId = `exec_${taskId}_${Date.now()}`;
    const execution: JobExecution = {
      id: executionId,
      taskId: task.id,
      topicId: task.topicId,
      topicName: topic.name,
      status: 'running',
      startedAt: new Date().toISOString(),
      documentsCollected: 0,
      documentsSaved: 0,
      duplicatesRemoved: 0
    };
    this.executions.push(execution);
    await this.saveExecutionToDb(execution);

    console.log(`[Scheduler] Executing task ${taskId} for topic "${topic.name}"`);

    try {
      // 获取主题关键词用于搜索
      const keywords = JSON.parse(topic.keywords || '[]');
      const searchQuery = keywords.length > 0
        ? `${topic.name} ${keywords.slice(0, 3).join(' ')}`
        : topic.name;

      // 执行 AI 检索
      const fetchedDocs = await fetchRealTimeTechNews(searchQuery);
      execution.documentsCollected = fetchedDocs.length;

      if (fetchedDocs.length > 0) {
        // 去重处理
        const existingDocs = await this.db.all(
          'SELECT * FROM documents WHERE topic_id = ?',
          [task.topicId]
        );

        const existingDocsForDedup = existingDocs.map((d: any) => ({
          title: d.title,
          url: d.source_url || '',
          source: d.source || '',
          type: d.metadata?.type || '',
          date: d.published_date || ''
        }));

        const allDocs = [...existingDocsForDedup, ...fetchedDocs];
        const dedupResult = deduplicateDocuments(allDocs);

        // 只保存新的文档（去重后的）
        const newDocs = dedupResult.unique.filter(doc =>
          !existingDocsForDedup.some(existing =>
            existing.url === doc.url || existing.title === doc.title
          )
        );

        execution.duplicatesRemoved = fetchedDocs.length - newDocs.length;

        if (newDocs.length > 0) {
          await saveFetchedDocuments(newDocs.map(doc => ({
            title: doc.title,
            source: doc.source,
            type: doc.type,
            date: doc.date,
            url: doc.url
          })), task.topicId);
          execution.documentsSaved = newDocs.length;
        }
      }

      // 更新执行状态为成功
      execution.status = 'success';
      execution.completedAt = new Date().toISOString();

      // 更新任务状态
      task.lastExecution = execution.startedAt;
      task.executionCount++;
      task.nextExecution = this.calculateNextExecution(task.cronExpression);
      await this.updateTaskInDb(task);

      console.log(`[Scheduler] Task ${taskId} completed: collected ${execution.documentsCollected}, saved ${execution.documentsSaved}, removed ${execution.duplicatesRemoved} duplicates`);

    } catch (error) {
      execution.status = 'failed';
      execution.completedAt = new Date().toISOString();
      execution.error = error instanceof Error ? error.message : String(error);
      console.error(`[Scheduler] Task ${taskId} failed:`, error);
    } finally {
      // 移除正在执行标记
      this.runningExecutions.delete(taskId);
      await this.saveExecutionToDb(execution);
    }
  }

  /**
   * 手动触发任务执行
   */
  async triggerTask(taskId: string): Promise<JobExecution | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 直接执行任务
    await this.executeTask(taskId);

    // 返回最新的执行记录
    const latestExecution = this.executions
      .filter(e => e.taskId === taskId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

    return latestExecution || null;
  }

  /**
   * 获取所有已注册的任务
   */
  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取执行日志
   */
  getExecutions(options: { limit?: number; taskId?: string; status?: string } = {}): JobExecution[] {
    let executions = [...this.executions];

    if (options.taskId) {
      executions = executions.filter(e => e.taskId === options.taskId);
    }

    if (options.status) {
      executions = executions.filter(e => e.status === options.status);
    }

    // 按开始时间倒序排列
    executions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    if (options.limit) {
      executions = executions.slice(0, options.limit);
    }

    return executions;
  }

  /**
   * 从数据库加载执行日志
   */
  async loadExecutionsFromDb(limit: number = 100): Promise<void> {
    const rows = await this.db.all(
      `SELECT * FROM job_executions
       ORDER BY started_at DESC
       LIMIT ?`,
      [limit]
    );

    this.executions = rows.map((row: any) => ({
      id: row.id,
      taskId: row.task_id,
      topicId: row.topic_id,
      topicName: row.topic_name,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      documentsCollected: row.documents_collected,
      documentsSaved: row.documents_saved,
      duplicatesRemoved: row.duplicates_removed,
      error: row.error
    }));
  }

  /**
   * 保存执行记录到数据库
   */
  private async saveExecutionToDb(execution: JobExecution): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO job_executions
       (id, task_id, topic_id, topic_name, status, started_at, completed_at,
        documents_collected, documents_saved, duplicates_removed, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        execution.id,
        execution.taskId,
        execution.topicId,
        execution.topicName,
        execution.status,
        execution.startedAt,
        execution.completedAt || null,
        execution.documentsCollected,
        execution.documentsSaved,
        execution.duplicatesRemoved,
        execution.error || null
      ]
    );
  }

  /**
   * 更新任务在数据库中的状态
   */
  private async updateTaskInDb(task: ScheduledTask): Promise<void> {
    await this.db.run(
      `UPDATE scheduled_jobs
       SET last_execution = ?, next_execution = ?, execution_count = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [task.lastExecution || null, task.nextExecution || null, task.executionCount, task.id]
    );
  }

  /**
   * 计算下次执行时间（简化版，实际应该使用 cron-parser）
   */
  private calculateNextExecution(cronExpression: string): string {
    // 这是一个简化的实现，返回一个预估时间
    // 实际项目中可以使用 cron-parser 库来精确计算
    const now = new Date();
    const [minute, hour, day, month, dayOfWeek] = cronExpression.split(' ');

    if (day === '*') {
      // 每天或每周
      if (dayOfWeek !== '*') {
        // 每周特定的一天
        const targetDay = parseInt(dayOfWeek);
        const daysUntilTarget = (targetDay - now.getDay() + 7) % 7 || 7;
        now.setDate(now.getDate() + daysUntilTarget);
      }
      // 每天的话就是明天
      now.setDate(now.getDate() + 1);
    } else if (day !== '*' && month === '*') {
      // 每月特定的一天
      const targetDay = parseInt(day);
      if (now.getDate() >= targetDay) {
        now.setMonth(now.getMonth() + 1);
      }
      now.setDate(targetDay);
    }

    // 设置时间
    if (hour !== '*') now.setHours(parseInt(hour));
    if (minute !== '*') now.setMinutes(parseInt(minute));
    now.setSeconds(0);
    now.setMilliseconds(0);

    return now.toISOString();
  }

  /**
   * 创建新任务
   */
  async createTask(topicId: string, schedule: 'daily' | 'weekly' | 'monthly'): Promise<ScheduledTask> {
    // 获取主题信息
    const topic = await this.db.get('SELECT * FROM topics WHERE id = ?', [topicId]);
    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }

    // 检查是否已存在
    const existing = await this.db.get('SELECT * FROM scheduled_jobs WHERE topic_id = ?', [topicId]);
    if (existing) {
      throw new Error(`Task for topic ${topicId} already exists`);
    }

    const cronExpression = SCHEDULE_CRON_MAP[schedule] || schedule;
    const taskId = `task_${topicId}_${Date.now()}`;

    const task: ScheduledTask = {
      id: taskId,
      topicId,
      topicName: topic.name,
      schedule,
      cronExpression,
      enabled: true,
      executionCount: 0
    };

    // 保存到数据库
    await this.db.run(
      `INSERT INTO scheduled_jobs (id, topic_id, schedule, cron_expression, enabled, execution_count)
       VALUES (?, ?, ?, ?, 1, 0)`,
      [taskId, topicId, schedule, cronExpression]
    );

    this.tasks.set(taskId, task);

    // 如果调度器正在运行，立即注册任务
    if (this.isRunning) {
      await this.registerTask(task);
    }

    return task;
  }

  /**
   * 更新任务
   */
  async updateTask(taskId: string, updates: Partial<Pick<ScheduledTask, 'schedule' | 'enabled'>>): Promise<ScheduledTask> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (updates.schedule) {
      task.schedule = updates.schedule;
      task.cronExpression = SCHEDULE_CRON_MAP[updates.schedule] || updates.schedule;
    }

    if (updates.enabled !== undefined) {
      task.enabled = updates.enabled;
    }

    // 更新数据库
    await this.db.run(
      `UPDATE scheduled_jobs SET schedule = ?, cron_expression = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [task.schedule, task.cronExpression, task.enabled ? 1 : 0, taskId]
    );

    // 重新注册任务
    if (this.isRunning) {
      const oldJob = this.cronJobs.get(taskId);
      if (oldJob) {
        oldJob.stop();
      }

      if (task.enabled) {
        await this.registerTask(task);
      } else {
        this.cronJobs.delete(taskId);
      }
    }

    return task;
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    await this.unregisterTask(taskId);
    await this.db.run('DELETE FROM scheduled_jobs WHERE id = ?', [taskId]);
  }
}

// 单例模式
let schedulerInstance: SchedulerService | null = null;

export function getScheduler(db: any): SchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService(db);
  }
  return schedulerInstance;
}

export { SchedulerService };
