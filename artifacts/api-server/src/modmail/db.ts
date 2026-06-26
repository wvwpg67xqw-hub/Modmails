import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "modmail.json");

interface Thread {
  threadId: string;
  channelId: string;
  userId: string;
  username: string;
  open: boolean;
  category: string;
  createdAt: number;
  subscribers: string[];
}

interface Snippet {
  name: string;
  content: string;
}

interface DB {
  threads: Record<string, Thread>;
  snippets: Record<string, Snippet>;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(): DB {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) {
    return { threads: {}, snippets: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    return { threads: {}, snippets: {} };
  }
}

function save(db: DB) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export function getThreadByChannel(channelId: string): Thread | null {
  const db = load();
  return Object.values(db.threads).find((t) => t.channelId === channelId) ?? null;
}

export function getThreadByUser(userId: string): Thread | null {
  const db = load();
  return Object.values(db.threads).find((t) => t.userId === userId && t.open) ?? null;
}

export function getThreadById(threadId: string): Thread | null {
  const db = load();
  return db.threads[threadId] ?? null;
}

export function createThread(thread: Thread) {
  const db = load();
  db.threads[thread.threadId] = thread;
  save(db);
}

export function updateThread(threadId: string, updates: Partial<Thread>) {
  const db = load();
  if (db.threads[threadId]) {
    db.threads[threadId] = { ...db.threads[threadId], ...updates };
    save(db);
  }
}

export function closeThread(threadId: string) {
  const db = load();
  if (db.threads[threadId]) {
    db.threads[threadId].open = false;
    save(db);
  }
}

export function getAllOpenThreads(): Thread[] {
  const db = load();
  return Object.values(db.threads).filter((t) => t.open);
}

export function addSubscriber(channelId: string, userId: string) {
  const db = load();
  const thread = Object.values(db.threads).find((t) => t.channelId === channelId);
  if (thread && !thread.subscribers.includes(userId)) {
    thread.subscribers.push(userId);
    save(db);
  }
}

export function removeSubscriber(channelId: string, userId: string) {
  const db = load();
  const thread = Object.values(db.threads).find((t) => t.channelId === channelId);
  if (thread) {
    thread.subscribers = thread.subscribers.filter((s) => s !== userId);
    save(db);
  }
}

export function getSnippet(name: string): Snippet | null {
  const db = load();
  return db.snippets[name.toLowerCase()] ?? null;
}

export function addSnippet(name: string, content: string) {
  const db = load();
  db.snippets[name.toLowerCase()] = { name: name.toLowerCase(), content };
  save(db);
}

export function removeSnippet(name: string): boolean {
  const db = load();
  if (db.snippets[name.toLowerCase()]) {
    delete db.snippets[name.toLowerCase()];
    save(db);
    return true;
  }
  return false;
}

export function listSnippets(): Snippet[] {
  const db = load();
  return Object.values(db.snippets);
}
