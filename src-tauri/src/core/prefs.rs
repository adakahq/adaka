use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum PrefsError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

impl Serialize for PrefsError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// ---------------------------------------------------------------------------
// PrefsStore — JSON file in app-data dir
// TODO(sqlite): migrate to SQLite once tauri-plugin-sql is wired
// ---------------------------------------------------------------------------

pub struct PrefsStore {
    path: PathBuf,
    cache: Mutex<HashMap<String, serde_json::Value>>,
}

impl PrefsStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        fs::create_dir_all(&app_data_dir).ok();
        let path = app_data_dir.join("prefs.json");
        let cache = if path.is_file() {
            let data = fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            HashMap::new()
        };
        Self {
            path,
            cache: Mutex::new(cache),
        }
    }

    pub fn get(&self, key: &str) -> Option<serde_json::Value> {
        let cache = self.cache.lock().expect("prefs lock poisoned");
        cache.get(key).cloned()
    }

    pub fn set(&self, key: &str, value: serde_json::Value) -> Result<(), PrefsError> {
        let mut cache = self.cache.lock().expect("prefs lock poisoned");
        cache.insert(key.to_string(), value);
        self.flush(&cache)
    }

    fn flush(&self, cache: &HashMap<String, serde_json::Value>) -> Result<(), PrefsError> {
        let json = serde_json::to_string_pretty(cache)?;
        let mut file = File::create(&self.path)?;
        file.write_all(json.as_bytes())?;
        file.sync_all()?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn core_get_pref(
    key: String,
    store: tauri::State<'_, PrefsStore>,
) -> Option<serde_json::Value> {
    store.get(&key)
}

#[tauri::command]
pub fn core_set_pref(
    key: String,
    value: serde_json::Value,
    store: tauri::State<'_, PrefsStore>,
) -> Result<(), PrefsError> {
    store.set(&key, value)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_set_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let store = PrefsStore::new(dir.path().to_path_buf());

        assert!(store.get("theme").is_none());

        store.set("theme", serde_json::json!("dark")).unwrap();
        assert_eq!(store.get("theme"), Some(serde_json::json!("dark")));

        store.set("theme", serde_json::json!("light")).unwrap();
        assert_eq!(store.get("theme"), Some(serde_json::json!("light")));
    }

    #[test]
    fn persists_to_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_path_buf();

        {
            let store = PrefsStore::new(path.clone());
            store.set("key", serde_json::json!(42)).unwrap();
        }

        let store2 = PrefsStore::new(path);
        assert_eq!(store2.get("key"), Some(serde_json::json!(42)));
    }
}
