# xd

**The AI coding agent built for the terminal.**  
Blazing fast, model-agnostic, and crafted natively for developers who live in their shell.

---

> [!IMPORTANT]
> **Active Development / Beta:** `xd` is currently in active development. Features and interfaces are evolving quickly. Feedback and contributions are warmly welcomed.

---

## Why xd?

Most AI coding assistants force you into heavy browser interfaces or slow Electron apps. `xd` brings autonomous pair programming straight to your command line:

- **Instant & Lightweight:** Starts in milliseconds natively with [Bun](https://bun.sh) — zero bloat, zero Electron memory footprint.
- **Zero-Flicker Alternate Screen TUI:** Powered by Mode 2026 atomic updates and line-differential rendering for fluid terminal interactions.
- **Any LLM Provider:** Switch seamlessly between Anthropic, Google Gemini, OpenAI, or your own local/custom OpenAI-compatible models.
- **Safe & Autonomous:** Inspect code diffs, run commands with granular permission gates, search workspaces, and fetch live web intelligence.
- **Built for Deep Flow:** Keyboard-driven navigation, multi-line editing, session resume, and `@` file mentions.

---

```text
 ▛███▜   xd v0.1.1
▀█████▀  AI can make mistakes. Verify important info.
 ▘▘ ▝▝

────────────────────────────────────────────────────────────────────────────────
> Refactor the authentication loop and add token rotation
────────────────────────────────────────────────────────────────────────────────
? for shortcuts                                            claude-3-7-sonnet
```

---

## Quick Install

### Linux, macOS & Termux

```bash
curl -fsSL https://raw.githubusercontent.com/sapirrior/xd/main/installer/install.sh | bash
```

_Automatically detects Linux (x64/ARM64), macOS (Apple Silicon/Intel), and Termux, installing `xd` directly into your path._

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/sapirrior/xd/main/installer/install.ps1 | iex
```

### Install from Source

```bash
git clone https://github.com/sapirrior/xd.git
cd xd
bun install
bun run start
```

---

## Connect Your Models

`xd` works with leading cloud frontier models as well as local models and self-hosted endpoints.

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

Connect `xd` to any custom OpenAI-compatible server or local model runner using `CUSTOM_API_URL`, `CUSTOM_API_MODEL_NAME`, and `CUSTOM_API_KEY`:

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

Type `/model` inside `xd` to open the interactive model picker. Instantly switch between configured providers and models without restarting your session.

### Mention Files with `@`

Type `@` followed by any filename (e.g. `@app.ts` or `@auth/login`) to fuzzy-search and attach context files directly into your prompt.

### Run Shell Commands with `!`

Type `!` to switch to bash execution mode and run shell commands directly inside your session without leaving the agent.

### Safe Diff Reviews

Before `xd` modifies any file, it presents a side-by-side or unified colored diff preview:

- `1` or `y`: Allow change once
- `2` or `a`: Allow all edits for the session
- `3` or `n`: Deny change
- `f`: Open scrollable full-screen diff review

---

## Keyboard Shortcuts

| Key             | Action                                 |
| :-------------- | :------------------------------------- |
| `!`             | Bash command execution mode            |
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
| `/exit`          | Exit `xd`                                        |

---

## Project Architecture

```
src/
├── engine/       # Agent execution loop, multi-provider model routing, system prompt
├── tools/        # File edits, terminal commands, directory tree, web search & fetch
├── tui/          # Alternate-screen renderer, ScreenBuffer, declarative layout
│   ├── primitives/   # Box, Text, SelectList, ModalBox, KeyReader
│   ├── components/   # Header, PromptInput, StatusBar, StreamingView, Docks
│   └── engine/       # DocumentTree, CellLayout, FrameBuffer
├── commands/     # Slash commands (/model, /resume, /skills, /clear, etc.)
├── session/      # Session persistence and conversation storage
├── skills/       # Dynamic skill discovery
├── theme/        # Theme palettes, TrueColor & ANSI fallbacks, figures
└── utils/        # ANSI tokenizers, diffing, markdown renderers
```

---

## Contributing

We love contributions! Check out [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) for guidelines on code style, conventional commits, and architecture boundaries.

---

## License

MIT License © 2026 [sapirrior](https://github.com/sapirrior)
