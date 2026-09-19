import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import type { Skill } from './types.js';

const MAX_SKILL_FILE_SIZE = 64 * 1024; // 64 KiB limit

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
 * 3. ~/.steward/skills/ (User steward home)
 *
 * Higher priority locations override lower priority locations on name conflict.
 */
export function discoverSkills(cwd: string = process.cwd()): Skill[] {
  const targets: ScanTarget[] = [
    { dir: join(cwd, '.agents', 'skills'), source: 'workspace' },
    { dir: join(homedir(), '.agents', 'skills'), source: 'user-agents' },
    { dir: join(homedir(), '.steward', 'skills'), source: 'user-steward' },
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
 * Retrieves a single discovered skill by exact name.
 */
export function getSkill(name: string, cwd: string = process.cwd()): Skill | null {
  const cleanName = name.trim();
  const all = discoverSkills(cwd);
  return all.find((s) => s.name.toLowerCase() === cleanName.toLowerCase()) ?? null;
}

export interface SkillReadOutput {
  name: string;
  description: string;
  source: Skill['source'];
  resourcePath: string;
  content: string;
}

/**
 * Reads a skill's primary instruction (SKILL.md) or a relative resource file within the skill directory.
 * Strictly prevents path traversal outside the skill's root directory.
 */
export function readSkillResource(
  name: string,
  relativePath?: string,
  cwd: string = process.cwd(),
  maxBytes: number = MAX_SKILL_FILE_SIZE,
): SkillReadOutput {
  const skill = getSkill(name, cwd);
  if (!skill) {
    throw new Error(`Skill "${name}" not found`);
  }

  let targetFilePath: string;

  if (!relativePath || !relativePath.trim()) {
    targetFilePath = skill.filePath;
  } else {
    const trimmedPath = relativePath.trim();
    if (isAbsolute(trimmedPath)) {
      throw new Error(
        `Invalid skill resource path: absolute paths are not permitted (${trimmedPath})`,
      );
    }

    const normalizedRelative = normalize(trimmedPath);
    if (normalizedRelative.startsWith('..') || normalizedRelative.includes(`${sep}..`)) {
      throw new Error(
        `Invalid skill resource path: directory traversal ("..") is forbidden (${trimmedPath})`,
      );
    }

    targetFilePath = resolve(skill.dirPath, normalizedRelative);

    // Verify resolved path is strictly within the skill directory
    const resolvedDir = resolve(skill.dirPath);
    if (!targetFilePath.startsWith(resolvedDir + sep) && targetFilePath !== resolvedDir) {
      throw new Error(`Resource "${trimmedPath}" resolves outside skill directory`);
    }
  }

  if (!existsSync(targetFilePath)) {
    throw new Error(`Skill resource file "${targetFilePath}" does not exist`);
  }

  const stat = statSync(targetFilePath);
  if (!stat.isFile()) {
    throw new Error(`Skill resource path "${targetFilePath}" is not a regular file`);
  }

  if (stat.size > maxBytes) {
    throw new Error(
      `Skill resource file exceeds size limit of ${maxBytes} bytes (file is ${stat.size} bytes)`,
    );
  }

  const content = readFileSync(targetFilePath, 'utf-8');

  return {
    name: skill.name,
    description: skill.description,
    source: skill.source,
    resourcePath: targetFilePath,
    content,
  };
}
