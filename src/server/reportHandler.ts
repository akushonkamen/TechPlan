/**
 * Report pipeline utility functions.
 * Used by the scheduler and HTTP endpoints for report generation and persistence.
 */
import fs from 'fs';
import path from 'path';
import type { SkillExecution } from '../skillExecutor.js';
import { validateReportOutput } from '../schemas/report.js';

// ── Robust multi-level JSON repair parser ──

function tryParseReportJson(str: string): any {
  if (!str || typeof str !== 'string') return null;
  let cleaned = str.trim();
  const fm = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fm) cleaned = fm[1].trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  let candidate = cleaned.slice(first, last + 1);

  // Strategy: try multiple repair levels
  const repairs = [
    // Level 0: direct parse
    candidate,
    // Level 1: trailing commas + control chars
    candidate
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''),
    // Level 2: line-based newline escaping inside strings
    (() => {
      const lines = candidate.split('\n');
      const fixed: string[] = [];
      let inStr = false;
      for (const line of lines) {
        const qc = (line.match(/(?<!\\)"/g) || []).length;
        if (!inStr) {
          fixed.push(line);
          if (qc % 2 === 1) inStr = true;
        } else {
          fixed.push('\\n' + line);
          if (qc % 2 === 1) inStr = false;
        }
      }
      return fixed.join('\n')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\t/g, '\\t');
    })(),
    // Level 3: aggressive — escape ALL newlines that look like they're inside strings
    candidate
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
      // Replace literal newlines inside JSON string values
      .split('\n').map((line, i, arr) => {
        // Count open quotes up to this line
        const soFar = arr.slice(0, i + 1).join('').replace(/\\"/g, '');
        const quoteCount = (soFar.match(/"/g) || []).length;
        // If odd number of quotes, we're inside a string
        if (quoteCount % 2 === 1 && i > 0) return '\\n' + line;
        return line;
      }).join(''),
    // Level 4: fix unclosed strings — when a line starts a new JSON property but we're inside a string
    (() => {
      const lines = candidate.split('\n');
      const fixed: string[] = [];
      let inStr = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const qc = (line.match(/(?<!\\)"/g) || []).length;
        const newProp = /^\s*"[a-zA-Z_]+":\s*/.test(line.trim());
        // If inside a string and next line looks like a new property, close the string
        if (inStr && newProp) {
          // Append closing quote + comma to previous line
          if (fixed.length > 0) {
            const prev = fixed[fixed.length - 1].trimEnd();
            fixed[fixed.length - 1] = prev + '"' + (prev.endsWith(',') ? '' : ',');
          }
          inStr = false;
          fixed.push(line);
          if (qc % 2 === 1) inStr = true;
        } else if (!inStr) {
          fixed.push(line);
          if (qc % 2 === 1) inStr = true;
        } else {
          fixed.push('\\n' + line);
          if (qc % 2 === 1) inStr = false;
        }
      }
      return fixed.join('\n')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\t/g, '\\t');
    })(),
    // Level 5: escape unescaped quotes inside JSON string values
    (() => {
      let result = '';
      let inString = false;
      let i = 0;
      while (i < candidate.length) {
        const ch = candidate[i];
        if (ch === '\\' && inString && i + 1 < candidate.length) {
          result += ch + candidate[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') {
          if (!inString) {
            inString = true;
            result += '"';
          } else {
            const afterStr = candidate.slice(i + 1).replace(/^\s+/, '');
            if (/^[,}\]:]/.test(afterStr) || afterStr === '' || /^:/.test(afterStr)) {
              inString = false;
              result += '"';
            } else {
              result += '\\"';
            }
          }
        } else {
          result += ch;
        }
        i++;
      }
      return result;
    })(),
  ];

  for (const repaired of repairs) {
    try {
      const obj = JSON.parse(repaired);
      if (obj && typeof obj === 'object') return obj;
    } catch { /* try next repair */ }
  }

  // Last resort: find the deepest nested JSON with "title" or "sections"
  const titleIdx = candidate.indexOf('"title"');
  if (titleIdx > -1) {
    // Walk back to find enclosing {
    let depth = 0, start = -1;
    for (let i = titleIdx; i >= 0; i--) {
      if (candidate[i] === '}') depth++;
      if (candidate[i] === '{') { depth--; if (depth < 0) { start = i; break; } }
    }
    if (start >= 0) {
      for (const repaired of repairs.slice(0, 3)) {
        const sub = repaired.slice(start);
        const lastBrace = sub.lastIndexOf('}');
        if (lastBrace > 0) {
          try {
            const obj = JSON.parse(sub.slice(0, lastBrace + 1));
            if (obj && typeof obj === 'object') return obj;
          } catch { /* continue */ }
        }
      }
    }
  }

  return null;
}

function readReportOutputFile(): any {
  const filePath = path.join(process.cwd(), 'report-output.json');
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const report = tryParseReportJson(raw);
    if (report) {
      fs.unlinkSync(filePath);
      console.log('[Report] Recovered report from report-output.json');
    }
    return report;
  } catch (error: any) {
    console.error('[Report] Failed to read report-output.json:', error?.message);
    return null;
  }
}

function extractReportFromStdout(stdout: string): any {
  if (!stdout) return null;
  const clean = stdout.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  const lines = clean.split('\n');

  // Strategy 1: Scan stream-json "result" lines from end
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'result' && parsed.result) {
        const resultStr = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
        const report = tryParseReportJson(resultStr);
        if (report) return report;
      }
    } catch { /* not a JSON line */ }
  }

  // Strategy 2: Scan assistant text blocks for report JSON
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || !line.includes('"sections"')) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'assistant' && parsed.message?.content) {
        for (const block of parsed.message.content) {
          if (block.type === 'text' && block.text) {
            const report = tryParseReportJson(block.text);
            if (report) return report;
          }
        }
      }
    } catch { /* not a JSON line */ }
  }

  // Strategy 3: Brute-force — find "sections" key and extract enclosing JSON
  const sectionsIdx = clean.indexOf('"sections"');
  if (sectionsIdx > -1) {
    let braceCount = 0, start = -1;
    for (let i = sectionsIdx; i >= 0; i--) {
      if (clean[i] === '}') braceCount++;
      if (clean[i] === '{') { braceCount--; if (braceCount < 0) { start = i; break; } }
    }
    if (start >= 0) {
      braceCount = 0;
      for (let i = start; i < clean.length; i++) {
        if (clean[i] === '{') braceCount++;
        if (clean[i] === '}') { braceCount--; if (braceCount === 0) {
          const report = tryParseReportJson(clean.slice(start, i + 1));
          if (report) return report;
          break;
        } }
      }
    }
  }
  return null;
}

