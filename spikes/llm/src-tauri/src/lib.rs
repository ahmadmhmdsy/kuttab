// Kuttab spike T-3. The Rust side only hosts tauri-plugin-http and two tiny
// commands used to record results to stdout (keys never reach this side).

/// Prints one result line so a `pnpm tauri dev` transcript can serve as evidence.
#[tauri::command]
fn report(line: String) {
    println!("[spike-llm] {line}");
}

/// True when KUTTAB_SPIKE_AUTORUN=1: the UI then runs the keyless probe and exits.
#[tauri::command]
fn autorun_requested() -> bool {
    std::env::var("KUTTAB_SPIKE_AUTORUN").as_deref() == Ok("1")
}

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![report, autorun_requested, quit])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
