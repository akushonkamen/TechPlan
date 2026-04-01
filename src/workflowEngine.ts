// Workflow Engine - Chain multiple skills together with data flow

import { randomUUID } from 'crypto';
import type { SkillExecutor, SkillExecution } from './skillExecutor.js';
import type { SkillRegistry } from './skillRegistry.js';
import type { SkillWebSocket } from './websocket.js';

export interface WorkflowStep {
  skillName: string;
  params: Record<string, any>;
  // If true, workflow stops if this step fails
  stopOnError?: boolean;
  // If specified, output from this step can be referenced in subsequent steps
  outputKey?: string;
}

export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  // If true, run steps in parallel (only if no data dependencies)
  parallel?: boolean;
  // Maximum concurrent executions in parallel mode
  maxConcurrency?: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  startedAt: string;
  completedAt?: string;
  steps: WorkflowStepExecution[];
  finalResult?: any;
  error?: string;
}

export interface WorkflowStepExecution {
  step: WorkflowStep;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  executionId?: string;
  result?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  steps: Array<{
    skillName: string;
    params?: Record<string, any>;
    stopOnError?: boolean;
    outputKey?: string;
  }>;
  parallel?: boolean;
  maxConcurrency?: number;
}

export class WorkflowEngine {
  private workflows = new Map<string, WorkflowConfig>();
  private executions = new Map<string, WorkflowExecution>();
  private skillExecutor: SkillExecutor;
  private skillRegistry: SkillRegistry;
  private ws: SkillWebSocket | null = null;

  constructor(
    skillExecutor: SkillExecutor,
    skillRegistry: SkillRegistry,
  ) {
    this.skillExecutor = skillExecutor;
    this.skillRegistry = skillRegistry;
  }

  /** Inject the WebSocket instance for progress updates. */
  setWebSocket(ws: SkillWebSocket) {
    this.ws = ws;
  }

  /**
   * Register a workflow from a definition.
   */
  registerWorkflow(definition: WorkflowDefinition): string {
    const id = randomUUID();
    const workflow: WorkflowConfig = {
      id,
      name: definition.name,
      description: definition.description,
      steps: definition.steps.map(s => ({
        skillName: s.skillName,
        params: s.params ?? {},
        stopOnError: s.stopOnError ?? true,
        outputKey: s.outputKey,
      })),
      parallel: definition.parallel ?? false,
      maxConcurrency: definition.maxConcurrency ?? 3,
    };
    this.workflows.set(id, workflow);
    console.log(`[WorkflowEngine] Registered workflow: ${workflow.name} (${id})`);
    return id;
  }

  /**
   * Get a workflow by ID.
   */
  getWorkflow(id: string): WorkflowConfig | undefined {
    return this.workflows.get(id);
  }

  /**
   * List all registered workflows.
   */
  listWorkflows(): WorkflowConfig[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Execute a workflow with the given initial context.
   * Context values can be referenced in step params using {{context.key}} syntax.
   */
  async executeWorkflow(
    workflowId: string,
    context: Record<string, any> = {},
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = randomUUID();
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'pending',
      startedAt: new Date().toISOString(),
      steps: workflow.steps.map(step => ({
        step,
        status: 'pending' as const,
      })),
    };
    this.executions.set(executionId, execution);

    // Execute workflow
    try {
      execution.status = 'running';
      this.broadcastProgress(executionId, 'Workflow started');

      if (workflow.parallel) {
        await this.executeParallel(workflow, execution, context);
      } else {
        await this.executeSequential(workflow, execution, context);
      }

      // Determine final status
      const allCompleted = execution.steps.every(s => s.status === 'completed' || s.status === 'skipped');
      const anyFailed = execution.steps.some(s => s.status === 'failed');

      if (allCompleted) {
        execution.status = 'completed';
        execution.completedAt = new Date().toISOString();
      } else if (anyFailed) {
        execution.status = 'partial';
        execution.completedAt = new Date().toISOString();
      }

      this.broadcastProgress(executionId, execution.status === 'completed' ? 'Workflow completed' : 'Workflow partially completed');
    } catch (err) {
      execution.status = 'failed';
      execution.error = err instanceof Error ? err.message : String(err);
      execution.completedAt = new Date().toISOString();
      this.broadcastProgress(executionId, `Workflow failed: ${execution.error}`);
    }

    return execution;
  }

