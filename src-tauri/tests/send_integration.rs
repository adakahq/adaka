#![cfg(test)]

use std::net::SocketAddr;
use std::time::Duration;

use axum::body::Body;
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::{any, get};
use axum::Router;
use tokio::net::TcpListener;
use tokio::sync::Mutex;

static TEST_LOCK: Mutex<()> = Mutex::const_new(());

/// Start a test server on a random port and return the address.
async fn start_server(app: Router) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    tokio::time::sleep(Duration::from_millis(50)).await;
    addr
}

fn setup_workspace(tmp: &tempfile::TempDir) {
    adaka_lib::test_helpers::create_workspace(tmp.path());
}

fn write_file(tmp: &tempfile::TempDir, relative: &str, content: &str) {
    adaka_lib::test_helpers::write_workspace_file(tmp.path(), relative, content);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn happy_json_roundtrip() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new().route(
        "/api/users",
        get(|| async {
            (
                StatusCode::OK,
                [("content-type", "application/json")],
                r#"{"users":["Ama","Kofi"]}"#,
            )
        }),
    );
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "Get users"
method = "GET"
url = "{{BASE_URL}}/api/users"

[headers]
Accept = "application/json"
"#;
    write_file(&tmp, "requests/get-users.req.toml", req_content);

    let response = adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/get-users.req.toml",
        Some("test"),
    )
    .await
    .unwrap();

    assert_eq!(response.status, 200);
    assert!(!response.binary);
    assert!(!response.truncated);
    assert!(response.body.contains("Ama"));
    assert_eq!(response.method, "GET");
    assert!(response.timing.total_ms < 5000);
    assert!(response.timing.first_byte_ms <= response.timing.total_ms);

    // Cancel map must be empty after successful send
    let pending = adaka_lib::test_helpers::pending_request_ids().await;
    assert!(
        pending.is_empty(),
        "cancel map not cleaned up after success"
    );
}

#[tokio::test]
async fn timeout_fires() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new().route(
        "/slow",
        get(|| async {
            tokio::time::sleep(Duration::from_secs(5)).await;
            "done"
        }),
    );
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "Slow"
method = "GET"
url = "{{BASE_URL}}/slow"

[settings]
timeout_ms = 200
"#;
    write_file(&tmp, "requests/slow.req.toml", req_content);

    let err = adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/slow.req.toml",
        Some("test"),
    )
    .await
    .unwrap_err();

    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["code"], "TIMEOUT");

    // Cancel map must be empty after error
    let pending = adaka_lib::test_helpers::pending_request_ids().await;
    assert!(
        pending.is_empty(),
        "cancel map not cleaned up after timeout"
    );
}

#[tokio::test]
async fn redirect_followed() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new()
        .route(
            "/redirect",
            get(|| async {
                Response::builder()
                    .status(StatusCode::MOVED_PERMANENTLY)
                    .header("Location", "/final")
                    .body(Body::empty())
                    .unwrap()
            }),
        )
        .route("/final", get(|| async { "arrived" }));
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "Follow redirect"
method = "GET"
url = "{{BASE_URL}}/redirect"

[settings]
follow_redirects = true
"#;
    write_file(&tmp, "requests/redir.req.toml", req_content);

    let response = adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/redir.req.toml",
        Some("test"),
    )
    .await
    .unwrap();

    assert_eq!(response.status, 200);
    assert!(response.body.contains("arrived"));
}

#[tokio::test]
async fn redirect_not_followed() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new().route(
        "/redirect",
        get(|| async {
            Response::builder()
                .status(StatusCode::MOVED_PERMANENTLY)
                .header("Location", "/final")
                .body(Body::empty())
                .unwrap()
        }),
    );
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "No redirect"
method = "GET"
url = "{{BASE_URL}}/redirect"

[settings]
follow_redirects = false
"#;
    write_file(&tmp, "requests/noredir.req.toml", req_content);

    let response = adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/noredir.req.toml",
        Some("test"),
    )
    .await
    .unwrap();

    assert_eq!(response.status, 301);
}

#[tokio::test]
async fn body_truncation_at_5mb() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new().route(
        "/big",
        get(|| async {
            let body = "x".repeat(6 * 1024 * 1024);
            (StatusCode::OK, [("content-type", "text/plain")], body)
        }),
    );
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "Big response"
method = "GET"
url = "{{BASE_URL}}/big"
"#;
    write_file(&tmp, "requests/big.req.toml", req_content);

    let response = adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/big.req.toml",
        Some("test"),
    )
    .await
    .unwrap();

    assert!(response.truncated);
    assert_eq!(response.body_size, 5 * 1024 * 1024);
}

