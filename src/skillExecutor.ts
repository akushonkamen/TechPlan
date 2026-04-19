// Skill Executor - Spawns Claude Code CLI to execute skills

import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { SkillRegistry } from "./skillRegistry.js";
import type { SkillWebSocket } from "./websocket.js";

export interface SkillExecution {
  id: string;
  skillName: string;
  params: Record<string, any>;
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  result?: any;
  error?: string;
  stdout: string;
  startedAt: string;
  completedAt?: string;
}

const MAX_CONCURRENT = 3;

// Strip ANSI escape codes (from `script` pseudo-TTY wrapper)
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

interface QueuedExecution {
  config: { name: string; prompt: string; timeout: number; allowedTools?: string[] };
  params: Record<string, any>;
  executionId?: string;
  resolve: (execution: SkillExecution) => void;
  reject: (error: Error) => void;
}

export class SkillExecutor {
  private activeProcesses = new Map<string, ChildProcess>();
  private runningCount = 0;
  private queue: QueuedExecution[] = [];
  // In-memory progress store — keyed by executionId
  private progressLines = new Map<string, string[]>();
  private ws: SkillWebSocket | null = null;

  constructor(
    private registry: SkillRegistry,
    private db: any,
  ) {}

  /** Inject the WebSocket instance after construction. */
  setWebSocket(ws: SkillWebSocket) {
    this.ws = ws;
  }

  /** Get accumulated progress lines for an execution (poll-based). */
  getProgress(executionId: string): string[] {
    return this.progressLines.get(executionId) ?? [];
  }

  /** Clean up stale "running" executions from a previous server session. */
  async cleanupStale() {
    try {
      await this.db.run(
        `UPDATE skill_executions SET status = 'failed', error = 'Server restarted' WHERE status = 'running'`
      );
    } catch { /* table might not exist yet */ }
  }

  /**
   * Start executing a skill. Returns the execution ID immediately
   * while execution continues in the background.
   */
  startExecution(
    skillName: string,
    params: Record<string, any>,
  ): { executionId: string; promise: Promise<SkillExecution> } {
    const prompt = this.registry.render(skillName, params);
    const config = this.registry.get(skillName)!;
    const executionId = randomUUID();

    const promise = this.runWithId(executionId, { name: skillName, prompt, timeout: config.timeout, allowedTools: config.allowedTools }, params);

    return { executionId, promise };
  }

  private runWithId(
    executionId: string,
    config: { name: string; prompt: string; timeout: number; allowedTools?: string[] },
    params: Record<string, any>,
  ): Promise<SkillExecution> {
    return this.run(config, params, executionId);
  }

