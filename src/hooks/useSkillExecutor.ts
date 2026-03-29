// Unified skill executor hook for triggering Claude Code skills via WebSocket

import { useState, useCallback, useRef, useEffect } from 'react';

export interface SkillExecutionState {
  executionId: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'timeout';
  progress: string[];
  result: any;
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
            try {
              const result = JSON.parse(msg.data);
              setState(prev => ({
                ...prev,
                status: 'completed',
                result,
              }));
            } catch {
              setState(prev => ({
                ...prev,
                status: 'completed',
                result: { raw: msg.data },
              }));
            }
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

  const execute = useCallback(async (skillName: string, params: Record<string, any> = {}) => {
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
              setState(prev => ({
                ...prev,
                status: statusData.status,
                result: statusData.result ? JSON.parse(statusData.result) : null,
                error: statusData.error,
              }));
            }
          }
        } catch {
          // Polling is a fallback, ignore errors
        }
      };

      // Poll every 2 seconds for up to 5 minutes
      const pollInterval = setInterval(pollStatus, 2000);
      const timeout = setTimeout(() => {
        clearInterval(pollInterval);
        setState(prev => {
          if (prev.status === 'running') {
            return { ...prev, status: 'timeout', error: 'Execution timed out' };
          }
          return prev;
        });
      }, 300000);

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
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: err.message,
      }));
    }
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

  return { ...state, execute, cancel, reset };
}
