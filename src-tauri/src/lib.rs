mod geo_dict;
mod label_dict;
mod scanner;
mod tagger;
mod thumbnail;
mod video_server;

use std::path::PathBuf;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};
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

    let old_path = store
        .get("mediaBasePath")
        .and_then(|v: serde_json::Value| v.as_str().map(String::from));

    store.set("mediaBasePath", serde_json::json!(path));
    store
        .save()
        .map_err(|e: tauri_plugin_store::Error| e.to_string())?;

    let scope = app.fs_scope();
    let _ = scope.allow_directory(&path, true);

    // Clear scan cache when folder actually changes
    if old_path.as_deref() != Some(&path) {
        let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let cache_file = app_data_dir.join("cache").join("index.json");
        let _ = std::fs::remove_file(cache_file);
    }

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
    thumbnail::ensure_thumbnail(&path, &base_path, &cache_dir)
}

#[tauri::command]
async fn get_thumbnail_cache_dir(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_data_dir.join("cache").join("thumbnails");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    Ok(cache_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn batch_ensure_thumbnails(
    app: tauri::AppHandle,
    paths: Vec<String>,
    base_path: String,
) -> Result<Vec<bool>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_data_dir.join("cache").join("thumbnails");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    let results: Vec<bool> = paths
        .iter()
        .map(|p| thumbnail::ensure_thumbnail(p, &base_path, &cache_dir).is_ok())
        .collect();

    Ok(results)
}

#[tauri::command]
async fn get_media_info(path: String, base_path: String) -> Result<serde_json::Value, String> {
    let full_path = PathBuf::from(&base_path).join(&path);
    thumbnail::get_media_info(&full_path)
}

#[tauri::command]
async fn get_video_server_port(state: tauri::State<'_, VideoServerPort>) -> Result<u16, String> {
    Ok(state.0)
}

#[tauri::command]
async fn clear_cache(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_data_dir.join("cache");

    let mut total_bytes: u64 = 0;
    let mut total_files: u64 = 0;

    for subdir in &["thumbnails", "converted"] {
        let dir = cache_dir.join(subdir);
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    total_bytes += meta.len();
                }
                if std::fs::remove_file(entry.path()).is_ok() {
                    total_files += 1;
                }
            }
        }
    }

    let index = cache_dir.join("index.json");
    if let Ok(meta) = std::fs::metadata(&index) {
        total_bytes += meta.len();
        if std::fs::remove_file(&index).is_ok() {
            total_files += 1;
        }
    }

    let size_mb = total_bytes as f64 / (1024.0 * 1024.0);
    Ok(format!("{total_files}ファイル（{size_mb:.1}MB）を削除しました"))
}

#[tauri::command]
async fn clear_tags(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let tags_file = app_data_dir.join("cache").join("tags.json");
    let _ = std::fs::remove_file(tags_file);
    Ok(())
}

#[tauri::command]
async fn get_tags(app: tauri::AppHandle) -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(tagger::load_tags(&app_data_dir))
}

