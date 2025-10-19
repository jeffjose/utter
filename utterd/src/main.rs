mod crypto;
mod oauth;

use clap::Parser;
use crypto::{KeyManager, MessageEncryption, EncryptedMessage};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::sleep;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const VERSION: &str = env!("CARGO_PKG_VERSION");

// ANSI color codes
mod colors {
    pub const RESET: &str = "\x1b[0m";
    pub const BRIGHT: &str = "\x1b[1m";
    pub const DIM: &str = "\x1b[2m";
    pub const RED: &str = "\x1b[31m";
    pub const GREEN: &str = "\x1b[32m";
    pub const YELLOW: &str = "\x1b[33m";
    pub const BLUE: &str = "\x1b[34m";
    pub const MAGENTA: &str = "\x1b[35m";
    pub const CYAN: &str = "\x1b[36m";
    pub const GRAY: &str = "\x1b[90m";
}

fn get_hostname() -> String {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "unknown".to_string())
}

fn get_platform_info() -> String {
    // Try to read /etc/os-release for Linux distro info
    if cfg!(target_os = "linux") {
        if let Ok(contents) = std::fs::read_to_string("/etc/os-release") {
            for line in contents.lines() {
                if line.starts_with("PRETTY_NAME=") {
                    let name = line.trim_start_matches("PRETTY_NAME=")
                        .trim_matches('"');
                    return name.to_string();
                }
            }
        }
        return "Linux".to_string();
    }

    // For other platforms, use the OS constant
    std::env::consts::OS.to_string()
}

/// utterd - Voice dictation from Android to Linux
#[derive(Parser)]
#[command(name = "utterd")]
#[command(about = "utterd - Voice dictation from Android to Linux", long_about = None)]
struct Args {
    /// WebSocket server URL
    #[arg(long, default_value = "ws://localhost:8080")]
    server: String,

