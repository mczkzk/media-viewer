# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Iron Rule

**NEVER modify, edit, move, rename, or delete original media files.** The user's media folder is strictly read-only. All app data (tags, thumbnails, caches) goes to AppData only.

## Development Commands

**Start dev (Tauri + hot reload):**
```bash
npm run tauri:dev
```

**Build DMG installer:**
```bash
npm run tauri:build
```

**Build + install to /Applications + ad-hoc sign:**
```bash
npm run install-app
```

**Run Rust tests:**
```bash
cd src-tauri && cargo test
```

**Clear cache (troubleshooting):**
App menu: File > キャッシュをクリア, or manually:
```bash
rm ~/Library/Application\ Support/com.mediaviewer.app/cache/thumbnails/*.jpg
rm ~/Library/Application\ Support/com.mediaviewer.app/cache/converted/*.jpg
rm ~/Library/Application\ Support/com.mediaviewer.app/cache/index.json
```

**Setup:**
```bash
npm install
npm run build:helpers   # Compile Swift helpers (first time or after .swift changes)
```

## Architecture Overview

### Data Flow Architecture

**Tauri WebView (Frontend) → IPC/HTTP → Rust Backend → Local Files**

1. **Rust Backend (src-tauri/src/lib.rs)**:
   - Tauri v2 IPC commands (see table below)
   - macOS menu bar: File (folder change, cache clear), Edit, View
   - Menu events emitted to frontend via `app.emit()`
   - Local HTTP server (`tiny_http`, src/video_server.rs) for all file serving on random port
   - `media://` protocol retained as fallback for HEIC conversion
   - Range requests support for video streaming
   - HEIC auto-conversion via macOS `sips`, cached in AppData
   - `plugin-store` for persisting mediaBasePath, `plugin-dialog` for folder selection
   - `set_stored_path` invalidates scan cache when folder changes

2. **Scanner (src-tauri/src/scanner.rs)**:
   - `walkdir` crate scans `YEAR/EVENT/...files` structure recursively
   - Returns `Vec<MediaItem>`: `{path, year, event, filename, type, mtime}`
   - Caches results in `AppData/cache/index.json` (24h TTL)
   - Skips hidden files and non-media extensions

3. **Thumbnail Generator (src-tauri/src/thumbnail.rs)**:
   - `image` crate for 300x300px cover-crop thumbnails with EXIF orientation
   - HEIC: `sips` conversion to temp JPEG, then resize
   - Video: `ffmpeg` (from node_modules/ffmpeg-static or system) extracts frame at 1s
   - Falls back to placeholder on failure (prevents retry loops)
   - MD5 hash of relative path as cache filename

4. **Media Info (src-tauri/src/thumbnail.rs::get_media_info)**:
   - `kamadak-exif` for EXIF data (camera, lens, GPS, settings)
   - `ffprobe` for video metadata (duration, codec, fps)
   - `get_gps()`: GPS extraction with HEIC fallback via `mdls`

5. **Image Tagger (src-tauri/src/tagger.rs)**:
   - `vision-tagger` Swift helper: image classification (`VNClassifyImageRequest`) + OCR (`VNRecognizeTextRequest`)
   - `reverse-geocoder` Swift helper: persistent process, `MKReverseGeocodingRequest` (en_US locale)
     - stdin/stdout communication, CLGeocoder cache enabled
     - 2s interval between requests, 60s backoff on rate limit
     - 50m proximity dedup (reuses result for nearby coordinates)
   - Stores tags in `AppData/cache/tags.json` (not cleared by cache clear, regenerate via menu)
   - Tags: Vision labels (EN+JA) + OCR text + GPS place names (EN + JA via geo_dict)
   - `label_dict.rs`: ~750 entry Vision label EN-to-JA translation
   - `geo_dict.rs`: 47 prefectures + 100+ cities/landmarks EN-to-JA translation
   - Videos: thumbnails pre-generated before tagging, then classified
   - Swift helpers compiled by `npm run build:helpers`, bundled in `Resources/helpers/`

### Tauri IPC Commands

| Command | Args | Returns | Purpose |
|---------|------|---------|---------|
| `get_stored_path` | - | `Option<String>` | Get saved media folder path |
| `set_stored_path` | `path` | - | Save media folder path |
| `scan_media` | `base_path` | `Vec<MediaItem>` | Scan media (with cache) |
| `force_scan` | `base_path` | `Vec<MediaItem>` | Force rescan (ignore cache) |
| `get_thumbnail` | `path`, `base_path` | `String` | Generate/get single thumbnail |
| `get_thumbnail_cache_dir` | - | `String` | Cache directory path |
| `batch_ensure_thumbnails` | `paths[]`, `base_path` | `Vec<bool>` | Batch thumbnail generation |
| `get_media_info` | `path`, `base_path` | `JSON` | EXIF/video metadata |
| `get_video_server_port` | - | `u16` | Local HTTP server port |
| `clear_cache` | - | `String` | Delete all caches (thumbnails + converted + scan) |
| `get_tags` | - | `HashMap<String, Vec<String>>` | Get all image tags |
| `tag_images` | `paths[]`, `base_path` | `usize` | Batch tag images (Vision + OCR + GPS) |
| `clear_tags` | - | - | Delete tags.json for regeneration |

