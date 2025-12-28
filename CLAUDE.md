# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Start server:**
```bash
node server.js
```
Server runs on `http://localhost:9000` (configurable via `.env`)

**Stop server:**
```bash
Ctrl + C
# or
lsof -ti :9000 | xargs kill -9
```

**Clear cache (troubleshooting):**
```bash
rm -rf cache/thumbnails/*
rm -f cache/index.json
```

**Setup:**
```bash
npm install
cp .env.example .env
# Edit .env to set MEDIA_BASE_PATH
```

## Architecture Overview

### Data Flow Architecture

**Scan → Cache → API → Frontend**

1. **Backend (server.js)**:
   - Express server serving static files + API endpoints
   - Validates paths to prevent directory traversal attacks
   - Serves thumbnails, full images, and media index

2. **Scanner (lib/scanner.js)**:
   - Scans `MEDIA_BASE_PATH` recursively for images/videos
   - Returns flat array: `{path, year, event, filename, type, mtime}`
   - Caches results in `cache/index.json` (24h TTL)
   - **Expected directory structure**: `YEAR/EVENT/...files`
     - Example: `2020/2020-06/photo.jpg`
     - Supports nested subdirectories within events

3. **Thumbnail Generator (lib/thumbnail.js)**:
   - On-demand thumbnail generation using `sharp`
   - 300x300px cached in `cache/thumbnails/`

4. **HEIC Conversion**:
   - Uses macOS `sips` command (macOS only)
   - Converts to JPEG on-demand, cached in `cache/converted/`

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
   - Click title to return to flat mode

**Key Components:**

- **Gallery (public/js/gallery.js)**:
  - Two render modes: `renderFlat()` and `renderHierarchical()`
  - `displayMode`: 'flat' | 'hierarchical'
  - `currentPath`: Array tracking folder depth in hierarchical mode
  - Year index: Auto-thins based on screen height, syncs with scroll
  - Folder extraction: Builds virtual folder tree from flat `path` field

- **Lightbox (public/js/lightbox.js)**:
  - Full-screen image/video viewer
  - Arrow key navigation
  - Uses `filteredItems` for navigation order

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

**Security:**
- `validatePath()` prevents directory traversal
- All file access validated against `MEDIA_BASE_PATH`

## Environment Variables

Required in `.env`:
- `MEDIA_BASE_PATH`: Absolute path to media directory
- `PORT`: Server port (default: 9000)

## macOS Dependency

HEIC/HEIF support requires macOS `sips` command. Will fail on other platforms.
