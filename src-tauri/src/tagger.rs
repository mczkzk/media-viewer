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

fn find_helper(name: &str) -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        let resources = exe
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("Resources"));
        if let Some(ref res) = resources {
            let bundled = res.join("helpers").join(name);
            if bundled.exists() {
                return Some(bundled);
            }
            let flat = res.join(name);
            if flat.exists() {
                return Some(flat);
            }
        }
    }
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("helpers").join(name);
    if dev_path.exists() {
        return Some(dev_path);
    }
    None
}

fn find_vision_tagger() -> Option<PathBuf> {
    find_helper("vision-tagger")
}

/// Call the Swift vision-tagger helper for a batch of images.
#[derive(Deserialize)]
struct VisionResult {
    labels: Vec<String>,
    text: Vec<String>,
}

/// Returns Vec of VisionResult (labels + OCR text), one per image.
fn classify_batch(paths: &[String]) -> Result<Vec<VisionResult>, String> {
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

struct GeoResult {
    en: String,
    ja: String,
}

/// Reverse-geocode a single coordinate via Swift helper (CLGeocoder).
fn reverse_geocode_one(lat: f64, lon: f64) -> Option<GeoResult> {
    let geocoder = find_helper("reverse-geocoder")?;
    let coord = format!("{},{}", lat, lon);

    let output = Command::new(&geocoder)
        .arg(&coord)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: HashMap<String, String> = serde_json::from_str(&stdout).ok()?;
    let ja = parsed.get("ja").cloned().unwrap_or_default();
    let en = parsed.get("en").cloned().unwrap_or_default();

    if ja.is_empty() && en.is_empty() {
        return None;
    }

    Some(GeoResult { en, ja })
}

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

    // Extract GPS and reverse-geocode one at a time (1s interval to avoid rate limiting)
    let mut location_map: HashMap<usize, GeoResult> = HashMap::new();
    for (i, p) in paths.iter().enumerate() {
        if !is_video(p) {
            let full = PathBuf::from(base_path).join(p);
            if let Some((lat, lon)) = thumbnail::get_gps(&full) {
                if let Some(geo) = reverse_geocode_one(lat, lon) {
                    location_map.insert(i, geo);
                }
                // Rate limit: 1 second between geocode requests
                std::thread::sleep(std::time::Duration::from_secs(1));
            }
        }
    }

    let mut tags = load_tags(app_data_dir);
    let mut count = 0;

    for (i, (rel_path, vision)) in paths.iter().zip(results.iter()).enumerate() {
        let mut tag_set: Vec<String> = Vec::new();

        // Vision classification labels (EN + JA)
        for label in &vision.labels {
            let ja = label_dict::translate(label);
            if !tag_set.contains(&label.to_string()) {
                tag_set.push(label.to_string());
            }
            let ja_str = ja.to_string();
            if ja != *label && !tag_set.contains(&ja_str) {
                tag_set.push(ja_str);
            }
        }

        // OCR text
        for text in &vision.text {
            if !tag_set.contains(text) {
                tag_set.push(text.clone());
            }
        }

        // GPS location (JA + EN)
        if let Some(geo) = location_map.get(&i) {
            for loc_str in [&geo.ja, &geo.en] {
                for part in loc_str.split_whitespace() {
                    if !tag_set.contains(&part.to_string()) {
                        tag_set.push(part.to_string());
                    }
                }
            }
        }
        tags.insert(rel_path.clone(), tag_set);
        count += 1;
    }

    save_tags(app_data_dir, &tags)?;
    Ok(count)
}

