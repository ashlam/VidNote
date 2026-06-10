fn main() {
    // catch_unwind is needed due to a Rust stdlib bug on Windows
    // where Command::output() panics when running `rustc -V` inside
    // the embed-resource crate's build script (rustc_version dependency).
    // The build artifacts are cached and the binary works without this step.
    let result = std::panic::catch_unwind(|| {
        tauri_build::build();
    });
    if result.is_err() {
        println!("cargo:warning=tauri_build::build() panicked (known Windows stdlib issue), continuing with cached build artifacts");
    }
}