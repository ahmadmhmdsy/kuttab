// The "use my browser" search route (decision 0002, item 8): a visible window the
// learner can see, approve and use (to solve a CAPTCHA, say). The window loads
// remote pages, so it gets no IPC at all (the capability lists only "main").
// Reading a page works by evaluating a small script that navigates to
// https://kuttab.capture/?n=<nonce>&d=<json>; `on_navigation` catches that URL,
// cancels the navigation and hands the JSON to the waiting command. A capture is
// only accepted for a nonce this host asked for.
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::mpsc;
use std::time::Duration;

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "browser";
const CAPTURE_HOST: &str = "kuttab.capture";

#[derive(Default)]
pub struct Browser(Mutex<HashMap<String, mpsc::Sender<String>>>);

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn web_url(url: &str) -> Result<Url, String> {
    let u = Url::parse(url).map_err(err)?;
    if u.scheme() != "https" && u.scheme() != "http" {
        return Err("Only web pages can be opened.".into());
    }
    Ok(u)
}

/// Opens the browser window at `url`, or moves the open one there. With
/// `visible: false` the window works hidden (headless); it is shown again
/// whenever a call asks for it, so the learner can solve a challenge page.
#[tauri::command]
pub async fn browser_open(app: AppHandle, url: String, visible: Option<bool>) -> Result<(), String> {
    let target = web_url(&url)?;
    let visible = visible.unwrap_or(true);
    if let Some(w) = app.get_webview_window(LABEL) {
        w.navigate(target).map_err(err)?;
        if visible {
            let _ = w.show();
            let _ = w.set_focus();
        }
        return Ok(());
    }
    let handle = app.clone();
    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(target))
        .title("Kuttab: web search")
        .inner_size(1000.0, 760.0)
        .visible(visible)
        .on_navigation(move |u| {
            if u.host_str() != Some(CAPTURE_HOST) {
                return true;
            }
            let pairs: HashMap<String, String> = u.query_pairs().into_owned().collect();
            if let (Some(n), Some(d)) = (pairs.get("n"), pairs.get("d")) {
                if let Some(tx) = handle.state::<Browser>().0.lock().unwrap().remove(n) {
                    let _ = tx.send(d.clone());
                }
            }
            false
        })
        .on_page_load(|w, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = w.app_handle().emit_to("main", "browser-loaded", payload.url().as_str());
            }
        })
        .build()
        .map_err(err)?;
    Ok(())
}

/// Reads the page now shown: url, title, visible text and links (optionally only
/// links matching a CSS selector). Returns JSON.
#[tauri::command]
pub async fn browser_capture(app: AppHandle, selector: Option<String>) -> Result<String, String> {
    let w = app.get_webview_window(LABEL).ok_or("The search window is closed.")?;
    let nonce = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(err)?.as_nanos());
    let (tx, rx) = mpsc::channel();
    app.state::<Browser>().0.lock().unwrap().insert(nonce.clone(), tx);
    let sel = serde_json::to_string(&selector.unwrap_or_else(|| "a[href]".into())).map_err(err)?;
    let script = format!(
        r#"(() => {{
  const links = [...document.querySelectorAll({sel})].slice(0, 60).map((a) => ({{ text: (a.innerText || "").trim().slice(0, 200), href: a.href }})).filter((l) => l.href);
  const text = (document.body ? document.body.innerText : "").slice(0, 60000);
  const d = JSON.stringify({{ url: location.href, title: document.title, text, links }});
  location.href = "https://{CAPTURE_HOST}/?n={nonce}&d=" + encodeURIComponent(d);
}})();"#
    );
    w.eval(&script).map_err(err)?;
    let got = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(15))).await.map_err(err)?;
    app.state::<Browser>().0.lock().unwrap().remove(&nonce);
    got.map_err(|_| "The page did not answer. It may still be loading.".into())
}

/// Brings a hidden search window into view.
#[tauri::command]
pub async fn browser_show(app: AppHandle) -> Result<(), String> {
    let w = app.get_webview_window(LABEL).ok_or("The search window is closed.")?;
    w.show().map_err(err)?;
    let _ = w.set_focus();
    Ok(())
}

#[tauri::command]
pub async fn browser_close(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        w.close().map_err(err)?;
    }
    Ok(())
}
