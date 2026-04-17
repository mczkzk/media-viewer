<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Media Viewer" width="128">
</p>

<h1 align="center">Media Viewer</h1>

A local media viewer for macOS. Browse photos and videos organized by year/event in a thumbnail grid, with AI image recognition and GPS place name search.

## Features

- **AI Search** - Search by content ("food", "beach", "dog"), in-image text (OCR), and GPS place names (Kyoto, Tokyo)
- **Fast Browsing** - Virtual scrolling for smooth viewing of large photo libraries
- **HEIC Support** - View iPhone photos natively
- **Video Playback** - Streaming playback for MP4/MOV/AVI/M4V/MKV
- **Fully Offline** - No API needed, everything runs locally

## Setup

**Requirements**: macOS, Xcode, Rust 1.77+, Node.js 18+

```bash
npm install
npm run build:helpers   # Compile Swift helpers (first time only)
```

## Usage

### Launch

```bash
npm run tauri:dev        # Development mode
npm run install-app      # Build + install to /Applications
```

### First Run

Select your media folder via File > Change Folder (Cmd+O). The path is remembered automatically.

### Folder Structure

```
/your-media-path/
├── 2023/
│   └── 2023-01-trip/
│       ├── photo.jpg
│       └── video.mp4
├── 2024/
│   └── 2024-06-vacation/
│       └── subfolder/      # Nesting OK
│           └── photo.heic
└── ...
```

First level = year, second level = event. Deeper levels are scanned recursively.

### Controls

| Action | Behavior |
|--------|----------|
| Search box | Search by tags, place names, filenames (Japanese, English, and romaji) |
| Year filter | Filter by year (switches to Finder-like folder view) |
| Click | Open in lightbox for full-size view / video playback |
| Arrow keys | Navigate within lightbox |
| Esc | Close lightbox |
| (i) button | Show EXIF data, GPS map, and tags |
| Year index (right edge) | Click a year to jump |

### Menu

| Menu | Action |
|------|--------|
| File > Change Folder (Cmd+O) | Switch media folder |
| File > Clear Cache | Delete thumbnails, conversion cache, and scan results |
| File > Regenerate Tags | Delete all image tags and re-analyze |

### How Search Works

On first launch, all images are analyzed in the background:
- **macOS Vision Framework** classifies image content (food, buildings, animals, etc.)
- **OCR** extracts text from images (signs, menus, etc.)
- **GPS Reverse Geocoding** resolves location names (English + Japanese for prefectures/major cities)

Tags are cached persistently. Subsequent launches only process newly added files.

## Supported Formats

**Images**: JPG, PNG, GIF, HEIC/HEIF
**Video**: MP4, MOV, AVI, M4V, MKV

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Thumbnails not showing | Click rescan button, or File > Clear Cache |
| Search returns no results | File > Regenerate Tags (first run takes 20-30 min) |
| HEIC not displaying | Verify with `which sips` (should exist on macOS by default) |

## For Developers

Detailed specification: [docs/SPEC.md](docs/SPEC.md)

```bash
npm run tauri:dev          # Dev with hot reload
npm run install-app        # Build + install + ad-hoc sign
cd src-tauri && cargo test  # Run Rust tests
```

## License

ISC
