import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Skill } from './types.js';

/**
 * Parses simple YAML frontmatter from a markdown string to extract name and description.
 */
export function parseSkillFrontmatter(
  content: string,
): { name?: string; description?: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || !match[1]) {
    return null;
  }

  const rawYaml = match[1];
  const lines = rawYaml.split(/\r?\n/);
  const result: { name?: string; description?: string } = {};

  let currentKey: 'name' | 'description' | null = null;
  let descriptionLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const keyMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (keyMatch && keyMatch[1]) {
      const key = keyMatch[1].toLowerCase();
      const val = (keyMatch[2] ?? '').trim();

      if (key === 'name') {
        currentKey = 'name';
        result.name = unquote(val);
      } else if (key === 'description') {
        currentKey = 'description';
        if (val === '>' || val === '>-' || val === '|' || val === '|-') {
          descriptionLines = [];
        } else if (val) {
          descriptionLines = [unquote(val)];
        } else {
          descriptionLines = [];
        }
      } else {
        currentKey = null;
      }
    } else if (currentKey === 'description' && (line.startsWith('  ') || line.startsWith('\t'))) {
      descriptionLines.push(trimmed);
    }
  }

  if (descriptionLines.length > 0) {
    result.description = descriptionLines.join(' ').trim();
  }

  return result;
}

function unquote(str: string): string {
  const trimmed = str.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

interface ScanTarget {
  dir: string;
  source: Skill['source'];
}

/**
 * Discovers skills across:
 * 1. .agents/skills/ (Workspace)
 * 2. ~/.agents/skills/ (User home)
 * 3. ~/.xd/skills/ (User xd home)
 *
 * Higher priority locations override lower priority locations on name conflict.
 */
export function discoverSkills(cwd: string = process.cwd()): Skill[] {
  const targets: ScanTarget[] = [
    { dir: join(cwd, '.agents', 'skills'), source: 'workspace' },
    { dir: join(homedir(), '.agents', 'skills'), source: 'user-agents' },
    { dir: join(homedir(), '.xd', 'skills'), source: 'user-xd' },
  ];

  const skillMap = new Map<string, Skill>();

  for (const target of targets) {
    if (!existsSync(target.dir)) {
      continue;
    }

    try {
      const entries = readdirSync(target.dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = join(target.dir, entry.name);
        const skillMdPath = join(skillDir, 'SKILL.md');
        const fallbackMdPath = join(skillDir, 'skill.md');

        const resolvedFile = existsSync(skillMdPath)
          ? skillMdPath
          : existsSync(fallbackMdPath)
            ? fallbackMdPath
            : null;

        if (!resolvedFile) continue;

        try {
          const raw = readFileSync(resolvedFile, 'utf-8');
          const frontmatter = parseSkillFrontmatter(raw);

          const skillName = frontmatter?.name || entry.name;
          const description = frontmatter?.description || 'No description provided.';

          // Only insert if not already discovered by a higher priority source
          if (!skillMap.has(skillName)) {
            skillMap.set(skillName, {
              name: skillName,
              description,
              filePath: resolvedFile,
              dirPath: skillDir,
              source: target.source,
            });
          }
        } catch {
          // Skip unparseable skill file
        }
      }
    } catch {
      // Skip inaccessible directory
    }
  }

  return Array.from(skillMap.values());
}

/**
 * Formats discovered skills for injection into the agent system prompt.
 */
export function formatSkillsForSystemPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const list = skills.map((s) => `- ${s.name} (${s.filePath}): ${s.description}`).join('\n');

  return `<skills>
You can use specialized 'skills' to help you with complex tasks.

Skills are folders of instructions, scripts, and resources that extend your capabilities for specialized tasks. Each skill folder contains a SKILL.md file with YAML frontmatter and detailed markdown instructions.

Available skills:
${list}

If a skill seems relevant to your current task, you MUST read its SKILL.md instructions using read_file before proceeding.
</skills>`;
}
