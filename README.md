# Chuck

**The non-destructive AI codebase scout and terminal architect.**  
Blazing fast, model-agnostic, and crafted natively for developers who live in their shell.

---

> [!IMPORTANT]
> **Active Development / Beta:** `chuck` is currently in active development. Features and interfaces are evolving quickly. Feedback and contributions are warmly welcomed.

---

## Why Chuck?

Most AI coding assistants force you into heavy browser interfaces or slow Electron apps. `chuck` brings autonomous codebase investigation and plan generation straight to your command line:

- **Instant & Lightweight:** Starts in milliseconds natively with [Bun](https://bun.sh) — zero bloat, zero Electron memory footprint.
- **Zero-Flicker Alternate Screen TUI:** Powered by Mode 2026 atomic updates and line-differential rendering for fluid terminal interactions.
- **Any LLM Provider:** Switch seamlessly between Anthropic, Google Gemini, OpenAI, or your own local/custom OpenAI-compatible models.
- **Safe & Non-Destructive:** Explores, reads, searches, and produces plans/artifacts strictly confined under `.chuck/` without modifying your host project files.
- **Built for Deep Flow:** Keyboard-driven navigation, multi-line editing, session resume, and `@` file mentions.

---

```text
 ▛███▜   Chuck v0.1.1
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
curl -fsSL https://raw.githubusercontent.com/sapirrior/xd/main/installer/install.sh | bash
```

_Automatically detects Linux (x64/ARM64), macOS (Apple Silicon/Intel), and Termux, installing `chuck` directly into your path._

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

Type `/model` inside `chuck` to open the interactive model picker. Instantly switch between configured providers and models without restarting your session.

### Mention Files with `@`

Type `@` followed by any filename (e.g. `@app.ts` or `@auth/login`) to fuzzy-search and attach context files directly into your prompt.

### Non-Destructive Artifacts & Plans

Chuck generates standalone blueprints and architectural artifacts under:
- `.chuck/plans/`
- `.chuck/artifacts/`

Your original workspace files remain untouched.

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
├── tools/        # Artifact tools (.chuck/), file reading, search, web fetch/search
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
