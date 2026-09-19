# Steward

[![Version](https://img.shields.io/badge/version-v0.13.0-D77757.svg)](https://github.com/sapirrior/steward/releases)
[![npm](https://img.shields.io/npm/v/steward-cli.svg?color=373737)](https://www.npmjs.com/package/steward-cli)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Bun-fbf0df.svg?logo=bun)](https://bun.sh)
[![Platforms](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Termux%20%7C%20Windows-lightgrey.svg)](#get-started)

Steward is an interactive AI engineering assistant for the terminal. Built with a lightweight native runtime, Steward pairs with you to explore codebases, refactor architectures, run commands, and implement features with full human-in-the-loop control across local and frontier models.

---

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

## Get Started

### Installation

Install Steward globally using npm or Bun:

```bash
# npm (Recommended)
npm install -g steward-cli

# Bun
bun add -g steward-cli
```

Or execute directly with npx:

```bash
npx steward-cli
```

#### Standalone Scripts

**macOS, Linux & Termux:**
```bash
curl -fsSL https://raw.githubusercontent.com/sapirrior/steward/main/installer/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/sapirrior/steward/main/installer/install.ps1 | iex
```

**Build from Source:**
```bash
git clone https://github.com/sapirrior/steward.git
cd steward
bun install
bun run start
```

---

## Core Capabilities

- **Human-in-the-Loop Engineering:** Steward keeps you in control with explicit permission gates for filesystem mutations and bash commands.
- **First-Class Local Model Support:** Optimized for local model execution (Ollama, LM Studio, vLLM, Qwen, DeepSeek) as well as cloud frontier APIs.
- **Lightweight Native Architecture:** Handcrafted zero-overhead runtime with sub-millisecond startup and minimal system resource usage.
- **Synchronized Terminal UI:** Built with Mode 2026 synchronized output, flicker-free differential rendering, and intra-line word diffs.
- **Hands-Free Voice Dictation:** Toggle `Ctrl+T` to dictate complex instructions with real-time speech-to-text directly in the prompt editor.

---

## Privacy & Data Security

Steward operates on a strictly local-first architecture:

- **Zero Telemetry:** Steward collects no analytics, tracking data, or diagnostic logs.
- **Local Persistence:** All session history, configuration, and state are stored locally on your machine.
- **Direct Inference:** Network requests are made directly to your configured provider or local server endpoint via your own API credentials, governed entirely by your provider's terms.

---

## Provider Setup & Configuration

Steward supports local endpoints and major cloud providers. Configure your environment using environment variables or a `.env` file:

### Local Models (Ollama, LM Studio, vLLM)

```bash
export CUSTOM_API_URL="http://localhost:11434/v1"
export CUSTOM_API_MODEL_NAME="qwen2.5-coder:32b"
export CUSTOM_API_KEY="ollama"
```

### Cloud Providers

```bash
# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google Gemini
export GEMINI_API_KEY="AIzaSy..."

# OpenAI
export OPENAI_API_KEY="sk-..."

# DeepSeek
export DEEPSEEK_API_KEY="sk-..."

# xAI
export XAI_API_KEY="xai-..."

# Mistral AI
export MISTRAL_API_KEY="your-mistral-api-key"

# OpenRouter
export OPENROUTER_API_KEY="sk-or-v1-..."
```

---

## Slash Commands

| Command | Description |
| :--- | :--- |
| `/rewind` | Revert workspace modifications and conversation state to any prior turn |
| `/model` | Switch active model or provider endpoint |
| `/effort` | Adjust model reasoning effort level |
| `/clear` | Clear the current conversation and start a new session |
| `/resume` | Browse and resume a prior session |
| `/rename` | Rename the active session |
| `/skills` | List discovered workspace skills |
| `/exit` | Exit Steward (`Ctrl+C Ctrl+C`) |

---

## License

MIT License © 2026 [sapirrior](https://github.com/sapirrior)
