// API hooks for skill management endpoints

import { useState, useEffect, useCallback } from 'react';

// Type definitions matching backend API responses
export interface SkillParamDef {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
  default?: any;
}

export interface SkillConfig {
  name: string;
  displayName: string;
  description: string;
  category: string;
  version: string;
  params: SkillParamDef[];
  steps: string[];
  promptTemplate: string;
  timeout: number;
}

export interface SkillVersion {
  id: string;
  skill_name: string;
  version: string;
  content: string;
  changelog: string | null;
  created_at: string;
}

export interface OptimizationConfig {
  id: string;
  skill_name: string;
  evaluation_criteria: string;
  max_iterations: number;
  convergence_threshold: number;
  focus_area: string;
  custom_params: string | null;
  updated_at: string;
}

export interface OptimizationHistoryEntry {
  id: string;
  skill_name: string;
  iterations_completed: number;
  converged: number;
  peak_score: number;
  final_score: number;
  lessons_extracted: number;
  result_summary: string | null;
  created_at: string;
}

// Fetch all skills
export function useSkillsList() {
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error('Failed to fetch skills');
      const data = await res.json();
      setSkills(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  return { skills, loading, error, refetch: fetchSkills };
}

// Fetch single skill detail
export function useSkillDetail(name: string) {
  const [skill, setSkill] = useState<SkillConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) {
      setLoading(false);
      return;
    }

    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/skills/${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error('Failed to fetch skill detail');
        const data = await res.json();
        setSkill(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [name]);

  return { skill, loading, error };
}

// Fetch skill versions
export function useSkillVersions(name: string) {
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    if (!name) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}/versions`);
      if (!res.ok) throw new Error('Failed to fetch versions');
      const data = await res.json();
      setVersions(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  return { versions, loading, error, refetch: fetchVersions };
}

// Fetch optimization config for a skill
export function useOptimizationConfig(name: string) {
  const [config, setConfig] = useState<OptimizationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!name) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}/optimization/config`);
      if (!res.ok) throw new Error('Failed to fetch optimization config');
      const data = await res.json();
      setConfig(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const save = useCallback(async (newConfig: Partial<OptimizationConfig>) => {
    if (!name) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}/optimization/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (!res.ok) throw new Error('Failed to save optimization config');
      const data = await res.json();
      if (data && data.skill_name) {
        setConfig(data);
      } else {
        await fetchConfig();
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [name]);

  return { config, loading, error, save, saving, refetch: fetchConfig };
}

// Fetch optimization history for a skill
export function useOptHistory(name: string) {
  const [history, setHistory] = useState<OptimizationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) {
      setLoading(false);
      return;
    }

    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/skills/${encodeURIComponent(name)}/optimization/history`);
        if (!res.ok) throw new Error('Failed to fetch optimization history');
        const data = await res.json();
        setHistory(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [name]);

  return { history, loading, error };
}
