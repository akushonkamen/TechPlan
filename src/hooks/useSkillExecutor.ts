// Unified skill executor hook for triggering Claude Code skills via WebSocket

import { useState, useCallback, useRef, useEffect } from 'react';

export interface SkillResult {
  totalCollected?: number;
  extractionStats?: { entities?: number; relations?: number };
  title?: string;
  raw?: string;
  [key: string]: unknown;
}

export interface SkillExecutionState {
  executionId: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'timeout';
  progress: string[];
  result: SkillResult | null;
  error: string | null;
  startedAt: string | null;
}

const WS_URL = `ws://${window.location.host}/ws`;

export function useSkillExecutor() {
  const [state, setState] = useState<SkillExecutionState>({
    executionId: null,
    status: 'idle',
    progress: [],
    result: null,
    error: null,
    startedAt: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const progressRef = useRef<string[]>([]);
  const startTimeRef = useRef<number>(0);

  const connectWebSocket = useCallback((executionId: string) => {
    return new Promise<void>((resolve) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', executionId }));
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.executionId !== executionId) return;

          if (msg.type === 'progress') {
            progressRef.current = [...progressRef.current, msg.data];
            setState(prev => ({
              ...prev,
              progress: progressRef.current,
            }));
          } else if (msg.type === 'result') {
            let parsedResult = null;
            try {
              parsedResult = JSON.parse(msg.data);
            } catch {
              // Malformed JSON, keep as raw data
            }
            setState(prev => ({
              ...prev,
              status: 'completed',
              result: parsedResult ?? { raw: msg.data },
            }));
            ws.close();
          } else if (msg.type === 'error') {
            setState(prev => ({
              ...prev,
              status: 'failed',
              error: msg.data,
            }));
            ws.close();
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        setState(prev => ({
          ...prev,
          status: 'failed',
          error: 'WebSocket connection failed',
        }));
      };

      ws.onclose = () => {
        wsRef.current = null;
      };
    });
  }, []);

  const execute = useCallback(async (skillName: string, params: Record<string, any> = {}, options?: { timeoutMs?: number }) => {
    progressRef.current = [];
    const startedAt = new Date().toISOString();
    setState({
      executionId: null,
      status: 'running',
      progress: [],
      result: null,
      error: null,
      startedAt,
    });

    try {
      // Start skill execution
      const response = await fetch(`/api/skill/${skillName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start skill');
      }

      const { executionId } = await response.json();

      setState(prev => ({
        ...prev,
        executionId,
      }));

      // Connect WebSocket for progress
      await connectWebSocket(executionId);

      // Also poll for final status as fallback
      const pollStatus = async () => {
        try {
          const statusRes = await fetch(`/api/skill/${executionId}/status`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status === 'completed' || statusData.status === 'failed') {
              let parsedResult = null;
              try {
                if (statusData.result) parsedResult = JSON.parse(statusData.result);
              } catch {
                // Ignore malformed JSON
              }
              setState(prev => ({
                ...prev,
                status: statusData.status,
                result: parsedResult,
                error: statusData.error,
              }));
            }
          }
        } catch {
          // Polling is a fallback, ignore errors
        }
      };

      // Poll every 2 seconds for up to timeout (default 5 minutes)
      const timeoutMs = options?.timeoutMs ?? 300000;
      const pollInterval = setInterval(pollStatus, 2000);
      const timeout = setTimeout(() => {
        clearInterval(pollInterval);
        setState(prev => {
          if (prev.status === 'running') {
            return { ...prev, status: 'timeout', error: 'Execution timed out' };
          }
          return prev;
        });
      }, timeoutMs);

      // Clean up when status changes
      const checkDone = setInterval(() => {
        setState(prev => {
          if (prev.status !== 'running') {
            clearInterval(pollInterval);
            clearInterval(checkDone);
            clearTimeout(timeout);
          }
          return prev;
        });
      }, 1000);
    } catch (err: unknown) {
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [connectWebSocket]);

  const connectOnly = useCallback((executionId: string, options?: { timeoutMs?: number }) => {
    progressRef.current = [];
    const startedAt = new Date().toISOString();
    setState({
      executionId,
      status: 'running',
      progress: [],
      result: null,
      error: null,
      startedAt,
    });

    // Connect WebSocket for progress
    connectWebSocket(executionId);

    // Also poll for final status as fallback
    const pollStatus = async () => {
      try {
        const statusRes = await fetch(`/api/skill/${executionId}/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.status === 'completed' || statusData.status === 'failed') {
            let parsedResult = null;
            try {
              if (statusData.result) parsedResult = JSON.parse(statusData.result);
            } catch {
              // Ignore malformed JSON
            }
            setState(prev => ({
              ...prev,
              status: statusData.status,
              result: parsedResult,
              error: statusData.error,
            }));
          }
        }
      } catch {
        // Polling is a fallback, ignore errors
      }
    };

    // Poll every 2 seconds for up to timeout (default 5 minutes)
    const timeoutMs = options?.timeoutMs ?? 300000;
    const pollInterval = setInterval(pollStatus, 2000);
    const timeout = setTimeout(() => {
      clearInterval(pollInterval);
      setState(prev => {
        if (prev.status === 'running') {
          return { ...prev, status: 'timeout', error: 'Execution timed out' };
        }
        return prev;
      });
    }, timeoutMs);

    // Clean up when status changes
    const checkDone = setInterval(() => {
      setState(prev => {
        if (prev.status !== 'running') {
          clearInterval(pollInterval);
          clearInterval(checkDone);
          clearTimeout(timeout);
        }
        return prev;
      });
    }, 1000);
  }, [connectWebSocket]);

  const cancel = useCallback(async () => {
    if (state.executionId) {
      await fetch(`/api/skill/${state.executionId}/cancel`, { method: 'POST' });
      wsRef.current?.close();
      setState(prev => ({ ...prev, status: 'idle' }));
    }
  }, [state.executionId]);

  const reset = useCallback(() => {
    setState({
      executionId: null,
      status: 'idle',
      progress: [],
      result: null,
      error: null,
      startedAt: null,
    });
    progressRef.current = [];
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return { ...state, execute, connectOnly, cancel, reset };
}
