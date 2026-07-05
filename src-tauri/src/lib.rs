mod core;

use tauri::Manager;

use core::{env, events, prefs, requests, workspace};

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Adaka");
}
