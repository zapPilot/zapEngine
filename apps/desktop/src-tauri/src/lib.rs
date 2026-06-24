use tauri::Manager;

const DEVTOOLS_ENV: &str = "ZAP_PILOT_DESKTOP_DEVTOOLS";

fn should_open_devtools() -> bool {
    std::env::var(DEVTOOLS_ENV).as_deref() == Ok("1")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if should_open_devtools() {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Zap Pilot desktop app");
}
