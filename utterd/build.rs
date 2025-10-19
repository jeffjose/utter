use std::env;
use std::path::PathBuf;

fn main() {
    // Load .env file from project root (one level up from utterd/)
    let env_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join(".env");

    if env_path.exists() {
        // Load the .env file
        match dotenvy::from_path(&env_path) {
            Ok(_) => {
                println!("cargo:warning=Loaded environment from {}", env_path.display());

                // Get and verify required variables
                let client_id = env::var("GOOGLE_CLIENT_ID").unwrap_or_else(|_| {
                    panic!(
                        "GOOGLE_CLIENT_ID not found in .env file at {}. \
                        Please copy .env.example to .env and fill in your credentials.",
                        env_path.display()
                    )
                });

                let client_secret = env::var("GOOGLE_CLIENT_SECRET").unwrap_or_else(|_| {
                    panic!(
                        "GOOGLE_CLIENT_SECRET not found in .env file at {}. \
                        Please copy .env.example to .env and fill in your credentials.",
                        env_path.display()
                    )
                });

                // Make variables available to env!() macro during compilation
                println!("cargo:rustc-env=GOOGLE_CLIENT_ID={}", client_id);
                println!("cargo:rustc-env=GOOGLE_CLIENT_SECRET={}", client_secret);
            }
            Err(e) => {
                panic!("Failed to load .env file at {}: {}", env_path.display(), e);
            }
        }
    } else {
        panic!(
            "No .env file found at {}. \
            Please copy .env.example to .env and fill in your credentials.",
            env_path.display()
        );
    }

    // Tell Cargo to re-run this build script if .env changes
    println!("cargo:rerun-if-changed={}", env_path.display());
}
