/**
 * In-memory pub/sub for SSE notification fan-out.
 *
 * Single-instance only. For multi-instance deploy, swap for Redis pub/sub.
 * One subscriber per browser tab; userId is the channel key.
 */
import { EventEmitter } from "node:events";

declare global {
  // eslint-disable-next-line no-var
  var __nq_notification_emitter: EventEmitter | undefined;
}

const emitter: EventEmitter = globalThis.__nq_notification_emitter ?? new EventEmitter();
emitter.setMaxListeners(500);
if (!globalThis.__nq_notification_emitter) globalThis.__nq_notification_emitter = emitter;

export interface SsePayload {
  type: "notification";
  id: number;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
}

export function subscribeUser(userId: string, cb: (payload: SsePayload) => void): () => void {
  const key = `user:${userId}`;
  emitter.on(key, cb);
  return () => emitter.off(key, cb);
}

export function broadcastToUser(userId: string, payload: SsePayload): void {
  emitter.emit(`user:${userId}`, payload);
}
