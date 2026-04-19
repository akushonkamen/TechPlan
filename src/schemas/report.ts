import { z } from 'zod';

// Signal within a report section
const SignalSchema = z.object({
  type: z.string(),
  title: z.string(),
  description: z.string().optional().default(''),
  confidence: z.number().min(0).max(1).optional().default(0.5),
}).passthrough();

// Report section
const ReportSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  thesis: z.string().optional().default(''),
  content: z.string().optional().default(''),
  highlights: z.array(z.string()).optional().default([]),
  signals: z.array(SignalSchema).optional().default([]),
  entityRefs: z.array(z.string()).optional().default([]),
}).passthrough();

// Timeline entry
const TimelineEntrySchema = z.object({
  date: z.string(),
  event: z.string(),
  significance: z.string().optional().default(''),
  entityRefs: z.array(z.string()).optional().default([]),
}).passthrough();

// Executive summary
const ExecutiveSummarySchema = z.object({
  overview: z.string().optional().default(''),
  keyPoints: z.array(z.any()).optional().default([]),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  period: z.object({ start: z.string(), end: z.string() }).optional(),
  recommendedActions: z.array(z.any()).optional().default([]),
}).passthrough();

// Normalized report content (post-normalization shape persisted to DB)
const NormalizedReportContentSchema = z.object({
  version: z.string().optional(),
  meta: z.any().optional(),
  executiveSummary: ExecutiveSummarySchema.optional(),
  sections: z.array(ReportSectionSchema).default([]),
  timeline: z.array(TimelineEntrySchema).default([]),
  metrics: z.record(z.string(), z.any()).default({}),
}).passthrough();

// Full report output (top-level shape from Claude)
const ReportOutputSchema = z.object({
  title: z.string().optional().default('Untitled Report'),
  summary: z.string().optional().default(''),
  type: z.string().optional(),
  content: NormalizedReportContentSchema.optional(),
  metadata: z.record(z.string(), z.any()).optional().default({}),
}).passthrough();

type ReportOutput = z.infer<typeof ReportOutputSchema>;

/**
 * Validate a parsed report object. Returns the validated data or null.
 * Logs warnings for validation issues but does not throw.
 */
export function validateReportOutput(data: unknown): {
  valid: boolean;
  data: ReportOutput | null;
  warnings: string[];
} {
  const warnings: string[] = [];

  const result = ReportOutputSchema.safeParse(data);

  if (result.success) {
    // Additional quality checks
    const content = result.data.content;
    if (content) {
      if (content.sections.length === 0) {
        warnings.push('Report has no sections');
      }
      if (!content.executiveSummary?.overview) {
        warnings.push('Report missing executive summary overview');
      }
    }
    return { valid: true, data: result.data, warnings };
  }

  // Collect validation errors as warnings
  for (const issue of result.error.issues) {
    warnings.push(`${issue.path.join('.')}: ${issue.message}`);
  }

  return { valid: false, data: null, warnings };
}
