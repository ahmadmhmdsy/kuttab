// Opt-in tray (decision 0002 item 23). Off by default. When the learner turns it
// on, Kuttab starts with the system in the tray and closing the window hides it
// instead of quitting, so reminders can show. Turning it off removes both.
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

const TRAY_ID: &str = "main";
pub const HIDDEN_ARG: &str = "--tray";

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }
    let open = MenuItem::with_id(app, "open", "Open Kuttab", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Kuttab")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn active(app: &AppHandle) -> bool {
    app.tray_by_id(TRAY_ID).is_some()
}

/// True when the OS started Kuttab at sign-in (hidden, in the tray).
#[tauri::command]
pub fn tray_started_hidden() -> bool {
    std::env::args().any(|a| a == HIDDEN_ARG)
}

#[tauri::command]
pub fn tray_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    let launch = app.autolaunch();
    if enabled {
        launch.enable().map_err(|e| e.to_string())?;
        create(&app).map_err(|e| e.to_string())?;
    } else {
        launch.disable().map_err(|e| e.to_string())?;
        app.remove_tray_by_id(TRAY_ID);
    }
    Ok(())
}

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification().builder().title(title).body(body).show().map_err(|e| e.to_string())
}
