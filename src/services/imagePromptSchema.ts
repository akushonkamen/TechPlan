/**
 * Image generation prompt schema — structured validation and templates
 * for consistent, safe image generation via Z-Image Turbo.
 */

// ── Prompt length limits ──
export const PROMPT_LIMITS = {
  COVER_TOPIC_MAX: 60,
  COVER_SUMMARY_MAX: 120,
  SECTION_TITLE_MAX: 80,
  SECTION_THESIS_MAX: 100,
  SECTION_HIGHLIGHTS_MAX: 150,
  TOTAL_PROMPT_MAX: 400,
  MIN_PROMPT_LENGTH: 20,
} as const;

// ── Style parameters for consistent output ──
export const IMAGE_STYLE_PARAMS = {
  cover: { width: 1024, height: 512, steps: 4 },
  section: { width: 1024, height: 768, steps: 4 },
} as const;

// ── Content filtering ──
const UNSAFE_PATTERNS: RegExp[] = [
  /\b(nude|nsfw|violent|gore|weapon|explicit)\b/i,
];

export function filterContent(text: string): string {
  let clean = text;
  for (const pat of UNSAFE_PATTERNS) {
    clean = clean.replace(pat, '[redacted]');
  }
  return clean;
}

// ── Prompt templates (use {field} placeholders, NOT {{field}}) ──
export const COVER_PROMPT_TEMPLATE =
  'Technology intelligence report cover. Topic: {topic}. Summary: {summary}. ' +
  'Abstract network data visualization, circuit board traces, dark navy background, ' +
  'teal and silver accent nodes, clean geometric layout, no text, wide banner.';

export const SECTION_PROMPT_TEMPLATE =
  'Technical infographic slide. Section: "{sectionTitle}". Key finding: {thesis}. ' +
  'Data points: {highlights}. Dark background, engineering diagram aesthetic, ' +
  'circuit node motifs, high information density, structured layout, no text labels.';

// ── Validation and prompt building ──
export interface PromptValidationResult {
  valid: boolean;
  prompt: string;
  warnings: string[];
}

export function validateAndBuildPrompt(
  template: string,
  fields: Record<string, string>,
  maxLength: number = PROMPT_LIMITS.TOTAL_PROMPT_MAX,
): PromptValidationResult {
  const warnings: string[] = [];

  // Filter each field for unsafe content
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    sanitized[key] = filterContent(value);
  }

  // Interpolate template with sanitized fields
  let prompt = template;
  for (const [key, value] of Object.entries(sanitized)) {
    prompt = prompt.replaceAll(`{${key}}`, value);
  }

  // Normalize whitespace and strip special chars
  prompt = prompt.replace(/[\n\r"]/g, ' ').replace(/\s+/g, ' ').trim();

  // Hard truncate to max length
  if (prompt.length > maxLength) {
    warnings.push(`Prompt truncated from ${prompt.length} to ${maxLength} chars`);
    prompt = prompt.slice(0, maxLength - 3) + '...';
  }

  // Check minimum length
  if (prompt.length < PROMPT_LIMITS.MIN_PROMPT_LENGTH) {
    warnings.push('Prompt is suspiciously short');
    return { valid: false, prompt, warnings };
  }

  return { valid: true, prompt, warnings };
}
