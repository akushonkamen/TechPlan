import { useCallback } from 'react';
import { useSkillExecutor } from './useSkillExecutor';

export interface ExpandDiscussionParams {
  topicId: string;
  selectedText: string;
  sectionTitle?: string;
  sectionThesis?: string;
  userInput?: string;
  reportType?: string;
}

export function useExpandDiscussion() {
  const executor = useSkillExecutor();

  const expand = useCallback(async (params: ExpandDiscussionParams) => {
    return executor.execute('expand-discussion', {
      topicId: params.topicId,
      selectedText: params.selectedText,
      sectionTitle: params.sectionTitle ?? '',
      sectionThesis: params.sectionThesis ?? '',
      userInput: params.userInput ?? '',
      reportType: params.reportType ?? '',
    }, { timeoutMs: 180000 });
  }, [executor.execute]);

  return {
    ...executor,
    expand,
  };
}
