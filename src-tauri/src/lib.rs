mod core;

use core::{env, events, workspace};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(events::EventBus::new())
        .invoke_handler(tauri::generate_handler![
            workspace::workspace_open,
            workspace::workspace_create,
            workspace::workspace_read_file,
            workspace::workspace_write_file,
            env::env_list,
            env::env_resolve,
            events::core_emit_event,
            events::core_recent_events,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Adaka");
}
