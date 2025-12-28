require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
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

// Serve original media files
app.use('/media', express.static(MEDIA_BASE_PATH));

// Start server
app.listen(PORT, () => {
  console.log(`Media viewer server running at http://localhost:${PORT}`);
  console.log(`Scanning media from: ${MEDIA_BASE_PATH}`);
});
