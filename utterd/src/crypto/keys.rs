use ed25519_dalek::{SigningKey, VerifyingKey};
use rand::rngs::OsRng;
use std::fs;
use std::path::PathBuf;

/// Manages Ed25519 keypairs for E2E encryption
///
/// Keys are stored in ~/.config/utterd/keypair.key
pub struct KeyManager {
    config_dir: PathBuf,
    signing_key: Option<SigningKey>,
    verifying_key: Option<VerifyingKey>,
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
            signing_key: None,
            verifying_key: None,
        })
    }

    /// Get or generate Ed25519 keypair
    pub fn get_or_generate_keypair(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let key_path = self.config_dir.join("keypair.key");

        if key_path.exists() {
            println!("[Crypto] Loading existing keypair from {:?}", key_path);
            self.load_keypair(&key_path)?;
        } else {
            println!("[Crypto] Generating new Ed25519 keypair");
            self.generate_and_save_keypair(&key_path)?;
        }

        Ok(())
    }

    /// Generate new Ed25519 keypair and save to file
    fn generate_and_save_keypair(&mut self, path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key = signing_key.verifying_key();

        // Save private key to file
        fs::write(path, signing_key.to_bytes())?;

        // Set restrictive permissions (Unix only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(path)?.permissions();
            perms.set_mode(0o600); // rw------- (owner only)
            fs::set_permissions(path, perms)?;
        }

        println!("[Crypto] Keypair generated and saved to {:?}", path);

        self.signing_key = Some(signing_key);
        self.verifying_key = Some(verifying_key);

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

        let signing_key = SigningKey::from_bytes(&key_array);
        let verifying_key = signing_key.verifying_key();

        self.signing_key = Some(signing_key);
        self.verifying_key = Some(verifying_key);

        Ok(())
    }

    /// Get the public key in base64 format
    pub fn get_public_key_base64(&self) -> Result<String, Box<dyn std::error::Error>> {
        let verifying_key = self.verifying_key
            .as_ref()
            .ok_or("No keypair loaded. Call get_or_generate_keypair() first.")?;

        Ok(base64::encode(verifying_key.as_bytes()))
    }

    /// Get the private key bytes
    pub fn get_private_key_bytes(&self) -> Result<&[u8; 32], Box<dyn std::error::Error>> {
        let signing_key = self.signing_key
            .as_ref()
            .ok_or("No keypair loaded")?;

        Ok(signing_key.as_bytes())
    }

    /// Get the public key bytes
    pub fn get_public_key_bytes(&self) -> Result<&[u8; 32], Box<dyn std::error::Error>> {
        let verifying_key = self.verifying_key
            .as_ref()
            .ok_or("No keypair loaded")?;

        Ok(verifying_key.as_bytes())
    }

    /// Clear all stored keys (delete key file)
    pub fn clear_keys(&self) -> Result<(), Box<dyn std::error::Error>> {
        let key_path = self.config_dir.join("keypair.key");
        if key_path.exists() {
            fs::remove_file(key_path)?;
            println!("[Crypto] Keys cleared");
        }
        Ok(())
    }
}

impl Default for KeyManager {
    fn default() -> Self {
        Self::new().expect("Failed to create KeyManager")
    }
}