// ── Convert nested JSON objects to readable Markdown ──
function jsonToMarkdown(obj: any, depth = 0): string {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(item => typeof item === 'object' && item !== null ? `- ${jsonToMarkdown(item, depth + 1)}` : `- ${item}`).join('\n');
  if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj)
      .map(([key, val]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase());
        if (typeof val === 'string') return `**${label}**: ${val}`;
        if (Array.isArray(val)) {
          const items = val.map((item: any) => typeof item === 'object' && item !== null ? `- ${jsonToMarkdown(item, depth + 1)}` : `- ${item}`).join('\n');
          return `**${label}**:\n${items}`;
        }
        return `**${label}**:\n${jsonToMarkdown(val, depth + 1)}`;
      })
      .join('\n\n');
  }
  return String(obj);
}

// ── Parse markdown summary into basic report structure ──
function parseMarkdownReport(markdown: string): { overview: string; keyPoints: string[]; sections: any[] } | null {
  if (!markdown || markdown.length < 100) return null;

  const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);

  // Extract overview: first substantial paragraph (not a heading, not a list item)
  let overview = '';
  for (const line of lines) {
    if (line.length > 30 && !line.startsWith('#') && !line.startsWith('```') && !line.startsWith('{') && !line.startsWith('|') && !line.startsWith('-') && !line.startsWith('*') && !/^\d+\./.test(line)) {
      overview = line.replace(/\*\*/g, '');
      break;
    }
  }

  // Extract key points: numbered items like "1. **突破**：..."
  const keyPoints: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+\*\*(.+?)\*\*[：:]\s*(.+)/);
    if (match) {
      keyPoints.push(`${match[1]}：${match[2]}`);
    }
  }

  // Split into sections by **bold headings**
  const sections: any[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^\*\*(.+?)\*\*[：:]?\s*(.*)/);
    if (headingMatch && headingMatch[1].length <= 20) {
      // Flush previous section
      if (currentTitle && currentLines.length > 0) {
        sections.push({
          id: `md_section_${sections.length}`,
          title: currentTitle,
          thesis: '',
          content: currentLines.join('\n'),
          highlights: currentLines.filter(l => l.startsWith('-') || /^\d+\./.test(l)).map(l => l.replace(/^[-\d.]+\s*/, '')),
          signals: [],
          entityRefs: [],
        });
      }
      currentTitle = headingMatch[1];
      currentLines = headingMatch[2] ? [headingMatch[2]] : [];
    } else if (currentTitle) {
      currentLines.push(line.replace(/\*\*/g, ''));
    }
  }
  // Flush last section
  if (currentTitle && currentLines.length > 0) {
    sections.push({
      id: `md_section_${sections.length}`,
      title: currentTitle,
      thesis: '',
      content: currentLines.join('\n'),
      highlights: currentLines.filter(l => l.startsWith('-') || /^\d+\./.test(l)).map(l => l.replace(/^[-\d.]+\s*/, '')),
      signals: [],
      entityRefs: [],
    });
  }

  // If no sections found but we have key points, create a single analysis section
  if (sections.length === 0 && keyPoints.length > 0) {
    sections.push({
      id: 'md_analysis',
      title: '分析发现',
      thesis: '',
      content: lines.join('\n'),
      highlights: keyPoints,
      signals: [],
      entityRefs: [],
    });
  }

  if (!overview && sections.length === 0) return null;

  return { overview, keyPoints, sections };
}

// ── Report type to skill mapping ──

export const REPORT_TYPE_TO_SKILL: Record<string, string> = {
  daily: 'report-daily',
  weekly: 'report',
  monthly: 'report-monthly',
  quarterly: 'report-quarterly',
  tech_topic: 'report-tech-topic',
  competitor: 'report-competitor',
  alert: 'report-alert',
};

/**
 * Compute time period for a report type.
 * Supports custom start/end, presets ("24h", "7d", "30d", "90d", "1y"), and report type defaults.
 */
