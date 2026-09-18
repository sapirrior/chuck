# Steward

[![Version](https://img.shields.io/badge/version-v0.7.0-D77757.svg)](https://github.com/sapirrior/steward/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Bun-fbf0df.svg?logo=bun)](https://bun.sh)
[![Platforms](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Termux%20%7C%20Windows-lightgrey.svg)](#quick-install)

**An interactive AI engineering assistant that brings intelligent agentic coding directly into your terminal.**

---

Steward pairs with you in your terminal to explore codebases, understand complex architectures, run commands, fix issues, and build features through natural language instructions.

```text
 ▄▄▄▄▄   Steward
▀▙███▟▀  AI engineering assistant for your terminal
 ▘▘ ▝▝

────────────────────────────────────────────────────────────────────────────────
> Refactor the authentication service to use JWT refresh token rotation
────────────────────────────────────────────────────────────────────────────────
? for shortcuts                                            claude-3-7-sonnet
```

---

## The Steward Approach

### 🛡️ Guaranteed Rewind Checkpointing

Never worry about losing code or corrupted changes.

- **Automatic Pre-Mutation Checkpoints:** Every edit via `write_file` or `edit_file` captures and persists a SHA-256 content-addressed preimage before writing a single byte.
- **Transactional `/rewind`:** Roll back conversation and workspace files to any prior state. Discarded turns are restored in reverse chronological order with conflict preflight checks.
- **Workspace Trust Gate:** Prompts for explicit confirmation before accessing unfamiliar repositories, keeping your workspace secure.

### 🔄 Background Shell Tasks

Run long-running test suites, dev servers, or builds without locking the agent:

- **Automatic Foreground-to-Background Handoff:** Commands running longer than ~12s automatically transition to session-scoped background tasks without respawning.
- **Autonomous Task Management:** Models inspect output tails via `task_read`, send interactive stdin via `task_send_input`, and terminate process trees with `task_kill`.
- **Zero Orphan Leaks:** All background tasks are tied to session lifecycle and clean up on `/clear`, session switches, or app exit.

### 🧠 Deep Investigation First

Steward reads and understands your real code, traces execution flow, checks your actual dependencies, and adopts your codebase's naming conventions and style before making changes.

### 🎙️ Voice Dictation (Live Transcription)

Dictate instructions hands-free with low latency:

- **Toggle with `Ctrl+T`:** Press `Ctrl+T` to start dictating, speak your instruction, and press `Ctrl+T` again to finalize.
- **Non-Destructive Composer Integration:** Dictated text streams live into your prompt draft at the cursor position without auto-submitting. Edit or adjust before pressing `Enter`.
- **Smart Language Recognition:** Configure your preferred language using dead-simple codes (e.g. `steward --config voice en`, `es`, `ja`, `de`, `fr`, `zh`). Defaults to automatic language detection.
- **Prerequisites:** Powered by Google's `gemini-3.5-transcribe-live` model (`GEMINI_API_KEY` required) with `mode: 'SMART'` disfluency cleanup and PulseAudio capture (`parec` required on Linux).

### ⚡ Senior Partner Persona

No robotic disclaimers or endless preambles. When you say _"hey"_, Steward asks what you're working on. When you ask a question, it investigates in parallel and reports the exact diagnosis.

---

## CLI Usage & Configuration

```bash
# Start interactive TUI session
steward

# View current settings & voice configuration
steward --config

# Set preferred voice language (accepts friendly aliases or BCP-47 tags)
steward --config voice en        # English (US)
steward --config voice es        # Spanish
steward --config voice ja        # Japanese
steward --config voice en-GB     # British English

# Check version or print GitHub repository URL
steward --version
steward --repo
steward --help
```

---

## Quick Install

### Linux, macOS & Termux

```bash
curl -fsSL https://raw.githubusercontent.com/sapirrior/steward/main/installer/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/sapirrior/steward/main/installer/install.ps1 | iex
```

### Build from Source

```bash
git clone https://github.com/sapirrior/steward.git
cd steward
bun install
bun run start
```

---

## API Keys Setup

Steward works with all major AI frontier models as well as local endpoints. Simply export your API key in your terminal or add it to a `.env` file:

### Cloud Providers

```bash
# Anthropic (Claude 3.7 Sonnet, Claude 3.5 Sonnet)
export ANTHROPIC_API_KEY="sk-ant-..."

# Google Gemini (Gemini 2.5 Flash, Gemini 2.5 Pro)
export GEMINI_API_KEY="AIzaSy..."

# OpenAI (GPT-4o, o3-mini, o1)
export OPENAI_API_KEY="sk-..."

# xAI (Grok 4, Grok 3, Grok Code)
export XAI_API_KEY="xai-..."

# Mistral AI (Codestral, Mistral Large)
export MISTRAL_API_KEY="your-mistral-api-key"

# DeepSeek (DeepSeek-V3, DeepSeek-R1)
export DEEPSEEK_API_KEY="sk-..."

# OpenRouter (Unified router over 400+ models)
export OPENROUTER_API_KEY="sk-or-v1-..."
```

### Local Models (Ollama, LM Studio, vLLM)

```bash
export CUSTOM_API_URL="http://localhost:11434/v1"
export CUSTOM_API_MODEL_NAME="qwen2.5-coder:32b"
export CUSTOM_API_KEY="ollama"
```

---

## Slash Commands

- `/rewind` — Browse past conversation turns and restore code + session history to any point
- `/model` — Switch active model or AI provider
- `/effort` — Adjust model reasoning/thinking effort level
- `/clear` — Clear the conversation and start a new session
- `/resume` — Browse and resume a previous session
- `/rename` — Rename the current session
- `/skills` — List discovered skills
- `/exit` (or `/quit`) — Exit Steward

---

## License

MIT License © 2026 [sapirrior](https://github.com/sapirrior)
