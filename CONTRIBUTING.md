# Contributing to xd

Thank you for contributing to `xd`!

This guide defines the code quality, engineering standards, Git commit conventions, and pull request workflows for **all contributors** to `xd`—whether human engineers or AI coding agents. Every contribution follows the exact same bar for quality, consistency, and testing.

---

## 1. Getting Started

### Prerequisites

- **Node.js:** Ensure you are using the Node.js version pinned in [.nvmrc](.nvmrc) (`>= 20`).
- **Package Manager:** `npm` is the standard package manager for this repository. Please do not commit lockfiles from other package managers (e.g., `pnpm-lock.yaml`, `yarn.lock`).

### Setup & Workflow Commands

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Format check / auto-formatting
npm run format

# Run tests
npm test

# Build
npm run build
```

---

## 2. Project Architecture & Boundaries

All application logic will reside under `src/`. To maintain maintainability, future implementation should respect these modular boundaries:

- **Agent Orchestration:** Context compilation, agent loop execution, and model communication via the Vercel AI SDK.
- **Tools:** Discrete, typed tool declarations and handlers made available to the agent.
- **UI:** Terminal user interface rendered via Ink components.

> Note: Infrastructure and governance passes do not create empty feature folders prematurely. Structure emerges as features land.

---

## 3. Code Standards & Style

### TypeScript

- Strict mode is enabled and enforced via `tsconfig.json`.
- Do not use `any` unless strictly necessary and accompanied by an explanatory comment.

### Formatting

- **Prettier** handles all code formatting (`.prettierrc`).
- Run `npm run format` prior to committing.

### Naming Conventions

- **Files & Directories:** `kebab-case` (e.g., `agent-runner.ts`, `status-badge.tsx`).
- **Types & Interfaces:** `PascalCase` (e.g., `AgentContext`, `ToolDefinition`).
- **Functions, Variables & Methods:** `camelCase` (e.g., `runAgentLoop`, `activeSession`).

### Ink Components

- Keep Ink components modular: one component per file with colocated custom hooks when applicable.
- Adhere to design tokens and UI references provided in `references/`.

---

## 4. Working with `.agents/` and `references/`

- The `.agents/` and `references/` directories are **human-managed**.
- Do not create, overwrite, or edit files in these folders.
- See [IMPORTANT.md](IMPORTANT.md) for full details regarding manual assets and the strict separation between visual styling references and application logic.

---

## 5. Git & Commit Message Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<optional scope>): <description>
```

### Common Types:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Changes that do not affect the meaning of the code (formatting, white-space)
- `refactor`: Code changes that neither fix a bug nor add a feature
- `test`: Adding or correcting tests
- `chore`: Maintenance tasks, dependencies, tooling configs

### Examples:

- `feat(agent): support streaming responses in tool loops`
- `fix(tui): correct ANSI color overflow in terminal width calculations`
- `docs(infra): update AGENTS.md with new command reference`

---

## 6. Branching & Pull Request Process

1. **Branching:** Create feature or fix branches branching from `main` (e.g., `feat/tool-runner`, `fix/cursor-blink`).
2. **Pull Requests:**
   - Submit PRs targeting `main`.
   - Provide a clear description of what changed and why.
   - Include verification details (manual testing steps, test command output).
   - Ensure `npm run typecheck` and `npm test` pass before requesting review.

---

## 7. Testing Strategy

- The official test framework choice is currently **TBD** and will be finalized prior to the initial feature implementation PR.
- Once the testing suite is established, all new feature additions and bug fixes must include unit or integration tests.

---

## 8. Reporting Issues

- Use the issue templates located in `.github/ISSUE_TEMPLATE/` when submitting bug reports or feature requests.
