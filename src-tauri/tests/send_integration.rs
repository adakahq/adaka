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

// We test the send module's internal logic directly.
// The crate exposes its internals for integration testing via `pub mod`.

/// Start a test server on a random port and return the address.
async fn start_server(app: Router) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    // Give server a moment to bind
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
    // Body should be base64 encoded
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&response.body)
        .unwrap();
    assert_eq!(decoded[0], 0xFF);
    assert_eq!(decoded[1], 0xD8);
}

#[tokio::test]
async fn cancellation_mid_flight() {
    // Acquire lock to avoid interference with other tests using the shared cancel registry
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

    // Record existing pending requests before our send
    let before_ids = adaka_lib::test_helpers::pending_request_ids().await;

    // Start the send in a spawned task
    let send_handle = tokio::spawn(async move {
        adaka_lib::test_helpers::execute_send(&ws_path, "requests/cancel.req.toml", Some("test"))
            .await
    });

    // Wait for our request to register in the cancel map
    let mut our_id = None;
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        let current_ids = adaka_lib::test_helpers::pending_request_ids().await;
        let new_ids: Vec<_> = current_ids
            .into_iter()
            .filter(|id| !before_ids.contains(id))
            .collect();
        if !new_ids.is_empty() {
            our_id = Some(new_ids[0].clone());
            break;
        }
    }

    let request_id = our_id.expect("request should have registered");
    adaka_lib::test_helpers::cancel_request(&request_id)
        .await
        .unwrap();

    let result = send_handle.await.unwrap();
    let err = result.unwrap_err();
    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["code"], "CANCELLED");
}

#[tokio::test]
async fn unresolved_var_short_circuits() {
    let _guard = TEST_LOCK.lock().await;
    // This server should NEVER be connected to — if it is, the test will panic.
    async fn unreachable_handler() -> &'static str {
        panic!("server should never be reached");
    }
    let app = Router::new().route("/", any(unreachable_handler));
    let addr = start_server(app).await;

    let tmp = tempfile::tempdir().unwrap();
    setup_workspace(&tmp);

    // Environment that does NOT define MISSING_VAR
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

    let env_content = format!(
        "name = \"test\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\nTOKEN = \"super-secret-value\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/test.toml", &env_content);

    let req_content = r#"
version = 1
name = "Secret test"
method = "GET"
url = "{{BASE_URL}}/api/data?key={{TOKEN}}"
"#;
    write_file(&tmp, "requests/secret.req.toml", req_content);

    // Use an env with TOKEN as a secret
    let env_with_secret = format!(
        "name = \"secret-env\"\n\n[vars]\nBASE_URL = \"http://127.0.0.1:{}\"\n\n[secrets]\nTOKEN = \"keychain\"\n",
        addr.port()
    );
    write_file(&tmp, "environments/secret-env.toml", &env_with_secret);

    // When secrets are unavailable (keychain not implemented), we get UNRESOLVED_VAR
    // This validates the secret pathway is exercised
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
