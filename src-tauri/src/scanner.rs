use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "heic", "heif"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "avi", "m4v", "mkv"];

const CACHE_DURATION_SECS: u64 = 24 * 60 * 60; // 24 hours

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct MediaItem {
    pub path: String,
    pub year: String,
    pub event: String,
    pub filename: String,
    #[serde(rename = "type")]
    pub media_type: String,
    pub mtime: u64,
}

fn get_media_type(ext: &str) -> Option<&'static str> {
    let lower = ext.to_lowercase();
    if IMAGE_EXTENSIONS.contains(&lower.as_str()) {
        Some("image")
    } else if VIDEO_EXTENSIONS.contains(&lower.as_str()) {
        Some("video")
    } else {
        None
    }
}

fn get_birthtime_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.created().ok())
        .or_else(|| fs::metadata(path).ok().and_then(|m| m.modified().ok()))
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Scan a YEAR/EVENT structured media directory
pub fn scan_directory(base_path: &str) -> Result<Vec<MediaItem>, String> {
    let base = PathBuf::from(base_path);
    if !base.is_dir() {
        return Err(format!("Directory not found: {}", base_path));
    }

    let mut items = Vec::new();

    // Read year-level directories
    let year_entries = fs::read_dir(&base).map_err(|e| e.to_string())?;

    for year_entry in year_entries.flatten() {
        let year_name = year_entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and the media-viewer directory itself
        if year_name.starts_with('.') || year_name == "media-viewer" {
            continue;
        }

        let year_path = year_entry.path();
        if !year_path.is_dir() {
            continue;
        }

        // Read event-level entries
        let event_entries = match fs::read_dir(&year_path) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for event_entry in event_entries.flatten() {
            let event_name = event_entry.file_name().to_string_lossy().to_string();

            if event_name.starts_with('.') {
                continue;
            }

            let event_path = event_entry.path();

            if event_path.is_file() {
                // File directly in year directory
                if let Some(ext) = event_path.extension().and_then(|e| e.to_str()) {
                    if let Some(media_type) = get_media_type(ext) {
                        let relative = format!("{}/{}", year_name, event_name);
                        items.push(MediaItem {
                            path: relative,
                            year: year_name.clone(),
                            event: year_name.clone(),
                            filename: event_name,
                            media_type: media_type.to_string(),
                            mtime: get_birthtime_ms(&event_path),
                        });
                    }
                }
                continue;
            }

            if !event_path.is_dir() {
                continue;
            }

            // Recursively scan event directory
            for entry in WalkDir::new(&event_path)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                let file_name = match path.file_name().and_then(|n| n.to_str()) {
                    Some(name) if !name.starts_with('.') => name.to_string(),
                    _ => continue,
                };

                let ext = match path.extension().and_then(|e| e.to_str()) {
                    Some(ext) => ext,
                    None => continue,
                };

                let media_type = match get_media_type(ext) {
                    Some(t) => t,
                    None => continue,
                };

                let relative = path
                    .strip_prefix(&base)
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .to_string();

                items.push(MediaItem {
                    path: relative,
                    year: year_name.clone(),
                    event: event_name.clone(),
                    filename: file_name,
                    media_type: media_type.to_string(),
                    mtime: get_birthtime_ms(path),
                });
            }
        }
    }

    Ok(items)
}

/// Get cache file path for the given base path
fn cache_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("cache").join("index.json")
}

/// Check if cache is valid (exists and not expired)
fn is_cache_valid(cache_file: &Path) -> bool {
    fs::metadata(cache_file)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.elapsed().ok())
        .map(|age| age.as_secs() < CACHE_DURATION_SECS)
        .unwrap_or(false)
}

/// Load items from cache
fn load_cache(cache_file: &Path) -> Option<Vec<MediaItem>> {
    let data = fs::read_to_string(cache_file).ok()?;
    serde_json::from_str(&data).ok()
}

/// Save items to cache
fn save_cache(cache_file: &Path, items: &[MediaItem]) -> Result<(), String> {
    if let Some(parent) = cache_file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(items).map_err(|e| e.to_string())?;
    fs::write(cache_file, data).map_err(|e| e.to_string())
}

/// Get or create media index with caching
pub fn get_or_create_index(
    base_path: &str,
    app_data_dir: &Path,
) -> Result<Vec<MediaItem>, String> {
    let cache_file = cache_path(app_data_dir);

    if is_cache_valid(&cache_file) {
        if let Some(cached) = load_cache(&cache_file) {
            return Ok(cached);
        }
    }

    let items = scan_directory(base_path)?;
    let _ = save_cache(&cache_file, &items);
    Ok(items)
}

