/**
 * Tests for the turn-notifier extension.
 *
 * Run with: node --test tests/turn-notifier.test.js
 *
 * Everything here is verified behaviourally: a fake `notify-send` executable is
 * placed on PATH in a real subprocess, so the assertions observe what actually
 * reached the notification backend rather than what a source-code regex matched.
 */

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const notifierPath = path.join(repoRoot, "notifier.js");
const indexPath = path.join(repoRoot, "index.ts");

const notifierHref = pathToFileURL(notifierPath).href;
const indexHref = pathToFileURL(indexPath).href;

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "turn-notifier-test-"));
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

/**
 * Creates a directory containing a fake `notify-send`, and returns
 * { binDir, logPath } where the fake records its argv.
 */
function makeFakeNotifySend(name, { sleepMs = 0, noise = false } = {}) {
	const dir = fs.mkdtempSync(path.join(tmpRoot, `${name}-`));
	const binDir = path.join(dir, "bin");
	const logPath = path.join(dir, "notify.log");
	fs.mkdirSync(binDir);

	const script = [
		"#!/bin/sh",
		noise ? 'echo "stdout-noise"; echo "stderr-noise" >&2' : "",
		sleepMs ? `sleep ${sleepMs / 1000}` : "",
		`printf '%s\\n' "$@" > "$NOTIFY_LOG"`,
	].filter(Boolean).join("\n");

	fs.writeFileSync(path.join(binDir, "notify-send"), script, { mode: 0o755 });
	return { binDir, logPath };
}

/**
 * Runs a module in a subprocess. With `binDir`, the fake notify-send shadows the
 * real one while the rest of the system PATH stays available (so /bin/sh helpers
 * such as `sleep` resolve). With `emptyPath`, nothing resolves at all.
 */
function runSubprocess(code, { binDir, logPath, emptyPath = false, timeout = 15_000 } = {}) {
	const PATH = emptyPath
		? ""
		: binDir
			? `${binDir}:${process.env.PATH}`
			: process.env.PATH;
	return spawnSync(
		process.execPath,
		["--disable-warning=ExperimentalWarning", "--input-type=module", "-e", code],
		{
			encoding: "utf-8",
			timeout,
			env: { ...process.env, PATH, NOTIFY_LOG: logPath ?? "" },
		},
	);
}

function readArgv(logPath, { timeoutMs = 6000 } = {}) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			return fs.readFileSync(logPath, "utf-8").split("\n").filter((l) => l !== "");
		} catch {
			if (Date.now() > deadline) return null;
			const until = Date.now() + 50;
			while (Date.now() < until) { /* spin: sync wait keeps tests simple */ }
		}
	}
}

function logExists(logPath) {
	try {
		fs.readFileSync(logPath);
		return true;
	} catch {
		return false;
	}
}

/** Loads index.ts, builds a stub ExtensionAPI, and returns the registered handlers. */
async function loadExtension() {
	const handlers = {};
	const registered = [];
	const pi = {
		on(event, handler) {
			registered.push(event);
			handlers[event] = handler;
			return () => {};
		},
	};
	const mod = await import(indexHref);
	await mod.default(pi);
	return { pi, handlers, registered };
}

// ── notifyUser: real spawn behaviour ─────────────────────────────

describe("notifyUser", () => {
	it("invokes notify-send with summary then body", async () => {
		const { binDir, logPath } = makeFakeNotifySend("argv");
		const code = `
			import { notifyUser } from ${JSON.stringify(notifierHref)};
			notifyUser("Pi", "Awaiting your input");
			setTimeout(() => process.exit(0), 1500);
		`;
		const result = runSubprocess(code, { binDir, logPath });
		assert.equal(result.status, 0, `subprocess failed: ${result.stderr}`);
		assert.deepEqual(readArgv(logPath), ["Pi", "Awaiting your input"]);
	});

	it("does not delay process exit and still notifies after exit", async () => {
		// Exercises `stdio: "ignore"` and `.unref()` (and `detached`): a slow
		// notify-send must not keep the agent alive, yet the detached child must
		// still finish writing its notification after the parent has exited.
		const { binDir, logPath } = makeFakeNotifySend("unref", { sleepMs: 2000 });
		const code = `
			import { notifyUser } from ${JSON.stringify(notifierHref)};
			notifyUser("Pi", "Awaiting your input");
			// No timer, no await: the process must be free to exit immediately.
		`;
		const started = Date.now();
		const result = runSubprocess(code, { binDir, logPath });
		const elapsed = Date.now() - started;

		assert.equal(result.status, 0, `subprocess failed: ${result.stderr}`);
		assert.ok(
			elapsed < 1000,
			`parent blocked for ${elapsed}ms waiting on the notification child`,
		);
		assert.deepEqual(readArgv(logPath), ["Pi", "Awaiting your input"]);
	});

	it("does not leak child output into the agent's stdio", async () => {
		const { binDir, logPath } = makeFakeNotifySend("stdio", { noise: true });
		const code = `
			import { notifyUser } from ${JSON.stringify(notifierHref)};
			notifyUser("Pi", "Awaiting your input");
			setTimeout(() => process.exit(0), 1000);
		`;
		const result = runSubprocess(code, { binDir, logPath });
		assert.equal(result.stdout, "", "child stdout must not reach the terminal");
		assert.equal(result.stderr, "", "child stderr must not reach the terminal");
	});

	it("does not crash the agent when notify-send is missing", () => {
		// A missing notify-send surfaces as an asynchronous "error" event on the
		// child process, which a try/catch around spawn does NOT catch. Without a
		// listener Node rethrows it as an uncaught exception.
		const code = `
			import { notifyUser } from ${JSON.stringify(notifierHref)};
			process.on("uncaughtException", () => process.exit(3));
			process.on("unhandledRejection", () => process.exit(4));
			notifyUser("Pi", "Awaiting your input");
			setTimeout(() => process.exit(0), 500);
		`;
		const result = runSubprocess(code, { emptyPath: true }); // notify-send unresolvable
		assert.equal(
			result.status,
			0,
			`expected clean exit, got status=${result.status} signal=${result.signal}\n${result.stderr}`,
		);
	});

	it("exports notifyUser as a callable named export", async () => {
		const mod = await import(notifierHref);
		assert.equal(typeof mod.notifyUser, "function");
	});
});

