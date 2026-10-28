import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
export function createStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(`${directory}/outreach.sqlite`);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, url TEXT UNIQUE NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, kind TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL);`);
  return {
    get(key, fallback = null) { const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; },
    set(key, value) { db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); },
    jobs() { return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all().map(row => ({ id: row.id, url: row.url, createdAt: row.created_at, ...JSON.parse(row.data) })); },
    addJob(url, data) { const id = randomUUID(); db.prepare('INSERT INTO jobs VALUES (?,?,?,?)').run(id, url, JSON.stringify(data), new Date().toISOString()); return id; },
    updateJob(id, data) { db.prepare('UPDATE jobs SET data=? WHERE id=?').run(JSON.stringify(data), id); },
    event(kind, message) { db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(randomUUID(), kind, message, new Date().toISOString()); },
    events() { return db.prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 100').all(); },
    close() { db.close(); }
  };
}
