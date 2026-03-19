use base64::Engine;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView};
use md5::{Digest, Md5};
use std::fs;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::process::Command;

const THUMBNAIL_SIZE: u32 = 300;

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "avi", "m4v", "mkv"];
const HEIC_EXTENSIONS: &[&str] = &["heic", "heif"];

fn hash_path(file_path: &str) -> String {
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

/// Convert HEIC to JPEG using macOS sips command
fn convert_heic_to_jpeg(heic_path: &Path) -> Result<PathBuf, String> {
    let temp_path = heic_path.with_extension("temp.jpg");
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

/// Generate video thumbnail using ffmpeg
fn generate_video_thumbnail(video_path: &Path, cache_path: &Path) -> Result<(), String> {
    // Try to find ffmpeg
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

/// Find ffmpeg binary (bundled via npm or system)
fn which_ffmpeg() -> Option<String> {
    // Check for ffmpeg-static npm package
    let npm_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or(Path::new("."))
        .join("node_modules")
        .join("ffmpeg-static")
        .join("ffmpeg");
    if npm_path.exists() {
        return npm_path.to_str().map(String::from);
    }

    // Fall back to system ffmpeg
    Command::new("which")
        .arg("ffmpeg")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
}

/// Generate a video placeholder SVG as JPEG
fn generate_video_placeholder(cache_path: &Path) -> Result<(), String> {
    let mut img = image::RgbaImage::new(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    // Dark background
    for pixel in img.pixels_mut() {
        *pixel = image::Rgba([44, 62, 80, 255]);
    }
    // Save as JPEG
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
        _ => img, // 1 or unknown
    }
}

/// Resize an image to thumbnail size (cover crop from center)
fn resize_to_thumbnail(source_path: &Path, cache_path: &Path) -> Result<(), String> {
    let orientation = get_exif_orientation(source_path);
    let img = image::open(source_path).map_err(|e| format!("Failed to open image: {}", e))?;
    let img = apply_orientation(img, orientation);

    let (w, h) = img.dimensions();

    // Calculate crop dimensions (cover mode: fill the square, crop excess)
    let scale = if w < h {
        THUMBNAIL_SIZE as f64 / w as f64
    } else {
        THUMBNAIL_SIZE as f64 / h as f64
    };

    let new_w = (w as f64 * scale).ceil() as u32;
    let new_h = (h as f64 * scale).ceil() as u32;

    let resized = img.resize(new_w, new_h, FilterType::Lanczos3);

    // Crop to center
    let crop_x = (new_w.saturating_sub(THUMBNAIL_SIZE)) / 2;
    let crop_y = (new_h.saturating_sub(THUMBNAIL_SIZE)) / 2;
    let cropped = resized.crop_imm(crop_x, crop_y, THUMBNAIL_SIZE, THUMBNAIL_SIZE);

    // Save as JPEG
    let mut buf = std::io::BufWriter::new(
        fs::File::create(cache_path).map_err(|e| format!("Failed to create cache file: {}", e))?,
    );
    cropped
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to write JPEG: {}", e))
}

/// Get or generate thumbnail, returns base64 data URL
pub fn get_thumbnail_base64(
    original_path: &str,
    base_path: &str,
    cache_dir: &Path,
) -> Result<String, String> {
    let full_path = PathBuf::from(base_path).join(original_path);
    let hash = hash_path(original_path);
    let cache_path = cache_dir.join(format!("{}.jpg", hash));

    // Ensure cache directory exists
    fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;

    // Return cached thumbnail if exists
    if !cache_path.exists() {
        generate_thumbnail(&full_path, &cache_path)?;
    }

    // Read and encode as base64
    let bytes = fs::read(&cache_path).map_err(|e| format!("Failed to read thumbnail: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

/// Generate thumbnail for a single file
fn generate_thumbnail(full_path: &Path, cache_path: &Path) -> Result<(), String> {
    if !full_path.exists() {
        return Err(format!("File not found: {}", full_path.display()));
    }

    if is_video(full_path) {
        // Try ffmpeg, fall back to placeholder
        if generate_video_thumbnail(full_path, cache_path).is_err() {
            generate_video_placeholder(cache_path)?;
        }
        return Ok(());
    }

    if is_heic(full_path) {
        // Convert HEIC to temp JPEG, then resize
        let temp_jpeg = convert_heic_to_jpeg(full_path)?;
        let result = resize_to_thumbnail(&temp_jpeg, cache_path);
        let _ = fs::remove_file(&temp_jpeg);
        return result;
    }

    // Regular image
    resize_to_thumbnail(full_path, cache_path)
}

/// Read a full-size media file as base64 data URL
pub fn read_media_base64(file_path: &str, base_path: &str) -> Result<String, String> {
    let full_path = PathBuf::from(base_path).join(file_path);

    if !full_path.exists() {
        return Err(format!("File not found: {}", full_path.display()));
    }

    // For HEIC, convert first
    if is_heic(&full_path) {
        let temp_jpeg = convert_heic_to_jpeg(&full_path)?;
        let bytes =
            fs::read(&temp_jpeg).map_err(|e| format!("Failed to read converted file: {}", e))?;
        let _ = fs::remove_file(&temp_jpeg);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        return Ok(format!("data:image/jpeg;base64,{}", b64));
    }

    let bytes =
        fs::read(&full_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let mime = match full_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
    {
        Some(ref ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg",
        Some(ref ext) if ext == "png" => "image/png",
        Some(ref ext) if ext == "gif" => "image/gif",
        Some(ref ext) if ext == "mp4" => "video/mp4",
        Some(ref ext) if ext == "mov" => "video/quicktime",
        Some(ref ext) if ext == "avi" => "video/x-msvideo",
        Some(ref ext) if ext == "m4v" => "video/x-m4v",
        Some(ref ext) if ext == "mkv" => "video/x-matroska",
        _ => "application/octet-stream",
    };

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
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
        assert_eq!(h1.len(), 32); // MD5 hex length
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
    fn test_thumbnail_generation_jpg() {
        let tmp = TempDir::new().unwrap();
        let cache_dir = TempDir::new().unwrap();

        // Create a minimal valid JPEG (1x1 red pixel)
        let img = image::RgbImage::from_pixel(100, 100, image::Rgb([255, 0, 0]));
        let img_path = tmp.path().join("test.jpg");
        img.save(&img_path).unwrap();

        let result = get_thumbnail_base64(
            "test.jpg",
            tmp.path().to_str().unwrap(),
            cache_dir.path(),
        );

        assert!(result.is_ok());
        let data_url = result.unwrap();
        assert!(data_url.starts_with("data:image/jpeg;base64,"));

        // Cache file should exist
        let hash = hash_path("test.jpg");
        assert!(cache_dir.path().join(format!("{}.jpg", hash)).exists());
    }

    #[test]
    fn test_thumbnail_cache_hit() {
        let tmp = TempDir::new().unwrap();
        let cache_dir = TempDir::new().unwrap();

        let img = image::RgbImage::from_pixel(100, 100, image::Rgb([0, 255, 0]));
        let img_path = tmp.path().join("cached.jpg");
        img.save(&img_path).unwrap();

        // First call generates
        let r1 = get_thumbnail_base64("cached.jpg", tmp.path().to_str().unwrap(), cache_dir.path());
        assert!(r1.is_ok());

        // Delete original (cache should still work)
        fs::remove_file(&img_path).unwrap();

        let r2 = get_thumbnail_base64("cached.jpg", tmp.path().to_str().unwrap(), cache_dir.path());
        assert!(r2.is_ok());
        assert_eq!(r1.unwrap(), r2.unwrap());
    }

    #[test]
    fn test_thumbnail_file_not_found() {
        let cache_dir = TempDir::new().unwrap();
        let result = get_thumbnail_base64("nonexistent.jpg", "/tmp/fake", cache_dir.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_resize_preserves_aspect_cover() {
        let tmp = TempDir::new().unwrap();

        // Create a wide image (400x200)
        let img = image::RgbImage::from_pixel(400, 200, image::Rgb([0, 0, 255]));
        let img_path = tmp.path().join("wide.jpg");
        img.save(&img_path).unwrap();

        let cache_path = tmp.path().join("thumb.jpg");
        resize_to_thumbnail(&img_path, &cache_path).unwrap();

        let thumb = image::open(&cache_path).unwrap();
        assert_eq!(thumb.dimensions(), (THUMBNAIL_SIZE, THUMBNAIL_SIZE));
    }
}
