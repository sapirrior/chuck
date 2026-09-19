# Privacy & Data Handling

Steward is designed with a strict **local-first** privacy architecture.

---

## 1. Zero Data Collection

Steward collects **zero telemetry, zero analytics, and zero tracking data**. 

- No crash reports, usage metrics, or diagnostic logs are sent to any server.
- All session history, pre-mutation snapshots, and configurations remain strictly on your local disk (`~/.steward/`).

---

## 2. Model Provider Data Transmission

The only network communication Steward performs is sending your prompts and authorized context directly to the AI model provider you configure using your own API key.

- **No Intermediate Servers:** Requests travel directly from your machine to the provider's official API endpoint (e.g. Anthropic, Google Gemini, OpenAI, DeepSeek, xAI, Mistral, OpenRouter).
- **Web Search & Fetch Tools:** If tools like `web_search` or `web_fetch` are invoked, direct standard outbound HTTP/HTTPS requests are made to the requested public websites.
- **Provider Policies:** How your data is handled once received by the model endpoint is governed entirely by the terms and data privacy policies of that specific provider.
- **Local & Air-Gapped Models:** When configured with local backends like Ollama, LM Studio, or vLLM, Steward operates 100% offline with zero outbound network requests (unless web search/fetch tools are explicitly invoked).

---

## 3. Summary

You own your code, your prompts, and your workspace. Steward acts purely as a local client.
