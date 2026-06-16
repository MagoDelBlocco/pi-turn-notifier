import { spawn } from "node:child_process";

/**
 * Send a desktop notification via notify-send.
 * Silently ignores errors (e.g., notify-send not installed).
 */
export function notifyUser(summary, body) {
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
