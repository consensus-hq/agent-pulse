import crypto from "node:crypto";
import { getInboxPersistence, type InboxState } from "./inboxPersist";
import type { InboxKey, InboxTask } from "./inboxTypes";

export type { InboxKey, InboxTask } from "./inboxTypes";

export class InboxKeyExistsError extends Error {
  constructor() {
    super("inbox_key_exists");
    this.name = "InboxKeyExistsError";
  }
}

const MAX_TASKS_PER_WALLET = 100;
const MAX_TOTAL_ENTRIES = 10_000;
const CLEANUP_INTERVAL = 10;

const globalInboxRuntime = globalThis as typeof globalThis & {
  __agentPulseInboxRuntime?: { requestCount: number };
};

function getRuntime() {
  if (!globalInboxRuntime.__agentPulseInboxRuntime) {
    globalInboxRuntime.__agentPulseInboxRuntime = { requestCount: 0 };
  }
  return globalInboxRuntime.__agentPulseInboxRuntime;
}

function normalizeWallet(wallet: string) {
  return wallet.toLowerCase();
}

function sweepExpiredKeys(state: InboxState): number {
  const now = Date.now();
  let removed = 0;
  for (const [wallet, record] of Object.entries(state.keys)) {
    if (record.expiresAt <= now) {
      delete state.keys[wallet];
      removed += 1;
    }
  }
  return removed;
}

function trimWalletTasks(state: InboxState): number {
  let trimmed = 0;
  for (const [wallet, tasks] of Object.entries(state.tasks)) {
    if (tasks.length <= MAX_TASKS_PER_WALLET) continue;
    const dropCount = tasks.length - MAX_TASKS_PER_WALLET;
    state.tasks[wallet] = tasks.slice(-MAX_TASKS_PER_WALLET);
    trimmed += dropCount;
  }
  return trimmed;
}

function totalEntries(state: InboxState): number {
  let total = Object.keys(state.keys).length;
  for (const tasks of Object.values(state.tasks)) {
    total += tasks.length;
  }
  return total;
}

function trimTotalEntries(state: InboxState): number {
  const total = totalEntries(state);
  if (total <= MAX_TOTAL_ENTRIES) return 0;
  let overage = total - MAX_TOTAL_ENTRIES;
  const allTasks: Array<{ wallet: string; id: string; receivedAt: number }> = [];
  for (const [wallet, tasks] of Object.entries(state.tasks)) {
    for (const task of tasks) {
      allTasks.push({ wallet, id: task.id, receivedAt: task.receivedAt });
    }
  }

  let removedTasks = 0;
  if (allTasks.length > 0 && overage > 0) {
    allTasks.sort((a, b) => a.receivedAt - b.receivedAt);
    const removalKeys = new Set<string>();
    for (let i = 0; i < Math.min(overage, allTasks.length); i += 1) {
      const task = allTasks[i];
      removalKeys.add(`${task.wallet}:${task.id}`);
    }
    for (const [wallet, tasks] of Object.entries(state.tasks)) {
      const filtered = tasks.filter(
        (task) => !removalKeys.has(`${wallet}:${task.id}`)
      );
      removedTasks += tasks.length - filtered.length;
      state.tasks[wallet] = filtered;
    }
    overage -= removedTasks;
  }

  if (overage > 0) {
    const keyEntries = Object.entries(state.keys).sort(
      (a, b) => a[1].expiresAt - b[1].expiresAt
    );
    for (let i = 0; i < Math.min(overage, keyEntries.length); i += 1) {
      const [wallet] = keyEntries[i];
      delete state.keys[wallet];
    }
  }

  return removedTasks;
}

function pruneEmptyTasks(state: InboxState) {
  for (const [wallet, tasks] of Object.entries(state.tasks)) {
    if (tasks.length === 0) {
      delete state.tasks[wallet];
    }
  }
}

