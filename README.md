# turn-notifier

Sends a desktop notification when the pi agent finishes and control returns to you.

## What It Does

Listens for the `agent_end` event — which fires only when the agent loop fully completes and the editor is waiting for your input — and sends a `notify-send` notification with the message **"Awaiting your input"**.

It does **not** fire during intermediate prompts (e.g., guardrails permission requests, model selection). Those happen inside the agent loop and never trigger `agent_end`.

### Caveat: automatic retries

`agent_end` also fires when the loop ends on a *retryable* error before pi automatically retries. The host attaches an internal `willRetry` flag to the event for its own listeners, but it is **not** forwarded to extensions, so this extension cannot distinguish a real end from a pending retry. You may therefore see a notification just before an automatic retry kicks in.

## Requirements

- `notify-send` (provided by `libnotify-bin` on most Linux distros). If it is not installed, the notification is skipped — `notifier.js` swallows both the synchronous spawn failure and the asynchronous `ENOENT` `error` event, so a missing `notify-send` never crashes the agent. This is Linux-only by design.

## Installation

Place this directory in `~/.pi/agent/extensions/turn-notifier/` — pi auto-discovers it.

## Testing

```bash
node --test tests/turn-notifier.test.js
```
