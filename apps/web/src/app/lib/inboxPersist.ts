import { promises as fs } from "node:fs";
import path from "node:path";
import type { InboxKey, InboxTask } from "./inboxTypes";

export type InboxState = {
  keys: Record<string, InboxKey>;
  tasks: Record<string, InboxTask[]>;
};

export interface InboxPersistence {
  getState(): Promise<InboxState>;
  setState(state: InboxState): Promise<void>;
  getKey(wallet: string): Promise<InboxKey | null>;
  setKey(wallet: string, key: InboxKey): Promise<void>;
  deleteKey(wallet: string): Promise<void>;
  getTasks(wallet: string): Promise<InboxTask[]>;
  setTasks(wallet: string, tasks: InboxTask[]): Promise<void>;
  addTask(wallet: string, task: InboxTask): Promise<void>;
  cleanup(): Promise<number>;
}

const STORE_KEY = "inbox-store:v1";
const STORE_FILE = "/tmp/inbox-store.json";

const globalInboxPersistence = globalThis as typeof globalThis & {
  __agentPulseInboxPersistence?: InboxPersistence;
};

function emptyState(): InboxState {
  return { keys: {}, tasks: {} };
}

function normalizeState(raw: unknown): InboxState {
  if (!raw || typeof raw !== "object") return emptyState();
  const data = raw as { keys?: unknown; tasks?: unknown };
  const keysInput = data.keys && typeof data.keys === "object" ? data.keys : {};
  const tasksInput = data.tasks && typeof data.tasks === "object" ? data.tasks : {};

  const keys: Record<string, InboxKey> = {};
  for (const [wallet, value] of Object.entries(keysInput as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const record = value as InboxKey;
    if (typeof record.key !== "string") continue;
    if (typeof record.expiresAt !== "number") continue;
    keys[wallet] = { key: record.key, expiresAt: record.expiresAt };
  }

  const tasks: Record<string, InboxTask[]> = {};
  for (const [wallet, value] of Object.entries(
    tasksInput as Record<string, unknown>
  )) {
    if (!Array.isArray(value)) continue;
    tasks[wallet] = value
      .map((task) => task as InboxTask)
      .filter(
        (task) =>
          task &&
          typeof task.id === "string" &&
          typeof task.receivedAt === "number"
      )
      .map((task) => ({
        id: task.id,
        receivedAt: task.receivedAt,
        payload: task.payload,
      }));
  }

  return { keys, tasks };
}

async function kvPipeline(commands: unknown[][]): Promise<unknown[]> {
  const kvRestApiUrl = process.env.KV_REST_API_URL || "";
  const kvRestApiToken = process.env.KV_REST_API_TOKEN || "";
  if (!kvRestApiUrl || !kvRestApiToken) return [];
  try {
    const response = await fetch(`${kvRestApiUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kvRestApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { result?: unknown[] };
    return Array.isArray(body?.result) ? body.result : [];
  } catch {
    return [];
  }
}

async function kvGet(key: string): Promise<string | null> {
  const [result] = await kvPipeline([["GET", key]]);
  return typeof result === "string" ? result : null;
}

async function kvSet(key: string, value: string): Promise<void> {
  await kvPipeline([["SET", key, value]]);
}

class KvInboxPersistence implements InboxPersistence {
  async getState(): Promise<InboxState> {
    const value = await kvGet(STORE_KEY);
    if (!value) return emptyState();
    try {
      return normalizeState(JSON.parse(value));
    } catch {
      return emptyState();
    }
  }

  async setState(state: InboxState): Promise<void> {
    await kvSet(STORE_KEY, JSON.stringify(state));
  }

  async getKey(wallet: string): Promise<InboxKey | null> {
    const state = await this.getState();
    return state.keys[wallet] ?? null;
  }

  async setKey(wallet: string, key: InboxKey): Promise<void> {
    const state = await this.getState();
    state.keys[wallet] = key;
    await this.setState(state);
  }

  async deleteKey(wallet: string): Promise<void> {
    const state = await this.getState();
    delete state.keys[wallet];
    await this.setState(state);
  }

  async getTasks(wallet: string): Promise<InboxTask[]> {
    const state = await this.getState();
    return state.tasks[wallet] ?? [];
  }

  async setTasks(wallet: string, tasks: InboxTask[]): Promise<void> {
    const state = await this.getState();
    state.tasks[wallet] = tasks;
    await this.setState(state);
  }

  async addTask(wallet: string, task: InboxTask): Promise<void> {
    const state = await this.getState();
    const existing = state.tasks[wallet] ?? [];
    existing.push(task);
    state.tasks[wallet] = existing;
    await this.setState(state);
  }

  async cleanup(): Promise<number> {
    const state = await this.getState();
    const now = Date.now();
    let removed = 0;
    for (const [wallet, record] of Object.entries(state.keys)) {
      if (record.expiresAt <= now) {
        delete state.keys[wallet];
        removed += 1;
      }
    }
    if (removed > 0) {
      await this.setState(state);
    }
    return removed;
  }
}

class FileInboxPersistence implements InboxPersistence {
  private loaded = false;
  private state: InboxState = emptyState();
  private loading: Promise<void> | null = null;

  private async loadState(): Promise<InboxState> {
    if (this.loaded) return this.state;
    if (this.loading) {
      await this.loading;
      return this.state;
    }
    const loading = (async () => {
      try {
        const data = await fs.readFile(STORE_FILE, "utf8");
        this.state = normalizeState(JSON.parse(data));
      } catch {
        this.state = emptyState();
      }
      this.loaded = true;
    })();
    this.loading = loading;
    await loading;
    this.loading = null;
    return this.state;
  }

  private async saveState(state: InboxState): Promise<void> {
    this.state = state;
    this.loaded = true;
    await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
    await fs.writeFile(STORE_FILE, JSON.stringify(state), "utf8");
  }

  async getState(): Promise<InboxState> {
    return this.loadState();
  }

  async setState(state: InboxState): Promise<void> {
    await this.saveState(state);
  }

  async getKey(wallet: string): Promise<InboxKey | null> {
    const state = await this.loadState();
    return state.keys[wallet] ?? null;
  }

  async setKey(wallet: string, key: InboxKey): Promise<void> {
    const state = await this.loadState();
    state.keys[wallet] = key;
    await this.saveState(state);
  }

  async deleteKey(wallet: string): Promise<void> {
    const state = await this.loadState();
    delete state.keys[wallet];
    await this.saveState(state);
  }

  async getTasks(wallet: string): Promise<InboxTask[]> {
    const state = await this.loadState();
    return state.tasks[wallet] ?? [];
  }

  async setTasks(wallet: string, tasks: InboxTask[]): Promise<void> {
    const state = await this.loadState();
    state.tasks[wallet] = tasks;
    await this.saveState(state);
  }

  async addTask(wallet: string, task: InboxTask): Promise<void> {
    const state = await this.loadState();
    const existing = state.tasks[wallet] ?? [];
    existing.push(task);
    state.tasks[wallet] = existing;
    await this.saveState(state);
  }

  async cleanup(): Promise<number> {
    const state = await this.loadState();
    const now = Date.now();
    let removed = 0;
    for (const [wallet, record] of Object.entries(state.keys)) {
      if (record.expiresAt <= now) {
        delete state.keys[wallet];
        removed += 1;
      }
    }
    if (removed > 0) {
      await this.saveState(state);
    }
    return removed;
  }
}

export function getInboxPersistence(): InboxPersistence {
  if (globalInboxPersistence.__agentPulseInboxPersistence) {
    return globalInboxPersistence.__agentPulseInboxPersistence;
  }

  const kvRestApiUrl = process.env.KV_REST_API_URL || "";
  const kvRestApiToken = process.env.KV_REST_API_TOKEN || "";
  const persistence =
    kvRestApiUrl && kvRestApiToken
      ? new KvInboxPersistence()
      : new FileInboxPersistence();

  globalInboxPersistence.__agentPulseInboxPersistence = persistence;
  return persistence;
}
