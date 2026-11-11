import { spawn } from "node:child_process";

/**
 * Notify through Kitty when interactive, otherwise via notify-send.
 * Silently ignores notify-send errors (e.g., binary not installed).
 */
export function notifyUser(summary, body) {
	// In a Kitty terminal, send the notification through the terminal itself.
	// This also works over SSH, where the remote host has no desktop bus.
	// Avoid escape sequences in non-interactive output (for example, pi --print).
	if (process.env.KITTY_WINDOW_ID && process.stdout.isTTY) {
		process.stdout.write(`\x1b]99;i=1:d=0;${summary}\x1b\\`);
		process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
		return;
	}

	try {
		const child = spawn("notify-send", [summary, body], {
			detached: true,
			stdio: "ignore",
		});
		// A missing notify-send surfaces as an asynchronous "error" event
		// (ENOENT), not a synchronous throw. Without this listener Node would
		// rethrow it as an uncaught exception, so swallow it here.
		child.on("error", () => {});
		child.unref();
	} catch {
		// Defensive: spawn can also throw synchronously on invalid arguments.
	}
}
