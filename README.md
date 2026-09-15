# Chuck

**The engineering agent that proposes before it touches your code.**  
Blazing fast, model-agnostic, and crafted natively for developers who live in their shell.

---

> [!IMPORTANT]
> **Active Development / Beta:** `chuck` is currently in active development. Features and interfaces are evolving quickly. Feedback and contributions are warmly welcomed.

---

## Core Product Concepts & Guarantees

Chuck operates on a fundamentally different philosophy than traditional destructive coding agents:

```
┌──────────────────────────────────────────────────────────────────┐
│                          HOST PROJECT                            │
│   src/          package.json       tests/        .git/           │
│   (100% Read-Only: read_file, find_files, search_text, list_dir) │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                       No Direct File Mutations
                                  │
┌─────────────────────────────────▼────────────────────────────────┐
│                       .chuck/ WORKSPACE                          │
│                                                                  │
│   ├── plans/           Architectural blueprints & task maps      │
│   │   └── plan.md      (write_plan, rename_plan, delete_plan)    │
│   │                                                              │
│   └── artifacts/       Isolated code proposals & draft files     │
│       └── src/...      (write_artifact, edit_artifact, etc.)     │
└──────────────────────────────────────────────────────────────────┘
```

### 1. The Zero Host Mutation Guarantee
* **Root Files are Untouchable:** Chuck does not have access to any tools capable of directly modifying, overwriting, or deleting files in your workspace root.
* **Structural Path Confinement:** All write and delete operations are strictly resolved and confined within `.chuck/`. Attempts to traverse upward (`../`) or target absolute paths are rejected at the runtime boundary.
* **Diff-Free & Risk-Free:** Review code proposals at your own pace without fear of uncommitted git tree pollution, accidental file corruption, or overwritten work.

### 2. Deep Investigation Before Execution
* Chuck acts as a senior engineer joining your codebase cold: it investigates your repo, traces execution paths, identifies conventions, and generates complete, production-ready plans under `.chuck/plans/`.

### 3. Isolated Artifact Proposals
* When Chuck writes code, it creates full file proposals under `.chuck/artifacts/<path>`. You can easily compare, test, or copy these proposals into your codebase whenever you decide.

---

```text
 ▛███▜   Chuck v0.1.3
▀█████▀  AI can make mistakes. Verify important info.
 ▘▘ ▝▝

────────────────────────────────────────────────────────────────────────────────
> Investigate the auth flow and draft a plan for token rotation
────────────────────────────────────────────────────────────────────────────────
? for shortcuts                                            claude-3-7-sonnet
```

---

## Quick Install

### Linux, macOS & Termux

```bash
curl -fsSL https://raw.githubusercontent.com/sapirrior/chuck/main/installer/install.sh | bash
```

_Automatically detects Linux (x64/ARM64), macOS (Apple Silicon/Intel), and Termux, installing `chuck` directly into your path._

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/sapirrior/chuck/main/installer/install.ps1 | iex
```

### Install from Source

```bash
git clone https://github.com/sapirrior/chuck.git
cd chuck
bun install
bun run start
```

---

## Connect Your Models

`chuck` works with leading cloud frontier models as well as local models and self-hosted endpoints.

### 1. Cloud Providers

Add your API key to your environment or `.env` file:

```bash
# Anthropic (Claude 3.7 Sonnet, Claude 3.5 Sonnet)
export ANTHROPIC_API_KEY="sk-ant-..."

# Google Gemini (Gemini 2.5 Flash, Gemini 2.5 Pro)
export GEMINI_API_KEY="AIzaSy..."

