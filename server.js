require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const exifr = require('exifr');
const scanner = require('./lib/scanner');
const thumbnail = require('./lib/thumbnail');

const app = express();
const PORT = process.env.PORT || 3000;

// Base path for media files (from .env or default to parent directory)
const MEDIA_BASE_PATH = process.env.MEDIA_BASE_PATH || path.join(__dirname, '..');

// Serve static files from public directory
app.use(express.static('public'));

// Security: Validate and sanitize file paths
function validatePath(requestedPath) {
  const safePath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(MEDIA_BASE_PATH, safePath);

  if (!fullPath.startsWith(MEDIA_BASE_PATH)) {
    throw new Error('Invalid path');
  }

  return fullPath;
}

// API: Get media index
app.get('/api/media', async (req, res) => {
  try {
    const index = await scanner.getOrCreateIndex(MEDIA_BASE_PATH);
    res.json(index);
  } catch (error) {
    console.error('Error getting media index:', error);
    res.status(500).json({ error: 'Failed to scan media files' });
  }
});

// API: Get thumbnail for a specific image
app.get('/api/thumbnail', async (req, res) => {
  try {
    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).send('Path parameter is required');
    }

    const fullPath = validatePath(requestedPath);
    const thumbPath = await thumbnail.getThumbnail(fullPath, path.join(__dirname, 'cache', 'thumbnails'));

    res.sendFile(thumbPath);
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    res.status(500).send('Failed to generate thumbnail');
  }
});

// API: Force rescan
app.get('/api/scan', async (req, res) => {
  try {
    const index = await scanner.forceScan(MEDIA_BASE_PATH);
    res.json({ message: 'Scan completed', count: index.length });
  } catch (error) {
    console.error('Error scanning media files:', error);
    res.status(500).json({ error: 'Failed to scan media files' });
  }
});

// API: Get full-size image (with HEIC conversion)
app.get('/api/image', async (req, res) => {
  try {
    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).send('Path parameter is required');
    }

    const fullPath = validatePath(requestedPath);
    const ext = path.extname(fullPath).toLowerCase();

    // Check if file is HEIC
    if (ext === '.heic' || ext === '.heif') {
      // Convert HEIC to JPEG and cache it
      const cacheDir = path.join(__dirname, 'cache', 'converted');
      await fs.mkdir(cacheDir, { recursive: true });

      const crypto = require('crypto');
      const hash = crypto.createHash('md5').update(fullPath).digest('hex');
      const cachedJpegPath = path.join(cacheDir, `${hash}.jpg`);

      // Check if converted file exists
      try {
        await fs.access(cachedJpegPath);
        return res.sendFile(cachedJpegPath);
      } catch {}

      // Convert HEIC to JPEG using sips
      console.log(`Converting HEIC to JPEG for display: ${fullPath}`);
      execSync(`sips -s format jpeg "${fullPath}" --out "${cachedJpegPath}"`, {
        stdio: 'ignore'
      });

      res.sendFile(cachedJpegPath);
    } else {
      // Send original file for non-HEIC images
      res.sendFile(fullPath);
    }
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).send('Failed to serve image');
  }
});

// API: Get media file information
app.get('/api/media-info', async (req, res) => {
  try {
    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const fullPath = validatePath(requestedPath);
    const stats = await fs.stat(fullPath);
    const ext = path.extname(fullPath).toLowerCase();

    const info = {
      filename: path.basename(fullPath),
      path: requestedPath,
      size: stats.size,
      modified: stats.mtime,
      type: ['.mp4', '.mov', '.avi', '.m4v', '.mkv'].includes(ext) ? 'video' : 'image'
    };

    // Get image/video dimensions and EXIF data
    if (info.type === 'image') {
      try {
        // For HEIC files, convert to JPEG first to read EXIF
        let exifSourcePath = fullPath;
        let tempJpegPath = null;

        if (ext === '.heic' || ext === '.heif') {
          const cacheDir = path.join(__dirname, 'cache', 'converted');
          await fs.mkdir(cacheDir, { recursive: true });

          const crypto = require('crypto');
          const hash = crypto.createHash('md5').update(fullPath).digest('hex');
          tempJpegPath = path.join(cacheDir, `${hash}.jpg`);

          // Convert if not cached
          try {
            await fs.access(tempJpegPath);
          } catch {
            execSync(`sips -s format jpeg "${fullPath}" --out "${tempJpegPath}"`, {
              stdio: 'ignore'
            });
          }

          exifSourcePath = tempJpegPath;
        }

        // Get EXIF data
        const exifData = await exifr.parse(exifSourcePath, {
          pick: ['Make', 'Model', 'DateTimeOriginal', 'ExposureTime', 'FNumber',
                 'ISO', 'FocalLength', 'LensModel',
                 'ImageWidth', 'ImageHeight', 'PixelXDimension', 'PixelYDimension']
        });

        // Get GPS data separately
        const gpsData = await exifr.gps(exifSourcePath);

        if (exifData) {
          info.exif = {
            make: exifData.Make,
            model: exifData.Model,
            dateTime: exifData.DateTimeOriginal,
            exposureTime: exifData.ExposureTime,
            fNumber: exifData.FNumber,
            iso: exifData.ISO,
            focalLength: exifData.FocalLength,
            lens: exifData.LensModel,
            gps: (gpsData && gpsData.latitude && gpsData.longitude) ? {
              latitude: gpsData.latitude,
              longitude: gpsData.longitude
            } : null
          };

          // Get dimensions from EXIF or image data
          info.width = exifData.PixelXDimension || exifData.ImageWidth;
          info.height = exifData.PixelYDimension || exifData.ImageHeight;
        }

        // If no EXIF dimensions, use sharp
        if (!info.width || !info.height) {
          const sharp = require('sharp');
          const metadata = await sharp(exifSourcePath).metadata();
          info.width = metadata.width;
          info.height = metadata.height;
        }

        // Calculate megapixels
        if (info.width && info.height) {
          info.megapixels = ((info.width * info.height) / 1000000).toFixed(1);
        }
      } catch (exifError) {
        console.error('Error reading EXIF:', exifError.message);
      }
    } else if (info.type === 'video') {
      // Get video metadata using ffprobe (if available)
      try {
        const ffprobePath = require('@ffprobe-installer/ffprobe').path;
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfprobePath(ffprobePath);

        const videoData = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(fullPath, (err, metadata) => {
            if (err) reject(err);
            else resolve(metadata);
          });
        });

        if (videoData && videoData.streams) {
          const videoStream = videoData.streams.find(s => s.codec_type === 'video');
          if (videoStream) {
            info.width = videoStream.width;
            info.height = videoStream.height;
            info.duration = videoData.format.duration;
            info.codec = videoStream.codec_name;
            info.fps = eval(videoStream.r_frame_rate);
          }
        }
      } catch (videoError) {
        console.error('Error reading video metadata:', videoError.message);
      }
    }

    res.json(info);
  } catch (error) {
    console.error('Error getting media info:', error);
    res.status(500).json({ error: 'Failed to get media info' });
  }
});

// Serve original media files
app.use('/media', express.static(MEDIA_BASE_PATH));

// Start server
app.listen(PORT, () => {
  console.log(`Media viewer server running at http://localhost:${PORT}`);
  console.log(`Scanning media from: ${MEDIA_BASE_PATH}`);
});
