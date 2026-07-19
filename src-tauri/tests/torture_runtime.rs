#![cfg(test)]

//! Runtime abuse: concurrent sends, 5MB boundary, timeout/hang paths, binary-as-JSON.

use std::net::SocketAddr;
use std::time::Duration;

use axum::body::Body;
use axum::extract::Path;
use axum::http::{header, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use tokio::net::TcpListener;

use tokio::sync::Mutex;

static SEND_LOCK: Mutex<()> = Mutex::const_new(());

async fn start_server(app: Router) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    tokio::time::sleep(Duration::from_millis(50)).await;
    addr
}

fn tmp_workspace() -> tempfile::TempDir {
    let root = tempfile::tempdir().expect("failed to create temp dir");
    adaka_lib::test_helpers::create_workspace(root.path());
    root
}

fn write_request(tmp: &tempfile::TempDir, name: &str, url: &str) -> String {
    let path = format!("requests/{name}.req.toml");
    let content = format!(
        "version = 1\nname = \"{name}\"\nmethod = \"GET\"\nurl = \"{url}\"\n\n[settings]\ntimeout_ms = 5000\n"
    );
    adaka_lib::test_helpers::write_workspace_file(tmp.path(), &path, &content);
    path
}

// ===========================================================================
// 20 concurrent sends — all complete or cancel cleanly
// ===========================================================================