#[tauri::command]
async fn tag_images(
    app: tauri::AppHandle,
    paths: Vec<String>,
    base_path: String,
) -> Result<usize, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        tagger::tag_images(&paths, &base_path, &app_data_dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

struct VideoServerPort(u16);

pub fn mime_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "heic" | "heif" => "image/jpeg", // served as converted JPEG
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "m4v" => "video/x-m4v",
        "mkv" => "video/x-matroska",
        _ => "application/octet-stream",
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .register_uri_scheme_protocol("media", move |_ctx, request| {
            use std::io::{Read, Seek, SeekFrom};

            let uri = request.uri().to_string();
            // Strip scheme + host prefix, and remove query string if present
            let path_part = uri
                .strip_prefix("media://localhost/")
                .or_else(|| uri.strip_prefix("media://localhost"))
                .unwrap_or("");
            let path_part = path_part.split('?').next().unwrap_or(path_part);

            let decoded = percent_encoding::percent_decode_str(path_part)
                .decode_utf8_lossy()
                .to_string();

            let file_path = PathBuf::from("/").join(&decoded);

            if !file_path.exists() {
                return tauri::http::Response::builder()
                    .status(404)
                    .body(b"Not found".to_vec())
                    .unwrap();
            }

            let ext = file_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            // HEIC: convert and cache as JPEG
            if thumbnail::is_heic_ext(&ext) {
                match thumbnail::convert_heic_cached(&file_path) {
                    Ok(cached_path) => {
                        let bytes = std::fs::read(&cached_path).unwrap_or_default();
                        return tauri::http::Response::builder()
                            .status(200)
                            .header("Content-Type", "image/jpeg")
                            .header("Content-Length", bytes.len().to_string())
                            .body(bytes)
                            .unwrap();
                    }
                    Err(_) => {
                        return tauri::http::Response::builder()
                            .status(500)
                            .body(b"HEIC conversion failed".to_vec())
                            .unwrap();
                    }
                }
            }

            let mime = mime_for_ext(&ext);
            let file_size = std::fs::metadata(&file_path)
                .map(|m| m.len())
                .unwrap_or(0);

            // Always serve with Range support (critical for video)
            let range_header = request
                .headers()
                .get("Range")
                .or_else(|| request.headers().get("range"))
                .and_then(|v| v.to_str().ok())
                .map(String::from);

            // Determine byte range
            let (start, end) = if let Some(range_str) = range_header {
                let range = range_str.trim_start_matches("bytes=");
                let parts: Vec<&str> = range.split('-').collect();
                let s: u64 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
                let e: u64 = parts
                    .get(1)
                    .and_then(|v| if v.is_empty() { None } else { v.parse().ok() })
                    .unwrap_or_else(|| (s + 4 * 1024 * 1024 - 1).min(file_size - 1));
                (s, e.min(file_size - 1))
            } else if file_size > 10 * 1024 * 1024 {
                // Large file without Range: serve first 4MB to trigger range mode
                (0, (4 * 1024 * 1024 - 1).min(file_size - 1))
            } else {
                // Small file: serve entirely
                (0, file_size - 1)
            };

            let length = end - start + 1;
            let is_partial = !(start == 0 && end == file_size - 1);

            let mut file = match std::fs::File::open(&file_path) {
                Ok(f) => f,
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(500)
                        .body(b"Read error".to_vec())
                        .unwrap();
                }
            };

            if start > 0 {
                let _ = file.seek(SeekFrom::Start(start));
            }
            let mut buf = vec![0u8; length as usize];
            let _ = file.read_exact(&mut buf);

            let mut builder = tauri::http::Response::builder()
                .header("Content-Type", mime)
                .header("Content-Length", length.to_string())
                .header("Accept-Ranges", "bytes");

            if is_partial {
                builder = builder
                    .status(206)
                    .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_size));
            } else {
                builder = builder.status(200);
            }

            builder.body(buf).unwrap()
        })
        .setup(|app| {
            // Start video streaming server on a random port
            let port = video_server::start();
            app.manage(VideoServerPort(port));

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

            // Application menu
            let change_folder =
                MenuItemBuilder::with_id("change_folder", "フォルダを変更...")
                    .accelerator("CmdOrCtrl+O")
                    .build(app)?;

            let clear_cache_menu =
                MenuItemBuilder::with_id("clear_cache", "キャッシュをクリア...")
                    .build(app)?;

            let regenerate_tags_menu =
                MenuItemBuilder::with_id("regenerate_tags", "タグを再生成...")
                    .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&change_folder)
                .item(&clear_cache_menu)
                .item(&regenerate_tags_menu)
                .separator()
                .close_window()
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .fullscreen()
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&file_menu, &edit_menu, &view_menu])
                .build()?;
            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                match event.id().0.as_str() {
                    "change_folder" => {
                        let _ = app_handle.emit("menu-change-folder", ());
                    }
                    "clear_cache" => {
                        let _ = app_handle.emit("menu-clear-cache", ());
                    }
                    "regenerate_tags" => {
                        let _ = app_handle.emit("menu-regenerate-tags", ());
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_stored_path,
            set_stored_path,
            scan_media,
            force_scan,
            get_thumbnail,
            get_thumbnail_cache_dir,
            batch_ensure_thumbnails,
            get_media_info,
            get_video_server_port,
            clear_cache,
            clear_tags,
            get_tags,
            tag_images
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
        let _info: fn(String, String) -> _ = get_media_info;
    }

    #[test]
    fn test_mime_types() {
        assert_eq!(mime_for_ext("jpg"), "image/jpeg");
        assert_eq!(mime_for_ext("MP4"), "video/mp4");
        assert_eq!(mime_for_ext("heic"), "image/jpeg");
        assert_eq!(mime_for_ext("mov"), "video/quicktime");
    }
}
