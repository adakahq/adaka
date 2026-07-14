pub mod format;
pub mod history;
pub mod inheritance;
pub mod send;
pub mod tree;

use crate::core::{env, workspace};

use std::path::Path;

// ---------------------------------------------------------------------------
// Structured error — { code, message } shape per M1 §4
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum ApiClientError {
    #[error("request file not found: {0}")]
    FileNotFound(String),
    #[error("parse error in {file}: {detail}")]
    Parse { file: String, detail: String },
    #[error("unresolved variable: {0}")]
    UnresolvedVar(String),
    #[error("invalid URL: {0}")]
    InvalidUrl(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("request timed out: {0}")]
    Timeout(String),
    #[error("TLS error: {0}")]
    Tls(String),
    #[error("request cancelled: {0}")]
    Cancelled(String),
    #[error("{0}")]
    Workspace(#[from] workspace::WorkspaceError),
    #[error("{0}")]
    Env(#[from] env::EnvError),
}

impl ApiClientError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::FileNotFound(_) => "FILE",
            Self::Parse { .. } => "PARSE",
            Self::UnresolvedVar(_) => "UNRESOLVED_VAR",
            Self::InvalidUrl(_) => "INVALID_URL",
            Self::Network(_) => "NETWORK",
            Self::Timeout(_) => "TIMEOUT",
            Self::Tls(_) => "TLS",
            Self::Cancelled(_) => "CANCELLED",
            Self::Workspace(e) => e.code(),
            Self::Env(_) => "ENV",
        }
    }
}

impl serde::Serialize for ApiClientError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("ApiClientError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn api_list_requests(
    workspace_path: String,
) -> Result<Vec<tree::TreeNode>, workspace::WorkspaceError> {
    let root = std::path::Path::new(&workspace_path);
    tree::list_requests(root)
}

#[tauri::command]
pub fn api_parse_request(
    workspace_path: String,
    request_path: String,
) -> Result<format::RequestFile, ApiClientError> {
    let root = Path::new(&workspace_path);
    let raw = workspace::read_file(root, &request_path)?;
    format::parse_request(&raw, &request_path).map_err(|detail| ApiClientError::Parse {
        file: request_path,
        detail,
    })
}

#[tauri::command]
pub fn api_parse_collection(
    workspace_path: String,
    collection_path: String,
) -> Result<format::CollectionConfig, ApiClientError> {
    let root = Path::new(&workspace_path);
    let raw = workspace::read_file(root, &collection_path)?;
    format::parse_collection(&raw, &collection_path).map_err(|detail| ApiClientError::Parse {
        file: collection_path,
        detail,
    })
}

#[tauri::command]
pub fn api_save_request(
    workspace_path: String,
    request_path: String,
    def: format::RequestFile,
) -> Result<(), ApiClientError> {
    let root = Path::new(&workspace_path);

    // Load existing content to preserve comments and unknown keys
    let existing = workspace::read_file(root, &request_path).ok();

    let toml = format::serialize_request(&def, existing.as_deref()).map_err(|detail| {
        ApiClientError::Parse {
            file: request_path.clone(),
            detail,
        }
    })?;

    workspace::write_file(root, &request_path, &toml)?;
    Ok(())
}

#[tauri::command]
pub fn api_resolve_request(
    workspace_path: String,
    request_path: String,
) -> Result<format::RequestFile, ApiClientError> {
    let root = Path::new(&workspace_path);
    let raw = workspace::read_file(root, &request_path)?;
    let req =
        format::parse_request(&raw, &request_path).map_err(|detail| ApiClientError::Parse {
            file: request_path.clone(),
            detail,
        })?;
    inheritance::resolve_inheritance(root, &request_path, req)
}