#[tokio::test(flavor = "multi_thread")]
async fn twenty_concurrent_sends_complete() {
    let _guard = SEND_LOCK.lock().await;
    // Clear any leftover state from prior tests
    adaka_lib::test_helpers::cancel_all_pending().await;
    tokio::time::sleep(Duration::from_millis(50)).await;

    let app = Router::new().route(
        "/delay/:ms",
        get(|Path(ms): Path<u64>| async move {
            tokio::time::sleep(Duration::from_millis(ms)).await;
            (StatusCode::OK, "done")
        }),
    );
    let addr = start_server(app).await;
    let root = tmp_workspace();

    // Create 20 different request files pointing at /delay/200
    let mut handles = Vec::new();
    for i in 0..20 {
        let name = format!("concurrent-{i}");
        let url = format!("http://{addr}/delay/200");
        let req_path = write_request(&root, &name, &url);
        let ws_path = root.path().to_string_lossy().to_string();

        handles.push(tokio::spawn(async move {
            adaka_lib::test_helpers::execute_send(&ws_path, &req_path, None).await
        }));
    }

    let mut successes = 0;
    for h in handles {
        match h.await.unwrap() {
            Ok(resp) => {
                assert_eq!(resp.status, 200);
                successes += 1;
            }
            Err(e) => panic!("send failed: {e}"),
        }
    }
    assert_eq!(successes, 20);

    // Verify cancel map drains within a reasonable time.
    // The map uses a global static Mutex, so cleanup from spawned tasks
    // may briefly lag behind the join. Allow up to 2s.
    let mut final_pending = Vec::new();
    for _ in 0..40 {
        tokio::time::sleep(Duration::from_millis(50)).await;
        final_pending = adaka_lib::test_helpers::pending_request_ids().await;
        if final_pending.is_empty() {
            break;
        }
    }
    assert!(
        final_pending.is_empty(),
        "cancel-map should be empty after all sends complete, found: {final_pending:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn concurrent_sends_with_cancel() {
    let _guard = SEND_LOCK.lock().await;
    let app = Router::new().route(
        "/slow",
        get(|| async {
            tokio::time::sleep(Duration::from_secs(10)).await;
            "done"
        }),
    );
    let addr = start_server(app).await;
    let root = tmp_workspace();

    let url = format!("http://{addr}/slow");
    let req_path = write_request(&root, "slow-req", &url);
    let ws_path = root.path().to_string_lossy().to_string();

    // Fire 5 requests then immediately cancel them all
    let mut handles = Vec::new();
    for _ in 0..5 {
        let ws = ws_path.clone();
        let rp = req_path.clone();
        handles.push(tokio::spawn(async move {
            adaka_lib::test_helpers::execute_send(&ws, &rp, None).await
        }));
    }

    // Give them a moment to register
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Cancel all pending
    adaka_lib::test_helpers::cancel_all_pending().await;

    // All should either complete with a cancel error or have been cleaned up
    for h in handles {
        let _ = h.await; // Don't care about the result — just no panic
    }

    let pending = adaka_lib::test_helpers::pending_request_ids().await;
    assert!(
        pending.is_empty(),
        "cancel-map should be empty after cancel_all, found: {pending:?}"
    );
}

// ===========================================================================
// 5MB response — truncation boundary
// ===========================================================================

#[tokio::test(flavor = "multi_thread")]
async fn response_under_5mb_not_truncated() {
    let _guard = SEND_LOCK.lock().await;
    // 5MB - 1 byte: definitely not truncated
    let body = "A".repeat(5 * 1024 * 1024 - 1);
    let body_clone = body.clone();
    let app = Router::new().route(
        "/under-5mb",
        get(move || {
            let b = body_clone.clone();
            async move { (StatusCode::OK, [(header::CONTENT_TYPE, "text/plain")], b) }
        }),
    );
    let addr = start_server(app).await;
    let root = tmp_workspace();

    let url = format!("http://{addr}/under-5mb");
    let req_path = write_request(&root, "under-5mb", &url);
    let ws_path = root.path().to_string_lossy().to_string();

    let resp = adaka_lib::test_helpers::execute_send(&ws_path, &req_path, None)
        .await
        .unwrap();

    assert!(!resp.truncated, "Under 5MB should not be truncated");
    assert_eq!(resp.body_size, 5 * 1024 * 1024 - 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn response_5mb_plus_1_truncated() {
    let _guard = SEND_LOCK.lock().await;
    let body = "B".repeat(5 * 1024 * 1024 + 1);
    let body_clone = body.clone();
    let app = Router::new().route(
        "/over-5mb",
        get(move || {
            let b = body_clone.clone();
            async move { (StatusCode::OK, [(header::CONTENT_TYPE, "text/plain")], b) }
        }),
    );
    let addr = start_server(app).await;
    let root = tmp_workspace();

    let url = format!("http://{addr}/over-5mb");
    let req_path = write_request(&root, "over-5mb", &url);
    let ws_path = root.path().to_string_lossy().to_string();

    let resp = adaka_lib::test_helpers::execute_send(&ws_path, &req_path, None)
        .await
        .unwrap();

    assert!(resp.truncated, "5MB+1 should be truncated");
    assert_eq!(resp.body_size, 5 * 1024 * 1024);
}

// ===========================================================================
// Server that sends headers then hangs (timeout path)
// ===========================================================================

#[tokio::test(flavor = "multi_thread")]
async fn server_hangs_triggers_timeout() {
    // Wait for any other tests' cancel_all_pending to settle
    tokio::time::sleep(Duration::from_millis(200)).await;

    // Server accepts connection then sleeps forever (never sends response body)
    let app = Router::new().route(
        "/hang",
        get(|| async {
            tokio::time::sleep(Duration::from_secs(60)).await;
            "should never reach here"
        }),
    );
    let addr = start_server(app).await;
    let root = tmp_workspace();

    let path = "requests/hang.req.toml";
    let content = format!(
        "version = 1\nname = \"hang\"\nmethod = \"GET\"\nurl = \"http://{addr}/hang\"\n\n[settings]\ntimeout_ms = 1000\n"
    );
    adaka_lib::test_helpers::write_workspace_file(root.path(), path, &content);
    let ws_path = root.path().to_string_lossy().to_string();

    let start = std::time::Instant::now();
    let result = adaka_lib::test_helpers::execute_send(&ws_path, path, None).await;
    let elapsed = start.elapsed();

    // Should be an error (timeout or cancelled), not a successful response
    assert!(
        result.is_err(),
        "Hanging server should trigger timeout/cancel error"
    );
    // Should have resolved in roughly 1s, not 60s
    assert!(
        elapsed.as_secs() < 10,
        "Timeout should fire in ~1s, took {elapsed:?}"
    );
    // Accept both timeout and cancelled errors — the cancel registry is global
    // and other tests may trigger cancel_all_pending
    let err_msg = format!("{}", result.unwrap_err());
    assert!(
        err_msg.to_lowercase().contains("timeout")
            || err_msg.to_lowercase().contains("timed out")
            || err_msg.to_lowercase().contains("cancel")
            || err_msg.to_lowercase().contains("deadline"),
        "Error should mention timeout or cancel: {err_msg}"
    );
}

// ===========================================================================
// Binary masquerading as JSON content-type
// ===========================================================================

#[tokio::test(flavor = "multi_thread")]
async fn binary_with_json_content_type() {
    let _guard = SEND_LOCK.lock().await;
    // Server sends random bytes but claims application/json
    let garbage: Vec<u8> = (0..1024).map(|i| (i % 256) as u8).collect();
    let garbage_clone = garbage.clone();
    let app = Router::new().route(
        "/fake-json",
        get(move || {
            let g = garbage_clone.clone();
            async move {
                Response::builder()
                    .status(200)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(g))
                    .unwrap()
            }
        }),
    );
    let addr = start_server(app).await;
    let root = tmp_workspace();

    let url = format!("http://{addr}/fake-json");
    let req_path = write_request(&root, "fake-json", &url);
    let ws_path = root.path().to_string_lossy().to_string();

    let resp = adaka_lib::test_helpers::execute_send(&ws_path, &req_path, None)
        .await
        .unwrap();

    // Should complete without panic. The response is delivered even if body isn't valid JSON.
    assert_eq!(resp.status, 200);
    assert!(resp.body_size > 0);
}
