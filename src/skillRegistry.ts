// Skill Registry - Loads and manages skill prompt templates

import * as fs from "fs";
import * as path from "path";

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

// Backward compatible simple config for existing code
export interface SimpleSkillConfig {
  name: string;
  description: string;
}

const DEFAULT_TIMEOUT = 600; // 10 minutes

// Per-skill timeout overrides (in seconds) - fallback for skills without frontmatter
const SKILL_TIMEOUTS: Record<string, number> = {
  research: 1200,         // 20 min — web search + collection is slow
  extract: 900,           // 15 min
  report: 600,            // 10 min
  'track-competitor': 900, // 15 min
  'sync-graph': 300,      // 5 min
  optimize: 1200,         // 20 min
  'report-daily': 300,     // 5 min — daily is lightweight
  'report-monthly': 600,   // 10 min
  'report-quarterly': 600, // 10 min
  'report-tech-topic': 600, // 10 min
  'report-competitor': 600, // 10 min
  'report-alert': 300,     // 5 min
};

interface FrontmatterData {
  // camelCase keys
  displayName?: string;
  // snake_case keys (as used in skill markdown files)
  display_name?: string;
  description?: string;
  category?: string;
  version?: string;
  timeout?: number;
  params?: SkillParamDef[];
  steps?: string[];
}

function parseScalar(value: string): any {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Minimal YAML parser for skill frontmatter subset.
 * Supports scalar keys, block strings (|), arrays of objects (`params`) and arrays of strings (`steps`).
 */
function parseYamlSubset(frontmatterStr: string): FrontmatterData {
  const result: any = {};
  const lines = frontmatterStr.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const keyMatch = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(trimmed);
    if (!keyMatch) {
      i++;
      continue;
    }

    const key = keyMatch[1];
    const rawValue = keyMatch[2];

    // Multiline string: description: |
    if (rawValue === '|') {
      const parts: string[] = [];
      i++;
      while (i < lines.length && (lines[i].startsWith('  ') || !lines[i].trim())) {
        const l = lines[i];
        parts.push(l.startsWith('  ') ? l.slice(2) : '');
        i++;
      }
      result[key] = parts.join('\n').trim();
      continue;
    }

    // Array section: params: / steps:
    if (!rawValue) {
      if (key === 'params') {
        const params: SkillParamDef[] = [];
        i++;
        while (i < lines.length && lines[i].startsWith('  - ')) {
          const first = lines[i].trim().slice(2).trim(); // remove "- "
          const obj: any = {};
          const firstKV = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(first);
          if (firstKV) obj[firstKV[1]] = parseScalar(firstKV[2]);
          i++;
          while (i < lines.length && lines[i].startsWith('    ')) {
            const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(lines[i].trim());
            if (kv) obj[kv[1]] = parseScalar(kv[2]);
            i++;
          }
          params.push(obj as SkillParamDef);
        }
        result[key] = params;
        continue;
      }

      if (key === 'steps') {
        const steps: string[] = [];
        i++;
        while (i < lines.length && lines[i].startsWith('  - ')) {
          const step = lines[i].trim().slice(2).trim();
          steps.push(String(parseScalar(step)));
          i++;
        }
        result[key] = steps;
        continue;
      }
    }

    result[key] = parseScalar(rawValue);
    i++;
  }

  return result as FrontmatterData;
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { frontmatter, body } or { frontmatter: null, body: content }
 */
function parseFrontmatter(content: string): { frontmatter: FrontmatterData | null; body: string } {
  const trimmed = content.trimStart();

  // Check if content starts with ---
  if (!trimmed.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  // Find the end delimiter
  const endIdx = trimmed.indexOf('\n---', 4); // Start search after first ---
  if (endIdx === -1) {
    return { frontmatter: null, body: content };
  }

  const frontmatterStr = trimmed.slice(4, endIdx).trim();
  const body = trimmed.slice(endIdx + 5).trim(); // Skip \n---

  try {
    const frontmatter = parseYamlSubset(frontmatterStr);
    return { frontmatter, body };
  } catch (err) {
    console.warn(`[SkillRegistry] Failed to parse frontmatter: ${err}`);
    return { frontmatter: null, body: content };
  }
}

export class SkillRegistry {
  private skills = new Map<string, SkillConfig>();

  loadAll(skillsDir: string): void {
    if (!fs.existsSync(skillsDir)) {
      console.warn(`[SkillRegistry] Skills directory not found: ${skillsDir}`);
      return;
    }

    const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const name = path.basename(file, '.md');
      const filePath = path.join(skillsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      const { frontmatter, body } = parseFrontmatter(content);

      if (frontmatter) {
        const displayName = frontmatter.displayName ?? frontmatter.display_name ?? name;
        // New format with frontmatter
        this.skills.set(name, {
          name,
          displayName,
          description: frontmatter.description ?? `Skill: ${name}`,
          category: frontmatter.category ?? 'general',
          version: frontmatter.version ?? '0.0.0',
          params: frontmatter.params ?? [],
          steps: frontmatter.steps ?? [],
          promptTemplate: body,
          timeout: frontmatter.timeout ?? SKILL_TIMEOUTS[name] ?? DEFAULT_TIMEOUT,
        });
      } else {
        // Old format - backward compatibility
        const lines = content.split('\n');
        const descriptionLine = lines.find(l => l.startsWith('# '));
        const description = descriptionLine
          ? descriptionLine.replace(/^# /, '').trim()
          : `Skill: ${name}`;

        this.skills.set(name, {
          name,
          displayName: name,
          description,
          category: 'general',
          version: '0.0.0',
          params: [],
          steps: [],
          promptTemplate: content,
          timeout: SKILL_TIMEOUTS[name] ?? DEFAULT_TIMEOUT,
        });
      }
    }
    const names = Array.from(this.skills.keys());
    console.log(`[SkillRegistry] Loaded ${this.skills.size} skills: ${names.join(', ')}`);
  }

  get(name: string): SkillConfig | undefined {
    return this.skills.get(name);
  }

  /**
   * Get detailed skill config (full SkillConfig with all fields)
   */
  getDetail(name: string): SkillConfig | undefined {
    return this.skills.get(name);
  }

  /**
   * List all skills with basic info (backward compatible)
   */
  list(): SimpleSkillConfig[] {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: s.description,
    }));
  }

  /**
   * List all skills with full details
   */
  listDetailed(): SkillConfig[] {
    return Array.from(this.skills.values());
  }

  /**
   * Render a skill prompt by replacing {{param}} placeholders with actual values.
   */
  render(name: string, params: Record<string, any>): string {
    const config = this.skills.get(name);
    if (!config) throw new Error(`Skill not found: ${name}`);

    let prompt = config.promptTemplate;
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{{${key}}}`;
      const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      // Manual replaceAll for broad compat
      while (prompt.includes(placeholder)) {
        prompt = prompt.replace(placeholder, strValue);
      }
    }
    return prompt;
  }
}
