# turn-notifier

Sends a desktop notification when the pi agent finishes and control returns to you.

## What It Does

Listens for the `agent_end` event — which fires only when the agent loop fully completes and the editor is waiting for your input — and sends a `notify-send` notification with the message **"Awaiting your input"**.

It does **not** fire during intermediate prompts (e.g., guardrails permission requests, model selection). Those happen inside the agent loop and never trigger `agent_end`.

## Requirements

- `notify-send` (provided by `libnotify-bin` on most Linux distros). Silently skipped if unavailable.

## Installation

Place this directory in `~/.pi/agent/extensions/turn-notifier/` — pi auto-discovers it.

## Testing

```bash
node --test tests/turn-notifier.test.js
```
