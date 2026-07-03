use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::Emitter;

const RING_CAPACITY: usize = 1000;

/// Known event topics per FOUNDATION §7. Adding a new topic is
/// backward-compatible; renaming one is a breaking change.
const KNOWN_TOPICS: &[&str] = &[
    "request.sent",
    "request.completed",
    "mail.received",
    "db.query",
    "log.line",
    "mock.hit",
    "process.state",
];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub seq: u64,
    pub topic: String,
    pub timestamp_ms: u64,
    pub payload: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum EventBusError {
    #[error("unknown topic: {0}")]
    UnknownTopic(String),
}

impl Serialize for EventBusError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// ---------------------------------------------------------------------------
// EventBus — pure logic, testable without Tauri
// ---------------------------------------------------------------------------

pub struct EventBus {
    /// Monotonic counter shared across threads.
    next_seq: AtomicU64,
    ring: Mutex<VecDeque<Event>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            next_seq: AtomicU64::new(1),
            ring: Mutex::new(VecDeque::with_capacity(RING_CAPACITY)),
        }
    }

    /// Validate topic, assign seq + timestamp, store in ring.
    /// Returns the stamped event so the caller can forward it to the
    /// frontend (Tauri emit) — that I/O stays outside this struct.
    pub fn emit(&self, topic: &str, payload: serde_json::Value) -> Result<Event, EventBusError> {
        if !KNOWN_TOPICS.contains(&topic) {
            return Err(EventBusError::UnknownTopic(topic.to_string()));
        }

        let seq = self.next_seq.fetch_add(1, Ordering::Relaxed);
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before UNIX epoch")
            .as_millis() as u64;

        let event = Event {
            seq,
            topic: topic.to_string(),
            timestamp_ms,
            payload,
        };

        let mut ring = self.ring.lock().expect("event bus lock poisoned");
        if ring.len() == RING_CAPACITY {
            ring.pop_front();
        }
        // TODO(timeline-persistence): write event to SQLite here
        ring.push_back(event.clone());

        Ok(event)
    }

    /// Return events with seq > since_seq (or all if None).
    pub fn recent(&self, since_seq: Option<u64>) -> Vec<Event> {
        let ring = self.ring.lock().expect("event bus lock poisoned");
        match since_seq {
            Some(s) => ring.iter().filter(|e| e.seq > s).cloned().collect(),
            None => ring.iter().cloned().collect(),
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands — thin wrappers around EventBus via managed state
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn core_emit_event(
    topic: String,
    payload: serde_json::Value,
    bus: tauri::State<'_, EventBus>,
    app: tauri::AppHandle,
) -> Result<Event, EventBusError> {
    let event = bus.emit(&topic, payload)?;
    // Forward to frontend listeners on a single channel.
    // Errors here are non-fatal — the frontend may not have a listener yet.
    let _ = app.emit("adaka://event", &event);
    Ok(event)
}

#[tauri::command]
pub fn core_recent_events(since_seq: Option<u64>, bus: tauri::State<'_, EventBus>) -> Vec<Event> {
    bus.recent(since_seq)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn seq_monotonicity_across_threads() {
        let bus = Arc::new(EventBus::new());
        let per_thread = 200;
        let num_threads = 5;

        let handles: Vec<_> = (0..num_threads)
            .map(|_| {
                let bus = Arc::clone(&bus);
                thread::spawn(move || {
                    let mut seqs = Vec::with_capacity(per_thread);
                    for _ in 0..per_thread {
                        let ev = bus.emit("request.sent", serde_json::json!({})).unwrap();
                        seqs.push(ev.seq);
                    }
                    seqs
                })
            })
            .collect();

        let mut all_seqs: Vec<u64> = Vec::new();
        for h in handles {
            all_seqs.extend(h.join().unwrap());
        }

        let total = num_threads * per_thread;
        assert_eq!(all_seqs.len(), total);

        let unique: HashSet<u64> = all_seqs.iter().copied().collect();
        assert_eq!(unique.len(), total, "every seq must be unique");

        let mut sorted = all_seqs.clone();
        sorted.sort();
        assert_eq!(sorted.first().copied(), Some(1), "seqs start at 1");
        assert_eq!(
            sorted.last().copied(),
            Some(total as u64),
            "seqs are contiguous up to total"
        );
    }

    #[test]
    fn ring_eviction_at_capacity() {
        let bus = EventBus::new();
        for i in 0..RING_CAPACITY + 50 {
            bus.emit("db.query", serde_json::json!({ "i": i })).unwrap();
        }

        let events = bus.recent(None);
        assert_eq!(events.len(), RING_CAPACITY);

        // Oldest surviving event should be seq 51 (first 50 evicted).
        assert_eq!(events[0].seq, 51);
        assert_eq!(events[RING_CAPACITY - 1].seq, (RING_CAPACITY + 50) as u64);
    }

    #[test]
    fn invalid_topic_rejected() {
        let bus = EventBus::new();
        let err = bus
            .emit("not.a.real.topic", serde_json::json!({}))
            .unwrap_err();
        assert!(
            matches!(err, EventBusError::UnknownTopic(ref t) if t == "not.a.real.topic"),
            "expected UnknownTopic, got: {err}"
        );
    }

    #[test]
    fn since_seq_filtering() {
        let bus = EventBus::new();
        for _ in 0..10 {
            bus.emit("log.line", serde_json::json!({})).unwrap();
        }

        let after_5 = bus.recent(Some(5));
        assert_eq!(after_5.len(), 5);
        assert!(after_5.iter().all(|e| e.seq > 5));

        let all = bus.recent(None);
        assert_eq!(all.len(), 10);

        let after_10 = bus.recent(Some(10));
        assert!(after_10.is_empty());
    }

    #[test]
    fn all_known_topics_accepted() {
        let bus = EventBus::new();
        for topic in KNOWN_TOPICS {
            bus.emit(topic, serde_json::json!({})).unwrap();
        }
        assert_eq!(bus.recent(None).len(), KNOWN_TOPICS.len());
    }

    #[test]
    fn event_carries_payload() {
        let bus = EventBus::new();
        let payload = serde_json::json!({ "method": "GET", "url": "/users" });
        let ev = bus.emit("request.sent", payload.clone()).unwrap();
        assert_eq!(ev.payload, payload);
    }

    #[test]
    fn timestamp_is_recent() {
        let before = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let bus = EventBus::new();
        let ev = bus.emit("mock.hit", serde_json::json!({})).unwrap();
        let after = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        assert!(ev.timestamp_ms >= before && ev.timestamp_ms <= after);
    }
}
