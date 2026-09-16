# Steward

[![Version](https://img.shields.io/badge/version-v0.2.4-D77757.svg)](https://github.com/sapirrior/steward/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Bun-fbf0df.svg?logo=bun)](https://bun.sh)
[![Platforms](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Termux%20%7C%20Windows-lightgrey.svg)](#quick-install)

**The engineering agent with direct workspace mutation and guaranteed rewind checkpointing.**

---

Most AI coding agents are reckless. You give them a prompt, and within seconds they're blindly overwriting files with no way to cleanly undo the changes if things go wrong.

**Steward is built on a different premise: AI should act like a senior engineer pairing with you, with automatic pre-mutation safety and instant rollback.**

Steward investigates your codebase thoroughly, directly creates and edits files with targeted operations, and durably checkpoints all file preimages in a content-addressed store (CAS) before touching disk. If you ever want to step back, `/rewind` instantly rolls back both your conversation history and workspace files to any prior turn.

```text
 ▄▄▄▄▄   Steward
▀▙███▟▀  Direct workspace editing. Guaranteed rewind checkpointing.
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
* **Automatic Pre-Mutation Checkpoints:** Every edit via `write_file` or `edit_file` captures and persists a SHA-256 content-addressed preimage before writing a single byte.
* **Transactional `/rewind`:** Roll back conversation and workspace files to any prior state. Discarded turns are restored in reverse chronological order with conflict preflight checks.
* **Workspace Trust Gate:** Prompts for explicit confirmation before accessing unfamiliar repositories, keeping your workspace secure.

### 🧠 Deep Investigation First
Steward reads and understands your real code, traces execution flow, checks your actual dependencies, and adopts your codebase's naming conventions and style before making changes.

### ⚡ Senior Partner Persona
No robotic disclaimers or endless preambles. When you say *"hey"*, Steward asks what you're working on. When you ask a question, it investigates in parallel and reports the exact diagnosis.

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

* `/rewind` — Browse past conversation turns and restore code + session history to any point
* `/model` — Switch active model or AI provider
* `/effort` — Adjust model reasoning/thinking effort level
* `/clear` — Clear the conversation and start a new session
* `/resume` — Browse and resume a previous session
* `/rename` — Rename the current session
* `/skills` — List discovered skills
* `/exit` (or `/quit`) — Exit Steward

---

## License

MIT License © 2026 [sapirrior](https://github.com/sapirrior)