// ── Extension registration against the current ExtensionAPI ──────

describe("extension registration", () => {
	it("registers exactly one agent_settled handler", async () => {
		const { pi, handlers, registered } = await loadExtension();

		assert.equal(registered.length, 1);
		assert.deepEqual(registered, ["agent_settled"]);
		assert.equal(typeof handlers.agent_settled, "function");
	});

	it("does not subscribe to the low-level agent_end event", async () => {
		const { registered } = await loadExtension();
		assert.ok(
			!registered.includes("agent_end"),
			"agent_end fires before retries/recovery settle and yields false notifications",
		);
	});

	it("notifies when a settled run completed", async () => {
		const { binDir, logPath } = makeFakeNotifySend("settled-ok");
		const code = `
			import { pathToFileURL } from "node:url";
			const mod = await import(${JSON.stringify(indexHref)});
			const handlers = {};
			mod.default({ on: (event, handler) => { handlers[event] = handler; } });
			await handlers.agent_settled({ type: "agent_settled", aborted: false });
			setTimeout(() => process.exit(0), 1000);
		`;
		const result = runSubprocess(code, { binDir, logPath });
		assert.equal(result.status, 0, `subprocess failed: ${result.stderr}`);
		assert.deepEqual(readArgv(logPath), ["Pi", "Awaiting your input"]);
	});

	it("stays silent when the run was aborted (Escape)", async () => {
		const { binDir, logPath } = makeFakeNotifySend("settled-aborted");
		const code = `
			const mod = await import(${JSON.stringify(indexHref)});
			const handlers = {};
			mod.default({ on: (event, handler) => { handlers[event] = handler; } });
			await handlers.agent_settled({ type: "agent_settled", aborted: true });
			setTimeout(() => process.exit(0), 1000);
		`;
		const result = runSubprocess(code, { binDir, logPath });
		assert.equal(result.status, 0, `subprocess failed: ${result.stderr}`);
		// Give a wrongly-fired notification time to land before asserting absence.
		assert.equal(logExists(logPath), false, "aborted run must not notify");
	});

	it("still notifies on backends whose agent_settled event has no aborted flag", async () => {
		// `aborted` was added in Pi 1.1.0; on 0.80.4–1.0.x the field is absent.
		const { binDir, logPath } = makeFakeNotifySend("settled-legacy");
		const code = `
			const mod = await import(${JSON.stringify(indexHref)});
			const handlers = {};
			mod.default({ on: (event, handler) => { handlers[event] = handler; } });
			await handlers.agent_settled({ type: "agent_settled" });
			setTimeout(() => process.exit(0), 1000);
		`;
		const result = runSubprocess(code, { binDir, logPath });
		assert.equal(result.status, 0, `subprocess failed: ${result.stderr}`);
		assert.deepEqual(readArgv(logPath), ["Pi", "Awaiting your input"]);
	});

	it("tolerates a rejecting notify backend without failing the settle dispatch", async () => {
		// The handler must not reject: agent_settled handlers are awaited, and a
		// rejected handler surfaces as an extension error in the host.
		const { binDir, logPath } = makeFakeNotifySend("robust", { noise: true });
		const code = `
			const mod = await import(${JSON.stringify(indexHref)});
			const handlers = {};
			mod.default({ on: (event, handler) => { handlers[event] = handler; } });
			for (let i = 0; i < 5; i++) {
				await handlers.agent_settled({ type: "agent_settled", aborted: false });
			}
			process.exit(0);
		`;
		const result = runSubprocess(code, { binDir, logPath });
		assert.equal(result.status, 0, `handler rejected: ${result.stderr}`);
	});
});
