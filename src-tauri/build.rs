use std::process::Command;

fn main() {
    // Compile Swift vision-tagger helper
    let helpers_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("helpers");
    let swift_src = helpers_dir.join("vision-tagger.swift");
    let swift_bin = helpers_dir.join("vision-tagger");

    if swift_src.exists() {
        println!("cargo:rerun-if-changed=helpers/vision-tagger.swift");

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
