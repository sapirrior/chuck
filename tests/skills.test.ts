import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSkills, getSkill, readSkillResource } from '../src/skills/index.js';
import { skillListTool } from '../src/tools/skill-list/index.js';
import { skillReadTool } from '../src/tools/skill-read/index.js';

describe('Skill Discovery & On-Demand Reading', () => {
  let tempWorkspace: string;

  beforeEach(() => {
    tempWorkspace = mkdtempSync(join(tmpdir(), 'steward-skill-test-'));
    const skillDir = join(tempWorkspace, '.agents', 'skills', 'test-skill');
    mkdirSync(skillDir, { recursive: true });

    const skillContent = `---
name: test-skill
description: A specialized test skill for verification.
---

# Test Skill Instructions
Follow these steps carefully.
`;
    writeFileSync(join(skillDir, 'SKILL.md'), skillContent, 'utf-8');

    // Create a subfolder with extra resource
    const docsDir = join(skillDir, 'docs');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'extra.md'), '# Extra reference info', 'utf-8');
  });

  afterEach(() => {
    try {
      rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {}
  });

  it('discovers skills in workspace .agents/skills directory', () => {
    const skills = discoverSkills(tempWorkspace);
    expect(skills.length).toBeGreaterThanOrEqual(1);

    const testSkill = skills.find((s) => s.name === 'test-skill');
    expect(testSkill).toBeDefined();
    expect(testSkill?.description).toBe('A specialized test skill for verification.');
  });

  it('SkillList returns metadata only without body content', async () => {
    const list = await skillListTool.execute({}, { cwd: tempWorkspace });
    expect(list.length).toBeGreaterThanOrEqual(1);

    const testSkill = list.find((s) => s.name === 'test-skill');
    expect(testSkill).toBeDefined();
    expect(testSkill?.name).toBe('test-skill');
    expect(testSkill?.description).toBe('A specialized test skill for verification.');
    expect((testSkill as any).content).toBeUndefined();

    const summary = skillListTool.summarize({}, list);
    expect(summary).toContain('Discovered');
  });

  it('SkillRead returns SKILL.md content by default', async () => {
    const result = await skillReadTool.execute({ name: 'test-skill' }, { cwd: tempWorkspace });
    expect(result.name).toBe('test-skill');
    expect(result.content).toContain('# Test Skill Instructions');
  });

  it('SkillRead reads valid relative resources within the skill directory', async () => {
    const result = await skillReadTool.execute(
      { name: 'test-skill', path: 'docs/extra.md' },
      { cwd: tempWorkspace },
    );
    expect(result.content).toBe('# Extra reference info');
  });

  it('SkillRead rejects absolute paths', async () => {
    await expect(
      skillReadTool.execute({ name: 'test-skill', path: '/etc/passwd' }, { cwd: tempWorkspace }),
    ).rejects.toThrow(/absolute paths are not permitted/);
  });

  it('SkillRead rejects directory traversal (..) outside skill directory', async () => {
    await expect(
      skillReadTool.execute(
        { name: 'test-skill', path: '../../package.json' },
        { cwd: tempWorkspace },
      ),
    ).rejects.toThrow(/directory traversal/);
  });

  it('SkillRead fails clearly when the skill does not exist', async () => {
    await expect(
      skillReadTool.execute({ name: 'non-existent-skill' }, { cwd: tempWorkspace }),
    ).rejects.toThrow(/not found/);
  });

  it('SkillRead rejects files exceeding the maximum bounded size', async () => {
    const skillDir = join(tempWorkspace, '.agents', 'skills', 'test-skill');
    const largeContent = 'A'.repeat(70 * 1024); // 70 KiB (exceeds 64 KiB)
    writeFileSync(join(skillDir, 'large.txt'), largeContent, 'utf-8');

    await expect(
      skillReadTool.execute({ name: 'test-skill', path: 'large.txt' }, { cwd: tempWorkspace }),
    ).rejects.toThrow(/exceeds size limit/);
  });
});
