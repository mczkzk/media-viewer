fn main() {
    // Swift helpers are compiled manually or by `npm run install-app`.
    // Not compiled here to avoid triggering Tauri dev file watcher loops.
    // To compile manually: xcrun swiftc -O -o helpers/vision-tagger helpers/vision-tagger.swift
    tauri_build::build()
}
