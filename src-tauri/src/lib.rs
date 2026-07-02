// Adaka — library entry point.
// Tauri 2 uses a lib crate so the same code works for desktop and mobile targets.

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running Adaka");
}