#[tauri::command]
pub async fn api_send_request(
    workspace_path: String,
    request_path: String,
    env_name: Option<String>,
    bus: tauri::State<'_, crate::core::events::EventBus>,
    app: tauri::AppHandle,
) -> Result<send::SendResponse, ApiClientError> {
    use tauri::Emitter;

    let env_ref = env_name.as_deref();

    // Phase 1: prepare (parse/inherit/env-resolve) — no network
    let prepared = send::prepare(&workspace_path, &request_path, env_ref).await?;

    // Emit request.sent with real resolved metadata
    let sent_payload = serde_json::json!({
        "request_id": &prepared.request_id,
        "method": &prepared.method,
        "url_resolved": &prepared.url_redacted,
        "path": &request_path,
    });
    if let Ok(event) = bus.emit("request.sent", sent_payload) {
        let _ = app.emit("adaka://event", &event);
    }

    // Phase 2: perform (network I/O)
    let response = send::perform(&prepared).await?;

    // Emit request.completed event
    let completed_payload = serde_json::json!({
        "request_id": &response.request_id,
        "status": response.status,
        "duration_ms": response.timing.total_ms,
        "size": response.body_size,
        "method": &response.method,
        "url_resolved": &response.url_resolved,
    });
    if let Ok(event) = bus.emit("request.completed", completed_payload) {
        let _ = app.emit("adaka://event", &event);
    }

    // Phase 3: persist to history with redacted snapshot
    let snapshot = prepared.redacted_snapshot();
    let started_at = chrono_now_iso();

    // Derive a workspace_id from the path (last path component or full path)
    let workspace_id = workspace_id_from_path(&workspace_path);

    // Open history DB in a well-known app-data-adjacent location
    // For the Tauri command path, we use the workspace's .adaka dir as a proxy
    // for app-data (real app would use tauri's app_data_dir). The history file
    // sits next to the workspace so it persists across sessions.
    let history_dir = std::path::Path::new(&workspace_path)
        .join(".adaka")
        .join("history");
    if let Ok(db) = history::HistoryDb::open(&history_dir) {
        let _ = db.insert(
            &workspace_id,
            &request_path,
            &response,
            &started_at,
            &snapshot,
        );
    }

    Ok(response)
}

#[tauri::command]
pub async fn api_cancel_request(request_id: String) -> Result<(), ApiClientError> {
    send::cancel_request(&request_id).await
}

#[tauri::command]
pub fn api_history_list(
    workspace_path: String,
    request_path: String,
) -> Result<Vec<history::HistoryListEntry>, ApiClientError> {
    let history_dir = Path::new(&workspace_path).join(".adaka").join("history");
    let workspace_id = workspace_id_from_path(&workspace_path);
    let db = history::HistoryDb::open(&history_dir)?;
    db.list_summary(&workspace_id, &request_path)
}

#[tauri::command]
pub fn api_history_get(
    workspace_path: String,
    id: i64,
) -> Result<Option<history::HistoryEntry>, ApiClientError> {
    let history_dir = Path::new(&workspace_path).join(".adaka").join("history");
    let db = history::HistoryDb::open(&history_dir)?;
    db.get(id)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn chrono_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs();
    // Simple ISO-8601 without pulling in chrono crate
    format!("{}Z", secs)
}

fn workspace_id_from_path(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

// ---------------------------------------------------------------------------
// Tests — error code constructibility and serialization shape
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn serialize_error(e: &ApiClientError) -> serde_json::Value {
        serde_json::to_value(e).unwrap()
    }

    #[test]
    fn error_file_code() {
        let e = ApiClientError::FileNotFound("missing.req.toml".into());
        let v = serialize_error(&e);
        assert_eq!(v["code"], "FILE");
    }

    #[test]
    fn error_parse_code() {
        let e = ApiClientError::Parse {
            file: "bad.req.toml".into(),
            detail: "expected `=`".into(),
        };
        let v = serialize_error(&e);
        assert_eq!(v["code"], "PARSE");
    }

    #[test]
    fn error_unresolved_var_code() {
        let e = ApiClientError::UnresolvedVar("MISSING_VAR".into());
        let v = serialize_error(&e);
        assert_eq!(v["code"], "UNRESOLVED_VAR");
        assert!(v["message"].as_str().unwrap().contains("MISSING_VAR"));
    }

    #[test]
    fn error_invalid_url_code() {
        let e = ApiClientError::InvalidUrl("missing scheme".into());
        let v = serialize_error(&e);
        assert_eq!(v["code"], "INVALID_URL");
        assert!(v["message"].as_str().unwrap().contains("missing scheme"));
    }

    #[test]
    fn error_network_code() {
        let e = ApiClientError::Network("connection refused".into());
        let v = serialize_error(&e);
        assert_eq!(v["code"], "NETWORK");
    }

    #[test]
    fn error_timeout_code() {
        let e = ApiClientError::Timeout("timed out".into());
        let v = serialize_error(&e);
        assert_eq!(v["code"], "TIMEOUT");
    }

    #[test]
    fn error_tls_code() {
        let e = ApiClientError::Tls("cert invalid".into());
        let v = serialize_error(&e);
        assert_eq!(v["code"], "TLS");
    }

    #[test]
    fn error_cancelled_code() {
        let e = ApiClientError::Cancelled("req-123".into());
        let v = serialize_error(&e);
        assert_eq!(v["code"], "CANCELLED");
    }

    #[test]
    fn error_workspace_delegation() {
        let e = ApiClientError::Workspace(workspace::WorkspaceError::NotInitialised);
        let v = serialize_error(&e);
        assert_eq!(v["code"], "NOT_INITIALISED");
    }

    #[test]
    fn error_env_code() {
        let e = ApiClientError::Env(env::EnvError::NotFound("staging".into()));
        let v = serialize_error(&e);
        assert_eq!(v["code"], "ENV");
    }
}
