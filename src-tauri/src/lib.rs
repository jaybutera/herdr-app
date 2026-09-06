#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Settings persist in the store on Android; the laptop build uses
        // localStorage and never reaches this plugin.
        .plugin(tauri_plugin_store::Builder::default().build())
        // Native HTTP, so requests leave the app instead of the WebView's
        // networking stack. See src/lib/api.ts for why.
        .plugin(tauri_plugin_http::init())
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
