mod crypto;

use clap::Parser;
use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use crypto::{KeyManager, MessageEncryption, EncryptedMessage};
use futures_util::{SinkExt, StreamExt};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Alignment, Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Terminal,
};
use serde::{Deserialize, Serialize};
use std::io;
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::sleep;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const VERSION: &str = env!("CARGO_PKG_VERSION");

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
    },
    Registered,
    Text {
        content: String,
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
    status: String,
    connection_attempts: u32,
    messages_received: u32,
    last_text: String,
    last_error: String,
    tool_status: String,
    client_id: Option<String>,
    server_url: String,
}

impl AppState {
    fn new(server_url: String, tool_status: String) -> Self {
        Self {
            status: "Initializing...".to_string(),
            connection_attempts: 0,
            messages_received: 0,
            last_text: String::new(),
            last_error: String::new(),
            tool_status,
            client_id: None,
            server_url,
        }
    }
}

struct UtterClient {
    server_url: String,
    use_ydotool: bool,
    state: Arc<Mutex<AppState>>,
    key_manager: Option<KeyManager>,
    message_encryption: Option<MessageEncryption>,
}

impl UtterClient {
    fn new(server_url: String, use_ydotool: bool) -> Self {
        let tool = if use_ydotool { "ydotool" } else { "xdotool" };
        let tool_status = match Self::check_tool_available(tool) {
            true => format!("✓ {} available", tool),
            false => format!("✗ {} not found", tool),
        };

        let state = Arc::new(Mutex::new(AppState::new(
            server_url.clone(),
            tool_status,
        )));

        // Initialize crypto
        let mut key_manager = KeyManager::new().ok();
        let message_encryption = if let Some(ref mut km) = key_manager {
            if let Err(e) = km.get_or_generate_keypair() {
                eprintln!("[Crypto] Failed to initialize keypair: {}", e);
                None
            } else {
                // Create MessageEncryption
                if let (Ok(priv_key), Ok(pub_key)) =
                    (km.get_private_key_bytes(), km.get_public_key_bytes()) {
                    Some(MessageEncryption::new(priv_key, pub_key))
                } else {
                    None
                }
            }
        } else {
            None
        };

        if message_encryption.is_some() {
            println!("[Crypto] E2E encryption enabled");
        } else {
            println!("[Crypto] E2E encryption disabled (running in plaintext mode)");
        }

        Self {
            server_url,
            use_ydotool,
            state,
            key_manager,
            message_encryption,
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
        let mut state = self.state.lock().await;

        match msg {
            WsMessage::Connected { client_id } => {
                state.client_id = Some(client_id);
                state.status = "Connected".to_string();
                let hostname = get_hostname();

                // Get public key if crypto is enabled
                let public_key = if let Some(ref km) = self.key_manager {
                    km.get_public_key_base64().ok()
                } else {
                    None
                };

                if public_key.is_some() {
                    println!("[Crypto] Including public key in registration");
                }

                Some(WsMessage::Register {
                    client_type: "linux".to_string(),
                    device_id: hostname.clone(),
                    device_name: hostname,
                    public_key,
                    version: Some(format!("utterd v{}", VERSION)),
                    platform: Some(get_platform_info()),
                    arch: Some(std::env::consts::ARCH.to_string()),
                })
            }
            WsMessage::Registered => {
                state.status = "Registered - Ready".to_string();
                None
            }
            WsMessage::Text { content, encrypted, nonce, ephemeral_public_key } => {
                state.messages_received += 1;

                // ENFORCE ENCRYPTION: Reject plaintext messages
                if !encrypted.unwrap_or(false) {
                    let err_msg = "REJECTED: Plaintext messages not allowed. E2E encryption is REQUIRED.";
                    state.last_error = err_msg.to_string();
                    eprintln!("[Crypto] {}", err_msg);
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
                        Ok(plaintext) => {
                            println!("[Crypto] Message decrypted successfully");
                            plaintext
                        }
                        Err(e) => {
                            let err_msg = format!("Decryption failed: {}", e);
                            state.last_error = err_msg.clone();
                            eprintln!("[Crypto] {}", err_msg);
                            return None;
                        }
                    }
                } else {
                    state.last_error = "Received encrypted message but crypto not initialized".to_string();
                    eprintln!("[Crypto] {}", state.last_error);
                    return None;
                };

                // Truncate for display
                let display_text = if plaintext.len() > 50 {
                    format!("{}...", &plaintext[..50])
                } else {
                    plaintext.clone()
                };
                state.last_text = display_text;

                // Simulate typing
                if let Err(e) = self.simulate_typing(&plaintext) {
                    state.last_error = e;
                }
                None
            }
            WsMessage::Pong => None,
            _ => None,
        }
    }

