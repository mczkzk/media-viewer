const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { execSync } = require('child_process');

const THUMBNAIL_SIZE = 300;
const THUMBNAIL_QUALITY = 80;

/**
 * Generate a hash from file path for cache filename
 */
function hashPath(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

/**
 * Check if file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert HEIC to JPEG using macOS sips command
 */
async function convertHeicToJpeg(heicPath) {
  const tempJpegPath = heicPath + '.temp.jpg';

  try {
    // Use sips to convert HEIC to JPEG
    execSync(`sips -s format jpeg "${heicPath}" --out "${tempJpegPath}"`, {
      stdio: 'ignore'
    });

    return tempJpegPath;
  } catch (error) {
    throw new Error(`Failed to convert HEIC: ${error.message}`);
  }
}

/**
 * Check if file is HEIC format
 */
function isHeicFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.heic' || ext === '.heif';
}

/**
 * Check if file is video format
 */
function isVideoFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.mp4', '.mov', '.avi', '.m4v', '.mkv'].includes(ext);
}

/**
 * Generate placeholder for video files
 */
async function generateVideoPlaceholder(cachePath) {
  const placeholderSvg = `
    <svg width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#2c3e50"/>
      <circle cx="150" cy="150" r="60" fill="rgba(255,255,255,0.2)"/>
      <polygon points="130,120 130,180 180,150" fill="white"/>
    </svg>
  `;

  await sharp(Buffer.from(placeholderSvg))
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toFile(cachePath);
}

/**
 * Get or generate thumbnail for an image
 * @param {string} originalPath - Full path to original image
 * @param {string} cacheDir - Directory to store thumbnails
 * @returns {string} Path to thumbnail file
 */
async function getThumbnail(originalPath, cacheDir) {
  const hash = hashPath(originalPath);
  const cachePath = path.join(cacheDir, `${hash}.jpg`);

  // Check if thumbnail already exists
  if (await fileExists(cachePath)) {
    return cachePath;
  }

  // Check if original file exists
  if (!(await fileExists(originalPath))) {
    throw new Error(`Original file not found: ${originalPath}`);
  }

  // Generate video placeholder if it's a video file
  if (isVideoFile(originalPath)) {
    console.log(`Generating video placeholder for: ${originalPath}`);
    await generateVideoPlaceholder(cachePath);
    return cachePath;
  }

  // Generate thumbnail
  let tempJpegPath = null;

  try {
    console.log(`Generating thumbnail for: ${originalPath}`);

    // Convert HEIC to JPEG first if needed
    let sourceImagePath = originalPath;
    if (isHeicFile(originalPath)) {
      console.log(`Converting HEIC to JPEG: ${originalPath}`);
      tempJpegPath = await convertHeicToJpeg(originalPath);
      sourceImagePath = tempJpegPath;
    }

    await sharp(sourceImagePath)
      .rotate() // Auto-rotate based on EXIF
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toFile(cachePath);

    // Clean up temporary JPEG
    if (tempJpegPath && await fileExists(tempJpegPath)) {
      await fs.unlink(tempJpegPath);
    }

    return cachePath;
  } catch (error) {
    // Clean up temporary JPEG on error
    if (tempJpegPath) {
      try {
        await fs.unlink(tempJpegPath);
      } catch {}
    }

    console.error(`Error generating thumbnail for ${originalPath}:`, error.message);
    throw error;
  }
}

/**
 * Clear thumbnail cache
 */
async function clearCache(cacheDir) {
  try {
    const files = await fs.readdir(cacheDir);
    for (const file of files) {
      if (file.endsWith('.jpg')) {
        await fs.unlink(path.join(cacheDir, file));
      }
    }
    console.log('Thumbnail cache cleared');
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

module.exports = {
  getThumbnail,
  clearCache
};
