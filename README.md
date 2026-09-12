# xd

An ultra-fast, lightweight general-purpose AI terminal agent built natively for [Bun](https://bun.sh) with TypeScript, Vercel AI SDK, and a high-performance declarative TUI engine.

---

> [!IMPORTANT]
> **Active Development / Beta:** `xd` is currently under active development. APIs, commands, and interfaces may evolve rapidly. Feedback, bug reports, and pull requests are warmly welcomed.

---

## Installation

### Unix / Linux / macOS / Termux

Run the following command in your terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/sapirrior/xd/main/installer/install.sh | bash
```

This script automatically detects your platform (Linux x64/ARM64, macOS Intel/Apple Silicon, Termux), downloads the pre-compiled binary, and installs it to `~/.local/bin` or `$PREFIX/bin`.

### Windows (PowerShell)

Run the following command in PowerShell:

```powershell
irm https://raw.githubusercontent.com/sapirrior/xd/main/installer/install.ps1 | iex
```

### Run from Source with Bun

```bash
# Clone the repository
git clone https://github.com/sapirrior/xd.git
cd xd

# Install dependencies
bun install

# Run directly
bun run start
```

---

## Features

- **Alternate-Screen TUI Engine:** Zero-flicker differential line-rendering engine utilizing Mode 2026 Synchronized Output and a 2D integer cell buffer.
- **Declarative UI Primitives:** Composable layout primitives (`Box`, `Text`, `SelectList`, `ModalBox`, `KeyReader`) with full ANSI styling and strict overflow boundaries (`wrap`, `clip`, `ellipsis`).
- **Multi-Provider LLM Orchestration:** Seamless support for Anthropic (Claude 3.5/3.7), OpenAI (GPT-4o, o1/o3), Google Gemini (2.0 Flash/Pro), Ollama, and OpenAI-compatible providers.
- **Agentic Tool Calling:**
  - File Operations: Safe diff-preview file editing, whole file creation, directory tree inspection, and fuzzy file search.
  - Shell Execution: Interactive bash commands with permission gates, full diff review, and inline execution.
  - Web Intelligence: Live web search and clean markdown web fetching.
- **Session Continuity:** Instant resume of past conversation sessions with turn tracking and metadata search via `/resume`.
- **Extensible Skills & Commands:** Discover and activate local skill documents and slash commands on the fly.
- **Cross-Platform Standalone Binaries:** Single executable binaries for Linux (x64/ARM64), macOS (Intel/Apple Silicon), and Windows with zero runtime dependencies.

---

## Quick Start & API Keys

Set your preferred provider API keys in your environment (or inside a `.env` file):

```bash
# Anthropic
export ANTHROPIC_API_KEY="your-anthropic-key"

# OpenAI
export OPENAI_API_KEY="your-openai-key"

# Google Gemini
export GEMINI_API_KEY="your-gemini-key"
```

Launch `xd`:

```bash
xd
```

---

## Shortcuts & Navigation

| Key                              | Action                                             |
| :------------------------------- | :------------------------------------------------- |
| `!`                              | Prefix to run a shell command directly (bash mode) |
| `@`                              | Fuzzy-search and mention workspace files           |
| `?`                              | Toggle shortcuts modal                             |
| `/`                              | Open slash command palette                         |
| `Esc Esc`                        | Double-tap to clear input prompt / cancel modal    |
| `Shift + Enter` (or `\ + Enter`) | Insert a newline into the prompt                   |
| `Ctrl + C`                       | Abort active model generation / exit               |
| `PgUp / PgDn`                    | Scroll message scrollback history                  |
| `↑ / ↓`                          | Navigate command history / select menu items       |

---

## Slash Commands

| Command          | Description                                                        |
| :--------------- | :----------------------------------------------------------------- |
| `/model`         | Open the interactive model picker to switch LLM providers & models |
| `/resume`        | Browse and resume previous conversation sessions                   |
| `/skills`        | List discovered agent skills and available capabilities            |
| `/clear`         | Clear the active conversation context and start fresh              |
| `/rename <name>` | Rename the current session                                         |
| `/exit`          | Exit the interactive session                                       |

---

## Architecture & Source Tree

```
src/
├── engine/       # Agent loop, model orchestration, system prompts, events
├── tools/        # Built-in tools (edit_file, read_file, run_command, web_search, etc.)
├── tui/          # TUI engine, ScreenBuffer, StateRenderer, declarative primitives
│   ├── primitives/   # Box, Text, SelectList, ModalBox, KeyReader
│   ├── components/   # Header, PromptInput, StatusBar, StreamingView, docks
│   └── engine/       # Component lifecycle, DocumentTree, cell layout, buffers
├── commands/     # Slash command registry and command implementations
├── models/       # Model discovery and provider initialization
├── session/      # Persistent session store (JSON storage)
├── skills/       # Dynamic skill discovery from .agents/skills/
├── theme/        # Theme palette, Unicode figures, and logo glyphs
└── utils/        # ANSI tokenizers, diffing, markdown renderers
```

---

## Development & Build Scripts

| Command              | Description                                     |
| :------------------- | :---------------------------------------------- |
| `bun run dev`        | Run directly from source in watch mode          |
| `bun run start`      | Start interactive CLI session                   |
| `bun run build`      | Bundle to `./dist/cli.js` (Node-compatible ESM) |
| `bun run compile`    | Compile standalone binary to `./dist/xd`        |
| `bun run format`     | Check formatting with Prettier                  |
| `bun run format:fix` | Automatically fix formatting                    |
| `bun test`           | Run test suite                                  |

---

## Contributing

Contributions are welcome. Please review [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before submitting a pull request.

---

## License

MIT License © 2026 [sapirrior](https://github.com/sapirrior)