    /// Use ydotool instead of xdotool (for Wayland)
    #[arg(long)]
    ydotool: bool,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
enum WsMessage {
    Connected {
        #[serde(rename = "clientId")]
        client_id: String,
    },
    Register {
        #[serde(rename = "clientType")]
        client_type: String,
        #[serde(rename = "deviceId")]
        device_id: String,
        #[serde(rename = "deviceName")]
        device_name: String,
        #[serde(rename = "publicKey", skip_serializing_if = "Option::is_none")]
        public_key: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        version: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        platform: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        arch: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        token: Option<String>,
    },
    Registered,
    Text {
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        from: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        timestamp: Option<i64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        encrypted: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        nonce: Option<String>,
        #[serde(rename = "ephemeralPublicKey", skip_serializing_if = "Option::is_none")]
        ephemeral_public_key: Option<String>,
    },
    Pong,
}

#[derive(Clone)]
struct AppState {
    client_id: Option<String>,
    last_message_timestamp: Option<i64>,
    last_message_sender: Option<String>,
    last_message_text: Option<String>,
}

impl AppState {
    fn new() -> Self {
        Self {
            client_id: None,
            last_message_timestamp: None,
            last_message_sender: None,
            last_message_text: None,
        }
    }
}

struct UtterClient {
    server_url: String,
    use_ydotool: bool,
    state: Arc<Mutex<AppState>>,
    key_manager: Option<Arc<KeyManager>>,
    message_encryption: Option<Arc<MessageEncryption>>,
    id_token: Option<String>,
}

impl UtterClient {
    fn new(server_url: String, use_ydotool: bool) -> Self {
        let state = Arc::new(Mutex::new(AppState::new()));

        // Initialize crypto
        let (key_manager, message_encryption) = match KeyManager::new() {
            Ok(mut km) => {
                match km.get_or_generate_keypair() {
                    Ok(_) => {
                        // Create MessageEncryption
                        match (km.get_private_key_bytes(), km.get_public_key_bytes()) {
                            (Ok(priv_key), Ok(pub_key)) => {
                                let enc = MessageEncryption::new(&priv_key, &pub_key);
                                (Some(Arc::new(km)), Some(Arc::new(enc)))
                            }
                            _ => {
                                eprintln!("{}✗ Key retrieval failed{}", colors::RED, colors::RESET);
                                (None, None)
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("{}✗ Failed to initialize keypair: {}{}", colors::RED, e, colors::RESET);
                        (None, None)
                    }
                }
            }
            Err(e) => {
                eprintln!("{}✗ Failed to create KeyManager: {}{}", colors::RED, e, colors::RESET);
                (None, None)
            }
        };

        Self {
            server_url,
            use_ydotool,
            state,
            key_manager,
            message_encryption,
            id_token: None,
        }
    }

    fn check_tool_available(tool: &str) -> bool {
        Command::new(tool)
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    fn check_dependencies(&self) -> bool {
        let tool = if self.use_ydotool { "ydotool" } else { "xdotool" };
        Self::check_tool_available(tool)
    }

    fn simulate_typing(&self, text: &str) -> Result<(), String> {
        let result = if self.use_ydotool {
            Command::new("ydotool")
                .arg("type")
                .arg(text)
                .status()
        } else {
            Command::new("xdotool")
                .arg("type")
                .arg("--")
                .arg(text)
                .status()
        };

        result.map_err(|e| format!("Typing error: {}", e))?;
        Ok(())
    }

    async fn handle_message(&self, msg: WsMessage) -> Option<WsMessage> {
        match msg {
            WsMessage::Connected { client_id } => {
                let mut state = self.state.lock().await;
                state.client_id = Some(client_id.clone());
                drop(state);

                let hostname = get_hostname();

                // Get public key if crypto is enabled
                let public_key = if let Some(ref km) = self.key_manager {
                    km.get_public_key_base64().ok()
                } else {
                    None
                };

                Some(WsMessage::Register {
                    client_type: "target".to_string(),
                    device_id: hostname.clone(),
                    device_name: hostname,
                    public_key,
                    version: Some(format!("utterd v{}", VERSION)),
                    platform: Some(get_platform_info()),
                    arch: Some(std::env::consts::ARCH.to_string()),
                    token: self.id_token.clone(),
                })
            }
            WsMessage::Registered => {
                print!("{}●{} Connected\n\n", colors::GREEN, colors::RESET);
                use std::io::Write;
                std::io::stdout().flush().unwrap();
                None
            }
            WsMessage::Text { content, from, timestamp, encrypted, nonce, ephemeral_public_key } => {
                // ENFORCE ENCRYPTION: Reject plaintext messages
                if !encrypted.unwrap_or(false) {
                    println!("\r\x1b[K{}✗ Rejected plaintext message{}", colors::RED, colors::RESET);
                    return None;
                }

                // Decrypt encrypted message
                let plaintext = if let (Some(ref enc), Some(nonce_str), Some(eph_key)) =
                    (&self.message_encryption, nonce, ephemeral_public_key) {

                    let encrypted_msg = EncryptedMessage {
                        ciphertext: content,
                        nonce: nonce_str,
                        ephemeral_public_key: eph_key,
                    };

                    match enc.decrypt(&encrypted_msg, "") {
                        Ok(plaintext) => plaintext,
                        Err(e) => {
                            println!("\r\x1b[K{}✗ Decryption failed: {}{}", colors::RED, e, colors::RESET);
                            return None;
                        }
                    }
                } else {
                    println!("\r\x1b[K{}✗ Crypto not initialized{}", colors::RED, colors::RESET);
                    return None;
                };

                // Calculate time ago
                let time_ago = if let Some(ts) = timestamp {
                    use std::time::{SystemTime, UNIX_EPOCH, Duration};
                    let msg_time = UNIX_EPOCH + Duration::from_millis(ts as u64);
                    let now = SystemTime::now();

                    if let Ok(elapsed) = now.duration_since(msg_time) {
                        let secs = elapsed.as_secs();
                        if secs < 60 {
                            format!("{}s ago", secs)
                        } else if secs < 3600 {
                            format!("{}m ago", secs / 60)
                        } else {
                            format!("{}h ago", secs / 3600)
                        }
                    } else {
                        "just now".to_string()
                    }
                } else {
                    "just now".to_string()
                };

                // Get sender name
                let sender = from.unwrap_or_else(|| "unknown".to_string());

                // Format display text
                let display_text = if plaintext.len() > 60 {
                    format!("{}...", &plaintext[..60])
                } else {
                    plaintext.clone()
                };

                // Update state with message info
                let mut state = self.state.lock().await;
                state.last_message_timestamp = timestamp;
                state.last_message_sender = Some(sender.clone());
                state.last_message_text = Some(display_text.clone());
                drop(state);

                // Print message status (two lines)
                // Move up two lines and clear both before printing
                use std::io::Write;
                print!("\x1b[2A\r\x1b[K{}Last:{} {} {}from {}{}\n\x1b[K{}\n",
                    colors::DIM, colors::RESET,
                    time_ago,
                    colors::DIM, colors::RESET, sender,
                    display_text);
                std::io::stdout().flush().unwrap();

                // Simulate typing
                if let Err(e) = self.simulate_typing(&plaintext) {
                    println!("\n{}✗ Typing error: {}{}", colors::RED, e, colors::RESET);
                }
                None
            }
            WsMessage::Pong => None,
            _ => None,
        }
    }

    async fn update_message_display(&self) {
        let state = self.state.lock().await;

        if let (Some(timestamp), Some(sender), Some(text)) = (
            state.last_message_timestamp,
            state.last_message_sender.clone(),
            state.last_message_text.clone(),
        ) {
            drop(state);

            // Calculate time ago
            use std::time::{SystemTime, UNIX_EPOCH, Duration};
            let msg_time = UNIX_EPOCH + Duration::from_millis(timestamp as u64);
            let now = SystemTime::now();

            let time_ago = if let Ok(elapsed) = now.duration_since(msg_time) {
                let secs = elapsed.as_secs();
                if secs < 60 {
                    format!("{}s ago", secs)
                } else if secs < 3600 {
                    format!("{}m ago", secs / 60)
                } else {
                    format!("{}h ago", secs / 3600)
                }
            } else {
                "just now".to_string()
            };

            // Print message status (two lines)
            use std::io::Write;
            print!("\x1b[2A\r\x1b[K{}Last:{} {} {}from {}{}\n\x1b[K{}\n",
                colors::DIM, colors::RESET,
                time_ago,
                colors::DIM, colors::RESET, sender,
                text);
            std::io::stdout().flush().unwrap();
        }
    }

    async fn connect(&self) -> Result<(), String> {
        // Connect to WebSocket
        let (ws_stream, _) = connect_async(&self.server_url)
            .await
            .map_err(|e| {
                if e.to_string().contains("Connection refused") || e.to_string().contains("111") {
                    "Server not running".to_string()
                } else if e.to_string().contains("getaddrinfo failed") {
                    "Cannot resolve hostname".to_string()
                } else if e.to_string().contains("Multiple exceptions") {
                    "Server not reachable".to_string()
                } else {
                    let err_str = e.to_string();
                    if err_str.len() > 60 {
                        err_str[..60].to_string()
                    } else {
                        err_str
                    }
                }
            })?;

        let (mut write, mut read) = ws_stream.split();

        // Spawn background task to update message display every second
        let client_clone = self.clone();
        let update_task = tokio::spawn(async move {
            loop {
                sleep(Duration::from_secs(1)).await;
                client_clone.update_message_display().await;
            }
        });

        // Message loop
        loop {
            tokio::select! {
                msg = read.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            match serde_json::from_str::<WsMessage>(&text) {
                                Ok(ws_msg) => {
                                    if let Some(response) = self.handle_message(ws_msg).await {
                                        let json = serde_json::to_string(&response).unwrap();
                                        if let Err(e) = write.send(Message::Text(json)).await {
                                            println!("\r\x1b[K{}✗ Send error: {}{}", colors::RED, e, colors::RESET);
                                            break;
                                        }
                                    }
                                }
                                Err(_) => {
                                    println!("\r\x1b[K{}✗ Invalid JSON received{}", colors::RED, colors::RESET);
                                }
                            }
                        }
                        Some(Ok(Message::Close(_))) => {
                            println!("\r\x1b[K{}✗ Connection closed{}", colors::YELLOW, colors::RESET);
                            break;
                        }
                        Some(Err(e)) => {
                            println!("\r\x1b[K{}✗ Connection lost: {}{}", colors::RED, e, colors::RESET);
                            break;
                        }
                        None => {
                            println!("\r\x1b[K{}✗ Connection closed{}", colors::YELLOW, colors::RESET);
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }

        // Clean up: abort the update task
        update_task.abort();

        Ok(())
    }

    async fn run(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if !self.check_dependencies() {
            let tool = if self.use_ydotool { "ydotool" } else { "xdotool" };
            eprintln!("\n{}✗ {} not found{}", colors::RED, tool, colors::RESET);
            eprintln!("\n{}Please install {}{}", colors::YELLOW, tool, colors::RESET);
            eprintln!("\n{}Install command:{}", colors::DIM, colors::RESET);
            eprintln!("  {}sudo apt install {}{}", colors::CYAN, tool, colors::RESET);
            return Ok(());
        }

        // Initialize OAuth (runs blocking I/O, so use spawn_blocking)
        let tokens = tokio::task::spawn_blocking(|| {
            let oauth_manager = oauth::OAuthManager::new()?;
            oauth_manager.get_or_authenticate()
        })
        .await
        .map_err(|e| format!("OAuth task failed: {}", e))?
        .map_err(|e| {
            eprintln!("{}✗ OAuth failed: {}{}", colors::RED, e, colors::RESET);
            eprintln!("{}Cannot start without authentication.{}\n", colors::RED, colors::RESET);
            e
        })?;

        self.id_token = Some(tokens.id_token);

        // Print startup banner
        let hostname = get_hostname();
        println!("{}{}Utter{} {}Daemon{}",
            colors::BRIGHT, colors::CYAN, colors::RESET, colors::DIM, colors::RESET);
        println!("{}{} • {}{}\n",
            colors::GRAY, self.server_url, hostname, colors::RESET);

        // Connection loop
        loop {
            // Try to connect
            if let Err(e) = self.connect().await {
                print!("\r\x1b[K{}✗ {}{}", colors::RED, e, colors::RESET);
            }

            // Reconnect after 5 seconds
            print!("\r{}Reconnecting in 5s...{}", colors::YELLOW, colors::RESET);
            use std::io::Write;
            std::io::stdout().flush().unwrap();
            sleep(Duration::from_secs(5)).await;
            print!("\r\x1b[K"); // Clear the line
            std::io::stdout().flush().unwrap();
        }
    }
}

impl Clone for UtterClient {
    fn clone(&self) -> Self {
        Self {
            server_url: self.server_url.clone(),
            use_ydotool: self.use_ydotool,
            state: self.state.clone(),
            key_manager: self.key_manager.clone(),
            message_encryption: self.message_encryption.clone(),
            id_token: self.id_token.clone(),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let mut client = UtterClient::new(args.server, args.ydotool);
    client.run().await
}
