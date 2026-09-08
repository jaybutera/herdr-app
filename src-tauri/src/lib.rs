#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Settings persist in the store on Android; the laptop build uses
        // localStorage and never reaches this plugin.
        .plugin(tauri_plugin_store::Builder::default().build())
        // Native HTTP, so requests leave the app instead of the WebView's
        // networking stack. See src/lib/api.ts for why.
        .plugin(tauri_plugin_http::init())
        // Hands a tapped link to the phone's browser. A plain anchor either
        // does nothing in the Android WebView or replaces the app with the
        // page, so RichText routes every URL through this instead.
        .plugin(tauri_plugin_opener::init())
        // Posts a system notification when the orchestrator says something
        // while the chat is not on screen. Android's WebView has no
        // `Notification`, so the web API alone would leave the APK silent;
        // src/lib/notify.ts picks this on Android and the web API on the
        // laptop.
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