  private run(
    config: { name: string; prompt: string; timeout: number; allowedTools?: string[] },
    params: Record<string, any>,
    preassignedId?: string,
  ): Promise<SkillExecution> {
    if (this.runningCount >= MAX_CONCURRENT) {
      return new Promise<SkillExecution>((resolve, reject) => {
        this.queue.push({ config, params, executionId: preassignedId, resolve, reject });
      });
    }

    const execution: SkillExecution = {
      id: preassignedId || randomUUID(),
      skillName: config.name,
      params,
      status: 'running',
      stdout: '',
      startedAt: new Date().toISOString(),
    };

    this.runningCount++;
    this.progressLines.set(execution.id, []);

    // Record in DB - if this fails, execution should reflect the failure
    const dbInsertPromise = this.db.run(
      `INSERT INTO skill_executions (id, skill_name, params, status, started_at) VALUES (?, ?, ?, 'running', ?)`,
      [execution.id, execution.skillName, JSON.stringify(params), execution.startedAt],
    );

    return new Promise<SkillExecution>((resolve, reject) => {
      // Handle DB insert failure - reject the promise immediately
      dbInsertPromise.catch((err: Error) => {
        console.error('[SkillExecutor] DB insert error:', err);
        execution.status = 'failed';
        execution.error = `Database error: ${err.message}`;
        this.runningCount--;
        reject(new Error(`Failed to record execution in database: ${err.message}`));
      });

      const appendProgress = (line: string) => {
        const arr = this.progressLines.get(execution.id);
        if (arr) {
          arr.push(line);
        }
        // Push to WebSocket subscribers in real-time
        this.ws?.send(execution.id, 'progress', line);
      };

      // Spawn claude CLI directly in non-interactive print mode (-p).
      // stream-json output works without a TTY.
      const toolArgs = config.allowedTools
        ? config.allowedTools.flatMap(t => ['--allowedTools', t])
        : [];
      const proc = spawn('claude', [
        '-p', config.prompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
        ...toolArgs,
      ], {
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Close stdin immediately — we pass the prompt via -p flag, not stdin.
      // Without this claude CLI may warn "no stdin data received" and exit non-zero.
      proc.stdin?.end();

      this.activeProcesses.set(execution.id, proc);

      let stdout = '';
      let stderr = '';

      // Helper: extract readable text from tool_result content
      const extractContent = (content: any): string => {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
          return content
            .filter((c: any) => c.type === 'text' && c.text)
            .map((c: any) => c.text)
            .join('\n');
        }
        return '';
      };

      // Helper: extract tool input detail for display
      const toolInputDetail = (input: Record<string, any>): string => {
        return input.query || input.command || input.url || input.description || input.prompt || '';
      };

      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;

        // Parse stream-json lines for structured progress
        // Strip ANSI escape codes from `script` pseudo-TTY wrapper
        const lines = chunk.split('\n').filter(l => l.trim());
        for (const rawLine of lines) {
          const line = stripAnsi(rawLine);
          try {
            const parsed = JSON.parse(line);

            if (parsed.type === 'system') {
              appendProgress('系统初始化完成');
            } else if (parsed.type === 'assistant' && parsed.message?.content) {
              for (const block of parsed.message.content) {
                if (block.type === 'thinking' && block.thinking) {
                  appendProgress(`思考: ${block.thinking.slice(0, 100).replace(/\n/g, ' ')}`);
                } else if (block.type === 'text' && block.text) {
                  const text = block.text.trim();
                  if (text) {
                    appendProgress(text.slice(0, 300));
                  }
                } else if (block.type === 'tool_use') {
                  const input = block.input || {};
                  const detail = toolInputDetail(input);
                  appendProgress(`调用 ${block.name}${detail ? ': ' + String(detail).slice(0, 120) : ''}`);
                }
              }
            } else if (parsed.type === 'user' && parsed.message?.content) {
              for (const block of parsed.message.content) {
                if (block.type === 'tool_result') {
                  const content = extractContent(block.content);
                  if (content) {
                    appendProgress(`结果: ${content.slice(0, 150).replace(/\n/g, ' ')}`);
                  }
                }
              }
            } else if (parsed.type === 'result') {
              // Parse the actual result content from Claude CLI output
              // Claude CLI returns: { type: "result", result: "{...actual JSON...}" }
              console.log('[SkillExecutor] Received result type, parsing...');

              const resultStr = parsed.result;
              let parsedResult: any = null;

              if (typeof resultStr === 'string') {
                parsedResult = this.extractJson(resultStr);
              } else if (resultStr && typeof resultStr === 'object') {
                parsedResult = resultStr;
                console.log('[SkillExecutor] Result is already an object');
              } else {
                parsedResult = parsed;
                console.log('[SkillExecutor] Using parsed as result');
              }

              execution.result = parsedResult;
              const durationSec = parsed.duration_ms
                ? Math.round(parsed.duration_ms / 1000)
                : 0;
              appendProgress(`── 完成${durationSec ? ` (耗时 ${durationSec}s)` : ''} ──`);
            }
          } catch {
            const trimmed = line.trim();
            if (trimmed && trimmed.length > 2) {
              appendProgress(trimmed.slice(0, 200));
            }
          }
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        const lines = text.split('\n').filter(l => l.trim());
        for (const line of lines) {
          if (line.includes('error') || line.includes('Error') || line.includes('warn')) {
            appendProgress(`[stderr] ${line.slice(0, 150)}`);
          }
        }
      });

      // Timeout handler
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        execution.status = 'timeout';
        execution.error = `Skill execution timed out after ${config.timeout}s`;
        appendProgress(`超时: 超过 ${config.timeout}s 限制`);
        this.finalize(execution, stdout, resolve);
      }, config.timeout * 1000);

      proc.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcesses.delete(execution.id);

        if (code === 0) {
          execution.status = 'completed';
          if (!execution.result) {
            // Strip ANSI escape codes from accumulated stdout
            const cleanStdout = stripAnsi(stdout);
            const lines = cleanStdout.split('\n').map(l => l.trim()).filter(Boolean);

            // Scan from end to start for the result line
            let foundResult = false;
            for (let i = lines.length - 1; i >= 0; i--) {
              if (lines[i].includes('"type":"result"')) {
                try {
                  const parsed = JSON.parse(lines[i]);
                  if (parsed.type === 'result' && parsed.result !== undefined) {
                    const resultStr = parsed.result;
                    if (typeof resultStr === 'string') {
                      const firstBrace = resultStr.indexOf('{');
                      const lastBrace = resultStr.lastIndexOf('}');
                      if (firstBrace !== -1 && lastBrace > firstBrace) {
                        try {
                          execution.result = JSON.parse(resultStr.slice(firstBrace, lastBrace + 1));
                          console.log('[SkillExecutor] Extracted result JSON from close handler');
                        } catch {
                          execution.result = { raw: resultStr };
                        }
                      } else {
                        execution.result = { raw: resultStr };
                      }
                    } else {
                      execution.result = resultStr;
                    }
                    foundResult = true;
                    break;
                  }
                } catch { /* skip malformed line */ }
              }
            }

            if (!foundResult) {
              // Last resort: try parsing whole stdout as single JSON
              try {
                execution.result = JSON.parse(cleanStdout);
              } catch {
                execution.result = { raw: cleanStdout };
              }
            }
          }
        } else if (execution.status !== 'timeout') {
          // If we already captured a result from stream parsing, treat as completed
          // (non-zero exit can come from harmless stderr warnings like stdin notices)
          if (execution.result && typeof execution.result === 'object' && !execution.result.raw) {
            execution.status = 'completed';
            console.log('[SkillExecutor] Non-zero exit but result already captured, marking completed');
          } else {
            // Try to extract result from stdout even on non-zero exit
            const cleanStdout = stripAnsi(stdout);
            const lines = cleanStdout.split('\n').map(l => l.trim()).filter(Boolean);
            let foundResult = false;
            for (let i = lines.length - 1; i >= 0; i--) {
              if (lines[i].includes('"type":"result"')) {
                try {
                  const parsed = JSON.parse(lines[i]);
                  if (parsed.type === 'result' && parsed.result !== undefined) {
                    const resultStr = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
                    const firstBrace = resultStr.indexOf('{');
                    const lastBrace = resultStr.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace > firstBrace) {
                      try {
                        execution.result = JSON.parse(resultStr.slice(firstBrace, lastBrace + 1));
                        execution.status = 'completed';
                        console.log('[SkillExecutor] Recovered result from non-zero exit');
                        foundResult = true;
                      } catch {
                        // fall through to failed
                      }
                    }
                    break;
                  }
                } catch { /* skip */ }
              }
            }
            if (!foundResult) {
              execution.status = 'failed';
              execution.error = stderr || `Process exited with code ${code}`;
              appendProgress(`失败: ${execution.error.slice(0, 150)}`);
            }
          }
        }

