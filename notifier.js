import { spawn } from "node:child_process";

/**
 * Send a desktop notification via notify-send.
 * Silently ignores errors (e.g., notify-send not installed).
 */
export function notifyUser(summary, body) {
	try {
		spawn("notify-send", [summary, body], {
			detached: true,
			stdio: "ignore",
		}).unref();
	} catch {
		// notify-send not available — silently skip.
	}
}