export function computePeriod(
  reportType: string,
  period?: { start?: string; end?: string; preset?: string }
): { start: string; end: string; preset?: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDateTime = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`;

  if (period?.start && period?.end) {
    return { start: period.start, end: period.end, preset: period.preset };
  }

  if (period?.preset) {
    const preset = period.preset.toLowerCase();
    switch (preset) {
      case '24h':
      case '1d': {
        const start = fmtDateTime(new Date(now.getTime() - 24 * 60 * 60 * 1000));
        return { start, end: fmtDateTime(now), preset: period.preset };
      }
      case '7d': {
        const start = fmtDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
        return { start, end: fmtDate(now), preset: period.preset };
      }
      case '30d': {
        const start = fmtDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
        return { start, end: fmtDate(now), preset: period.preset };
      }
      case '90d': {
        const start = fmtDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
        return { start, end: fmtDate(now), preset: period.preset };
      }
      case '1y':
      case '365d': {
        const start = fmtDate(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000));
        return { start, end: fmtDate(now), preset: period.preset };
      }
      default:
        console.warn(`[computePeriod] Unknown preset: ${period.preset}, falling back to reportType default`);
        break;
    }
  }

  switch (reportType) {
    case 'daily': {
      const today = fmtDate(now);
      return { start: today, end: today, preset: 'daily' };
    }
    case 'weekly': {
      const weekAgo = fmtDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      return { start: weekAgo, end: fmtDate(now), preset: 'weekly' };
    }
    case 'monthly': {
      const start = fmtDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
      return { start, end: fmtDate(now), preset: 'monthly' };
    }
    case 'quarterly': {
      const start = fmtDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
      return { start, end: fmtDate(now), preset: 'quarterly' };
    }
    case 'tech_topic': {
      const start = fmtDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
      return { start, end: fmtDate(now), preset: '30d' };
    }
    case 'competitor': {
      const start = fmtDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
      return { start, end: fmtDate(now), preset: '90d' };
    }
    case 'alert': {
      const start = fmtDateTime(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));
      return { start, end: fmtDateTime(now), preset: '24h' };
    }
    default: {
      const weekAgo = fmtDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      return { start: weekAgo, end: fmtDate(now), preset: 'weekly' };
    }
  }
}

// ── Exported utility functions ──

/**
 * Trigger automatic data collection for a time period.
 * This runs the research skill with deduplication and time-range filtering.
 */
export async function triggerCollectionForPeriod(
  db: any,
  skillExecutor: any,
  topicId: string,
  topicName: string,
  periodStart: string,
  periodEnd: string,
  keywords: string[] = [],
  organizations: string[] = []
): Promise<{ executionId: string; extractExecutionId?: string; syncExecutionId?: string; collected: number; duplicatesSkipped: number; extracted?: boolean; synced?: boolean }> {
  // Get topic details for collection
  const topic = await db.get(
    "SELECT keywords, organizations FROM topics WHERE id = ?",
    [topicId]
  );

  const topicKeywords = keywords.length > 0
    ? keywords
    : (topic?.keywords ? JSON.parse(topic.keywords) : []);

  const topicOrgs = organizations.length > 0
    ? organizations
    : (topic?.organizations ? JSON.parse(topic.organizations) : []);

  // Check for existing documents in the period to assess coverage
  const existingDocs = await db.get(
    `SELECT COUNT(*) as count FROM documents
     WHERE topic_id = ? AND published_date >= ? AND published_date <= ?`,
    [topicId, periodStart, periodEnd]
  );
  const existingCount = existingDocs?.count || 0;

  // Skip collection if we already have sufficient coverage (configurable threshold)
  const MIN_DOCS_THRESHOLD = 5;
  if (existingCount >= MIN_DOCS_THRESHOLD) {
    console.log(`[Collection] Skipping collection for topic ${topicId}: ${existingCount} docs already exist in period`);
    return { executionId: 'skip', collected: 0, duplicatesSkipped: 0, extracted: false, synced: false };
  }

  // Helper: run a skill and wait for completion (with timeout)
  const runSkill = async (skillName: string, params: Record<string, any>, timeoutMs = 600000) => {
    const { executionId, promise } = skillExecutor.startExecution(skillName, params);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${skillName} timeout`)), timeoutMs)
    );
    try {
      await Promise.race([promise, timeout]) as any;
      console.log(`[Collection] ${skillName} completed for topic ${topicId}`);
      return { executionId, success: true };
    } catch (err: any) {
      console.error(`[Collection] ${skillName} failed:`, err?.message || err);
      return { executionId, success: false };
    }
  };

  // Phase 1: Research — collect documents
  const researchResult = await runSkill('research', {
    topicId,
    topicName,
    keywords: JSON.stringify(topicKeywords),
    organizations: JSON.stringify(topicOrgs),
    timeRangeStart: periodStart,
    timeRangeEnd: periodEnd,
    maxResults: 20,
  });

  // Count new documents collected
  const newDocs = await db.get(
    `SELECT COUNT(*) as count FROM documents
     WHERE topic_id = ? AND published_date >= ? AND published_date <= ?`,
    [topicId, periodStart, periodEnd]
  );
  const collected = (newDocs?.count || 0) - existingCount;

  // Phase 2: Extract — only if research collected new documents
  let extractResult = { executionId: '', success: false };
  if (collected > 0) {
    extractResult = await runSkill('extract', {
      topicId,
      extractTypes: 'entities,relations,claims,events',
    });
  } else {
    console.log(`[Collection] Skipping extract: no new documents for topic ${topicId}`);
  }

  // Phase 3: Sync Graph — only if extract succeeded
  let syncResult = { executionId: '', success: false };
  if (extractResult.success) {
    syncResult = await runSkill('sync-graph', { topicId });
  } else {
    console.log(`[Collection] Skipping sync-graph: extract did not succeed for topic ${topicId}`);
  }

  return {
    executionId: researchResult.executionId,
    extractExecutionId: extractResult.executionId,
    syncExecutionId: syncResult.executionId,
    collected,
    duplicatesSkipped: 0,
    extracted: extractResult.success,
    synced: syncResult.success,
  };
}

// ── Pipeline step: Image generation ──

