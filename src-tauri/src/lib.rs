mod core;

use core::{env, workspace};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            workspace::workspace_open,
            workspace::workspace_create,
            workspace::workspace_read_file,
            workspace::workspace_write_file,
            env::env_list,
            env::env_resolve,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Adaka");
}