    async fn connect(&self) -> Result<(), String> {
        let mut state = self.state.lock().await;
        state.connection_attempts += 1;
        state.status = "Connecting...".to_string();
        state.last_error = String::new();
        state.client_id = None;
        drop(state);

        // Connect to WebSocket
        let (ws_stream, _) = connect_async(&self.server_url)
            .await
            .map_err(|e| {
                if e.to_string().contains("Connection refused") || e.to_string().contains("111") {
                    "Server not running - start relay server first".to_string()
                } else if e.to_string().contains("getaddrinfo failed") {
                    "Cannot resolve hostname".to_string()
                } else if e.to_string().contains("Multiple exceptions") {
                    "Server not reachable - check server URL".to_string()
                } else {
                    let err_str = e.to_string();
                    if err_str.len() > 80 {
                        err_str[..80].to_string()
                    } else {
                        err_str
                    }
                }
            })?;

        let (mut write, mut read) = ws_stream.split();

        // Update status
        let mut state = self.state.lock().await;
        state.status = "Connected".to_string();
        drop(state);

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
                                            let mut state = self.state.lock().await;
                                            state.last_error = format!("Send error: {}", e);
                                            break;
                                        }
                                    }
                                }
                                Err(_) => {
                                    let mut state = self.state.lock().await;
                                    state.last_error = "Invalid JSON received".to_string();
                                }
                            }
                        }
                        Some(Ok(Message::Close(_))) => {
                            let mut state = self.state.lock().await;
                            state.status = "Disconnected".to_string();
                            state.last_error = "Connection closed normally".to_string();
                            break;
                        }
                        Some(Err(e)) => {
                            let mut state = self.state.lock().await;
                            state.status = "Disconnected".to_string();
                            state.last_error = format!("Connection lost unexpectedly: {}", e);
                            break;
                        }
                        None => {
                            let mut state = self.state.lock().await;
                            state.status = "Disconnected".to_string();
                            state.last_error = "Connection closed".to_string();
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }

        Ok(())
    }

    async fn run_with_display(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Setup terminal
        enable_raw_mode()?;
        let mut stdout = io::stdout();
        execute!(stdout, EnterAlternateScreen)?;
        let backend = CrosstermBackend::new(stdout);
        let mut terminal = Terminal::new(backend)?;

        let state = self.state.clone();
        let client = self.clone();

        // Spawn connection task
        let conn_handle = tokio::spawn(async move {
            loop {
                // Try to connect
                if let Err(e) = client.connect().await {
                    let mut state = client.state.lock().await;
                    if e.contains("Connection refused") {
                        state.status = "Connection Refused".to_string();
                    } else if e.contains("Timeout") {
                        state.status = "Timeout".to_string();
                    } else {
                        state.status = "Connection Error".to_string();
                    }
                    state.last_error = e;
                }

                // Countdown before reconnecting
                for remaining in (1..=5).rev() {
                    let mut state = client.state.lock().await;
                    state.status = format!("Reconnecting in {}s...", remaining);
                    drop(state);
                    sleep(Duration::from_millis(1000)).await;
                }
            }
        });

        // UI loop
        loop {
            let state = state.lock().await.clone();

            terminal.draw(|f| {
                let chunks = Layout::default()
                    .direction(Direction::Vertical)
                    .margin(2)
                    .constraints([Constraint::Min(0)].as_ref())
                    .split(f.area());

                // Build status lines
                let mut lines = vec![];

                // Status line with color
                let status_style = if state.status == "Connected"
                    || state.status == "Registered - Ready"
                {
                    Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)
                } else if state.status.contains("Connecting") || state.status.contains("Reconnecting")
                {
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)
                };

                lines.push(Line::from(vec![
                    Span::styled("Status:  ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                    Span::styled(&state.status, status_style),
                ]));

                lines.push(Line::from(vec![
                    Span::styled("Server:  ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                    Span::styled(&state.server_url, Style::default().fg(Color::White)),
                ]));

                if let Some(ref client_id) = state.client_id {
                    lines.push(Line::from(vec![
                        Span::styled("Client ID:  ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                        Span::styled(client_id, Style::default().fg(Color::White)),
                    ]));
                }

                lines.push(Line::from(vec![
                    Span::styled("Tool:  ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                    Span::styled(&state.tool_status, Style::default().fg(Color::White)),
                ]));

                lines.push(Line::from(vec![
                    Span::styled("Messages:  ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                    Span::styled(state.messages_received.to_string(), Style::default().fg(Color::White)),
                ]));

                if !state.last_text.is_empty() {
                    lines.push(Line::from(vec![
                        Span::styled("Last Text:  ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                        Span::styled(&state.last_text, Style::default().fg(Color::White)),
                    ]));
                }

                if !state.last_error.is_empty() {
                    lines.push(Line::from(vec![
                        Span::styled("Error:  ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                        Span::styled(&state.last_error, Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)),
                    ]));
                }

                // Build subtitle
                let subtitle = if state.status == "Registered - Ready" {
                    "Waiting for voice input from Android..."
                } else if state.connection_attempts > 0 {
                    &format!("Attempt #{}", state.connection_attempts)
                } else {
                    ""
                };

                let block = Block::default()
                    .title("🎤 utterd")
                    .title_alignment(Alignment::Left)
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(Color::Blue));

                let block = if !subtitle.is_empty() {
                    block.title_bottom(subtitle)
                } else {
                    block
                };

                let paragraph = Paragraph::new(lines)
                    .block(block)
                    .alignment(Alignment::Left);

                f.render_widget(paragraph, chunks[0]);
            })?;

            // Check for keyboard input (Ctrl+C)
            if event::poll(Duration::from_millis(100))? {
                if let Event::Key(key) = event::read()? {
                    if key.code == KeyCode::Char('c')
                        && key.modifiers.contains(event::KeyModifiers::CONTROL)
                    {
                        break;
                    }
                }
            }
        }

        // Cleanup
        conn_handle.abort();
        disable_raw_mode()?;
        execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
        terminal.show_cursor()?;

        println!("\nShutdown complete");

        Ok(())
    }

    async fn run(&self) -> Result<(), Box<dyn std::error::Error>> {
        if !self.check_dependencies() {
            let tool = if self.use_ydotool { "ydotool" } else { "xdotool" };
            eprintln!("✗ {} not found", tool);
            eprintln!("\nPlease install {}", tool);
            eprintln!("\nInstall command:");
            eprintln!("  sudo apt install {}", tool);
            return Ok(());
        }

        self.run_with_display().await
    }
}

impl Clone for UtterClient {
    fn clone(&self) -> Self {
        Self {
            server_url: self.server_url.clone(),
            use_ydotool: self.use_ydotool,
            state: self.state.clone(),
            key_manager: None,  // Crypto not cloned - each instance should have its own
            message_encryption: None,
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let client = UtterClient::new(args.server, args.ydotool);
    client.run().await
}
