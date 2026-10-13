# turn-notifier

Sends a desktop notification when the pi agent run has fully settled and control
returns to you.

## What It Does

Listens for the **`agent_settled`** event and sends a `notify-send` notification
with the message **"Awaiting your input"**.

`agent_settled` is the final, notification-only boundary of a run: Pi has no
remaining automatic retry, overflow/compaction recovery, or queued follow-up
work, so it is the only event that genuinely means "the editor is waiting for
your input". Pi's own `notify.ts` example hooks the same event.

`agent_end` — the event this extension used to subscribe to — marks the end of a
*low-level* run only. Retries, recovery, and queued continuations can still
follow it, and the internal `willRetry` flag on that event is not forwarded to
extensions, so notifications fired from `agent_end` can be false alarms.

### Cancelled runs

`agent_settled` carries `aborted: true` when the run ended because it was
cancelled (for example with Escape). Since you just pressed the key, no
notification is sent for aborted runs. On Pi releases between 0.80.4 and 1.0.x
the flag does not exist yet and every settled run notifies.

It does **not** fire during intermediate prompts (guardrails permission requests,
model selection, extension dialogs): those happen inside the run, before it
settles.

## Requirements

- `notify-send` (provided by `libnotify-bin` on most Linux distros) and a running
  notification daemon. If `notify-send` is missing the notification is skipped —
  `notifier.js` swallows both the synchronous spawn failure and the asynchronous
  `ENOENT` `error` event, so a missing dependency never crashes the agent.
- Linux-only by design. In WSL, headless sessions, or terminals that own their
  notification channel (Ghostty, iTerm2, Kitty, Windows Terminal), `notify-send`
  is a no-op; see Pi's bundled `notify.ts` example, which uses OSC 777 / OSC 99 /
  Windows toast escape sequences instead.

## Installation

Place this directory in `~/.pi/agent/extensions/turn-notifier/` — pi auto-discovers it.

Requires Pi **>= 0.80.4** (when `agent_settled` was introduced).

## Testing

```bash
node --test tests/turn-notifier.test.js
```

The suite puts a fake `notify-send` on `PATH` inside real subprocesses and asserts
on what actually reaches it — argument order, non-blocking exit, stdio isolation,
missing-binary resilience, and the `aborted` guard — rather than on source text.
It relies on Node's native TypeScript type stripping (Node >= 22.18) to import
`index.ts`; pi itself loads the file through jiti.
