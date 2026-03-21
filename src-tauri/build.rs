use std::process::Command;

fn compile_swift_if_needed(helpers_dir: &std::path::Path, name: &str) {
    let src = helpers_dir.join(format!("{}.swift", name));
    let bin = helpers_dir.join(name);

    println!("cargo:rerun-if-changed=helpers/{}.swift", name);

    let needs_compile = if bin.exists() {
        let src_mod = std::fs::metadata(&src).and_then(|m| m.modified()).ok();
        let bin_mod = std::fs::metadata(&bin).and_then(|m| m.modified()).ok();
        matches!((src_mod, bin_mod), (Some(s), Some(b)) if s > b)
    } else {
        true
    };

    if needs_compile && src.exists() {
        let status = Command::new("xcrun")
            .args(["swiftc", "-O"])
            .arg("-o")
            .arg(&bin)
            .arg(&src)
            .status()
            .expect("Failed to run swiftc");

        if !status.success() {
            eprintln!("Warning: Failed to compile {}.swift", name);
        }
    }
}

fn main() {
    let helpers_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("helpers");
    compile_swift_if_needed(&helpers_dir, "vision-tagger");
    compile_swift_if_needed(&helpers_dir, "reverse-geocoder");
    tauri_build::build()
}