        this.finalize(execution, stdout, resolve);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses.delete(execution.id);
        execution.status = 'failed';
        execution.error = err.message;
        appendProgress(`启动失败: ${err.message}`);
        this.finalize(execution, stdout, resolve);
      });
    });
  }

  private finalize(
    execution: SkillExecution,
    stdout: string,
    resolve: (execution: SkillExecution) => void,
  ) {
    execution.stdout = stdout;
    execution.completedAt = new Date().toISOString();
    this.runningCount--;

    // Update DB
    this.db.run(
      `UPDATE skill_executions SET status = ?, result = ?, error = ?, completed_at = ? WHERE id = ?`,
      [
        execution.status,
        JSON.stringify(execution.result ?? null),
        execution.error ?? null,
        execution.completedAt,
        execution.id,
      ],
    ).catch((err: Error) => console.error('[SkillExecutor] DB update error:', err));

    // Send terminal WebSocket message so frontend knows execution ended
    if (execution.status === 'failed' || execution.status === 'timeout') {
      this.ws?.send(execution.id, 'error', execution.error ?? 'Execution failed');
    }

    resolve(execution);

    // Keep progress lines for 5 minutes after completion, then clean up
    setTimeout(() => {
      this.progressLines.delete(execution.id);
    }, 5 * 60 * 1000);

    // Process queue
    if (this.queue.length > 0 && this.runningCount < MAX_CONCURRENT) {
      const next = this.queue.shift()!;
      this.run(next.config, next.params, next.executionId)
        .then(next.resolve)
        .catch(next.reject);
    }
  }

  /**
   * Extract a JSON object from a string that may contain markdown fences,
   * extra text before/after, or nested structures.
   */
  private extractJson(input: string): any {
    let cleaned = input.trim();

    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // Try direct parse first
    try {
      return JSON.parse(cleaned);
    } catch { /* continue */ }

    // Find outermost { } pair and try parse
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(extracted);
      } catch { /* continue */ }
    }

    // If the result has nested "content" field as a JSON string, try to unwrap
    try {
      const outer = JSON.parse(cleaned);
      if (outer.content && typeof outer.content === 'string') {
        try { return { ...outer, content: JSON.parse(outer.content) }; } catch { /* */ }
      }
      return outer;
    } catch { /* */ }

    console.log('[SkillExecutor] Could not extract JSON from result, storing as raw');
    return { raw: cleaned };
  }

  cancel(executionId: string): boolean {
    const proc = this.activeProcesses.get(executionId);
    if (proc) {
      proc.kill('SIGTERM');
      this.activeProcesses.delete(executionId);
      this.runningCount--;
      // Process queue after cancel
      if (this.queue.length > 0 && this.runningCount < MAX_CONCURRENT) {
        const next = this.queue.shift()!;
        this.run(next.config, next.params, next.executionId)
          .then(next.resolve)
          .catch(next.reject);
      }
      return true;
    }
    return false;
  }

  isRunning(executionId: string): boolean {
    return this.activeProcesses.has(executionId);
  }

  /**
   * Get execution history from database.
   * Supports filtering by skill name, status, and pagination.
   */
  async getHistory(options: {
    skillName?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<SkillExecution[]> {
    const { skillName, status, limit = 50, offset = 0 } = options;

    let query = 'SELECT * FROM skill_executions WHERE 1=1';
    const params: any[] = [];

    if (skillName) {
      query += ' AND skill_name = ?';
      params.push(skillName);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    try {
      const rows = await this.db.all(query, params);
      return rows.map((row: any) => ({
        id: row.id,
        skillName: row.skill_name,
        params: row.params ? JSON.parse(row.params) : {},
        status: row.status,
        result: row.result ? JSON.parse(row.result) : undefined,
        error: row.error,
        stdout: row.stdout ?? '',
        startedAt: row.started_at,
        completedAt: row.completed_at,
      }));
    } catch (err) {
      console.error('[SkillExecutor] Failed to fetch history:', err);
      return [];
    }
  }

  /**
   * Get execution statistics by skill name.
   */
  async getStats(skillName?: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    running: number;
    avgDuration?: number;
  }> {
    let query = 'SELECT status, COUNT(*) as count FROM skill_executions';
    const params: any[] = [];

    if (skillName) {
      query += ' WHERE skill_name = ?';
      params.push(skillName);
    }

    query += ' GROUP BY status';

    try {
      const rows = await this.db.all(query, params);
      const stats: { total: number; completed: number; failed: number; running: number; avgDuration?: number } = {
        total: 0,
        completed: 0,
        failed: 0,
        running: 0,
      };

      for (const row of rows) {
        stats.total += row.count;
        if (row.status === 'completed') stats.completed = row.count;
        if (row.status === 'failed') stats.failed = row.count;
        if (row.status === 'running') stats.running = row.count;
      }

      // Calculate average duration for completed executions
      const durationQuery = skillName
        ? 'SELECT AVG(julianday(completed_at) - julianday(started_at)) * 86400 as avg_duration FROM skill_executions WHERE skill_name = ? AND status = "completed" AND completed_at IS NOT NULL'
        : 'SELECT AVG(julianday(completed_at) - julianday(started_at)) * 86400 as avg_duration FROM skill_executions WHERE status = "completed" AND completed_at IS NOT NULL';

      const durationParams = skillName ? [skillName] : [];
      const durationRow = await this.db.get(durationQuery, durationParams);
      if (durationRow?.avg_duration) {
        stats.avgDuration = Math.round(durationRow.avg_duration);
      }

      return stats;
    } catch (err) {
      console.error('[SkillExecutor] Failed to fetch stats:', err);
      return { total: 0, completed: 0, failed: 0, running: 0 };
    }
  }
}
