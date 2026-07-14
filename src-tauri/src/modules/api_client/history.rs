use std::path::PathBuf;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::send::SendResponse;
use super::ApiClientError;

const MAX_HISTORY_PER_REQUEST: usize = 50;

// ---------------------------------------------------------------------------
// History entry
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub workspace_id: String,
    pub request_path: String,
    pub method: String,
    pub url_resolved: String,
    pub status: u16,
    pub duration_ms: u64,
    pub response_size: usize,
    pub started_at: String,
    pub response_headers: String,
    pub response_body: String,
    pub request_snapshot: String,
}

/// Lightweight summary for list views — no response body, headers, or snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryListEntry {
    pub id: i64,
    pub method: String,
    pub url_resolved: String,
    pub status: u16,
    pub duration_ms: u64,
    pub response_size: usize,
    pub started_at: String,
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

pub struct HistoryDb {
    conn: Connection,
}

impl HistoryDb {
    pub fn open(app_data_dir: &PathBuf) -> Result<Self, ApiClientError> {
        std::fs::create_dir_all(app_data_dir).map_err(|e| {
            ApiClientError::Network(format!("failed to create app data dir: {}", e))
        })?;
        let db_path = app_data_dir.join("history.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| ApiClientError::Network(format!("failed to open history db: {}", e)))?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self, ApiClientError> {
        let conn = Connection::open_in_memory()
            .map_err(|e| ApiClientError::Network(format!("failed to open in-memory db: {}", e)))?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), ApiClientError> {
        self.conn
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS request_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id TEXT NOT NULL,
                    request_path TEXT NOT NULL,
                    method TEXT NOT NULL,
                    url_resolved TEXT NOT NULL,
                    status INTEGER NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    response_size INTEGER NOT NULL,
                    started_at TEXT NOT NULL,
                    response_headers TEXT NOT NULL,
                    response_body TEXT NOT NULL,
                    request_snapshot TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_history_ws_path
                    ON request_history(workspace_id, request_path);",
            )
            .map_err(|e| ApiClientError::Network(format!("history migration failed: {}", e)))?;
        Ok(())
    }

    pub fn insert(
        &self,
        workspace_id: &str,
        request_path: &str,
        response: &SendResponse,
        started_at: &str,
        request_snapshot: &str,
    ) -> Result<i64, ApiClientError> {
        let headers_json = serde_json::to_string(&response.headers).unwrap_or_default();

        self.conn
            .execute(
                "INSERT INTO request_history
                 (workspace_id, request_path, method, url_resolved, status, duration_ms,
                  response_size, started_at, response_headers, response_body, request_snapshot)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    workspace_id,
                    request_path,
                    response.method,
                    response.url_resolved,
                    response.status,
                    response.timing.total_ms,
                    response.body_size,
                    started_at,
                    headers_json,
                    response.body,
                    request_snapshot,
                ],
            )
            .map_err(|e| ApiClientError::Network(format!("history insert failed: {}", e)))?;

        let id = self.conn.last_insert_rowid();

        // Prune to last 50 per (workspace_id, request_path)
        self.prune(workspace_id, request_path)?;

