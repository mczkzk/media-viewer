use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView};
use md5::{Digest, Md5};
use std::fs;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::process::Command;
use dirs;

const THUMBNAIL_SIZE: u32 = 300;

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "avi", "m4v", "mkv"];
const HEIC_EXTENSIONS: &[&str] = &["heic", "heif"];

pub fn hash_path(file_path: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(file_path.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn is_video(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| VIDEO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_heic(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| HEIC_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn is_heic_ext(ext: &str) -> bool {
    HEIC_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

/// Convert HEIC to JPEG using macOS sips command, writing to a temp directory
fn convert_heic_to_jpeg(heic_path: &Path) -> Result<PathBuf, String> {
    let hash = hash_path(&heic_path.to_string_lossy());
    let temp_path = std::env::temp_dir().join(format!("media-viewer-{}.jpg", hash));

    let status = Command::new("sips")
        .args([
            "-s",
            "format",
            "jpeg",
            heic_path.to_str().unwrap_or(""),
            "--out",
            temp_path.to_str().unwrap_or(""),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("sips command failed: {}", e))?;

    if !status.success() {
        return Err("sips conversion failed".to_string());
    }
    Ok(temp_path)
}

/// Convert HEIC to JPEG with persistent cache. Returns path to cached JPEG.
pub fn convert_heic_cached(heic_path: &Path) -> Result<PathBuf, String> {
    let hash = hash_path(&heic_path.to_string_lossy());
    // Use a persistent cache dir, not temp
    let cache_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("com.mediaviewer.app")
        .join("cache")
        .join("converted");
    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let cached_path = cache_dir.join(format!("{}.jpg", hash));

    if cached_path.exists() {
        return Ok(cached_path);
    }

    let status = Command::new("sips")
        .args([
            "-s", "format", "jpeg",
            heic_path.to_str().unwrap_or(""),
            "--out",
            cached_path.to_str().unwrap_or(""),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("sips command failed: {}", e))?;

    if !status.success() {
        return Err("sips conversion failed".to_string());
    }
    Ok(cached_path)
}

/// Generate video thumbnail using ffmpeg
fn generate_video_thumbnail(video_path: &Path, cache_path: &Path) -> Result<(), String> {
    let ffmpeg = which_ffmpeg().ok_or("ffmpeg not found")?;

    let status = Command::new(&ffmpeg)
        .args([
            "-i",
            video_path.to_str().unwrap_or(""),
            "-ss",
            "1",
            "-vframes",
            "1",
            "-vf",
            &format!("scale={THUMBNAIL_SIZE}:{THUMBNAIL_SIZE}:force_original_aspect_ratio=increase,crop={THUMBNAIL_SIZE}:{THUMBNAIL_SIZE}"),
            "-y",
            cache_path.to_str().unwrap_or(""),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    if !status.success() {
        return Err("ffmpeg thumbnail extraction failed".to_string());
    }
    Ok(())
}

/// Find a binary by checking npm path, well-known paths, then $PATH
fn find_binary(name: &str, npm_subpath: &str, well_known: &[&str]) -> Option<String> {
    let npm_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or(Path::new("."))
        .join("node_modules")
        .join(npm_subpath)
        .join(name);
    if npm_path.exists() {
        return npm_path.to_str().map(String::from);
    }

    for path in well_known {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    Command::new("which")
        .arg(name)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
}

fn which_ffmpeg() -> Option<String> {
    find_binary("ffmpeg", "ffmpeg-static", &[
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ])
}

fn which_ffprobe() -> Option<String> {
    find_binary("ffprobe", "@ffprobe-installer", &[
        "/opt/homebrew/bin/ffprobe",
        "/usr/local/bin/ffprobe",
        "/usr/bin/ffprobe",
    ])
}

/// Generate a video placeholder as JPEG
fn generate_video_placeholder(cache_path: &Path) -> Result<(), String> {
    let mut img = image::RgbaImage::new(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    for pixel in img.pixels_mut() {
        *pixel = image::Rgba([44, 62, 80, 255]);
    }
    img.save(cache_path).map_err(|e| e.to_string())
}

/// Read EXIF orientation value (1-8)
fn get_exif_orientation(path: &Path) -> u32 {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return 1,
    };
    let mut reader = BufReader::new(file);
    let exif = match exif::Reader::new().read_from_container(&mut reader) {
        Ok(e) => e,
        Err(_) => return 1,
    };
    exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
        .and_then(|f| f.value.get_uint(0))
        .unwrap_or(1)
}

/// Apply EXIF orientation to image
fn apply_orientation(img: DynamicImage, orientation: u32) -> DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}

/// Resize an image to thumbnail size (cover crop from center)
fn resize_to_thumbnail(source_path: &Path, cache_path: &Path) -> Result<(), String> {
    let orientation = get_exif_orientation(source_path);
    let img = image::open(source_path).map_err(|e| format!("Failed to open image: {}", e))?;
    let img = apply_orientation(img, orientation);

    let (w, h) = img.dimensions();

    let scale = if w < h {
        THUMBNAIL_SIZE as f64 / w as f64
    } else {
        THUMBNAIL_SIZE as f64 / h as f64
    };

    let new_w = (w as f64 * scale).ceil() as u32;
    let new_h = (h as f64 * scale).ceil() as u32;

    let resized = img.resize(new_w, new_h, FilterType::Triangle);

    let crop_x = (new_w.saturating_sub(THUMBNAIL_SIZE)) / 2;
    let crop_y = (new_h.saturating_sub(THUMBNAIL_SIZE)) / 2;
    let cropped = resized.crop_imm(crop_x, crop_y, THUMBNAIL_SIZE, THUMBNAIL_SIZE);

    let mut buf = std::io::BufWriter::new(
        fs::File::create(cache_path).map_err(|e| format!("Failed to create cache file: {}", e))?,
    );
    cropped
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to write JPEG: {}", e))
}

/// Ensure thumbnail exists in cache, returns the absolute cache file path
pub fn ensure_thumbnail(
    original_path: &str,
    base_path: &str,
    cache_dir: &Path,
) -> Result<String, String> {
    let full_path = PathBuf::from(base_path).join(original_path);
    let hash = hash_path(original_path);
    let cache_path = cache_dir.join(format!("{}.jpg", hash));

    fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;

    if !cache_path.exists() {
        generate_thumbnail(&full_path, &cache_path)?;
    }

    Ok(cache_path.to_string_lossy().to_string())
}

/// Generate thumbnail for a single file. On failure, creates a placeholder to avoid retrying.
fn generate_thumbnail(full_path: &Path, cache_path: &Path) -> Result<(), String> {
    if !full_path.exists() {
        return Err(format!("File not found: {}", full_path.display()));
    }

    let result = generate_thumbnail_inner(full_path, cache_path);
    if result.is_err() {
        // Create placeholder so we don't retry failed files
        let _ = generate_video_placeholder(cache_path);
    }
    result
}

fn generate_thumbnail_inner(full_path: &Path, cache_path: &Path) -> Result<(), String> {
    if is_video(full_path) {
        if generate_video_thumbnail(full_path, cache_path).is_err() {
            generate_video_placeholder(cache_path)?;
        }
        return Ok(());
    }

    if is_heic(full_path) {
        let temp_jpeg = convert_heic_to_jpeg(full_path)?;
        let result = resize_to_thumbnail(&temp_jpeg, cache_path);
        let _ = fs::remove_file(&temp_jpeg);
        return result;
    }

    resize_to_thumbnail(full_path, cache_path)
}

/// Get media info (EXIF, dimensions, video metadata) as JSON
pub fn get_media_info(full_path: &Path) -> Result<serde_json::Value, String> {
    if !full_path.exists() {
        return Err(format!("File not found: {}", full_path.display()));
    }

    let metadata = fs::metadata(full_path).map_err(|e| e.to_string())?;
    let filename = full_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let ext = full_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let mut info = serde_json::json!({
        "filename": filename,
        "size": metadata.len(),
        "modified": modified,
        "type": if VIDEO_EXTENSIONS.contains(&ext.as_str()) { "video" } else { "image" },
    });

    // Image dimensions and EXIF
    if !VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        let img_path = if is_heic(full_path) {
            convert_heic_to_jpeg(full_path).ok()
        } else {
            None
        };
        let source = img_path.as_deref().unwrap_or(full_path);

        if let Ok(img) = image::open(source) {
            let orientation = get_exif_orientation(if is_heic(full_path) { full_path } else { source });
            let (w, h) = img.dimensions();
            let (w, h) = if orientation >= 5 { (h, w) } else { (w, h) };
            info["width"] = serde_json::json!(w);
            info["height"] = serde_json::json!(h);
            let mp = (w as f64 * h as f64 / 1_000_000.0 * 10.0).round() / 10.0;
            info["megapixels"] = serde_json::json!(mp);
        }

        if let Some(temp) = img_path {
            let _ = fs::remove_file(temp);
        }

        // Read EXIF data
        if let Ok(file) = fs::File::open(full_path) {
            let mut reader = BufReader::new(file);
            if let Ok(exif_data) = exif::Reader::new().read_from_container(&mut reader) {
                let mut exif_json = serde_json::json!({});

                if let Some(f) = exif_data.get_field(exif::Tag::DateTime, exif::In::PRIMARY) {
                    exif_json["dateTime"] = serde_json::json!(f.display_value().to_string());
                }
                if let Some(f) = exif_data.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
                    exif_json["dateTime"] = serde_json::json!(f.display_value().to_string());
                }
                if let Some(f) = exif_data.get_field(exif::Tag::Make, exif::In::PRIMARY) {
                    exif_json["make"] = serde_json::json!(f.display_value().to_string().trim_matches('"'));
                }
                if let Some(f) = exif_data.get_field(exif::Tag::Model, exif::In::PRIMARY) {
                    exif_json["model"] = serde_json::json!(f.display_value().to_string().trim_matches('"'));
                }
                if let Some(f) = exif_data.get_field(exif::Tag::FNumber, exif::In::PRIMARY) {
                    if let Some(v) = f.value.get_uint(0) {
                        // FNumber is stored as rational, display_value gives "f/2.8"
                        let _ = v; // use display_value instead
                    }
                    let s = f.display_value().to_string();
                    if let Ok(v) = s.parse::<f64>() {
                        exif_json["fNumber"] = serde_json::json!(v);
                    }
                }
                if let Some(f) = exif_data.get_field(exif::Tag::ExposureTime, exif::In::PRIMARY) {
                    let s = f.display_value().to_string();
                    // Parse "1/125" or "1/60 s" format
                    let s = s.trim_end_matches(" s").trim();
                    if s.contains('/') {
                        let parts: Vec<&str> = s.split('/').collect();
                        if parts.len() == 2 {
                            if let (Ok(num), Ok(den)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                                if den > 0.0 {
                                    exif_json["exposureTime"] = serde_json::json!(num / den);
                                }
                            }
                        }
                    }
                }
                if let Some(f) = exif_data.get_field(exif::Tag::FocalLength, exif::In::PRIMARY) {
                    let s = f.display_value().to_string();
                    let s = s.trim_end_matches(" mm").trim();
                    if let Ok(v) = s.parse::<f64>() {
                        exif_json["focalLength"] = serde_json::json!(v);
                    }
                }
                if let Some(f) = exif_data.get_field(exif::Tag::PhotographicSensitivity, exif::In::PRIMARY) {
                    if let Some(v) = f.value.get_uint(0) {
                        exif_json["iso"] = serde_json::json!(v);
                    }
                }
                if let Some(f) = exif_data.get_field(exif::Tag::LensModel, exif::In::PRIMARY) {
                    exif_json["lens"] = serde_json::json!(f.display_value().to_string().trim_matches('"'));
                }

                // GPS
                let lat = get_gps_coord(&exif_data, exif::Tag::GPSLatitude, exif::Tag::GPSLatitudeRef);
                let lng = get_gps_coord(&exif_data, exif::Tag::GPSLongitude, exif::Tag::GPSLongitudeRef);
                if let (Some(lat), Some(lng)) = (lat, lng) {
                    exif_json["gps"] = serde_json::json!({
                        "latitude": lat,
                        "longitude": lng,
                    });
                }

                info["exif"] = exif_json;
            }
        }
    }

    // Video metadata via ffprobe
    if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        if let Some(ffprobe) = which_ffprobe() {
            if let Ok(output) = Command::new(&ffprobe)
                .args([
                    "-v", "quiet",
                    "-print_format", "json",
                    "-show_format",
                    "-show_streams",
                    full_path.to_str().unwrap_or(""),
                ])
                .output()
            {
                if let Ok(json_str) = String::from_utf8(output.stdout) {
                    if let Ok(probe_data) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        // Extract duration
                        if let Some(duration) = probe_data["format"]["duration"]
                            .as_str()
                            .and_then(|s| s.parse::<f64>().ok())
                        {
                            info["duration"] = serde_json::json!(duration);
                        }

                        // Find video stream for dimensions, codec, fps
                        if let Some(streams) = probe_data["streams"].as_array() {
                            for stream in streams {
                                if stream["codec_type"].as_str() == Some("video") {
                                    if let (Some(w), Some(h)) = (
                                        stream["width"].as_u64(),
                                        stream["height"].as_u64(),
                                    ) {
                                        info["width"] = serde_json::json!(w);
                                        info["height"] = serde_json::json!(h);
                                    }
                                    if let Some(codec) = stream["codec_name"].as_str() {
                                        info["codec"] = serde_json::json!(codec);
                                    }
                                    // fps from r_frame_rate "30/1"
                                    if let Some(fps_str) = stream["r_frame_rate"].as_str() {
                                        let parts: Vec<&str> = fps_str.split('/').collect();
                                        if parts.len() == 2 {
                                            if let (Ok(n), Ok(d)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                                                if d > 0.0 {
                                                    info["fps"] = serde_json::json!(n / d);
                                                }
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(info)
}

/// Extract GPS coordinates (lat, lon) from an image file's EXIF data.
/// For HEIC files, falls back to sips JSON output since kamadak-exif doesn't support HEIC.
pub fn get_gps(file_path: &Path) -> Option<(f64, f64)> {
    // Try kamadak-exif first (works for JPEG/TIFF)
    if let Ok(file) = std::fs::File::open(file_path) {
        let mut reader = BufReader::new(file);
        if let Ok(exif_data) = exif::Reader::new().read_from_container(&mut reader) {
            let lat = get_gps_coord(&exif_data, exif::Tag::GPSLatitude, exif::Tag::GPSLatitudeRef);
            let lon = get_gps_coord(&exif_data, exif::Tag::GPSLongitude, exif::Tag::GPSLongitudeRef);
            if let (Some(lat), Some(lon)) = (lat, lon) {
                return Some((lat, lon));
            }
        }
    }

    // Fallback for HEIC: use sips to extract GPS
    if is_heic(file_path) {
        return get_gps_via_sips(file_path);
    }

    None
}

/// Extract GPS from HEIC using macOS sips command
fn get_gps_via_sips(file_path: &Path) -> Option<(f64, f64)> {
    let output = Command::new("mdls")
        .args(["-name", "kMDItemLatitude", "-name", "kMDItemLongitude"])
        .arg(file_path)
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lat: Option<f64> = None;
    let mut lon: Option<f64> = None;

    for line in stdout.lines() {
        if line.contains("kMDItemLatitude") && !line.contains("null") {
            lat = line.split('=').nth(1).and_then(|v| v.trim().parse().ok());
        }
        if line.contains("kMDItemLongitude") && !line.contains("null") {
            lon = line.split('=').nth(1).and_then(|v| v.trim().parse().ok());
        }
    }

    match (lat, lon) {
        (Some(la), Some(lo)) => Some((la, lo)),
        _ => None,
    }
}

/// Extract GPS coordinate from EXIF
fn get_gps_coord(exif_data: &exif::Exif, coord_tag: exif::Tag, ref_tag: exif::Tag) -> Option<f64> {
    let field = exif_data.get_field(coord_tag, exif::In::PRIMARY)?;
    let values: Vec<f64> = match &field.value {
        exif::Value::Rational(rationals) => {
            rationals.iter().map(|r| r.num as f64 / r.denom as f64).collect()
        }
        _ => return None,
    };
    if values.len() < 3 {
        return None;
    }
    let mut coord = values[0] + values[1] / 60.0 + values[2] / 3600.0;

    if let Some(ref_field) = exif_data.get_field(ref_tag, exif::In::PRIMARY) {
        let ref_str = ref_field.display_value().to_string();
        if ref_str.contains('S') || ref_str.contains('W') {
            coord = -coord;
        }
    }
    Some(coord)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_hash_path_deterministic() {
        let h1 = hash_path("2024/event/photo.jpg");
        let h2 = hash_path("2024/event/photo.jpg");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 32);
    }

    #[test]
    fn test_hash_path_unique() {
        let h1 = hash_path("2024/event/photo1.jpg");
        let h2 = hash_path("2024/event/photo2.jpg");
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_is_video() {
        assert!(is_video(Path::new("video.mp4")));
        assert!(is_video(Path::new("video.MOV")));
        assert!(!is_video(Path::new("photo.jpg")));
    }

    #[test]
    fn test_is_heic() {
        assert!(is_heic(Path::new("photo.heic")));
        assert!(is_heic(Path::new("photo.HEIF")));
        assert!(!is_heic(Path::new("photo.jpg")));
    }

    #[test]
    fn test_is_heic_ext() {
        assert!(is_heic_ext("heic"));
        assert!(is_heic_ext("HEIF"));
        assert!(!is_heic_ext("jpg"));
    }

    #[test]
    fn test_thumbnail_generation_jpg() {
        let tmp = TempDir::new().unwrap();
        let cache_dir = TempDir::new().unwrap();

        let img = image::RgbImage::from_pixel(100, 100, image::Rgb([255, 0, 0]));
        let img_path = tmp.path().join("test.jpg");
        img.save(&img_path).unwrap();

        let result = ensure_thumbnail(
            "test.jpg",
            tmp.path().to_str().unwrap(),
            cache_dir.path(),
        );

        assert!(result.is_ok());
        let cache_path = result.unwrap();
        assert!(cache_path.ends_with(".jpg"));
        assert!(Path::new(&cache_path).exists());
    }

    #[test]
    fn test_thumbnail_cache_hit() {
        let tmp = TempDir::new().unwrap();
        let cache_dir = TempDir::new().unwrap();

        let img = image::RgbImage::from_pixel(100, 100, image::Rgb([0, 255, 0]));
        let img_path = tmp.path().join("cached.jpg");
        img.save(&img_path).unwrap();

        let r1 = ensure_thumbnail("cached.jpg", tmp.path().to_str().unwrap(), cache_dir.path());
        assert!(r1.is_ok());

        fs::remove_file(&img_path).unwrap();

        let r2 = ensure_thumbnail("cached.jpg", tmp.path().to_str().unwrap(), cache_dir.path());
        assert!(r2.is_ok());
        assert_eq!(r1.unwrap(), r2.unwrap());
    }

    #[test]
    fn test_thumbnail_file_not_found() {
        let cache_dir = TempDir::new().unwrap();
        let result = ensure_thumbnail("nonexistent.jpg", "/tmp/fake", cache_dir.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_resize_preserves_aspect_cover() {
        let tmp = TempDir::new().unwrap();

        let img = image::RgbImage::from_pixel(400, 200, image::Rgb([0, 0, 255]));
        let img_path = tmp.path().join("wide.jpg");
        img.save(&img_path).unwrap();

        let cache_path = tmp.path().join("thumb.jpg");
        resize_to_thumbnail(&img_path, &cache_path).unwrap();

        let thumb = image::open(&cache_path).unwrap();
        assert_eq!(thumb.dimensions(), (THUMBNAIL_SIZE, THUMBNAIL_SIZE));
    }

    #[test]
    fn test_get_media_info_image() {
        let tmp = TempDir::new().unwrap();

        let img = image::RgbImage::from_pixel(800, 600, image::Rgb([128, 128, 128]));
        let img_path = tmp.path().join("info_test.jpg");
        img.save(&img_path).unwrap();

        let result = get_media_info(&img_path);
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info["filename"], "info_test.jpg");
        assert_eq!(info["width"], 800);
        assert_eq!(info["height"], 600);
        assert_eq!(info["type"], "image");
    }
}
