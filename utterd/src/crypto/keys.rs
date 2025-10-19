use base64::{Engine as _, engine::general_purpose};
use rand::rngs::OsRng;
use std::fs;
use std::path::PathBuf;
use x25519_dalek::{PublicKey, StaticSecret};

/// Manages X25519 keypairs for E2E encryption
///
/// Keys are stored in ~/.config/utterd/keypair.key
pub struct KeyManager {
    config_dir: PathBuf,
    private_key: Option<StaticSecret>,
    public_key: Option<PublicKey>,
}

impl KeyManager {
    /// Create a new KeyManager with default config directory
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let config_dir = dirs::config_dir()
            .ok_or("Could not find config directory")?
            .join("utterd");

        // Create config directory if it doesn't exist
        fs::create_dir_all(&config_dir)?;

        Ok(Self {
            config_dir,
            private_key: None,
            public_key: None,
        })
    }

    /// Get or generate X25519 keypair
    pub fn get_or_generate_keypair(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let key_path = self.config_dir.join("keypair.key");

        if key_path.exists() {
            self.load_keypair(&key_path)?;
        } else {
            self.generate_and_save_keypair(&key_path)?;
        }

        Ok(())
    }

    /// Generate new X25519 keypair and save to file
    fn generate_and_save_keypair(&mut self, path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
        let private_key = StaticSecret::random_from_rng(OsRng);
        let public_key = PublicKey::from(&private_key);

        // Save private key to file
        fs::write(path, private_key.to_bytes())?;

        // Set restrictive permissions (Unix only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(path)?.permissions();
            perms.set_mode(0o600); // rw------- (owner only)
            fs::set_permissions(path, perms)?;
        }

        self.private_key = Some(private_key);
        self.public_key = Some(public_key);

        Ok(())
    }

    /// Load keypair from file
    fn load_keypair(&mut self, path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
        let key_bytes = fs::read(path)?;

        if key_bytes.len() != 32 {
            return Err(format!("Invalid key length: {} bytes (expected 32)", key_bytes.len()).into());
        }

        let key_array: [u8; 32] = key_bytes.try_into()
            .map_err(|_| "Failed to convert key bytes to array")?;

        let private_key = StaticSecret::from(key_array);
        let public_key = PublicKey::from(&private_key);

        self.private_key = Some(private_key);
        self.public_key = Some(public_key);

        Ok(())
    }

    /// Get the public key in base64 format
    pub fn get_public_key_base64(&self) -> Result<String, Box<dyn std::error::Error>> {
        let public_key = self.public_key
            .as_ref()
            .ok_or("No keypair loaded. Call get_or_generate_keypair() first.")?;

        Ok(general_purpose::STANDARD.encode(public_key.as_bytes()))
    }

    /// Get the private key bytes
    pub fn get_private_key_bytes(&self) -> Result<[u8; 32], Box<dyn std::error::Error>> {
        let private_key = self.private_key
            .as_ref()
            .ok_or("No keypair loaded")?;

        Ok(private_key.to_bytes())
    }

    /// Get the public key bytes
    pub fn get_public_key_bytes(&self) -> Result<[u8; 32], Box<dyn std::error::Error>> {
        let public_key = self.public_key
            .as_ref()
            .ok_or("No keypair loaded")?;

        Ok(*public_key.as_bytes())
    }

    /// Clear all stored keys (delete key file)
    pub fn clear_keys(&self) -> Result<(), Box<dyn std::error::Error>> {
        let key_path = self.config_dir.join("keypair.key");
        if key_path.exists() {
            fs::remove_file(key_path)?;
        }
        Ok(())
    }
}

impl Default for KeyManager {
    fn default() -> Self {
        Self::new().expect("Failed to create KeyManager")
    }
}