function maybeCleanup(state: InboxState): number {
  const runtime = getRuntime();
  runtime.requestCount += 1;
  if (runtime.requestCount % CLEANUP_INTERVAL !== 0) return 0;
  return sweepExpiredKeys(state);
}

export async function issueKey(
  wallet: string,
  ttlSeconds: number
): Promise<InboxKey> {
  const persistence = getInboxPersistence();
  const normalized = normalizeWallet(wallet);
  const state = await persistence.getState();
  maybeCleanup(state);

  const now = Date.now();
  const existing = state.keys[normalized];
  if (existing) {
    if (existing.expiresAt > now) {
      throw new InboxKeyExistsError();
    }
    delete state.keys[normalized];
  }

  const key = crypto.randomBytes(24).toString("hex");
  const expiresAt = now + ttlSeconds * 1000;
  const record = { key, expiresAt };

  state.keys[normalized] = record;
  trimWalletTasks(state);
  trimTotalEntries(state);
  pruneEmptyTasks(state);
  await persistence.setState(state);
  return record;
}

export async function getActiveKey(wallet: string): Promise<InboxKey | null> {
  const persistence = getInboxPersistence();
  const normalized = normalizeWallet(wallet);
  const state = await persistence.getState();
  const removedByCleanup = maybeCleanup(state);
  const record = state.keys[normalized];
  if (!record) {
    if (removedByCleanup > 0) {
      await persistence.setState(state);
    }
    return null;
  }
  if (Date.now() > record.expiresAt) {
    delete state.keys[normalized];
    await persistence.setState(state);
    return null;
  }
  if (removedByCleanup > 0) {
    await persistence.setState(state);
  }
  return record;
}

export async function verifyKey(wallet: string, key: string): Promise<boolean> {
  const persistence = getInboxPersistence();
  const normalized = normalizeWallet(wallet);
  const state = await persistence.getState();
  const removedByCleanup = maybeCleanup(state);
  const record = state.keys[normalized];
  if (!record) {
    if (removedByCleanup > 0) {
      await persistence.setState(state);
    }
    return false;
  }
  if (Date.now() > record.expiresAt) {
    delete state.keys[normalized];
    await persistence.setState(state);
    return false;
  }
  if (removedByCleanup > 0) {
    await persistence.setState(state);
  }
  return record.key === key;
}

export async function addTask(
  wallet: string,
  payload: unknown
): Promise<InboxTask> {
  const persistence = getInboxPersistence();
  const normalized = normalizeWallet(wallet);
  const task: InboxTask = {
    id: crypto.randomUUID(),
    receivedAt: Date.now(),
    payload,
  };

  const state = await persistence.getState();
  maybeCleanup(state);
  const existing = state.tasks[normalized] ?? [];
  existing.push(task);
  state.tasks[normalized] = existing;
  trimWalletTasks(state);
  trimTotalEntries(state);
  pruneEmptyTasks(state);
  await persistence.setState(state);
  return task;
}

export async function listTasks(wallet: string): Promise<InboxTask[]> {
  const persistence = getInboxPersistence();
  const normalized = normalizeWallet(wallet);
  const state = await persistence.getState();
  const removed = maybeCleanup(state);
  if (removed > 0) {
    await persistence.setState(state);
  }
  return state.tasks[normalized] ?? [];
}

export async function cleanupInboxStore(): Promise<{
  expiredKeys: number;
  trimmedTasks: number;
}> {
  const persistence = getInboxPersistence();
  const state = await persistence.getState();
  const expiredKeys = sweepExpiredKeys(state);
  const trimmedWallet = trimWalletTasks(state);
  const trimmedTotal = trimTotalEntries(state);
  pruneEmptyTasks(state);
  const trimmedTasks = trimmedWallet + trimmedTotal;
  if (expiredKeys > 0 || trimmedTasks > 0) {
    await persistence.setState(state);
  }
  return { expiredKeys, trimmedTasks };
}