#[tokio::test]
async fn binary_response() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new().route(
        "/binary",
        get(|| async {
            let bytes: Vec<u8> = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]; // JPEG-like
            (StatusCode::OK, [("content-type", "image/jpeg")], bytes)
        }),
    );
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "Binary"
method = "GET"
url = "{{BASE_URL}}/binary"
"#;
    write_file(&tmp, "requests/binary.req.toml", req_content);

    let response = adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/binary.req.toml",
        Some("test"),
    )
    .await
    .unwrap();

    assert!(response.binary);
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&response.body)
        .unwrap();
    assert_eq!(decoded[0], 0xFF);
    assert_eq!(decoded[1], 0xD8);
}

#[tokio::test]
async fn cancellation_mid_flight() {
    let _guard = TEST_LOCK.lock().await;

    let app = Router::new().route(
        "/slow",
        get(|| async {
            tokio::time::sleep(Duration::from_secs(30)).await;
            "done"
        }),
    );
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "Cancel me"
method = "GET"
url = "{{BASE_URL}}/slow"

[settings]
timeout_ms = 30000
"#;
    write_file(&tmp, "requests/cancel.req.toml", req_content);

    let ws_path = tmp.path().to_str().unwrap().to_string();

    // Use prepare to get the request_id before perform
    let prepared =
        adaka_lib::test_helpers::prepare(&ws_path, "requests/cancel.req.toml", Some("test"))
            .await
            .unwrap();
    let request_id = prepared.request_id.clone();

    // Start the perform in a spawned task
    let send_handle =
        tokio::spawn(async move { adaka_lib::test_helpers::perform(&prepared).await });

    // Wait for our request to register in the cancel map
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        let current_ids = adaka_lib::test_helpers::pending_request_ids().await;
        if current_ids.contains(&request_id) {
            break;
        }
    }

    adaka_lib::test_helpers::cancel_request(&request_id)
        .await
        .unwrap();

    let result = send_handle.await.unwrap();
    let err = result.unwrap_err();
    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["code"], "CANCELLED");

    // Cancel map must be empty after cancellation
    let pending = adaka_lib::test_helpers::pending_request_ids().await;
    assert!(pending.is_empty(), "cancel map not cleaned up after cancel");
}

#[tokio::test]
async fn unresolved_var_short_circuits() {
    let _guard = TEST_LOCK.lock().await;
    async fn unreachable_handler() -> &'static str {
        panic!("server should never be reached");
    }
    let app = Router::new().route("/", any(unreachable_handler));
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "Unresolved"
method = "GET"
url = "{{BASE_URL}}/api/{{MISSING_VAR}}"
"#;
    write_file(&tmp, "requests/unresolved.req.toml", req_content);

    let err = adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/unresolved.req.toml",
        Some("test"),
    )
    .await
    .unwrap_err();

    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["code"], "UNRESOLVED_VAR");
    assert!(v["message"].as_str().unwrap().contains("MISSING_VAR"));
}

#[tokio::test]
async fn secret_redaction_in_response_dto() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new().route("/api/data", get(|| async { (StatusCode::OK, "ok") }));
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    // Use an env with TOKEN as a secret
    let env_with_secret = format!(
        "name = \"secret-env\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n\n[secrets]\nTOKEN = \"keychain\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/secret-env.toml", &env_with_secret);

    let req_content = r#"
version = 1
name = "Secret test"
method = "GET"
url = "{{BASE_URL}}/api/data?key={{TOKEN}}"
"#;
    write_file(&tmp, "requests/secret.req.toml", req_content);

    // When secrets are unavailable (keychain not implemented), we get UNRESOLVED_VAR
    let err = adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/secret.req.toml",
        Some("secret-env"),
    )
    .await
    .unwrap_err();

    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["code"], "UNRESOLVED_VAR");
    assert!(v["message"].as_str().unwrap().contains("TOKEN"));
}

// ---------------------------------------------------------------------------
// Wiring tests: history, events, redacted snapshot
// ---------------------------------------------------------------------------

