import fs from 'fs';
import path from 'path';

export interface UsageEvent {
  type: 'app_open' | 'app_active';
  app: string;
  timestamp: string;
}

/**
 * Memoria de uso de la TV: persiste eventos (apps abiertas / activas) con timestamp
 * para que el agente pueda responder "¿qué estaba viendo ayer a las 22:00?".
 * Persistencia en un archivo JSON (backend/data/, gitignored).
 */
export class MemoryStore {
  private readonly file: string;
  private readonly maxEvents: number;
  private events: UsageEvent[] = [];

  constructor(file: string, maxEvents = 2000) {
    this.file = file;
    this.maxEvents = maxEvents;
    this.load();
  }

  record(type: 'app_open' | 'app_active', app: string, ts = new Date().toISOString()): void {
    this.events.push({ type, app, timestamp: ts });
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    this.save();
  }

  query(rangeMs: number): UsageEvent[] {
    const cutoff = Date.now() - rangeMs;
    return this.events.filter((e) => Date.parse(e.timestamp) >= cutoff);
  }

  /** App activa más reciente registrada. */
  currentApp(): string | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === 'app_active') return this.events[i].app;
    }
    return null;
  }

  recentAppOpens(limit = 10): UsageEvent[] {
    return this.events.filter((e) => e.type === 'app_open').slice(-limit);
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) this.events = parsed;
    } catch {
      this.events = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.events, null, 2));
  }
}