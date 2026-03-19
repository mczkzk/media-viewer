use tauri_plugin_store::StoreExt;

#[tauri::command]
async fn get_stored_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app
        .store("settings.json")
        .map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    let path = store
        .get("mediaBasePath")
        .and_then(|v: serde_json::Value| v.as_str().map(String::from));
    Ok(path)
}

#[tauri::command]
async fn set_stored_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    store.set("mediaBasePath", serde_json::json!(path));
    store
        .save()
        .map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
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
        .invoke_handler(tauri::generate_handler![get_stored_path, set_stored_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commands_exist() {
        // Verify command handlers are properly defined as async functions
        let _get: fn(tauri::AppHandle) -> _ = get_stored_path;
        let _set: fn(tauri::AppHandle, String) -> _ = set_stored_path;
    }
}