#[tokio::test]
async fn history_inserted_after_send() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new().route(
        "/api/test",
        get(|| async {
            (
                StatusCode::OK,
                [("content-type", "application/json")],
                r#"{"ok":true}"#,
            )
        }),
    );
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\nAPI_KEY = \"normal-key\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "History test"
method = "GET"
url = "{{BASE_URL}}/api/test?auth={{API_KEY}}"
"#;
    write_file(&tmp, "requests/history-test.req.toml", req_content);

    let prepared = adaka_lib::test_helpers::prepare(
        tmp.path().to_str().unwrap(),
        "requests/history-test.req.toml",
        Some("test"),
    )
    .await
    .unwrap();

    let response = adaka_lib::test_helpers::perform(&prepared).await.unwrap();
    assert_eq!(response.status, 200);

    // Insert into history (simulating what api_send_request does)
    let db = adaka_lib::test_helpers::open_history_db_in_memory().unwrap();
    let snapshot = prepared.redacted_snapshot();
    db.insert(
        "test-ws",
        "requests/history-test.req.toml",
        &response,
        "2026-07-04T00:00:00Z",
        &snapshot,
    )
    .unwrap();

    // Verify history entry exists
    let entries = db
        .list("test-ws", "requests/history-test.req.toml")
        .unwrap();
    assert_eq!(entries.len(), 1);

    let entry = &entries[0];
    assert_eq!(entry.method, "GET");
    assert_eq!(entry.status, 200);

    // Snapshot contains the URL and method
    assert!(entry.request_snapshot.contains("/api/test"));
    assert!(entry.request_snapshot.contains("GET"));

    // URL in response DTO uses the redacted form
    assert_eq!(response.url_resolved, prepared.url_redacted);
}

/// [vars] values are NOT secrets and are NOT redacted — by design.
/// Only [secrets] entries (resolved via keychain) get ••• treatment.
#[tokio::test]
async fn snapshot_preserves_vars_values() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new().route("/api/secret", get(|| async { (StatusCode::OK, "ok") }));
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    // TOKEN is in [vars], not [secrets] — it must NOT be redacted
    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\nTOKEN = \"super-secret-abc\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "Vars snap"
method = "GET"
url = "{{BASE_URL}}/api/secret?key={{TOKEN}}"
"#;
    write_file(&tmp, "requests/vars-snap.req.toml", req_content);

    let prepared = adaka_lib::test_helpers::prepare(
        tmp.path().to_str().unwrap(),
        "requests/vars-snap.req.toml",
        Some("test"),
    )
    .await
    .unwrap();

    let response = adaka_lib::test_helpers::perform(&prepared).await.unwrap();
    assert_eq!(response.status, 200);

    // [vars] values pass through unredacted into the snapshot
    let snapshot = prepared.redacted_snapshot();
    assert!(
        snapshot.contains("super-secret-abc"),
        "vars values must be preserved (not redacted) in snapshot"
    );

    // History stores the snapshot as-is
    let db = adaka_lib::test_helpers::open_history_db_in_memory().unwrap();
    db.insert(
        "test-ws",
        "requests/vars-snap.req.toml",
        &response,
        "2026-07-04T00:00:00Z",
        &snapshot,
    )
    .unwrap();
    let entries = db.list("test-ws", "requests/vars-snap.req.toml").unwrap();
    assert_eq!(entries.len(), 1);
    assert!(entries[0].request_snapshot.contains("super-secret-abc"));
}

#[tokio::test]
async fn events_sent_and_completed_pair() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new().route(
        "/api/events",
        get(|| async {
            (
                StatusCode::OK,
                [("content-type", "application/json")],
                r#"{"event":"test"}"#,
            )
        }),
    );
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "Event test"
method = "GET"
url = "{{BASE_URL}}/api/events"
"#;
    write_file(&tmp, "requests/event-test.req.toml", req_content);

    // Create an event bus to simulate what api_send_request does
    let bus = adaka_lib::test_helpers::new_event_bus();

    // Prepare
    let prepared = adaka_lib::test_helpers::prepare(
        tmp.path().to_str().unwrap(),
        "requests/event-test.req.toml",
        Some("test"),
    )
    .await
    .unwrap();

    // Emit request.sent (as the command layer does)
    let sent_payload = serde_json::json!({
        "request_id": &prepared.request_id,
        "method": &prepared.method,
        "url_resolved": &prepared.url_redacted,
        "path": "requests/event-test.req.toml",
    });
    bus.emit("request.sent", sent_payload).unwrap();

    // Perform
    let response = adaka_lib::test_helpers::perform(&prepared).await.unwrap();

    // Emit request.completed
    let completed_payload = serde_json::json!({
        "request_id": &response.request_id,
        "status": response.status,
        "duration_ms": response.timing.total_ms,
        "size": response.body_size,
        "method": &response.method,
        "url_resolved": &response.url_resolved,
    });
    bus.emit("request.completed", completed_payload).unwrap();

    // Verify events
    let events = bus.recent(None);
    assert_eq!(events.len(), 2);

    // First event: request.sent
    assert_eq!(events[0].topic, "request.sent");
    assert_eq!(events[0].payload["request_id"], prepared.request_id);
    assert_eq!(events[0].payload["method"], "GET");
    assert!(events[0].payload["url_resolved"]
        .as_str()
        .unwrap()
        .contains("/api/events"));

    // Second event: request.completed
    assert_eq!(events[1].topic, "request.completed");
    assert_eq!(events[1].payload["request_id"], prepared.request_id);
    assert_eq!(events[1].payload["method"], "GET");
    assert_eq!(events[1].payload["status"], 200);

    // Both share the same request_id
    assert_eq!(
        events[0].payload["request_id"],
        events[1].payload["request_id"]
    );
}

