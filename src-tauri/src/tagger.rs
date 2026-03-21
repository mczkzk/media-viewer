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

use crate::geo_dict;
use crate::label_dict;
use crate::scanner;
use crate::thumbnail;

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Stdio};

fn is_video(path: &str) -> bool {
    path.rsplit('.')
        .next()
        .map(|ext| scanner::VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Distance in meters between two GPS coordinates (haversine).
fn gps_distance(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6_371_000.0; // Earth radius in meters
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlon / 2.0).sin().powi(2);
    r * 2.0 * a.sqrt().asin()
}

struct GeocoderProcess {
    child: Child,
    reader: BufReader<std::process::ChildStdout>,
    last_lat: f64,
    last_lon: f64,
    last_result: String,
}

impl GeocoderProcess {
    fn spawn() -> Option<Self> {
        let geocoder_path = find_helper("reverse-geocoder")?;
        let mut child = Command::new(&geocoder_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let stdout = child.stdout.take()?;
        let reader = BufReader::new(stdout);
        Some(Self {
            child,
            reader,
            last_lat: f64::NAN,
            last_lon: f64::NAN,
            last_result: String::new(),
        })
    }

    /// Geocode a coordinate. Reuses cached result if within 50m of last query.
    fn geocode(&mut self, lat: f64, lon: f64) -> Option<String> {
        if !self.last_lat.is_nan() && gps_distance(lat, lon, self.last_lat, self.last_lon) < 50.0 {
            if !self.last_result.is_empty() {
                return Some(self.last_result.clone());
            }
            return None;
        }

        let stdin = self.child.stdin.as_mut()?;

        let coord = format!("{},{}\n", lat, lon);
        stdin.write_all(coord.as_bytes()).ok()?;
        stdin.flush().ok()?;

        let mut line = String::new();
        self.reader.read_line(&mut line).ok()?;

        let parsed: HashMap<String, String> = serde_json::from_str(line.trim()).ok()?;
        let error = parsed.get("error").cloned().unwrap_or_default();
        let location = parsed.get("location").cloned().unwrap_or_default();

        self.last_lat = lat;
        self.last_lon = lon;

        if error == "rate_limit" {
            eprintln!("Geocoder: rate limited, waiting 60s");
            std::thread::sleep(std::time::Duration::from_secs(60));
            self.last_result = String::new();
            return None;
        }

        if location.is_empty() {
            self.last_result = String::new();
            return None;
        }

        self.last_result = location.clone();
        Some(location)
    }

    fn quit(&mut self) {
        if let Some(stdin) = self.child.stdin.as_mut() {
            let _ = stdin.write_all(b"quit\n");
            let _ = stdin.flush();
        }
        let _ = self.child.wait();
    }
}

/// Build EN+JA location tags from a Japanese location string.
/// Parse English fullAddress into tags, add Japanese prefecture names.
/// Input: "Karuizawa, 〒389-0102, Nagano, Japan" or similar
fn build_location_tags(en_location: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for segment in en_location.split(',') {
        for word in segment.trim().split_whitespace() {
            let clean = word.trim_matches(|c: char| !c.is_alphanumeric() && c != '-');
            if clean.is_empty() || clean.starts_with('〒') {
                continue;
            }
            if clean.chars().all(|c| c.is_ascii_digit() || c == '-') {
                continue;
            }
            if !tags.contains(&clean.to_string()) {
                tags.push(clean.to_string());
            }
        }
    }
    let tags_snapshot: Vec<String> = tags.clone();
    for tag in &tags_snapshot {
        for ja in geo_dict::translate(tag) {
            let ja_str = ja.to_string();
            if !tags.contains(&ja_str) {
                tags.push(ja_str);
            }
        }
    }
    tags
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

    let mut location_map: HashMap<usize, Vec<String>> = HashMap::new();
    let mut geocoder = GeocoderProcess::spawn();

    if let Some(ref mut geo) = geocoder {
        for (i, p) in paths.iter().enumerate() {
            if !is_video(p) {
                let full = PathBuf::from(base_path).join(p);
                if let Some((lat, lon)) = thumbnail::get_gps(&full) {
                    if let Some(ja_location) = geo.geocode(lat, lon) {
                        location_map.insert(i, build_location_tags(&ja_location));
                    }
                    // CLGeocoder rate limit: match reverse-geocoder's 2s interval
                    std::thread::sleep(std::time::Duration::from_secs(2));
                }
            }
        }
        geo.quit();
    }

    let mut tags = load_tags(app_data_dir);
    let mut count = 0;

    for (i, (rel_path, vision)) in paths.iter().zip(results.iter()).enumerate() {
        let mut tag_set: Vec<String> = Vec::new();

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

        for text in &vision.text {
            if !tag_set.contains(text) {
                tag_set.push(text.clone());
            }
        }

        if let Some(loc_tags) = location_map.get(&i) {
            for tag in loc_tags {
                if !tag_set.contains(tag) {
                    tag_set.push(tag.clone());
                }
            }
        }
        tags.insert(rel_path.clone(), tag_set);
        count += 1;
    }

    save_tags(app_data_dir, &tags)?;
    Ok(count)
}

