import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface AdakaEvent {
  seq: number;
  topic: string;
  timestamp_ms: number;
  payload: unknown;
}

type EventHandler = (event: AdakaEvent) => void;

const topicHandlers = new Map<string, Set<EventHandler>>();
let globalUnsub: UnlistenFn | null = null;

async function ensureListener(): Promise<void> {
  if (globalUnsub) return;
  globalUnsub = await listen<AdakaEvent>("adaka://event", (e) => {
    const handlers = topicHandlers.get(e.payload.topic);
    if (handlers) {
      for (const h of handlers) h(e.payload);
    }
  });
}

export async function onEvent(
  topic: string,
  handler: EventHandler,
): Promise<() => void> {
  await ensureListener();
  let set = topicHandlers.get(topic);
  if (!set) {
    set = new Set();
    topicHandlers.set(topic, set);
  }
  set.add(handler);
  return () => {
    set.delete(handler);
    if (set.size === 0) topicHandlers.delete(topic);
  };
}

export async function emitEvent(
  topic: string,
  payload: unknown,
): Promise<AdakaEvent> {
  return invoke<AdakaEvent>("core_emit_event", { topic, payload });
}

export async function recentEvents(
  sinceSeq?: number,
): Promise<AdakaEvent[]> {
  return invoke<AdakaEvent[]>("core_recent_events", {
    sinceSeq: sinceSeq ?? null,
  });
}
