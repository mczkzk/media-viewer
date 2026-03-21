use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
struct TagCache {
    version: u32,
    tags: HashMap<String, Vec<String>>,
}

impl TagCache {
    fn new() -> Self {
        Self {
            version: 1,
            tags: HashMap::new(),
        }
    }
}

fn cache_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("cache").join("tags.json")
}

pub fn load_tags(app_data_dir: &Path) -> HashMap<String, Vec<String>> {
    let path = cache_path(app_data_dir);
    let data = match fs::read_to_string(&path) {
        Ok(d) => d,
        Err(_) => return HashMap::new(),
    };
    match serde_json::from_str::<TagCache>(&data) {
        Ok(cache) => cache.tags,
        Err(_) => HashMap::new(),
    }
}

fn save_tags(app_data_dir: &Path, tags: &HashMap<String, Vec<String>>) -> Result<(), String> {
    let path = cache_path(app_data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let cache = TagCache {
        version: 1,
        tags: tags.clone(),
    };
    let data = serde_json::to_string(&cache).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}

fn find_vision_tagger() -> Option<PathBuf> {
    // Check bundled binary in app Resources
    if let Ok(exe) = std::env::current_exe() {
        let resources = exe
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("Resources"));
        if let Some(ref res) = resources {
            // Tauri bundles resources with their relative path
            let bundled = res.join("helpers").join("vision-tagger");
            if bundled.exists() {
                return Some(bundled);
            }
            let flat = res.join("vision-tagger");
            if flat.exists() {
                return Some(flat);
            }
        }
    }

    // Dev mode: check helpers directory relative to source
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("helpers").join("vision-tagger");
    if dev_path.exists() {
        return Some(dev_path);
    }

    None
}

/// Call the Swift vision-tagger helper for a batch of images.
/// Returns Vec of label arrays (English), one per image.
fn classify_batch(paths: &[String]) -> Result<Vec<Vec<String>>, String> {
    let tagger = find_vision_tagger().ok_or("vision-tagger binary not found")?;

    let output = Command::new(&tagger)
        .args(paths)
        .output()
        .map_err(|e| format!("Failed to run vision-tagger: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("vision-tagger failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse vision-tagger output: {}", e))
}

use crate::label_dict;
use crate::thumbnail;

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "avi", "m4v", "mkv"];

fn is_video(path: &str) -> bool {
    path.rsplit('.')
        .next()
        .map(|ext| VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Tag a batch of images. Returns number of newly tagged images.
/// For videos, uses the cached thumbnail instead of the original file.
pub fn tag_images(
    paths: &[String],
    base_path: &str,
    app_data_dir: &Path,
) -> Result<usize, String> {
    let cache_dir = app_data_dir.join("cache").join("thumbnails");
    let full_paths: Vec<String> = paths
        .iter()
        .map(|p| {
            if is_video(p) {
                // Use cached thumbnail for videos
                let hash = thumbnail::hash_path(p);
                let thumb = cache_dir.join(format!("{}.jpg", hash));
                if thumb.exists() {
                    return thumb.to_string_lossy().to_string();
                }
            }
            format!("{}/{}", base_path, p)
        })
        .collect();

    let results = classify_batch(&full_paths)?;
    let mut tags = load_tags(app_data_dir);
    let mut count = 0;

    for (rel_path, labels) in paths.iter().zip(results.iter()) {
        let mut tag_set: Vec<String> = Vec::new();
        for label in labels {
            let ja = label_dict::translate(label);
            // Always include English original
            if !tag_set.contains(&label.to_string()) {
                tag_set.push(label.to_string());
            }
            // Add Japanese translation if different from English
            let ja_str = ja.to_string();
            if ja != *label && !tag_set.contains(&ja_str) {
                tag_set.push(ja_str);
            }
        }
        tags.insert(rel_path.clone(), tag_set);
        count += 1;
    }

    save_tags(app_data_dir, &tags)?;
    Ok(count)
}
