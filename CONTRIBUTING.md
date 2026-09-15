# Contributing to Steward

Thank you for your interest in contributing to `steward`, the engineering agent! This guide covers everything you need to get started.

---

## Getting Started

### Prerequisites

- **Bun** >= 1.0 — [Install Bun](https://bun.sh/docs/installation)

### Setup

```bash
# Clone the repo
git clone https://github.com/sapirrior/steward.git
cd steward

# Install dependencies
bun install

# Run in development (watch mode)
bun run dev
```

---

## Project Structure

```
src/
├── engine/       # Agent loop, model orchestration, system prompt
├── tools/        # Tool definitions exposed to the model (confined to .steward/)
├── tui/          # Alternate-screen TUI engine, renderer, layout
├── commands/     # Slash command system (/model, /effort, /clear, /resume, etc.)
├── config/       # Environment and settings
├── models/       # Model discovery and provider mapping
├── session/      # Canonical session storage and projections
├── skills/       # Skills discovery and loading
├── theme/        # Colors, figures, and visual tokens
└── utils/        # Shared helpers (markdown, ANSI, token formatting)
```

---

## Development Scripts

| Command | Description |
| :--- | :--- |
| `bun run dev` | Run from source in watch mode |
| `bun run start` | Run the CLI directly |
| `bun run build` | Bundle to `./dist/cli.js` |
| `bun run compile` | Compile to standalone binary `./dist/steward` |
| `bun run format` | Check formatting |
| `bun run format:fix` | Auto-fix formatting |
| `bun test` | Run tests |

---

## Code Standards

### TypeScript
- Strict mode is enforced. Avoid `any` — if unavoidable, add an explanatory comment.
- Bun is the runtime; no compilation step required for development.

### Formatting
- **Prettier** handles all formatting.
- Run `bun run format:fix` before committing.

### Naming Conventions

| Type | Convention | Example |
| :--- | :--- | :--- |
| Files & Directories | `kebab-case` | `agent-runner.ts` |
| Types & Interfaces | `PascalCase` | `AgentContext` |
| Functions & Variables | `camelCase` | `runAgentLoop` |

---

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

### Types

| Type | When to use |
| :--- | :--- |
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Refactor without feature/fix |
| `test` | Adding or updating tests |
| `chore` | Build, deps, tooling |
| `build` | Build system or scripts |

### Examples

```
feat(engine): add streaming tool call support
fix(tui): correct ANSI width calculation for wide characters
docs: update contributing guide for Bun setup
chore: upgrade ai sdk to 7.x
```

---

## Pull Requests

1. **Branch** from `main` using a descriptive name: `feat/tool-name` or `fix/issue-description`.
2. **Keep PRs focused** — one feature or fix per PR.
3. **Describe your changes** — what changed, why, and how to verify.
4. **Ensure** `bun run format` and `bun test` pass before opening a PR.
5. **Target** `main` for all PRs.

---

## Reporting Issues

Open an issue on [GitHub Issues](https://github.com/sapirrior/steward/issues) with:
- A clear description of the problem.
- Steps to reproduce.
- Expected vs actual behavior.
- Your OS, Bun version, and terminal emulator.