async function runImageGenStep(
  db: any,
  reportId: string,
  topicName: string,
  reportType: string,
  summary: string,
  normalizedContent: any,
  onProgress?: (msg: string) => void,
): Promise<boolean> {
  try {
    onProgress?.('[ImageGen] 检查 Z-Image 服务...');
    const { generateCoverImage, generateSectionImage, isServerOnline } = await import('../services/imageGeneration.js');
    const online = await isServerOnline();
    if (!online) {
      console.log('[ImageGen] Server not available, skipping image generation');
      onProgress?.('[ImageGen] Z-Image 服务不可用，跳过图片生成');
      return false;
    }
    onProgress?.('[ImageGen] Z-Image 服务在线，开始生成封面图...');

    // Generate cover image
    const coverPath = await generateCoverImage(topicName, reportType, summary, reportId);
    if (coverPath) {
      await db.run('UPDATE reports SET cover_image_url = ? WHERE id = ?', [coverPath, reportId]);
      console.log(`[ImageGen] Cover image saved for ${reportId}`);
      onProgress?.('[ImageGen] 封面图生成完成');
    } else {
      onProgress?.('[ImageGen] 封面图生成失败，继续生成章节图...');
    }

    // Generate section images
    const sections = normalizedContent.sections ?? [];
    const sectionCount = Math.min(sections.length, 6);
    onProgress?.(`[ImageGen] 开始生成章节图 (共 ${sectionCount} 张)...`);
    const { SECTION_PROMPT_TEMPLATE, PROMPT_LIMITS, validateAndBuildPrompt } = await import('../services/imagePromptSchema.js');
    const tasks = sections.slice(0, 6).map((sec: any, i: number) => {
      const highlights = (sec.highlights ?? []).slice(0, 3).join('. ');
      const { prompt } = validateAndBuildPrompt(SECTION_PROMPT_TEMPLATE, {
        sectionTitle: (sec.title ?? '').slice(0, PROMPT_LIMITS.SECTION_TITLE_MAX),
        thesis: (sec.thesis ?? '').slice(0, PROMPT_LIMITS.SECTION_THESIS_MAX),
        highlights: highlights.slice(0, PROMPT_LIMITS.SECTION_HIGHLIGHTS_MAX),
      });
      return generateSectionImage(prompt, reportId, `section_${i}`)
        .then(imgPath => {
          onProgress?.(`[ImageGen] 章节图 (${i + 1}/${sectionCount}) ${imgPath ? '完成' : '失败'}`);
          return { index: i, path: imgPath };
        });
    });

    const results = await Promise.allSettled(tasks);
    const sectionImages: Record<string, string> = {};
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.path) {
        sectionImages[r.value.index] = r.value.path.replace(process.cwd(), '');
      }
    }
    if (Object.keys(sectionImages).length > 0) {
      await db.run(
        "UPDATE reports SET metadata = json_set(COALESCE(metadata, '{}'), '$.sectionImages', ?) WHERE id = ?",
        [JSON.stringify(sectionImages), reportId],
      );
      console.log(`[ImageGen] Section images saved for ${reportId}: ${Object.keys(sectionImages).length} images`);
      onProgress?.(`[ImageGen] 章节图生成完成: ${Object.keys(sectionImages).length} 张`);
    }

    const hasAnyImage = coverPath || Object.keys(sectionImages).length > 0;
    if (!hasAnyImage) {
      onProgress?.('[ImageGen] 未生成任何图片');
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(`[ImageGen] Failed for ${reportId}:`, err?.message || err);
    onProgress?.(`[ImageGen] 错误: ${err?.message || 'Unknown error'}`);
    return false;
  }
}

// ── Pipeline step: PPT export ──

async function runPptExportStep(
  db: any,
  reportId: string,
  title: string,
  summary: string,
  reportType: string,
  normalizedContent: any,
  topicName: string,
  onProgress?: (msg: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    onProgress?.('[PPTX] 检查 ppt-master...');
    const { exportReportToPptx, isPptMasterAvailable } = await import('../services/pptxExport.js');
    if (!isPptMasterAvailable()) {
      console.log('[PPTX] ppt-master not available, skipping PPT export');
      onProgress?.('[PPTX] ppt-master 不可用，跳过 PPT 导出');
      return { ok: false, error: 'ppt-master 未安装' };
    }

    onProgress?.('[PPTX] 开始导出 PPT...');
    // Read existing images from report metadata (generated by image-gen step)
    const reportRow = await db.get('SELECT cover_image_url, metadata FROM reports WHERE id = ?', [reportId]);
    const reportMeta = typeof reportRow?.metadata === 'string' ? JSON.parse(reportRow.metadata) : (reportRow?.metadata || {});
    const existingImages = {
      coverImageUrl: reportRow?.cover_image_url || undefined,
      sectionImages: reportMeta.sectionImages || undefined,
    };
    const report = { id: reportId, title, summary, type: reportType, content: normalizedContent, topic_name: topicName };
    const pptxPath = await exportReportToPptx(report, existingImages);
    if (pptxPath) {
      await db.run(
        "UPDATE reports SET metadata = json_set(COALESCE(metadata, '{}'), '$.pptxPath', ?) WHERE id = ?",
        [pptxPath, reportId],
      );
      console.log(`[PPTX] Export done for ${reportId}: ${pptxPath}`);
      onProgress?.(`[PPTX] PPT 导出完成: ${pptxPath}`);
      return { ok: true };
    }
    onProgress?.('[PPTX] PPT 导出失败');
    return { ok: false, error: 'PPT 导出未生成文件' };
  } catch (err: any) {
    console.error(`[PPTX] Failed for ${reportId}:`, err?.message || err);
    onProgress?.(`[PPTX] 错误: ${err?.message || 'Unknown error'}`);
    return { ok: false, error: err?.message || 'PPT export error' };
  }
}

// ── Pipeline orchestration ──

