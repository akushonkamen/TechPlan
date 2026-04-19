import { z } from 'zod';

const ConfidenceSchema = z.number().min(0).max(1);

const EntityTypeSchema = z.enum([
  'Technology',
  'Organization',
  'Person',
  'Product',
  'Location',
  'TimePeriod',
  'Other',
]);

const RelationTypeSchema = z.enum([
  'develops',
  'competes_with',
  'published_by',
  'uses',
  'invests_in',
  'partners_with',
  'acquires',
  'supports',
  'contradicts',
  'related_to',
]);

const ClaimPolaritySchema = z.enum(['positive', 'negative', 'neutral']);

const EventTypeSchema = z.enum([
  'breakthrough',
  'partnership',
  'product_launch',
  'regulation',
  'funding',
  'acquisition',
  'research',
  'other',
]);

const EntityExtractionSchema = z.object({
  text: z.string().trim().min(1),
  type: EntityTypeSchema,
  confidence: ConfidenceSchema,
  aliases: z.array(z.string().trim().min(1)).optional().default([]),
}).passthrough();

const RelationExtractionSchema = z.object({
  source_text: z.string().trim().min(1),
  target_text: z.string().trim().min(1),
  relation: RelationTypeSchema,
  confidence: ConfidenceSchema,
  evidence: z.string().optional().default(''),
}).passthrough();

const ClaimExtractionSchema = z.object({
  text: z.string().trim().min(1),
  type: z.string().optional().default('claim'),
  polarity: ClaimPolaritySchema,
  confidence: ConfidenceSchema,
  source_context: z.string().optional().default(''),
}).passthrough();

const EventExtractionSchema = z.object({
  type: EventTypeSchema,
  title: z.string().trim().min(1),
  description: z.string().optional().default(''),
  event_time: z.string().optional().default(''),
  participants: z.array(z.string().trim().min(1)).optional().default([]),
  confidence: ConfidenceSchema,
}).passthrough();

const ExtractionResultSchema = z.object({
  topicId: z.string().trim().min(1),
  documentsProcessed: z.number().int().min(0),
  extractionStats: z.object({
    entities: z.number().int().min(0).optional().default(0),
    relations: z.number().int().min(0).optional().default(0),
    claims: z.number().int().min(0).optional().default(0),
    events: z.number().int().min(0).optional().default(0),
  }).optional().default({ entities: 0, relations: 0, claims: 0, events: 0 }),
  entities: z.array(EntityExtractionSchema).optional().default([]),
  relations: z.array(RelationExtractionSchema).optional().default([]),
  claims: z.array(ClaimExtractionSchema).optional().default([]),
  events: z.array(EventExtractionSchema).optional().default([]),
  topEntities: z.array(EntityExtractionSchema).optional().default([]),
}).passthrough();

type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export function validateExtractionOutput(data: unknown): {
  valid: boolean;
  data: ExtractionResult | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const result = ExtractionResultSchema.safeParse(data);

  if (!result.success) {
    for (const issue of result.error.issues) {
      warnings.push(`${issue.path.join('.')}: ${issue.message}`);
    }
    return { valid: false, data: null, warnings };
  }

  const parsed = result.data;
  if (
    parsed.extractionStats.entities > 0 &&
    parsed.entities.length > 0 &&
    parsed.extractionStats.entities < parsed.entities.length
  ) {
    warnings.push('extractionStats.entities is less than entities array length');
  }
  if (
    parsed.extractionStats.relations > 0 &&
    parsed.relations.length > 0 &&
    parsed.extractionStats.relations < parsed.relations.length
  ) {
    warnings.push('extractionStats.relations is less than relations array length');
  }

  return { valid: true, data: parsed, warnings };
}
