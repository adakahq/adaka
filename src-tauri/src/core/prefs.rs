use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

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

    /// Add a recent workspace and flush, all under one lock acquisition.
    /// Two windows opening workspaces around the same time each go through
    /// this method serialized by `cache`'s mutex, so the read-modify-write
    /// can't interleave and drop an entry the way it would if the frontend
    /// did get-then-set as two separate IPC round trips.
    pub fn add_recent_workspace(
        &self,
        name: &str,
        path: &str,
        last_opened: &str,
    ) -> Result<Vec<RecentWorkspace>, PrefsError> {
        let mut cache = self.cache.lock().expect("prefs lock poisoned");
        let mut list = read_recent_workspaces(&cache);
        list.retain(|r| r.path != path);
        list.insert(
            0,
            RecentWorkspace {
                name: name.to_string(),
                path: path.to_string(),
                last_opened: last_opened.to_string(),
            },
        );
        list.truncate(MAX_RECENT_WORKSPACES);
        cache.insert(RECENTS_KEY.to_string(), serde_json::to_value(&list)?);
        self.flush(&cache)?;
        Ok(list)
    }

    pub fn remove_recent_workspace(&self, path: &str) -> Result<Vec<RecentWorkspace>, PrefsError> {
        let mut cache = self.cache.lock().expect("prefs lock poisoned");
        let mut list = read_recent_workspaces(&cache);
        list.retain(|r| r.path != path);
        cache.insert(RECENTS_KEY.to_string(), serde_json::to_value(&list)?);
        self.flush(&cache)?;
        Ok(list)
    }

    /// Atomic + durable write: write to a sibling temp file, fsync, then
    /// rename over the real path. A plain `File::create` truncates in place,
    /// so a crash mid-write (or two processes racing) could leave prefs.json
    /// empty or half-written; temp+rename makes the swap a single filesystem
    /// operation.
    fn flush(&self, cache: &HashMap<String, serde_json::Value>) -> Result<(), PrefsError> {
        let json = serde_json::to_string_pretty(cache)?;
        let parent = self.path.parent().unwrap_or(&self.path);
        let tmp_path = parent.join(format!(".prefs-tmp-{}", std::process::id()));

        let mut file = File::create(&tmp_path)?;
        file.write_all(json.as_bytes())?;
        file.sync_all()?;
        drop(file);

        if let Err(e) = fs::rename(&tmp_path, &self.path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(e.into());
        }
        Ok(())
    }
}

const RECENTS_KEY: &str = "recentWorkspaces";
const MAX_RECENT_WORKSPACES: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentWorkspace {
    pub name: String,
    pub path: String,
    #[serde(rename = "lastOpened")]
    pub last_opened: String,
}

fn read_recent_workspaces(cache: &HashMap<String, serde_json::Value>) -> Vec<RecentWorkspace> {
    cache
        .get(RECENTS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
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

/// Add-or-bump a recent workspace atomically. Used instead of a
/// get-pref/set-pref round trip from the frontend so two windows opening
/// workspaces at nearly the same time can't clobber each other's entry.
#[tauri::command]
pub fn core_add_recent_workspace(
    name: String,
    path: String,
    last_opened: String,
    store: tauri::State<'_, PrefsStore>,
) -> Result<Vec<RecentWorkspace>, PrefsError> {
    store.add_recent_workspace(&name, &path, &last_opened)
}

#[tauri::command]
pub fn core_remove_recent_workspace(
    path: String,
    store: tauri::State<'_, PrefsStore>,
) -> Result<Vec<RecentWorkspace>, PrefsError> {
    store.remove_recent_workspace(&path)
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

    #[test]
    fn add_recent_workspace_dedupes_and_moves_to_front() {
        let dir = tempfile::tempdir().unwrap();
        let store = PrefsStore::new(dir.path().to_path_buf());

        store.add_recent_workspace("First", "/a", "t1").unwrap();
        store.add_recent_workspace("Second", "/b", "t2").unwrap();
        let list = store
            .add_recent_workspace("First Updated", "/a", "t3")
            .unwrap();

        assert_eq!(list.len(), 2);
        assert_eq!(list[0].path, "/a");
        assert_eq!(list[0].name, "First Updated");
        assert_eq!(list[1].path, "/b");
    }

    #[test]
    fn add_recent_workspace_caps_at_max() {
        let dir = tempfile::tempdir().unwrap();
        let store = PrefsStore::new(dir.path().to_path_buf());

        let mut list = Vec::new();
        for i in 0..10 {
            list = store
                .add_recent_workspace(&format!("Proj {i}"), &format!("/p{i}"), "t")
                .unwrap();
        }

        assert_eq!(list.len(), MAX_RECENT_WORKSPACES);
        assert_eq!(list[0].path, "/p9");
    }

    #[test]
    fn remove_recent_workspace_filters_by_path() {
        let dir = tempfile::tempdir().unwrap();
        let store = PrefsStore::new(dir.path().to_path_buf());

        store.add_recent_workspace("A", "/a", "t1").unwrap();
        store.add_recent_workspace("B", "/b", "t2").unwrap();
        let list = store.remove_recent_workspace("/a").unwrap();

        assert_eq!(list.len(), 1);
        assert_eq!(list[0].path, "/b");
    }

    #[test]
    fn recent_workspaces_survive_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_path_buf();

        {
            let store = PrefsStore::new(path.clone());
            store.add_recent_workspace("A", "/a", "t1").unwrap();
        }

        let store2 = PrefsStore::new(path);
        let list = read_recent_workspaces(&store2.cache.lock().unwrap());
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].path, "/a");
    }
}
