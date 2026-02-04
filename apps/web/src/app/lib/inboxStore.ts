import crypto from "node:crypto";

export type InboxKey = {
  key: string;
  expiresAt: number;
};

export type InboxTask = {
  id: string;
  receivedAt: number;
  payload: unknown;
};

type InboxStore = {
  keys: Map<string, InboxKey>;
  tasks: Map<string, InboxTask[]>;
};

const globalStore = globalThis as typeof globalThis & {
  __agentPulseInboxStore?: InboxStore;
};

function getStore(): InboxStore {
  if (!globalStore.__agentPulseInboxStore) {
    globalStore.__agentPulseInboxStore = {
      keys: new Map(),
      tasks: new Map(),
    };
  }
  return globalStore.__agentPulseInboxStore;
}

export function issueKey(wallet: string, ttlSeconds: number): InboxKey {
  const store = getStore();
  const key = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const record = { key, expiresAt };
  store.keys.set(wallet.toLowerCase(), record);
  return record;
}

export function verifyKey(wallet: string, key: string): boolean {
  const store = getStore();
  const record = store.keys.get(wallet.toLowerCase());
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    store.keys.delete(wallet.toLowerCase());
    return false;
  }
  return record.key === key;
}

export function addTask(wallet: string, payload: unknown): InboxTask {
  const store = getStore();
  const task: InboxTask = {
    id: crypto.randomUUID(),
    receivedAt: Date.now(),
    payload,
  };
  const existing = store.tasks.get(wallet.toLowerCase()) ?? [];
  existing.push(task);
  store.tasks.set(wallet.toLowerCase(), existing);
  return task;
}

export function listTasks(wallet: string): InboxTask[] {
  const store = getStore();
  return store.tasks.get(wallet.toLowerCase()) ?? [];
}