/// Force a fresh scan ignoring cache
pub fn force_scan(base_path: &str, app_data_dir: &Path) -> Result<Vec<MediaItem>, String> {
    let items = scan_directory(base_path)?;
    let _ = save_cache(&cache_path(app_data_dir), &items);
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_tree(dir: &Path) {
        // YEAR/EVENT structure
        let event_dir = dir.join("2024").join("2024-06-vacation");
        fs::create_dir_all(&event_dir).unwrap();
        fs::write(event_dir.join("photo1.jpg"), "fake jpg").unwrap();
        fs::write(event_dir.join("photo2.png"), "fake png").unwrap();
        fs::write(event_dir.join("video1.mp4"), "fake mp4").unwrap();
        fs::write(event_dir.join(".hidden.jpg"), "hidden").unwrap();
        fs::write(event_dir.join("readme.txt"), "not media").unwrap();

        // Nested subdirectory
        let sub_dir = event_dir.join("day2");
        fs::create_dir_all(&sub_dir).unwrap();
        fs::write(sub_dir.join("photo3.heic"), "fake heic").unwrap();

        // Another year
        let event2_dir = dir.join("2023").join("2023-01-newyear");
        fs::create_dir_all(&event2_dir).unwrap();
        fs::write(event2_dir.join("fireworks.mov"), "fake mov").unwrap();

        // File directly in year directory (no event folder)
        fs::write(dir.join("2023").join("standalone.jpg"), "standalone").unwrap();
    }

    #[test]
    fn test_scan_directory_structure() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let items = scan_directory(tmp.path().to_str().unwrap()).unwrap();

        // Should find: photo1.jpg, photo2.png, video1.mp4, photo3.heic, fireworks.mov, standalone.jpg
        assert_eq!(items.len(), 6, "Expected 6 media files, got {}: {:?}", items.len(), items.iter().map(|i| &i.path).collect::<Vec<_>>());
    }

    #[test]
    fn test_skips_hidden_files() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let items = scan_directory(tmp.path().to_str().unwrap()).unwrap();
        let hidden: Vec<_> = items.iter().filter(|i| i.filename.starts_with('.')).collect();
        assert!(hidden.is_empty(), "Should not include hidden files");
    }

    #[test]
    fn test_skips_non_media_files() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let items = scan_directory(tmp.path().to_str().unwrap()).unwrap();
        let txt: Vec<_> = items.iter().filter(|i| i.filename.ends_with(".txt")).collect();
        assert!(txt.is_empty(), "Should not include .txt files");
    }

    #[test]
    fn test_media_type_detection() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let items = scan_directory(tmp.path().to_str().unwrap()).unwrap();

        let images: Vec<_> = items.iter().filter(|i| i.media_type == "image").collect();
        let videos: Vec<_> = items.iter().filter(|i| i.media_type == "video").collect();

        assert_eq!(images.len(), 4, "Expected 4 images");
        assert_eq!(videos.len(), 2, "Expected 2 videos");
    }

    #[test]
    fn test_year_event_assignment() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let items = scan_directory(tmp.path().to_str().unwrap()).unwrap();

        let photo1 = items.iter().find(|i| i.filename == "photo1.jpg").unwrap();
        assert_eq!(photo1.year, "2024");
        assert_eq!(photo1.event, "2024-06-vacation");

        // File directly in year dir uses year as event
        let standalone = items.iter().find(|i| i.filename == "standalone.jpg").unwrap();
        assert_eq!(standalone.year, "2023");
        assert_eq!(standalone.event, "2023");
    }

    #[test]
    fn test_nested_subdirectory_paths() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let items = scan_directory(tmp.path().to_str().unwrap()).unwrap();

        let heic = items.iter().find(|i| i.filename == "photo3.heic").unwrap();
        assert_eq!(heic.path, "2024/2024-06-vacation/day2/photo3.heic");
        assert_eq!(heic.event, "2024-06-vacation");
    }

    #[test]
    fn test_invalid_directory() {
        let result = scan_directory("/nonexistent/path");
        assert!(result.is_err());
    }

    #[test]
    fn test_cache_roundtrip() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let cache_dir = TempDir::new().unwrap();
        let items = scan_directory(tmp.path().to_str().unwrap()).unwrap();

        // Save cache
        save_cache(&cache_path(cache_dir.path()), &items).unwrap();

        // Load cache
        let loaded = load_cache(&cache_path(cache_dir.path())).unwrap();
        assert_eq!(items.len(), loaded.len());

        // Cache should be valid
        assert!(is_cache_valid(&cache_path(cache_dir.path())));
    }

    #[test]
    fn test_get_or_create_index_uses_cache() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let cache_dir = TempDir::new().unwrap();

        // First call: scans and caches
        let items1 = get_or_create_index(tmp.path().to_str().unwrap(), cache_dir.path()).unwrap();

        // Add a new file (should not appear if cache is used)
        let new_file = tmp.path().join("2024").join("2024-06-vacation").join("new.jpg");
        fs::write(&new_file, "new").unwrap();

        // Second call: should use cache
        let items2 = get_or_create_index(tmp.path().to_str().unwrap(), cache_dir.path()).unwrap();
        assert_eq!(items1.len(), items2.len(), "Should use cached result");

        // Force scan: should find the new file
        let items3 = force_scan(tmp.path().to_str().unwrap(), cache_dir.path()).unwrap();
        assert_eq!(items3.len(), items1.len() + 1, "Force scan should find new file");
    }
}