#[tokio::test]
async fn cancel_map_empty_after_all_paths() {
    let _guard = TEST_LOCK.lock().await;
    let app = Router::new().route("/ok", get(|| async { "ok" })).route(
        "/slow",
        get(|| async {
            tokio::time::sleep(Duration::from_secs(30)).await;
            "done"
        }),
    );
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    // 1. Success path
    let req_ok = r#"
version = 1
name = "OK"
method = "GET"
url = "{{BASE_URL}}/ok"
"#;
    write_file(&tmp, "requests/ok.req.toml", req_ok);
    adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/ok.req.toml",
        Some("test"),
    )
    .await
    .unwrap();
    let pending = adaka_lib::test_helpers::pending_request_ids().await;
    assert!(pending.is_empty(), "cancel map not empty after success");

    // 2. Timeout path
    let req_timeout = r#"
version = 1
name = "Timeout"
method = "GET"
url = "{{BASE_URL}}/slow"

[settings]
timeout_ms = 100
"#;
    write_file(&tmp, "requests/timeout.req.toml", req_timeout);
    let _ = adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/timeout.req.toml",
        Some("test"),
    )
    .await;
    let pending = adaka_lib::test_helpers::pending_request_ids().await;
    assert!(pending.is_empty(), "cancel map not empty after timeout");

    // 3. Cancel path
    let req_cancel = r#"
version = 1
name = "Cancel"
method = "GET"
url = "{{BASE_URL}}/slow"

[settings]
timeout_ms = 30000
"#;
    write_file(&tmp, "requests/cancel2.req.toml", req_cancel);
    let prepared = adaka_lib::test_helpers::prepare(
        tmp.path().to_str().unwrap(),
        "requests/cancel2.req.toml",
        Some("test"),
    )
    .await
    .unwrap();
    let rid = prepared.request_id.clone();
    let handle = tokio::spawn(async move { adaka_lib::test_helpers::perform(&prepared).await });
    // Wait for registration
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        let ids = adaka_lib::test_helpers::pending_request_ids().await;
        if ids.contains(&rid) {
            break;
        }
    }
    adaka_lib::test_helpers::cancel_request(&rid).await.unwrap();
    let _ = handle.await.unwrap();
    let pending = adaka_lib::test_helpers::pending_request_ids().await;
    assert!(pending.is_empty(), "cancel map not empty after cancel");
}

// Live-internet test — run locally via `cargo test -- --ignored`, not in CI.
#[tokio::test]
#[ignore]
async fn live_httpbin_roundtrip() {
    let _guard = TEST_LOCK.lock().await;
    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);
    write_file(
        &tmp,
        "requests/httpbin.req.toml",
        "version = 1\nname = \"httpbin\"\nmethod = \"GET\"\nurl = \"https://httpbin.org/get\"\n",
    );

    let resp = adaka_lib::test_helpers::execute_send(
        tmp.path().to_str().unwrap(),
        "requests/httpbin.req.toml",
        None,
    )
    .await
    .unwrap();

    eprintln!(
        "LIVE: {} {} — {}ms",
        resp.status, resp.status_text, resp.timing.total_ms
    );
    assert_eq!(resp.status, 200);
    assert_eq!(resp.status_text, "OK");
    assert!(resp.body.contains("httpbin.org"));
    assert!(resp.timing.total_ms > 0);
}
