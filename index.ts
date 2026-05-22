import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { notifyUser } from "./notifier.js";

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async () => {
		notifyUser("Pi", "Awaiting your input");
	});
}
