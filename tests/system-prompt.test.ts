import { describe, it, expect } from 'bun:test';
import { buildSystemPrompt } from '../src/engine/system-prompt.js';

describe('System Prompt Structure & Invariants', () => {
  it('should contain all required redesigned section tags and calibration examples', () => {
    const prompt = buildSystemPrompt({
      cwd: '/workspace/steward',
      skills: [],
    });

    const expectedTags = [
      '<identity>',
      '</identity>',
      '<operating_principles>',
      '</operating_principles>',
      '<security>',
      '</security>',
      '<tools>',
      '</tools>',
      '<workflow>',
      '</workflow>',
      '<artifacts>',
      '</artifacts>',
      '<communication>',
      '</communication>',
      '<slash_commands>',
      '</slash_commands>',
      '<runtime_context>',
      '</runtime_context>',
      '<examples>',
      '</examples>',
    ];

    for (const tag of expectedTags) {
      expect(prompt).toContain(tag);
    }
  });

  it('should not contain any legacy or removed section tags', () => {
    const prompt = buildSystemPrompt({
      cwd: '/workspace/steward',
      skills: [],
    });

    const removedTags = [
      '<non_destructive_guarantee>',
      '<investigation_workflow>',
      '<code_and_conventions>',
      '<tool_policy>',
      '<artifact_lifecycle>',
      '<communication_style>',
    ];

    for (const tag of removedTags) {
      expect(prompt).not.toContain(tag);
    }
  });

  it('should correctly format runtime context with provided cwd', () => {
    const testCwd = '/custom/test/project';
    const prompt = buildSystemPrompt({
      cwd: testCwd,
      skills: [],
    });

    expect(prompt).toContain(`cwd      : ${testCwd}`);
    expect(prompt).toContain(`platform : ${process.platform}`);
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
});
