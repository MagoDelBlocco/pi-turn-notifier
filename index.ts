import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { notifyUser } from "./notifier.js";

export default function (pi: ExtensionAPI) {
	// `agent_end` fires at the end of each *low-level* run: an automatic retry,
	// overflow or compaction recovery, or queued follow-up can still continue
	// afterward, and the internal `willRetry` flag on that event is not forwarded
	// to extensions. `agent_settled` (Pi >= 0.80.4) is the final, notification-only
	// boundary: Pi has no remaining automatic work, so this is the only event that
	// truly means "control has returned to you".
	pi.on("agent_settled", async (event) => {
		// A run cancelled with Escape also settles. The user already knows they
		// cancelled, so do not noise their desktop for it. `aborted` was added in
		// Pi 1.1.0; on earlier releases it is undefined and the notification fires.
		if (event.aborted) return;
		notifyUser("Pi", "Awaiting your input");
	});
}
