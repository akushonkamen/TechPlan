// Convenience hooks for specific skills

import { useCallback } from 'react';
import { useSkillExecutor } from './useSkillExecutor';

export function useResearch() {
  const executor = useSkillExecutor();

  const research = useCallback(async (params: {
    topicId: string;
    topicName: string;
    keywords: string[];
    organizations?: string[];
    maxResults?: number;
  }) => {
    return executor.execute('research', {
      topicId: params.topicId,
      topicName: params.topicName,
      keywords: JSON.stringify(params.keywords),
      organizations: JSON.stringify(params.organizations ?? []),
      maxResults: params.maxResults ?? 10,
    });
  }, [executor.execute]);

  return { ...executor, research };
}

export function useExtraction() {
  const executor = useSkillExecutor();

  const extract = useCallback(async (params: {
    topicId: string;
    documentIds?: string[];
    extractTypes?: string;
  }) => {
    return executor.execute('extract', {
      topicId: params.topicId,
      documentIds: params.documentIds ? JSON.stringify(params.documentIds) : '',
      extractTypes: params.extractTypes ?? 'entities,relations,claims,events',
    });
  }, [executor.execute]);

  return { ...executor, extract };
}

export function useReportGeneration() {
  const executor = useSkillExecutor();

  const generateReport = useCallback(async (params: {
    topicId: string;
    topicName: string;
    reportType: string;
    timeRangeStart?: string;
    timeRangeEnd?: string;
  }) => {
    return executor.execute('report', {
      topicId: params.topicId,
      topicName: params.topicName,
      reportType: params.reportType,
      timeRangeStart: params.timeRangeStart ?? '',
      timeRangeEnd: params.timeRangeEnd ?? '',
    });
  }, [executor.execute]);

  return { ...executor, generateReport };
}

export function useGraphSync() {
  const executor = useSkillExecutor();

  const syncGraph = useCallback(async (params: { topicId: string }) => {
    return executor.execute('sync-graph', {
      topicId: params.topicId,
    });
  }, [executor.execute]);

  return { ...executor, syncGraph };
}

export function useCompetitorTracking() {
  const executor = useSkillExecutor();

  const trackCompetitor = useCallback(async (params: {
    organization: string;
    topicContext?: string;
    focusAreas?: string;
  }) => {
    return executor.execute('track-competitor', {
      organization: params.organization,
      topicContext: params.topicContext ?? '',
      focusAreas: params.focusAreas ?? 'roadmaps,repos,press_releases,technology,partnerships',
    });
  }, [executor.execute]);

  return { ...executor, trackCompetitor };
}

export function useBilevelOptimization() {
  const executor = useSkillExecutor();

  const optimize = useCallback(async (params: {
    skillName: string;
    evaluationCriteria?: string;
    maxIterations?: number;
    convergenceThreshold?: number;
  }) => {
    return executor.execute('optimize', {
      skillName: params.skillName,
      evaluationCriteria: params.evaluationCriteria ?? 'relevance,depth,accuracy',
      maxIterations: params.maxIterations ?? 10,
      convergenceThreshold: params.convergenceThreshold ?? 8,
    });
  }, [executor.execute]);

  return { ...executor, optimize };
}
