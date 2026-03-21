use std::process::Command;

fn main() {
    let helpers_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("helpers");
    let swift_src = helpers_dir.join("vision-tagger.swift");
    let swift_bin = helpers_dir.join("vision-tagger");

    println!("cargo:rerun-if-changed=helpers/vision-tagger.swift");

    // Only compile if binary is missing or source is newer
    let needs_compile = if swift_bin.exists() {
        let src_modified = std::fs::metadata(&swift_src).and_then(|m| m.modified()).ok();
        let bin_modified = std::fs::metadata(&swift_bin).and_then(|m| m.modified()).ok();
        match (src_modified, bin_modified) {
            (Some(s), Some(b)) => s > b,
            _ => true,
        }
    } else {
        true
    };

    if needs_compile && swift_src.exists() {
        let status = Command::new("xcrun")
            .args(["swiftc", "-O"])
            .arg("-o")
            .arg(&swift_bin)
            .arg(&swift_src)
            .status()
            .expect("Failed to run swiftc");

        if !status.success() {
            eprintln!("Warning: Failed to compile vision-tagger.swift");
        }
    }

    tauri_build::build()
}
