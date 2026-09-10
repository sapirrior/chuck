export interface SystemPromptOptions {
  cwd?: string;
  userRules?: string[];
  extraInstructions?: string;
}

/**
 * Builds the system instructions for the agent turn.
 */
export function buildSystemPrompt(options: SystemPromptOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const year = new Date().getUTCFullYear();
  const platform = process.platform;

  let prompt = `<role>
You are xd, a general-purpose AI agent living in the terminal.
You help with everyday tasks: inspecting and organizing files, research, planning, shell utility work, and writing or debugging code when asked.
</role>

<operational_rules>
- Investigate before acting: use tools to discover actual system and file state before making assumptions.
- Execute read-only tools concurrently when appropriate.
- Execute mutating tools (file modifications, shell execution) sequentially.
- Be concise, direct, and actionable. Avoid filler, conversational padding, or conversational summaries of tool actions.
- Preserve existing comments, formatting, and structures in files unless explicitly asked to modify them.
</operational_rules>

<context>
cwd: ${cwd}
platform: ${platform}
year: ${year}
</context>`;

  if (options.userRules && options.userRules.length > 0) {
    prompt += `\n\n<user_defined_rules>\n${options.userRules.map((rule) => `- ${rule}`).join('\n')}\n</user_defined_rules>`;
  }

  if (options.extraInstructions) {
    prompt += `\n\n<additional_instructions>\n${options.extraInstructions}\n</additional_instructions>`;
  }

  return prompt;
}
