// Skill Registry - Loads and manages skill prompt templates

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

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
};

interface FrontmatterData {
  displayName?: string;
  description?: string;
  category?: string;
  version?: string;
  timeout?: number;
  params?: SkillParamDef[];
  steps?: string[];
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
    const frontmatter = yaml.load(frontmatterStr) as FrontmatterData;
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
        // New format with frontmatter
        this.skills.set(name, {
          name,
          displayName: frontmatter.displayName ?? name,
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