### Frontend Architecture (Vanilla JS)

**Two display modes:**

1. **Flat Mode** (default):
   - All files shown in chronological grid with year dividers
   - Year index navigation on right side (hover to reveal)
   - Supports search, sort, and filtering

2. **Hierarchical Mode** (triggered by year filter):
   - Shows folder/file structure (Finder-like)
   - Breadcrumb navigation
   - Folders clickable to navigate deeper
   - Clear year filter to return to flat mode

**Key Components:**

- **TauriApp (public/js/tauri-app.js)**:
  - Detects Tauri environment via `window.__TAURI__`
  - JS-side MD5 hash for thumbnail URLs (no IPC needed for cached thumbnails)
  - Batch thumbnail generation for cache misses
  - All content served via `http://127.0.0.1:PORT/...` (local HTTP server)
  - `changeFolder()`: folder selection + Tauri state init (no page reload needed)
  - Listens for menu events (`menu-change-folder`, `menu-clear-cache`)

- **Gallery (public/js/gallery.js)**:
  - Two render modes: `renderFlat()` and `renderHierarchical()`
  - `displayMode`: 'flat' | 'hierarchical'
  - `currentPath`: Array tracking folder depth in hierarchical mode
  - Year index: Auto-thins based on screen height, syncs with scroll
  - Folder extraction: Builds virtual folder tree from flat `path` field
  - `tagMap`: image tags loaded from backend, searched via `_matchesQuery()`
  - Search matches: path, event, filename, **tags** (EN+JA), all with kana conversion

- **VirtualScroll (public/js/virtual-scroll.js)**:
  - Renders only visible rows to minimize DOM elements
  - Manages row recycling and scroll-based rendering

- **Lightbox (public/js/lightbox.js)**:
  - Full-screen image/video viewer
  - Arrow key navigation, Escape to close
  - Info panel toggled via (i) button (no dedicated close button)
  - Uses `filteredItems` for navigation order

- **Kana Converter (public/js/kana-converter.js)**:
  - Multi-format search: converts queries to romaji/hiragana/katakana
  - Pre-converts all searchable fields on load for performance
  - Enables searching Japanese text with romaji input (e.g., "tokyo" matches "東京")

### Critical Implementation Details

**Year Filter Behavior:**
- Selecting year → switches to hierarchical mode at event folder level
- Year filter starts at `currentPath = [year]` (not root)
- Clearing year filter → returns to flat mode

**Hierarchical Mode:**
- Frontend-only: reconstructs folder tree from flat `path` strings
- `extractFoldersAtCurrentPath()`: Groups files by next path segment
- `extractFilesAtCurrentPath()`: Shows only direct children
- Mixed folder/file display sorted by name (Finder-like)

**Year Index Navigation:**
- Visible only in flat mode
- Auto-calculates display count based on `window.innerHeight`
- Intervals: if all years fit, show all; else thin out with step calculation
- Scroll tracking highlights active year
- Respects sort order (desc/asc)
- Click year → updates URL hash (`#2025`) and scrolls to year divider

**URL State Persistence:**
- Query params: `?year=2025&q=tokyo` (hierarchical mode + search)
- Hash: `#2025` (scroll position in flat mode)
- State restored on page reload
- `updateURL()` called on filter/search/mode changes

**Thumbnail Loading (Tauri mode):**
- Frontend calculates MD5 hash of relative path → constructs `http://127.0.0.1:PORT/...` URL to cache file
- Browser loads cached thumbnail via local HTTP server (no IPC)
- On 404 (cache miss): stays in loading state, batches paths, calls `batch_ensure_thumbnails` IPC
- After generation, retries with cache-busted URL

## Platform Dependencies

- **macOS** required (uses `sips` for HEIC conversion)
- **ffmpeg/ffprobe**: Bundled via npm (`ffmpeg-static`, `@ffprobe-installer/ffprobe`) for dev; also found via well-known paths (`/opt/homebrew/bin`, `/usr/local/bin`) in built app
- **Rust** 1.77.2+
- **Node.js** 18+ (for Tauri CLI and npm dependencies)

## Documentation Rules

- **After implementing a feature or making significant changes**, update `docs/SPEC.md` to reflect the current state. SPEC.md is the single source of truth for the application's full specification.
- Keep SPEC.md in sync with the actual implementation. If you add a new IPC command, component, or feature, add it to SPEC.md.
- Do NOT update SPEC.md for trivial bug fixes or refactors that don't change behavior.
