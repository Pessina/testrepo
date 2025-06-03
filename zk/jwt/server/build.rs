use std::process::Command;

fn main() {
    // Build the SP1 program
    let output = Command::new("cargo")
        .args(&["prove", "build"])
        .current_dir("../program")
        .output()
        .expect("Failed to execute cargo prove build");

    if !output.status.success() {
        println!(
            "cargo:warning=Failed to build SP1 program: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        // Don't panic, just warn - the user can build manually
    } else {
        // If successful, the environment variable should be set by the build process
        println!("cargo:warning=SP1 program built successfully");
    }

    println!("cargo:rerun-if-changed=../program/src");
    println!("cargo:rerun-if-changed=../program/Cargo.toml");

    // Set the environment variable manually if it's not set
    // This is a fallback in case the cargo prove build doesn't set it
    let elf_path = "../target/elf-compilation/riscv32im-succinct-zkvm-elf/release/jwt-program";
    if std::path::Path::new(elf_path).exists() {
        println!(
            "cargo:rustc-env=SP1_ELF_jwt-program={}",
            std::fs::canonicalize(elf_path).unwrap().display()
        );
    }
}