        Ok(id)
    }

    fn prune(&self, workspace_id: &str, request_path: &str) -> Result<(), ApiClientError> {
        self.conn
            .execute(
                "DELETE FROM request_history WHERE id NOT IN (
                    SELECT id FROM request_history
                    WHERE workspace_id = ?1 AND request_path = ?2
                    ORDER BY id DESC
                    LIMIT ?3
                 ) AND workspace_id = ?1 AND request_path = ?2",
                params![workspace_id, request_path, MAX_HISTORY_PER_REQUEST],
            )
            .map_err(|e| ApiClientError::Network(format!("history prune failed: {}", e)))?;
        Ok(())
    }

    pub fn list_summary(
        &self,
        workspace_id: &str,
        request_path: &str,
    ) -> Result<Vec<HistoryListEntry>, ApiClientError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, method, url_resolved, status, duration_ms, response_size, started_at
                 FROM request_history
                 WHERE workspace_id = ?1 AND request_path = ?2
                 ORDER BY id DESC",
            )
            .map_err(|e| ApiClientError::Network(format!("history list failed: {}", e)))?;

        let rows = stmt
            .query_map(params![workspace_id, request_path], |row| {
                Ok(HistoryListEntry {
                    id: row.get(0)?,
                    method: row.get(1)?,
                    url_resolved: row.get(2)?,
                    status: row.get::<_, u32>(3)? as u16,
                    duration_ms: row.get::<_, i64>(4)? as u64,
                    response_size: row.get::<_, i64>(5)? as usize,
                    started_at: row.get(6)?,
                })
            })
            .map_err(|e| ApiClientError::Network(format!("history query failed: {}", e)))?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(
                row.map_err(|e| ApiClientError::Network(format!("history row failed: {}", e)))?,
            );
        }
        Ok(entries)
    }

    pub fn list(
        &self,
        workspace_id: &str,
        request_path: &str,
    ) -> Result<Vec<HistoryEntry>, ApiClientError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, workspace_id, request_path, method, url_resolved, status,
                        duration_ms, response_size, started_at, response_headers,
                        response_body, request_snapshot
                 FROM request_history
                 WHERE workspace_id = ?1 AND request_path = ?2
                 ORDER BY id DESC",
            )
            .map_err(|e| ApiClientError::Network(format!("history list failed: {}", e)))?;

        let rows = stmt
            .query_map(params![workspace_id, request_path], |row| {
                Ok(HistoryEntry {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    request_path: row.get(2)?,
                    method: row.get(3)?,
                    url_resolved: row.get(4)?,
                    status: row.get::<_, u32>(5)? as u16,
                    duration_ms: row.get::<_, i64>(6)? as u64,
                    response_size: row.get::<_, i64>(7)? as usize,
                    started_at: row.get(8)?,
                    response_headers: row.get(9)?,
                    response_body: row.get(10)?,
                    request_snapshot: row.get(11)?,
                })
            })
            .map_err(|e| ApiClientError::Network(format!("history query failed: {}", e)))?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(
                row.map_err(|e| ApiClientError::Network(format!("history row failed: {}", e)))?,
            );
        }
        Ok(entries)
    }

    pub fn get(&self, id: i64) -> Result<Option<HistoryEntry>, ApiClientError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, workspace_id, request_path, method, url_resolved, status,
                        duration_ms, response_size, started_at, response_headers,
                        response_body, request_snapshot
                 FROM request_history WHERE id = ?1",
            )
            .map_err(|e| ApiClientError::Network(format!("history get failed: {}", e)))?;

        let mut rows = stmt
            .query_map(params![id], |row| {
                Ok(HistoryEntry {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    request_path: row.get(2)?,
                    method: row.get(3)?,
                    url_resolved: row.get(4)?,
                    status: row.get::<_, u32>(5)? as u16,
                    duration_ms: row.get::<_, i64>(6)? as u64,
                    response_size: row.get::<_, i64>(7)? as usize,
                    started_at: row.get(8)?,
                    response_headers: row.get(9)?,
                    response_body: row.get(10)?,
                    request_snapshot: row.get(11)?,
                })
            })
            .map_err(|e| ApiClientError::Network(format!("history get failed: {}", e)))?;

        match rows.next() {
            Some(Ok(entry)) => Ok(Some(entry)),
            Some(Err(e)) => Err(ApiClientError::Network(format!(
                "history get row failed: {}",
                e
            ))),
            None => Ok(None),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    use super::super::send::TimingInfo;

    fn sample_response(status: u16) -> SendResponse {
        SendResponse {
            request_id: "test-id".to_string(),
            status,
            status_text: "OK".to_string(),
            headers: HashMap::new(),
            body: "{\"ok\":true}".to_string(),
            body_size: 11,
            truncated: false,
            binary: false,
            timing: TimingInfo {
                total_ms: 100,
                first_byte_ms: 50,
                dns_ms: 0,
                connect_ms: 0,
                tls_ms: 0,
                download_ms: 50,
            },
            url_resolved: "http://example.com/api".to_string(),
            method: "GET".to_string(),
        }
    }

    #[test]
    fn insert_and_list() {
        let db = HistoryDb::open_in_memory().unwrap();
        let resp = sample_response(200);
        db.insert(
            "ws1",
            "requests/get.req.toml",
            &resp,
            "2026-07-04T00:00:00Z",
            "{}",
        )
        .unwrap();
        db.insert(
            "ws1",
            "requests/get.req.toml",
            &resp,
            "2026-07-04T00:01:00Z",
            "{}",
        )
        .unwrap();

        let entries = db.list("ws1", "requests/get.req.toml").unwrap();
        assert_eq!(entries.len(), 2);
        // Most recent first
        assert_eq!(entries[0].started_at, "2026-07-04T00:01:00Z");
    }

    #[test]
    fn get_by_id() {
        let db = HistoryDb::open_in_memory().unwrap();
        let resp = sample_response(201);
        let id = db
            .insert(
                "ws1",
                "requests/post.req.toml",
                &resp,
                "2026-07-04T00:00:00Z",
                "{}",
            )
            .unwrap();

        let entry = db.get(id).unwrap().unwrap();
        assert_eq!(entry.status, 201);
        assert_eq!(entry.request_path, "requests/post.req.toml");
    }

    #[test]
    fn prune_to_50() {
        let db = HistoryDb::open_in_memory().unwrap();
        let resp = sample_response(200);

        for i in 0..60 {
            db.insert(
                "ws1",
                "requests/get.req.toml",
                &resp,
                &format!("2026-07-04T00:{:02}:00Z", i),
                "{}",
            )
            .unwrap();
        }

        let entries = db.list("ws1", "requests/get.req.toml").unwrap();
        assert_eq!(entries.len(), 50);
        // Oldest surviving should be the 11th insert (index 10, 0-indexed)
        assert_eq!(entries.last().unwrap().started_at, "2026-07-04T00:10:00Z");
    }

    #[test]
    fn separate_workspaces_separate_histories() {
        let db = HistoryDb::open_in_memory().unwrap();
        let resp = sample_response(200);
        db.insert(
            "ws1",
            "requests/get.req.toml",
            &resp,
            "2026-07-04T00:00:00Z",
            "{}",
        )
        .unwrap();
        db.insert(
            "ws2",
            "requests/get.req.toml",
            &resp,
            "2026-07-04T00:00:00Z",
            "{}",
        )
        .unwrap();

        assert_eq!(db.list("ws1", "requests/get.req.toml").unwrap().len(), 1);
        assert_eq!(db.list("ws2", "requests/get.req.toml").unwrap().len(), 1);
    }

    #[test]
    fn list_summary_excludes_bodies() {
        let db = HistoryDb::open_in_memory().unwrap();
        let resp = sample_response(200);
        db.insert(
            "ws1",
            "requests/get.req.toml",
            &resp,
            "2026-07-04T00:00:00Z",
            "{\"method\":\"GET\",\"url\":\"http://example.com\"}",
        )
        .unwrap();

        let summaries = db.list_summary("ws1", "requests/get.req.toml").unwrap();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].status, 200);
        assert_eq!(summaries[0].method, "GET");
        assert_eq!(summaries[0].duration_ms, 100);
        assert_eq!(summaries[0].response_size, 11);
    }

    #[test]
    fn persistence_across_reopen() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_path_buf();

        {
            let db = HistoryDb::open(&path).unwrap();
            let resp = sample_response(200);
            db.insert(
                "ws1",
                "requests/get.req.toml",
                &resp,
                "2026-07-04T00:00:00Z",
                "{}",
            )
            .unwrap();
        }

        // Reopen
        let db = HistoryDb::open(&path).unwrap();
        let entries = db.list("ws1", "requests/get.req.toml").unwrap();
        assert_eq!(entries.len(), 1);
    }
}
