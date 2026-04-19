// Skill Registry - Loads and manages skill prompt templates

import * as fs from "fs";
import * as path from "path";

export interface SkillConfig {
  name: string;
  promptTemplate: string;
  timeout: number; // seconds
  description: string;
}

const DEFAULT_TIMEOUT = 600; // 10 minutes

// Per-skill timeout overrides (in seconds)
const SKILL_TIMEOUTS: Record<string, number> = {
  research: 1200,         // 20 min — web search + collection is slow
  extract: 900,           // 15 min
  report: 600,            // 10 min
  'track-competitor': 900, // 15 min
  'sync-graph': 300,      // 5 min
  optimize: 1200,         // 20 min
};

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

      // Parse description: first line starting with #
      const lines = content.split('\n');
      const descriptionLine = lines.find(l => l.startsWith('# '));
      const description = descriptionLine
        ? descriptionLine.replace(/^# /, '').trim()
        : `Skill: ${name}`;

      this.skills.set(name, {
        name,
        promptTemplate: content,
        timeout: SKILL_TIMEOUTS[name] ?? DEFAULT_TIMEOUT,
        description,
      });
    }
    const names = Array.from(this.skills.keys());
    console.log(`[SkillRegistry] Loaded ${this.skills.size} skills: ${names.join(', ')}`);
  }

  get(name: string): SkillConfig | undefined {
    return this.skills.get(name);
  }

  list(): Array<{ name: string; description: string }> {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: s.description,
    }));
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
