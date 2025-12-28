const fs = require('fs').promises;
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'cache', 'index.json');
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Media file extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.m4v', '.mkv'];
const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];

/**
 * Check if a file is a media file
 */
function isMediaFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MEDIA_EXTENSIONS.includes(ext);
}

/**
 * Get media type (image or video)
 */
function getMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return 'unknown';
}

/**
 * Scan a directory recursively for media files
 */
async function scanDirectory(basePath) {
  console.log(`Starting scan of: ${basePath}`);
  const index = [];

  try {
    const years = await fs.readdir(basePath);

    for (const year of years) {
      // Skip non-directory items and hidden files
      if (year.startsWith('.') || year === 'media-viewer') {
        continue;
      }

      const yearPath = path.join(basePath, year);

      try {
        const yearStats = await fs.stat(yearPath);
        if (!yearStats.isDirectory()) {
          continue;
        }

        const events = await fs.readdir(yearPath);

        for (const event of events) {
          // Skip hidden files
          if (event.startsWith('.')) {
            continue;
          }

          const eventPath = path.join(yearPath, event);

          try {
            const eventStats = await fs.stat(eventPath);
            if (!eventStats.isDirectory()) {
              // Handle files directly in year directory
              if (isMediaFile(event)) {
                index.push({
                  path: `${year}/${event}`,
                  year,
                  event: year, // Use year as event name
                  filename: event,
                  type: getMediaType(event),
                  mtime: eventStats.birthtime.getTime() // Use creation time
                });
              }
              continue;
            }

            const files = await fs.readdir(eventPath);

            for (const file of files) {
              // Skip hidden files
              if (file.startsWith('.')) {
                continue;
              }

              const filePath = path.join(eventPath, file);

              try {
                const fileStats = await fs.stat(filePath);

                if (fileStats.isFile() && isMediaFile(file)) {
                  index.push({
                    path: `${year}/${event}/${file}`,
                    year,
                    event,
                    filename: file,
                    type: getMediaType(file),
                    mtime: fileStats.birthtime.getTime() // Use creation time
                  });
                }
              } catch (err) {
                console.warn(`Error reading file ${filePath}:`, err.message);
              }
            }
          } catch (err) {
            console.warn(`Error reading event ${eventPath}:`, err.message);
          }
        }
      } catch (err) {
        console.warn(`Error reading year ${yearPath}:`, err.message);
      }
    }

    console.log(`Scan completed: found ${index.length} media files`);
    return index;
  } catch (error) {
    console.error('Error scanning directory:', error);
    throw error;
  }
}

/**
 * Check if cache exists and is valid
 */
async function isCacheValid() {
  try {
    const stats = await fs.stat(CACHE_FILE);
    const age = Date.now() - stats.mtime.getTime();
    return age < CACHE_DURATION;
  } catch (error) {
    return false;
  }
}

/**
 * Load index from cache
 */
async function loadCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Save index to cache
 */
async function saveCache(index) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(index, null, 2));
    console.log(`Cache saved to ${CACHE_FILE}`);
  } catch (error) {
    console.error('Error saving cache:', error);
  }
}

/**
 * Get or create media index (with caching)
 */
async function getOrCreateIndex(basePath) {
  // Check if cache is valid
  if (await isCacheValid()) {
    console.log('Using cached index');
    const cached = await loadCache();
    if (cached) {
      return cached;
    }
  }

  // Perform fresh scan
  console.log('Cache expired or not found, performing fresh scan');
  const index = await scanDirectory(basePath);
  await saveCache(index);
  return index;
}

/**
 * Force a fresh scan (ignoring cache)
 */
async function forceScan(basePath) {
  console.log('Forcing fresh scan');
  const index = await scanDirectory(basePath);
  await saveCache(index);
  return index;
}

module.exports = {
  getOrCreateIndex,
  forceScan,
  isMediaFile,
  getMediaType
};
