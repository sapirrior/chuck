import { describe, it, expect } from 'bun:test';
import { buildSystemPrompt } from '../src/engine/system-prompt.js';
import type { Skill } from '../src/skills/index.js';

describe('System Prompt Structure & Invariants', () => {
  it('should contain all required core sections and instructions', () => {
    const prompt = buildSystemPrompt({
      cwd: '/workspace/steward',
      skills: [],
    });

    const expectedSections = [
      '# Tone and style',
      '# Proactiveness',
      '# Following conventions',
      '# Code style',
      '# Tool usage policy',
      '# Task Management (Planning)',
      '# Doing tasks',
      '# Code References',
      '<env>',
      '</env>',
    ];

    for (const section of expectedSections) {
      expect(prompt).toContain(section);
    }

    // Defensive security & feedback invariants
    expect(prompt).toContain('Assist with defensive security tasks only');
    expect(prompt).toContain('https://github.com/sapirrior/steward');
  });

  it('should contain mutation, planning, and task management instructions', () => {
    const prompt = buildSystemPrompt({
      cwd: '/workspace/steward',
      skills: [],
    });

    expect(prompt).toContain('write file');
    expect(prompt).toContain('edit file');
    expect(prompt).toContain('.steward/plans/');
    expect(prompt).toContain('WebFetch');
    expect(prompt).toContain('◉');
  });

  it('should correctly format runtime environment block with provided cwd and platform', () => {
    const testCwd = '/custom/test/project';
    const prompt = buildSystemPrompt({
      cwd: testCwd,
      skills: [],
    });

    expect(prompt).toContain(`Working directory: ${testCwd}`);
    expect(prompt).toContain(`Platform: ${process.platform}`);
    expect(prompt).toContain('Is directory a git repo:');
    expect(prompt).toContain("Today's date:");
  });

  it('should detect git repository status accurately and safely', () => {
    const repoPrompt = buildSystemPrompt({
      cwd: process.cwd(),
      skills: [],
    });
    expect(repoPrompt).toContain('Is directory a git repo: yes');

    const nonRepoPrompt = buildSystemPrompt({
      cwd: '/non/existent/path/never/exists',
      skills: [],
    });
    expect(nonRepoPrompt).toContain('Is directory a git repo: no');
  });

  it('should append user_defined_rules with updated exception references', () => {
    const prompt = buildSystemPrompt({
      cwd: '/workspace/steward',
      skills: [],
      userRules: ['Always format with prettier', 'Never use console.log in prod'],
    });

    expect(prompt).toContain('<user_defined_rules>');
    expect(prompt).toContain('- Always format with prettier');
    expect(prompt).toContain('- Never use console.log in prod');
    expect(prompt).toContain('except for the operating_principles and security sections');
  });

  it('should append additional_instructions when provided', () => {
    const prompt = buildSystemPrompt({
      cwd: '/workspace/steward',
      skills: [],
      extraInstructions: 'Session specific context goes here.',
    });

    expect(prompt).toContain('<additional_instructions>');
    expect(prompt).toContain('Session specific context goes here.');
  });

  it('should format and append discovered skills when present', () => {
    const mockSkills: Skill[] = [
      {
        name: 'test-skill',
        description: 'A mock skill for testing',
        filePath: '/mock/path/SKILL.md',
        content: '# Test Skill Content',
      },
    ];

    const prompt = buildSystemPrompt({
      cwd: '/workspace/steward',
      skills: mockSkills,
    });

    expect(prompt).toContain('test-skill');
    expect(prompt).toContain('A mock skill for testing');
  });
});