# OpenAI (GPT-4o, o3-mini, o1)
export OPENAI_API_KEY="sk-..."
```

---

### 2. Custom Endpoints & Local Models (Ollama, DeepSeek, LM Studio, vLLM, OpenRouter, Groq)

Connect `chuck` to any custom OpenAI-compatible server or local model runner using `CUSTOM_API_URL`, `CUSTOM_API_MODEL_NAME`, and `CUSTOM_API_KEY`:

#### Local Ollama

```bash
export CUSTOM_API_URL="http://localhost:11434/v1"
export CUSTOM_API_MODEL_NAME="qwen2.5-coder:32b"
# Optional dummy key for local endpoints
export CUSTOM_API_KEY="ollama"
```

#### LM Studio / vLLM / LocalAI

```bash
export CUSTOM_API_URL="http://localhost:1234/v1"
export CUSTOM_API_MODEL_NAME="deepseek-r1-distill-qwen-32b"
```

#### DeepSeek API

```bash
export CUSTOM_API_URL="https://api.deepseek.com/v1"
export CUSTOM_API_MODEL_NAME="deepseek-chat"
export CUSTOM_API_KEY="your-deepseek-api-key"
```

#### OpenRouter / Groq / Together AI

```bash
# OpenRouter
export CUSTOM_API_URL="https://openrouter.ai/api/v1"
export CUSTOM_API_MODEL_NAME="anthropic/claude-3.7-sonnet"
export CUSTOM_API_KEY="your-openrouter-key"

# Groq
export CUSTOM_API_URL="https://api.groq.com/openai/v1"
export CUSTOM_API_MODEL_NAME="llama-3.3-70b-versatile"
export CUSTOM_API_KEY="your-groq-key"
```

---

## Interactive Workflow

### Switch Models on the Fly (`/model`)

Type `/model` inside `chuck` to open the interactive model picker or use `/model <model_id>`. Instantly switch between configured providers and models; choices are automatically remembered and saved to `~/.chuck/settings.json`.

### Mention Files with `@`

Type `@` followed by any filename (e.g. `@app.ts` or `@auth/login`) to fuzzy-search and attach context files directly into your prompt.

### Isolated Artifacts & Plans
 
Chuck ships every plan and every file it writes into a workspace confined to `.chuck/` — a guarantee,
not a limitation:
- **Plans (`.chuck/plans/`):** `write_plan`, `rename_plan`, `delete_plan`
- **Artifacts (`.chuck/artifacts/`):** `write_artifact`, `edit_artifact`, `rename_artifact`, `delete_artifact`
- **Investigation:** `read_file`, `find_files`, `search_text`, `list_dir`, `web_fetch`, `web_search`

Your original host project files are never modified directly.

---

## Keyboard Shortcuts

| Key             | Action                                 |
| :-------------- | :------------------------------------- |
| `@`             | Mention & fuzzy-search workspace files |
| `?`             | Toggle shortcuts modal                 |
| `/`             | Open slash commands menu               |
| `Esc Esc`       | Clear input prompt / dismiss dialogs   |
| `Shift + Enter` | Insert newline in multi-line prompts   |
| `Ctrl + C`      | Abort current generation / exit        |
| `PgUp / PgDn`   | Scroll through session history         |
| `↑ / ↓`         | Navigate history and menu selections   |

---

## Slash Commands

| Command          | Action                                           |
| :--------------- | :----------------------------------------------- |
| `/model`         | Switch active LLM provider or model              |
| `/resume`        | Browse and resume previous conversation sessions |
| `/skills`        | Inspect discovered agent skills and capabilities |
| `/clear`         | Clear conversation context and start fresh       |
| `/rename <name>` | Rename current session                           |
| `/exit`          | Exit `chuck`                                     |

---

## Project Architecture

```
src/
├── engine/       # Agent execution loop, multi-provider model routing, system prompt
├── tools/        # Confined tools (artifacts, plans, search, inspect, fetch)
├── tui/          # Alternate-screen renderer, ScreenBuffer, declarative layout
│   ├── primitives/   # Box, Text, SelectList, ModalBox, KeyReader
│   ├── components/   # Header, PromptInput, StatusBar, StreamingView, Docks
│   └── engine/       # DocumentTree, CellLayout, FrameBuffer
├── commands/     # Slash commands (/model, /resume, /skills, /clear, etc.)
├── session/      # Canonical session storage v1 (ModelMessage[]), helpers & projections
├── skills/       # Dynamic skill discovery
├── theme/        # Theme palettes, TrueColor & ANSI fallbacks, figures
└── utils/        # ANSI tokenizers, formatting, markdown renderers
```

---

## Contributing

We love contributions! Check out [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) for guidelines on code style, conventional commits, and architecture boundaries.

---

## License

MIT License © 2026 [sapirrior](https://github.com/sapirrior)