  /**
   * Get execution status by ID.
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get execution history.
   */
  getExecutionHistory(): WorkflowExecution[] {
    return Array.from(this.executions.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * Cancel a running workflow execution.
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    // Cancel all running steps
    let cancelledAny = false;
    for (const stepExec of execution.steps) {
      if (stepExec.status === 'running' && stepExec.executionId) {
        if (this.skillExecutor.cancel(stepExec.executionId)) {
          cancelledAny = true;
          stepExec.status = 'failed';
          stepExec.error = 'Cancelled';
        }
      }
    }

    if (cancelledAny) {
      execution.status = 'failed';
      execution.completedAt = new Date().toISOString();
    }

    return cancelledAny;
  }

  // ── Private methods ──

  private async executeSequential(
    workflow: WorkflowConfig,
    execution: WorkflowExecution,
    context: Record<string, any>,
  ): Promise<void> {
    const outputContext: Record<string, any> = { ...context };

    for (let i = 0; i < workflow.steps.length; i++) {
      const stepExec = execution.steps[i];
      stepExec.status = 'running';
      stepExec.startedAt = new Date().toISOString();

      this.broadcastProgress(execution.id, `Step ${i + 1}/${workflow.steps.length}: ${stepExec.step.skillName}`);

      // Resolve params with context references
      const resolvedParams = this.resolveParams(stepExec.step.params, outputContext);

      // Validate params
      const validation = this.skillRegistry.validateParams(stepExec.step.skillName, resolvedParams);
      if (!validation.valid) {
        stepExec.status = 'failed';
        stepExec.error = validation.errors?.join(', ');
        if (stepExec.step.stopOnError !== false) {
          throw new Error(`Parameter validation failed: ${stepExec.error}`);
        }
        continue;
      }

      // Execute step
      try {
        const { executionId, promise } = this.skillExecutor.startExecution(
          stepExec.step.skillName,
          resolvedParams,
        );
        stepExec.executionId = executionId;

        const result = await promise;
        stepExec.status = 'completed';
        stepExec.result = result.result;
        stepExec.completedAt = new Date().toISOString();

        // Store output in context for next steps
        if (stepExec.step.outputKey && result.result !== undefined) {
          outputContext[stepExec.step.outputKey] = result.result;
        }
      } catch (err) {
        stepExec.status = 'failed';
        stepExec.error = err instanceof Error ? err.message : String(err);
        stepExec.completedAt = new Date().toISOString();

        if (stepExec.step.stopOnError !== false) {
          throw err;
        }
      }
    }

    // Store final result
    execution.finalResult = outputContext;
  }

  private async executeParallel(
    workflow: WorkflowConfig,
    execution: WorkflowExecution,
    context: Record<string, any>,
  ): Promise<void> {
    const maxConcurrency = workflow.maxConcurrency ?? 3;
    const outputContext: Record<string, any> = { ...context };

    // Group steps by concurrency slot
    for (let i = 0; i < workflow.steps.length; i += maxConcurrency) {
      const batch = workflow.steps.slice(i, i + maxConcurrency);
      const batchExecutions = execution.steps.slice(i, i + maxConcurrency);

      // Execute batch in parallel
      await Promise.all(
        batch.map(async (step, idx) => {
          const stepExec = batchExecutions[idx];
          stepExec.status = 'running';
          stepExec.startedAt = new Date().toISOString();

          this.broadcastProgress(execution.id, `Step: ${step.skillName}`);

          // Resolve params with context references
          const resolvedParams = this.resolveParams(step.params, outputContext);

          // Validate params
          const validation = this.skillRegistry.validateParams(step.skillName, resolvedParams);
          if (!validation.valid) {
            stepExec.status = 'failed';
            stepExec.error = validation.errors?.join(', ');
            return;
          }

          // Execute step
          try {
            const { executionId, promise } = this.skillExecutor.startExecution(
              step.skillName,
              resolvedParams,
            );
            stepExec.executionId = executionId;

            const result = await promise;
            stepExec.status = 'completed';
            stepExec.result = result.result;
            stepExec.completedAt = new Date().toISOString();

            // Store output in context
            if (step.outputKey && result.result !== undefined) {
              outputContext[step.outputKey] = result.result;
            }
          } catch (err) {
            stepExec.status = 'failed';
            stepExec.error = err instanceof Error ? err.message : String(err);
            stepExec.completedAt = new Date().toISOString();
          }
        }),
      );
    }

    execution.finalResult = outputContext;
  }

  /**
   * Resolve parameter references like {{context.key}} or {{steps.previousStep.outputKey}}.
   */
  private resolveParams(
    params: Record<string, any>,
    context: Record<string, any>,
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      resolved[key] = this.resolveValue(value, context);
    }

    return resolved;
  }

