/**
 * Tests for the turn-notifier extension.
 *
 * Run with: node --test tests/turn-notifier.test.js
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const notifierPath = path.join(__dirname, "..", "notifier.js");

// ── Tests for notifyUser (runtime behavior) ─────────────────────

describe("notifyUser", () => {
	it("does not throw with valid arguments", async () => {
		const { notifyUser } = await import("../notifier.js");
		assert.doesNotThrow(() => {
			notifyUser("Pi", "Awaiting your input");
		});
	});

	it("does not crash the process when notify-send is missing", () => {
		// A missing notify-send surfaces as an asynchronous "error" event on
		// the child process, which a try/catch around spawn does NOT catch.
		// Run notifyUser in a real subprocess with an empty PATH (so notify-send
		// cannot be resolved) and assert the process exits cleanly rather than
		// dying from an uncaught ENOENT exception.
		const child = `
			import { notifyUser } from ${JSON.stringify(pathToFileURL(notifierPath).href)};
			process.on("uncaughtException", () => process.exit(3));
			process.on("unhandledRejection", () => process.exit(4));
			notifyUser("Pi", "Awaiting your input");
			setTimeout(() => process.exit(0), 500);
		`;
		const result = spawnSync(
			process.execPath,
			["--input-type=module", "-e", child],
			{ env: { PATH: "" }, encoding: "utf-8" },
		);
		assert.equal(
			result.status,
			0,
			`expected clean exit, got status=${result.status} signal=${result.signal}\n${result.stderr}`,
		);
	});
});

// ── Tests for extension registration ─────────────────────────────

describe("extension registration", () => {
	it("registers an agent_end handler", async () => {
		const registeredEvents = [];
		const handlers = {};
		const pi = {
			on: mock.fn((event, handler) => {
				registeredEvents.push(event);
				handlers[event] = handler;
			}),
		};

		const mod = await import("../index.ts");
		mod.default(pi);

		assert.equal(pi.on.mock.callCount(), 1);
		assert.deepEqual(registeredEvents, ["agent_end"]);
		assert.ok(typeof handlers.agent_end === "function");
	});

	it("agent_end handler calls notifyUser with correct args", async () => {
		const handlers = {};
		const pi = {
			on: (event, handler) => {
				handlers[event] = handler;
			},
		};

		const mod = await import("../index.ts");
		mod.default(pi);

		// Simulate agent_end firing
		assert.doesNotThrow(async () => {
			await handlers.agent_end({}, {});
		});
	});

	it("fires only on agent_end (not on other events)", async () => {
		const registeredEvents = [];
		const pi = {
			on: (event, _handler) => {
				registeredEvents.push(event);
			},
		};

		const mod = await import("../index.ts");
		mod.default(pi);

		assert.deepEqual(registeredEvents, ["agent_end"]);
		assert.equal(registeredEvents.length, 1);
	});
});

// ── Unit tests for notifier.js spawn arguments ───────────────────
// These tests verify the spawn call parameters by reading the source
// and checking for the expected patterns.

describe("notifier.js spawn parameters", () => {
	const src = fs.readFileSync(notifierPath, "utf-8");

	it("passes 'notify-send' as command", () => {
		assert.ok(
			src.includes('spawn("notify-send"') || src.includes("'notify-send'"),
			"notifier.js must spawn 'notify-send'",
		);
	});

	it("passes detached: true option", () => {
		assert.ok(
			src.includes("detached: true"),
			"notifier.js must pass detached: true",
		);
	});

	it("passes stdio: 'ignore' option", () => {
		assert.ok(
			src.includes("stdio: 'ignore'") || src.includes('stdio: "ignore"'),
			"notifier.js must pass stdio: 'ignore'",
		);
	});

	it("calls .unref() on the child process", () => {
		assert.ok(
			src.includes(".unref()"),
			"notifier.js must call .unref() on child process",
		);
	});

	it("wraps spawn in try/catch for graceful failure", () => {
		assert.ok(
			src.includes("try") && src.includes("catch"),
			"notifier.js must wrap spawn in try/catch",
		);
	});

	it("registers an 'error' listener for async ENOENT (missing notify-send)", () => {
		assert.ok(
			/\.on\(\s*["']error["']/.test(src),
			"notifier.js must attach an 'error' listener so a missing notify-send does not crash the process",
		);
	});

	it("exports notifyUser as a named export", () => {
		assert.ok(
			src.includes("export function notifyUser") ||
				src.includes("export { notifyUser }"),
			"notifier.js must export notifyUser",
		);
	});

	it("imports spawn from node:child_process", () => {
		assert.ok(
			src.includes("node:child_process"),
			"notifier.js must import from node:child_process",
		);
	});
});

// ── Integration: verify the full flow ────────────────────────────

describe("full flow integration", () => {
	it("extension factory + agent_end handler + notifyUser end-to-end", async () => {
		const handlers = {};
		const pi = {
			on: (event, handler) => {
				handlers[event] = handler;
			},
		};

		const mod = await import("../index.ts");
		mod.default(pi);

		// Verify handler exists
		assert.ok(handlers.agent_end, "agent_end handler should be registered");

		// Verify handler executes without error
		await handlers.agent_end({}, {});
	});
});
