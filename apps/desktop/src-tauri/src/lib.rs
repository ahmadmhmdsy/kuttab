// Kuttab host. Three jobs: a key-value store in SQLite (app data dir), API keys
// in the OS keychain, and saving exports through a native dialog. Secret values
// are never logged or returned anywhere except to the caller that asked.
// The search window (browser.rs) is the fourth; the opt-in tray (tray.rs) the fifth.
mod browser;
mod hardware;
mod tray;

use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const KEYCHAIN_SERVICE: &str = "dev.kuttab.app";

struct Db(Mutex<Connection>);

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("kuttab.db")).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
fn kv_get(db: tauri::State<Db>, key: String) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(err)?;
    conn.query_row("SELECT value FROM kv WHERE key = ?1", params![key], |r| r.get(0))
        .optional()
        .map_err(err)
}

#[tauri::command]
fn kv_set(db: tauri::State<Db>, key: String, value: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute(
        "INSERT INTO kv (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map(|_| ())
    .map_err(err)
}

#[tauri::command]
fn kv_delete(db: tauri::State<Db>, key: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("DELETE FROM kv WHERE key = ?1", params![key]).map(|_| ()).map_err(err)
}

#[tauri::command]
fn kv_keys(db: tauri::State<Db>, prefix: String) -> Result<Vec<String>, String> {
    let conn = db.0.lock().map_err(err)?;
    // substr comparison avoids LIKE wildcards inside the prefix.
    let mut stmt = conn
        .prepare("SELECT key FROM kv WHERE substr(key, 1, length(?1)) = ?1 ORDER BY key")
        .map_err(err)?;
    let rows = stmt.query_map(params![prefix], |r| r.get::<_, String>(0)).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

fn entry(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, id).map_err(err)
}

#[tauri::command]
fn secret_get(id: String) -> Result<Option<String>, String> {
    match entry(&id)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_set(id: String, value: String) -> Result<(), String> {
    entry(&id)?.set_password(&value).map_err(err)
}

#[tauri::command]
fn secret_delete(id: String) -> Result<(), String> {
    match entry(&id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Asks where to save, then writes `contents`. Returns false if the user cancels.
#[tauri::command]
async fn export_file(app: tauri::AppHandle, name: String, contents: String) -> Result<bool, String> {
    let picked = app.dialog().file().set_file_name(&name).blocking_save_file();
    let Some(path) = picked else { return Ok(false) };
    let path = path.into_path().map_err(err)?;
    std::fs::write(path, contents).map_err(err)?;
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![tray::HIDDEN_ARG]),
        ))
        .setup(|app| {
            let conn = open_db(app.handle())?;
            app.manage(Db(Mutex::new(conn)));
            app.manage(browser::Browser::default());
            // Started at sign-in: stay in the tray until the learner opens the window.
            if tray::tray_started_hidden() {
                tray::create(app.handle())?;
                if let Some(w) = app.get_webview_window("main") {
                    w.hide()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // With the tray on, closing the main window hides it.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && tray::active(window.app_handle()) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            kv_get,
            kv_set,
            kv_delete,
            kv_keys,
            secret_get,
            secret_set,
            secret_delete,
            export_file,
            hardware::hardware,
            browser::browser_open,
            browser::browser_capture,
            browser::browser_show,
            browser::browser_close,
            tray::tray_set,
            tray::tray_started_hidden,
            tray::notify
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
