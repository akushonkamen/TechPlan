// Convenience hooks for specific skills

import { useCallback } from 'react';
import { useSkillExecutor } from './useSkillExecutor';

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
