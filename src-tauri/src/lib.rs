mod scanner;
mod thumbnail;

use tauri::Manager;
use tauri_plugin_fs::FsExt;
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

    let scope = app.fs_scope();
    let _ = scope.allow_directory(&path, true);

    Ok(())
}

#[tauri::command]
async fn scan_media(
    app: tauri::AppHandle,
    base_path: String,
) -> Result<Vec<scanner::MediaItem>, String> {
    let scope = app.fs_scope();
    let _ = scope.allow_directory(&base_path, true);

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    scanner::get_or_create_index(&base_path, &app_data_dir)
}

#[tauri::command]
async fn force_scan(
    app: tauri::AppHandle,
    base_path: String,
) -> Result<Vec<scanner::MediaItem>, String> {
    let scope = app.fs_scope();
    let _ = scope.allow_directory(&base_path, true);

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    scanner::force_scan(&base_path, &app_data_dir)
}

#[tauri::command]
async fn get_thumbnail(
    app: tauri::AppHandle,
    path: String,
    base_path: String,
) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_data_dir.join("cache").join("thumbnails");
    thumbnail::get_thumbnail_base64(&path, &base_path, &cache_dir)
}

#[tauri::command]
async fn get_media_file(path: String, base_path: String) -> Result<String, String> {
    thumbnail::read_media_base64(&path, &base_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let store = app.handle().store("settings.json").ok();
            if let Some(store) = store {
                if let Some(path) = store
                    .get("mediaBasePath")
                    .and_then(|v: serde_json::Value| v.as_str().map(String::from))
                {
                    let scope = app.fs_scope();
                    let _ = scope.allow_directory(&path, true);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_stored_path,
            set_stored_path,
            scan_media,
            force_scan,
            get_thumbnail,
            get_media_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commands_exist() {
        let _get: fn(tauri::AppHandle) -> _ = get_stored_path;
        let _set: fn(tauri::AppHandle, String) -> _ = set_stored_path;
        let _scan: fn(tauri::AppHandle, String) -> _ = scan_media;
        let _force: fn(tauri::AppHandle, String) -> _ = force_scan;
        let _thumb: fn(tauri::AppHandle, String, String) -> _ = get_thumbnail;
        let _media: fn(String, String) -> _ = get_media_file;
    }
}
