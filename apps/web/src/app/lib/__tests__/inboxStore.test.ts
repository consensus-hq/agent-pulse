import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  InboxKeyExistsError,
  addTask,
  cleanupInboxStore,
  issueKey,
  listTasks,
  verifyKey,
} from "../inboxStore";
import { getInboxPersistence } from "../inboxPersist";
import { createRateLimiter } from "../rateLimit";
import type { InboxTask } from "../inboxTypes";

type GlobalState = typeof globalThis & {
  __agentPulseInboxPersistence?: unknown;
  __agentPulseInboxRuntime?: { requestCount: number };
};

async function resetStore() {
  process.env.KV_REST_API_URL = "";
  process.env.KV_REST_API_TOKEN = "";
  const globalState = globalThis as GlobalState;
  delete globalState.__agentPulseInboxPersistence;
  if (globalState.__agentPulseInboxRuntime) {
    globalState.__agentPulseInboxRuntime.requestCount = 0;
  }
  const persistence = getInboxPersistence();
  await persistence.setState({ keys: {}, tasks: {} });
}

beforeEach(async () => {
  await resetStore();
});

test("issueKey and verifyKey", async () => {
  const wallet = "0x000000000000000000000000000000000000dEaD";
  const record = await issueKey(wallet, 60);
  assert.ok(record.key.length > 0);
  assert.ok(await verifyKey(wallet, record.key));
  assert.equal(await verifyKey(wallet, "bad"), false);
});

test("issueKey does not overwrite active key", async () => {
  const wallet = "0x000000000000000000000000000000000000dEaD";
  await issueKey(wallet, 60);
  await assert.rejects(
    () => issueKey(wallet, 60),
    (error) => error instanceof InboxKeyExistsError
  );
});

test("key expiry", async () => {
  const wallet = "0x000000000000000000000000000000000000BEEF";
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const record = await issueKey(wallet, 1);
  now += 2_000;
  assert.equal(await verifyKey(wallet, record.key), false);
  Date.now = originalNow;
});

test("task add/list", async () => {
  const wallet = "0x0000000000000000000000000000000000000001";
  await addTask(wallet, { ok: true });
  const tasks = await listTasks(wallet);
  assert.equal(tasks.length, 1);
  assert.deepEqual(tasks[0].payload, { ok: true });
});

test("task limit per wallet", async () => {
  const wallet = "0x0000000000000000000000000000000000000002";
  for (let i = 0; i < 105; i += 1) {
    await addTask(wallet, { idx: i });
  }
  const tasks = await listTasks(wallet);
  assert.equal(tasks.length, 100);
  assert.equal((tasks[0].payload as { idx: number }).idx, 5);
});

test("rate limiter", () => {
  const limiter = createRateLimiter({ windowMs: 1_000, maxRequests: 2 });
  assert.ok(limiter.check("key").allowed);
  assert.ok(limiter.check("key").allowed);
  assert.equal(limiter.check("key").allowed, false);
});

test("cleanup trims expired keys and tasks", async () => {
  const wallet = "0x0000000000000000000000000000000000000003";
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  await issueKey(wallet, 1);
  now += 2_000;
  const persistence = getInboxPersistence();
  const tasks: InboxTask[] = [];
  for (let i = 0; i < 150; i += 1) {
    tasks.push({ id: `task-${i}`, receivedAt: i, payload: { i } });
  }
  await persistence.setState({ keys: { [wallet.toLowerCase()]: { key: "x", expiresAt: now - 1 } }, tasks: { [wallet.toLowerCase()]: tasks } });
  const result = await cleanupInboxStore();
  assert.equal(result.expiredKeys, 1);
  assert.equal(result.trimmedTasks, 50);
  const remaining = await listTasks(wallet);
  assert.equal(remaining.length, 100);
  Date.now = originalNow;
});