  private resolveValue(value: any, context: Record<string, any>): any {
    if (typeof value === 'string') {
      // Replace {{context.key}} and {{steps.key}} references
      return value.replace(/\{\{(context|steps)\.([^}]+)\}\}/g, (_, source, path) => {
        if (source === 'context') {
          return this.getNestedValue(context, path);
        }
        return value; // Keep original if not found
      });
    }

    if (Array.isArray(value)) {
      return value.map(v => this.resolveValue(v, context));
    }

    if (typeof value === 'object' && value !== null) {
      const resolved: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = this.resolveValue(v, context);
      }
      return resolved;
    }

    return value;
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return ''; // Return empty string if path not found
      }
    }
    return current;
  }

  private broadcastProgress(executionId: string, message: string) {
    this.ws?.send(executionId, 'progress', `[Workflow] ${message}`);
  }
}

// ── Predefined Workflows ──

/**
 * Create the standard research -> extract -> sync-graph workflow.
 */
export function createResearchWorkflow(): WorkflowDefinition {
  return {
    name: 'Full Research Pipeline',
    description: 'Collect documents, extract knowledge, and sync to graph',
    steps: [
      {
        skillName: 'research',
        params: {
          topicId: '{{context.topicId}}',
          topicName: '{{context.topicName}}',
          keywords: '{{context.keywords}}',
        },
        stopOnError: true,
        outputKey: 'researchResult',
      },
      {
        skillName: 'extract',
        params: {
          topicId: '{{context.topicId}}',
          extractTypes: '{{context.extractTypes}}',
        },
        stopOnError: true,
        outputKey: 'extractResult',
      },
      {
        skillName: 'sync-graph',
        params: {
          topicId: '{{context.topicId}}',
        },
        stopOnError: false,
        outputKey: 'syncResult',
      },
    ],
    parallel: false,
  };
}

/**
 * Create a competitor tracking workflow.
 */
export function createCompetitorWorkflow(): WorkflowDefinition {
  return {
    name: 'Competitor Tracking',
    description: 'Research competitor, extract entities, and generate analysis',
    steps: [
      {
        skillName: 'track-competitor',
        params: {
          topicId: '{{context.topicId}}',
          competitorName: '{{context.competitorName}}',
        },
        stopOnError: true,
        outputKey: 'trackingResult',
      },
      {
        skillName: 'extract',
        params: {
          topicId: '{{context.topicId}}',
          extractTypes: '["organization", "technology", "investment"]',
        },
        stopOnError: true,
      },
      {
        skillName: 'report-competitor',
        params: {
          topicId: '{{context.topicId}}',
          competitorName: '{{context.competitorName}}',
        },
        stopOnError: false,
      },
    ],
    parallel: false,
  };
}