export interface PipelineStep {
  stepName: string;
  skillName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  executionId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export interface PipelineResult {
  pipelineId: string;
  steps: PipelineStep[];
  reportId?: string;
}

const REPORT_SKILL_MAP: Record<string, string> = {
  daily: 'report-daily',
  weekly: 'report',
  monthly: 'report-monthly',
  quarterly: 'report-quarterly',
  alert: 'report-alert',
  tech_topic: 'report-tech-topic',
  competitor: 'report-competitor',
};

/**
 * Determine which pipeline steps are needed based on existing data.
 * Skips steps when data already exists:
 *   - docCount >= 5 → skip research
 *   - entityCount > 0 → skip extract
 *   - report always runs
 */
async function determineActiveSteps(
  db: any,
  topicId: string,
  periodStart: string,
  periodEnd: string,
  reportType: string,
): Promise<PipelineStep[]> {
  const emptyStep = (name: string, skill: string, status: PipelineStep['status'] = 'pending'): PipelineStep => ({
    stepName: name, skillName: skill, status, executionId: null, startedAt: null, completedAt: null, error: null,
  });

  const reportSkill = REPORT_SKILL_MAP[reportType] ?? 'report';
  const steps: PipelineStep[] = [];

  // Check document count within the report period (same period as the report covers)
  const DOC_THRESHOLDS: Record<string, number> = {
    daily: 5, weekly: 20, monthly: 80, quarterly: 200,
    tech_topic: 20, competitor: 20, alert: 5,
  };
  const threshold = DOC_THRESHOLDS[reportType] ?? 20;

  const docRow = await db.get(
    `SELECT COUNT(*) as count FROM documents WHERE topic_id = ? AND created_at >= ? AND created_at <= ?`,
    [topicId, periodStart, periodEnd],
  );
  const docCount = docRow?.count || 0;

  if (docCount >= threshold) {
    steps.push(emptyStep('research', 'research', 'skipped'));

    // Check entity count
    const entityRow = await db.get(
      `SELECT COUNT(*) as count FROM entities e JOIN documents d ON e.document_id = d.id
       WHERE d.topic_id = ?`,
      [topicId],
    );
    const entityCount = entityRow?.count || 0;

    if (entityCount > 0) {
      steps.push(emptyStep('extract', 'extract', 'skipped'));
      steps.push(emptyStep('sync-graph', 'sync-graph', 'skipped'));
    } else {
      steps.push(emptyStep('extract', 'extract'));
      steps.push(emptyStep('sync-graph', 'sync-graph'));
    }
  } else {
    steps.push(emptyStep('research', 'research'));
    steps.push(emptyStep('extract', 'extract'));
    steps.push(emptyStep('sync-graph', 'sync-graph'));
  }

  // Report always runs
  steps.push(emptyStep('report', reportSkill));

  // Image-gen always runs after report; skipped if Z-Image unavailable
  steps.push(emptyStep('image-gen', 'image-gen'));

  // PPT-export always runs after image-gen; skipped if export fails
  steps.push(emptyStep('ppt-export', 'ppt-export'));

  return steps;
}

/**
 * Run a complete report generation pipeline.
 * Tags all child executions with the same pipelineId for grouping.
 * Returns immediately with pipelineId + step definitions; pipeline runs in background.
 */
export async function startPipeline(
  db: any,
  skillExecutor: any,
  params: {
    topicId: string;
    topicName: string;
    reportType: string;
    timeRangeStart: string;
    timeRangeEnd: string;
    keywords?: string[];
    organizations?: string[];
    [key: string]: any;
  },
  computedPeriod: { start: string; end: string; preset?: string },
): Promise<PipelineResult> {
  const { randomUUID } = await import('crypto');
  const pipelineId = `pipe_${randomUUID()}`;

  // Determine active steps
  const steps = await determineActiveSteps(db, params.topicId, params.timeRangeStart, params.timeRangeEnd, params.reportType);

  // Get topic details for research params
  const topic = await db.get("SELECT keywords, organizations FROM topics WHERE id = ?", [params.topicId]);
  const topicKeywords = params.keywords?.length ? params.keywords : (topic?.keywords ? JSON.parse(topic.keywords) : []);
  const topicOrgs = params.organizations?.length ? params.organizations : (topic?.organizations ? JSON.parse(topic.organizations) : []);

  // Track report data for image-gen/ppt-export steps
  let pipelineReportId: string | null = null;
  let pipelineReportData: { title: string; summary: string; reportType: string; normalizedContent: any } | null = null;

  // Run pipeline in background (non-blocking)
  const pipelinePromise = (async () => {
    // Write DB rows for all pre-determined skipped steps
    for (const step of steps) {
      if (step.status === 'skipped') {
        const skipExecId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        await db.run(
          `INSERT INTO skill_executions (id, skill_name, status, started_at, completed_at, pipeline_id, pipeline_step)
           VALUES (?, ?, 'skipped', ?, ?, ?, ?)`,
          [skipExecId, step.skillName, now, now, pipelineId, step.stepName],
        );
        step.executionId = skipExecId;
      }
    }

    for (const step of steps) {
      if (step.status === 'skipped') continue;
      if (steps.some(s => s.status === 'failed')) {
        // A previous step failed — skip remaining and write DB rows
        step.status = 'skipped';
        const skipExecId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        await db.run(
          `INSERT INTO skill_executions (id, skill_name, status, started_at, completed_at, pipeline_id, pipeline_step)
           VALUES (?, ?, 'skipped', ?, ?, ?, ?)`,
          [skipExecId, step.skillName, now, now, pipelineId, step.stepName],
        );
        step.executionId = skipExecId;
        continue;
      }

      // Mark step running
      step.status = 'running';
      step.startedAt = new Date().toISOString();

      // ── Image-gen step (direct function call, not skillExecutor) ──
      if (step.stepName === 'image-gen') {
        // Write a DB row so frontend DAG can see this step
        const imgExecId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.run(
          `INSERT INTO skill_executions (id, skill_name, status, started_at, pipeline_id, pipeline_step)
           VALUES (?, 'image-gen', 'running', ?, ?, 'image-gen')`,
          [imgExecId, step.startedAt, pipelineId],
        );
        step.executionId = imgExecId;
        skillExecutor.registerProgress(imgExecId);
        const imgProgress = (msg: string) => skillExecutor.appendExternalProgress(imgExecId, msg);

        if (!pipelineReportId || !pipelineReportData) {
          console.log('[Pipeline] Skipping image-gen — no report data available');
          step.status = 'skipped';
          step.completedAt = new Date().toISOString();
          await db.run(
            `UPDATE skill_executions SET status = 'skipped', completed_at = ? WHERE id = ?`,
            [step.completedAt, imgExecId],
          );
          continue;
        }
        try {
          const ok = await runImageGenStep(db, pipelineReportId, params.topicName, pipelineReportData.reportType, pipelineReportData.summary, pipelineReportData.normalizedContent, imgProgress);
          step.status = ok ? 'completed' : 'failed';
          if (!ok) step.error = 'Image generation failed';
        } catch (err: any) {
          step.status = 'failed';
          step.error = err?.message || 'Image generation error';
        }
        step.completedAt = new Date().toISOString();
        await db.run(
          `UPDATE skill_executions SET status = ?, completed_at = ?, error = ? WHERE id = ?`,
          [step.status, step.completedAt, step.error, imgExecId],
        );
        continue;
      }

      // ── PPT-export step (direct function call, not skillExecutor) ──
      if (step.stepName === 'ppt-export') {
        // Write a DB row so frontend DAG can see this step
        const pptExecId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.run(
          `INSERT INTO skill_executions (id, skill_name, status, started_at, pipeline_id, pipeline_step)
           VALUES (?, 'ppt-export', 'running', ?, ?, 'ppt-export')`,
          [pptExecId, step.startedAt, pipelineId],
        );
        step.executionId = pptExecId;
        skillExecutor.registerProgress(pptExecId);
        const pptProgress = (msg: string) => skillExecutor.appendExternalProgress(pptExecId, msg);

        if (!pipelineReportId || !pipelineReportData) {
          console.log('[Pipeline] Skipping ppt-export — no report data available');
          step.status = 'skipped';
          step.completedAt = new Date().toISOString();
          await db.run(
            `UPDATE skill_executions SET status = 'skipped', completed_at = ? WHERE id = ?`,
            [step.completedAt, pptExecId],
          );
          continue;
        }
        try {
          const pptResult = await runPptExportStep(db, pipelineReportId, pipelineReportData.title, pipelineReportData.summary, pipelineReportData.reportType, pipelineReportData.normalizedContent, params.topicName, pptProgress);
          step.status = pptResult.ok ? 'completed' : 'failed';
          if (!pptResult.ok) step.error = pptResult.error || 'PPT export failed';
        } catch (err: any) {
          step.status = 'failed';
          step.error = err?.message || 'PPT export error';
        }
        step.completedAt = new Date().toISOString();
        await db.run(
          `UPDATE skill_executions SET status = ?, completed_at = ?, error = ? WHERE id = ?`,
          [step.status, step.completedAt, step.error, pptExecId],
        );
        continue;
      }

      // Build skill-specific params
      let skillParams: Record<string, any> = { ...params };
      if (step.stepName === 'research') {
        skillParams = {
          ...skillParams,
          keywords: JSON.stringify(topicKeywords),
          organizations: JSON.stringify(topicOrgs),
          timeRangeStart: params.timeRangeStart,
          timeRangeEnd: params.timeRangeEnd,
          maxResults: 20,
        };
      } else if (step.stepName === 'extract') {
        skillParams = { topicId: params.topicId, extractTypes: 'entities,relations,claims,events' };
      } else if (step.stepName === 'sync-graph') {
        skillParams = { topicId: params.topicId };
      } else if (step.stepName === 'report') {
        skillParams = {
          ...skillParams,
          timeRangeStart: params.timeRangeStart,
          timeRangeEnd: params.timeRangeEnd,
        };
      }

      const { executionId, promise } = skillExecutor.startExecution(step.skillName, skillParams, {
        pipelineId,
        pipelineStep: step.stepName,
      });
      step.executionId = executionId;

      try {
        const execution = await promise as SkillExecution;
        // Check for LLM API errors in the result (executor marks as completed but result has error)
        const result = execution.result ?? {};
        const hasLlmError = result?.error?.code || result?.error?.message;
        step.status = (execution.status === 'completed' && !hasLlmError) ? 'completed' : 'failed';
        step.completedAt = execution.completedAt ?? new Date().toISOString();
        step.error = execution.error ?? (hasLlmError ? `LLM API 错误: ${result.error.message || result.error.code}` : null);

        // If this is the report step, persist the report
        if (step.stepName === 'report' && execution.status === 'completed') {
          try {
            const reportResult = await handleReportResult(db, execution, params, computedPeriod);
            if (reportResult) {
              pipelineReportId = reportResult.reportId;
              pipelineReportData = reportResult;
            }
            // Check if handleReportResult detected an LLM error and updated status
            const updated = await db.get('SELECT status, error FROM skill_executions WHERE id = ?', [executionId]);
            if (updated?.status === 'failed') {
              step.status = 'failed';
              step.error = updated.error ?? 'Report persistence failed';
            }
          } catch (err: any) {
            console.error(`[Pipeline] Report persistence failed:`, err?.message || err);
          }
        }
      } catch (err: any) {
        step.status = 'failed';
        step.error = err?.message || 'Unknown error';
        step.completedAt = new Date().toISOString();
      }
    }

    // Finalize report: update from 'processing' to 'draft' so it becomes visible
    if (pipelineReportId) {
      try {
        await db.run("UPDATE reports SET status = 'draft' WHERE id = ?", [pipelineReportId]);
        console.log(`[Pipeline] Report ${pipelineReportId} finalized → draft`);
      } catch (err: any) {
        console.error(`[Pipeline] Failed to finalize report:`, err?.message || err);
      }
    }

    console.log(`[Pipeline] ${pipelineId} completed — steps:`, steps.map(s => `${s.stepName}=${s.status}`).join(', '));
  })();

  // Don't await — return immediately so HTTP response can be sent
  pipelinePromise.catch(err => console.error(`[Pipeline] ${pipelineId} error:`, err));

  return { pipelineId, steps };
}

/**
 * Get documents count within a time period for reporting
 */
export async function getDocumentsCountInPeriod(db: any, topicId: string, periodStart: string, periodEnd: string): Promise<number> {
  const result = await db.get(
    `SELECT COUNT(*) as count FROM documents
     WHERE topic_id = ? AND published_date >= ? AND published_date <= ?`,
    [topicId, periodStart, periodEnd]
  );
  return result?.count || 0;
}

/**
 * Get unique sources count within a time period
 */
export async function getUniqueSourcesCountInPeriod(db: any, topicId: string, periodStart: string, periodEnd: string): Promise<number> {
  const result = await db.get(
    `SELECT COUNT(DISTINCT source) as count FROM documents
     WHERE topic_id = ? AND published_date >= ? AND published_date <= ? AND source IS NOT NULL`,
    [topicId, periodStart, periodEnd]
  );
  return result?.count || 0;
}

/**
 * Extracted report persistence handler (shared by HTTP endpoint & scheduler).
 * Takes db, execution result, and report params, then normalizes and persists the report.
 */
export async function handleReportResult(
  db: any,
  execution: SkillExecution,
  params: Record<string, any>,
  computedPeriod?: { start: string; end: string; preset?: string }
): Promise<{ reportId: string; title: string; summary: string; reportType: string; normalizedContent: any } | null> {
  try {
    const envelope = execution.result ?? {};
    let rawOutput = envelope.result ?? envelope.raw ?? envelope;

    let parsed: any;
    if (typeof rawOutput === 'string') {
      let cleaned = rawOutput.trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (fenceMatch) cleaned = fenceMatch[1].trim();
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
      // Use robust parser with multi-level repair (handles unescaped newlines, trailing commas, etc.)
      parsed = tryParseReportJson(cleaned) ?? {};
    } else if (typeof rawOutput === 'object' && rawOutput !== null) {
      parsed = rawOutput;
    } else {
      parsed = {};
    }

    // Detect LLM API error responses (rate limits, auth failures, etc.)
    if (parsed?.error?.code || parsed?.error?.message) {
      const errMsg = parsed.error.message || parsed.error.code || 'Unknown LLM API error';
      console.error(`[Report] LLM API error: ${errMsg}`);
      await db.run(
        "UPDATE skill_executions SET status = 'failed', error = ? WHERE id = ?",
        [`LLM API 错误: ${errMsg}`, execution.id]
      );
      return;
    }

    // Fallback: scan raw stdout for report JSON when primary parsing yields nothing useful
    const hasReportStructure = (obj: any): boolean =>
      obj && typeof obj === 'object' && (
        Array.isArray(obj.sections) ||
        (obj.content && Array.isArray(obj.content.sections)) ||
        Array.isArray(obj.keyUpdates) ||
        Array.isArray(obj.alerts) ||
        obj.alertSummary ||
        obj.technologyOverview ||
        obj.companyProfile ||
        obj.swotAnalysis ||
        obj.monthlyOverview ||
        obj.strategicExecution ||
        (obj.title && (obj.sections || obj.content || obj.summary)) ||
        (obj.summary && (obj.sections || obj.content)) ||
        (obj.content && (obj.content.keyUpdates || obj.content.alertSummary || obj.content.swotAnalysis))
      );
    if (!hasReportStructure(parsed)) {
      console.log('[Report] Primary parsing empty, scanning stdout for report JSON...');
      const report = extractReportFromStdout(execution.stdout);
      if (report) {
        parsed = report;
        console.log('[Report] Recovered report JSON from stdout fallback');
      } else {
        const fileReport = readReportOutputFile();
        if (fileReport) {
          parsed = fileReport;
        }
      }
    }

    const content = parsed.content ?? parsed;
    const meta = content.meta ?? {};
    const reportType = params.reportType ?? parsed.type ?? meta.type ?? 'weekly';

    // ── Unified report normalization ──
    // All report types now output unified { executiveSummary, sections[], timeline[], metrics } format (v2.0)
    let normalizedContent: any;

    {
      const execSummary = content.executiveSummary ?? {};
      const rawKeyPoints = execSummary.keyPoints ?? [];

      normalizedContent = {
        executiveSummary: {
          overview: execSummary.overview ?? parsed.summary ?? '',
          keyPoints: rawKeyPoints,
          confidence: execSummary.confidence ?? meta.confidence ?? 'medium',
          period: execSummary.period ?? meta.period ?? computedPeriod ?? {},
        },
        sections: (content.sections ?? []).map((sec: any) => {
          // Normalize section.content: convert JSON objects to Markdown strings
          if (sec.content && typeof sec.content !== 'string') {
            sec.content = jsonToMarkdown(sec.content);
          }
          return sec;
        }),
        timeline: content.timeline ?? [],
        metrics: content.metrics ?? {},
      };
    }

    // ── Detect model thinking-text leakage ──
    // Some models (e.g. GLM) output their chain-of-thought as the report content,
    // with the actual report JSON embedded as a string inside a "raw_report" section.
    const THINKING_PATTERNS = /^(?:Now I have|Let me|I'll|I will|I have all|The documents span|I need to|First,? let me|Based on the|The most recent|I found|Looking at|After analyzing)/i;
    const overview = normalizedContent.executiveSummary?.overview ?? '';
    const overviewLooksLikeThinking = THINKING_PATTERNS.test(overview);

    if (overviewLooksLikeThinking) {
      console.log('[Report] Detected thinking-text in executiveSummary.overview, attempting recovery');
      let recovered = false;
      // Scan sections for embedded JSON report
      for (const sec of normalizedContent.sections ?? []) {
        if (typeof sec.content !== 'string') continue;
        // Find the first '{' that starts a JSON object with "title"
        const jsonStart = sec.content.indexOf('{"title"');
        if (jsonStart === -1) continue;
        const jsonStr = sec.content.slice(jsonStart);
        const embedded = tryParseReportJson(jsonStr);
        if (embedded && hasReportStructure(embedded)) {
          console.log('[Report] Recovered embedded report from thinking-text leakage');
          const embContent = embedded.content ?? embedded;
          const embSummary = embContent.executiveSummary ?? {};
          normalizedContent.executiveSummary.overview = embSummary.overview ?? embedded.summary ?? '';
          normalizedContent.executiveSummary.keyPoints = embSummary.keyPoints ?? [];
          normalizedContent.executiveSummary.confidence = embSummary.confidence ?? 'medium';
          normalizedContent.sections = (embContent.sections ?? []).map((s: any) => {
            if (s.content && typeof s.content !== 'string') s.content = jsonToMarkdown(s.content);
            return s;
          });
          normalizedContent.timeline = embContent.timeline ?? [];
          normalizedContent.metrics = embContent.metrics ?? {};
          recovered = true;
          break;
        }
      }
      // Fallback: no embedded JSON found — reconstruct overview from available data
      if (!recovered) {
        console.log('[Report] No embedded JSON found, reconstructing overview from sections');
        const sectionTheses = (normalizedContent.sections ?? [])
          .map(s => s.thesis).filter(Boolean).join('；');
        normalizedContent.executiveSummary.overview = sectionTheses || report.summary || '报告已生成，详见各章节分析。';
        // Also clean thinking text from section content if present
        for (const sec of normalizedContent.sections ?? []) {
          if (typeof sec.content === 'string' && THINKING_PATTERNS.test(sec.content)) {
            sec.content = sec.thesis || '';
          }
        }
      }
    }

    const hasSubstantialContent = (normalizedContent.sections?.length ?? 0) > 0
      || (normalizedContent.executiveSummary.overview?.length ?? 0) > 50;
    const rawStr = typeof rawOutput === 'string' ? rawOutput : String(rawOutput ?? '');
    if (!hasSubstantialContent && rawStr.length > 100) {
      // Try to extract a nested JSON report from the raw string
      const nestedReport = tryParseReportJson(rawStr);
      if (nestedReport && hasReportStructure(nestedReport)) {
        const nestedContent = nestedReport.content ?? nestedReport;
        const nestedExecSummary = nestedContent.executiveSummary ?? {};
        normalizedContent.executiveSummary.overview = nestedExecSummary.overview ?? nestedReport.summary ?? '';
        normalizedContent.executiveSummary.keyPoints = nestedExecSummary.keyPoints ?? [];
        normalizedContent.executiveSummary.confidence = nestedExecSummary.confidence ?? 'medium';
        normalizedContent.sections = (nestedContent.sections ?? []).map((sec: any) => {
          if (sec.content && typeof sec.content !== 'string') {
            sec.content = jsonToMarkdown(sec.content);
          }
          return sec;
        });
        normalizedContent.timeline = nestedContent.timeline ?? [];
        normalizedContent.metrics = nestedContent.metrics ?? {};
      } else {
        // Smart fallback: try to parse markdown summary into report structure
        const mdReport = parseMarkdownReport(rawStr);
        if (mdReport && mdReport.sections.length > 0) {
          normalizedContent.executiveSummary.overview = mdReport.overview || '';
          normalizedContent.executiveSummary.keyPoints = mdReport.keyPoints;
          normalizedContent.sections = mdReport.sections;
          console.log('[Report] Recovered report from markdown summary:', mdReport.sections.length, 'sections,', mdReport.keyPoints.length, 'keyPoints');
        } else {
          // Last resort: store as raw markdown
          const lastFenceEnd = rawStr.lastIndexOf('```');
          const markdownBody = lastFenceEnd > 0 ? rawStr.slice(lastFenceEnd + 3).trim() : rawStr;
          const overviewLine = rawStr.split('\n').find((l: string) =>
            l.trim().length > 20 && !l.startsWith('#') && !l.startsWith('```') && !l.startsWith('{')
          );
          normalizedContent.executiveSummary.overview = overviewLine ?? '';
          normalizedContent.sections = [{
            id: 'raw_report',
            title: '完整报告',
            thesis: '',
            content: markdownBody,
            highlights: [],
            signals: [],
            entityRefs: [],
          }];
        }
      }
    }

    const TYPE_LABELS: Record<string, string> = {
      daily: '日报', weekly: '周报', monthly: '月报', quarterly: '季报',
      tech_topic: '技术专题', competitor: '友商分析', alert: '预警',
    };
    const periodStart = computedPeriod?.start ?? normalizedContent.executiveSummary.period?.start;
    const periodEnd = computedPeriod?.end ?? normalizedContent.executiveSummary.period?.end;
    let title = parsed.title ?? '';
    // Ensure title includes date range for consistent display
    if (!title || title.length < 5) {
      const label = TYPE_LABELS[reportType] ?? '报告';
      const name = reportType === 'competitor' ? (params.competitorName ?? params.topicName ?? '') : (params.topicName ?? '');
      title = `${name} ${label}`;
    }
    if (periodStart && periodEnd) {
      const dateRange = `${periodStart.slice(0, 10)} ~ ${periodEnd.slice(0, 10)}`;
      if (!title.includes(dateRange) && !title.includes('—') && !title.includes(' ~ ')) {
        title = `${title} · ${dateRange}`;
      }
    }
    const summary = parsed.summary ?? normalizedContent.executiveSummary.overview ?? '';
    const period = normalizedContent.executiveSummary.period ?? {};
    const rptId = `rpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log('[Report] Parsed report:', {
      title,
      hasSummary: !!summary,
      sectionsCount: normalizedContent.sections.length,
      timelineCount: normalizedContent.timeline.length,
      confidence: normalizedContent.executiveSummary.confidence,
    });

    // Validate report structure with Zod schema
    const validation = validateReportOutput({ title, summary, content: normalizedContent });
    if (validation.warnings.length > 0) {
      console.warn('[Report] Schema validation warnings:', validation.warnings);
    }
    if (!validation.valid) {
      console.warn('[Report] Schema validation failed, proceeding with best-effort save');
      if (normalizedContent.executiveSummary) {
        normalizedContent.executiveSummary.confidence = 'low';
      }
    }

    const docCount = await db.get(
      "SELECT COUNT(*) as count FROM documents WHERE topic_id = ?",
      [params.topicId]
    );
    const entityCount = await db.get(
      `SELECT COUNT(*) as count FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ?`,
      [params.topicId]
    );

    await db.run(
      `INSERT INTO reports (id, topic_id, topic_name, type, title, summary, content, status, generated_at, period_start, period_end, metadata, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, 'pending')`,
      [
        rptId,
        params.topicId ?? null,
        params.topicName ?? params.topicContext ?? '',
        params.reportType ?? 'weekly',
        title,
        summary,
        JSON.stringify(normalizedContent),
        new Date().toISOString(),
        period.start ?? null,
        period.end ?? null,
        JSON.stringify({
          executionId: execution.id,
          documentCount: docCount?.count || 0,
          entityCount: entityCount?.count || 0,
          ...(parsed.metadata ?? meta)
        }),
      ]
    );
    console.log(`[Report] Saved report ${rptId} for topic ${params.topicId}`);

    // Create report_time_periods entry for tracking
    try {
      const periodStart = computedPeriod?.start || period.start;
      const periodEnd = computedPeriod?.end || period.end;
      const presetType = computedPeriod?.preset || params.periodPreset;

      // Count documents and sources within the period
      const docsInPeriod = await getDocumentsCountInPeriod(db, params.topicId, periodStart, periodEnd);
      const sourcesInPeriod = await getUniqueSourcesCountInPeriod(db, params.topicId, periodStart, periodEnd);

      await db.run(
        `INSERT INTO report_time_periods (id, report_id, period_start, period_end, preset_type, documents_count, sources_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `rtp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          rptId,
          periodStart,
          periodEnd,
          presetType || null,
          docsInPeriod,
          sourcesInPeriod
        ]
      );
      console.log(`[Report] Created time period entry: ${periodStart} - ${periodEnd}, ${docsInPeriod} docs, ${sourcesInPeriod} sources`);
    } catch (periodErr) {
      console.error('[Report] Failed to create report_time_periods entry:', periodErr);
      // Non-critical error, continue with report processing
    }

    // Graph links removed - using SQLite only

    return { reportId: rptId, title, summary, reportType, normalizedContent };
  } catch (err) {
    console.error('[Report] Failed to persist report:', err);
    return null;
  }
}
