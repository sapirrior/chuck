# Steward

[![Version](https://img.shields.io/badge/version-v0.2.2-D77757.svg)](https://github.com/sapirrior/steward/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Bun-fbf0df.svg?logo=bun)](https://bun.sh)
[![Platforms](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Termux%20%7C%20Windows-lightgrey.svg)](#quick-install)

**The engineering agent that proposes before it touches your code.**

---

Most AI coding agents are reckless. You give them a prompt, and within seconds they're blindly overwriting your working tree, making half-baked edits across five files, and leaving you to untangle the mess in `git diff`. 

**Steward is built on a different premise: AI should act like a senior engineer pairing with you, not a runaway script.**

Steward investigates your codebase thoroughly, drafts clear architectural plans, and generates complete, production-ready code proposals safely isolated in `.steward/`. Your original files remain untouched until you review and decide to apply them.

```text
 ▄▄▄▄▄   Steward
▀▙███▟▀  Propose before touching code. Zero git pollution.
 ▘▘ ▝▝ 

────────────────────────────────────────────────────────────────────────────────
> Investigate our auth flow and draft a plan for refresh token rotation
────────────────────────────────────────────────────────────────────────────────
? for shortcuts                                            claude-3-7-sonnet
```

---

## The Steward Approach

### 🛡️ The Zero-Anxiety Guarantee
Never worry about an AI destroying your uncommitted changes or modifying production code unexpectedly.
* **Isolated Proposals:** All plans land in `.steward/plans/` and all generated code proposals land in `.steward/artifacts/`.
* **Host Files Remain Untouchable:** Steward has zero tools to directly mutate your host project files.
* **Workspace Trust Gate:** Prompts for your explicit confirmation before accessing unfamiliar repositories, keeping your workspace secure.

### 🧠 Deep Investigation First
Steward reads and understands your real code, traces execution flow, checks your actual dependencies, and adopts your codebase's naming conventions and style before writing a single line.

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

## How It Works

1. **Launch:** Run `steward` in any project folder.
2. **Explore & Plan:** Ask Steward to diagnose a bug, explore an unfamiliar codebase, or design a new feature.
3. **Review Proposals:** Open `.steward/plans/plan.md` to review the architecture blueprint, or inspect `.steward/artifacts/` to view clean, complete code proposals.
4. **Apply on Your Terms:** Copy or merge the proposals when you are ready.

---

## License

MIT License © 2026 [sapirrior](https://github.com/sapirrior)
