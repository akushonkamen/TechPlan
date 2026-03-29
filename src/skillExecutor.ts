// Skill Executor - Spawns Claude Code CLI to execute skills

import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { SkillRegistry } from "./skillRegistry.js";

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

// Escape a string for use as a shell argument (single-quoted, safe for bash)
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

interface QueuedExecution {
  config: { name: string; prompt: string; timeout: number };
  params: Record<string, any>;
  resolve: (execution: SkillExecution) => void;
  reject: (error: Error) => void;
}

export class SkillExecutor {
  private activeProcesses = new Map<string, ChildProcess>();
  private runningCount = 0;
  private queue: QueuedExecution[] = [];
  // In-memory progress store — keyed by executionId
  private progressLines = new Map<string, string[]>();

  constructor(
    private registry: SkillRegistry,
    private db: any,
  ) {}

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

    const promise = this.runWithId(executionId, { name: skillName, prompt, timeout: config.timeout }, params);

    return { executionId, promise };
  }

  private runWithId(
    executionId: string,
    config: { name: string; prompt: string; timeout: number },
    params: Record<string, any>,
  ): Promise<SkillExecution> {
    return this.run(config, params, executionId);
  }

  private run(
    config: { name: string; prompt: string; timeout: number },
    params: Record<string, any>,
    preassignedId?: string,
  ): Promise<SkillExecution> {
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

    // Record in DB
    this.db.run(
      `INSERT INTO skill_executions (id, skill_name, params, status, started_at) VALUES (?, ?, ?, 'running', ?)`,
      [execution.id, execution.skillName, JSON.stringify(params), execution.startedAt],
    ).catch((err: Error) => console.error('[SkillExecutor] DB insert error:', err));

    return new Promise<SkillExecution>((resolve) => {
      const appendProgress = (line: string) => {
        const arr = this.progressLines.get(execution.id);
        if (arr) {
          arr.push(line);
        }
      };

      // claude CLI requires a TTY to output data.
      // Wrap with `script` to provide a pseudo-terminal.
      const claudeCmd = `claude -p ${shellEscape(config.prompt)} --output-format stream-json --verbose --dangerously-skip-permissions`;

      const proc = spawn('script', [
        '-q', '-c', claudeCmd, '/dev/null',
      ], {
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

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
        const lines = chunk.split('\n').filter(l => l.trim());
        for (const line of lines) {
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
              execution.result = parsed;
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
            try {
              execution.result = JSON.parse(stdout);
            } catch {
              execution.result = { raw: stdout.slice(-2000) };
            }
          }
        } else if (execution.status !== 'timeout') {
          execution.status = 'failed';
          execution.error = stderr || `Process exited with code ${code}`;
          appendProgress(`失败: ${execution.error.slice(0, 150)}`);
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

    resolve(execution);

    // Keep progress lines for 5 minutes after completion, then clean up
    setTimeout(() => {
      this.progressLines.delete(execution.id);
    }, 5 * 60 * 1000);

    // Process queue
    if (this.queue.length > 0 && this.runningCount < MAX_CONCURRENT) {
      const next = this.queue.shift()!;
      this.run(next.config, next.params)
        .then(next.resolve)
        .catch(next.reject);
    }
  }

  cancel(executionId: string): boolean {
    const proc = this.activeProcesses.get(executionId);
    if (proc) {
      proc.kill('SIGTERM');
      this.activeProcesses.delete(executionId);
      return true;
    }
    return false;
  }

  isRunning(executionId: string): boolean {
    return this.activeProcesses.has(executionId);
  }
}
