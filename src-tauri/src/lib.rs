pub mod core;
pub mod modules;

use tauri::Manager;

use core::{env, events, prefs, requests, workspace};
use modules::api_client;

/// Test helpers exposed for integration tests.
#[doc(hidden)]
pub mod test_helpers {
    use std::path::Path;

    use crate::core::events::EventBus;
    use crate::core::workspace;
    use crate::modules::api_client::history::HistoryDb;
    use crate::modules::api_client::{send, ApiClientError};

    pub use send::{PreparedRequest, SendResponse};

    pub fn create_workspace(root: &Path) {
        workspace::create(root, Some("Test")).unwrap();
    }

    pub fn write_workspace_file(root: &Path, relative: &str, content: &str) {
        workspace::write_file(root, relative, content).unwrap();
    }

    pub async fn prepare(
        workspace_path: &str,
        request_path: &str,
        env_name: Option<&str>,
    ) -> Result<PreparedRequest, ApiClientError> {
        send::prepare(workspace_path, request_path, env_name).await
    }

    pub async fn perform(prepared: &PreparedRequest) -> Result<SendResponse, ApiClientError> {
        send::perform(prepared).await
    }

    pub async fn execute_send(
        workspace_path: &str,
        request_path: &str,
        env_name: Option<&str>,
    ) -> Result<SendResponse, ApiClientError> {
        send::execute_send(workspace_path, request_path, env_name).await
    }

    pub async fn cancel_all_pending() {
        send::cancel_all_pending().await;
    }

    pub async fn pending_request_ids() -> Vec<String> {
        send::pending_request_ids().await
    }

    pub async fn cancel_request(request_id: &str) -> Result<(), ApiClientError> {
        send::cancel_request(request_id).await
    }

    pub fn new_event_bus() -> EventBus {
        EventBus::new()
    }

    pub fn open_history_db_in_memory() -> Result<HistoryDb, ApiClientError> {
        HistoryDb::open_in_memory()
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(events::EventBus::new())
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            app.manage(prefs::PrefsStore::new(app_data));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace::workspace_open,
            workspace::workspace_create,
            workspace::workspace_read_file,
            workspace::workspace_write_file,
            env::env_list,
            env::env_resolve,
            events::core_emit_event,
            events::core_recent_events,
            prefs::core_get_pref,
            prefs::core_set_pref,
            requests::api_list_requests,
            api_client::api_parse_request,
            api_client::api_parse_collection,
            api_client::api_resolve_request,
            api_client::api_send_request,
            api_client::api_cancel_request,
            api_client::api_history_list,
            api_client::api_history_get,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Adaka");
}