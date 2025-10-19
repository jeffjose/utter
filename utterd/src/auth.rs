use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use base64::Engine;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JWTPayload {
    pub user_id: String,
    pub iat: u64,
    pub exp: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub jwt: String,
    pub expires_in: u64,
    pub user_id: String,
}

pub async fn exchange_for_jwt(
    auth_url: &str,
    oauth_token: &str,
) -> Result<AuthResponse, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/auth", auth_url))
        .json(&serde_json::json!({ "token": oauth_token }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        return Err(format!(
            "JWT exchange failed: {}",
            error["error"].as_str().unwrap_or("unknown error")
        )
        .into());
    }

    let auth_resp: AuthResponse = response.json().await?;
    Ok(auth_resp)
}

pub async fn refresh_jwt(
    auth_url: &str,
    current_jwt: &str,
) -> Result<AuthResponse, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/auth/refresh", auth_url))
        .json(&serde_json::json!({ "jwt": current_jwt }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        return Err(format!(
            "JWT refresh failed: {}",
            error["error"].as_str().unwrap_or("unknown error")
        )
        .into());
    }

    let auth_resp: AuthResponse = response.json().await?;
    Ok(auth_resp)
}

pub fn decode_jwt_payload(jwt: &str) -> Result<JWTPayload, Box<dyn std::error::Error>> {
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() != 3 {
        return Err("Invalid JWT format".into());
    }

    let payload_b64 = parts[1];
    let payload_json = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload_b64)?;
    let payload: JWTPayload = serde_json::from_slice(&payload_json)?;

    Ok(payload)
}

pub fn is_jwt_expiring_soon(jwt: &str, threshold_seconds: u64) -> bool {
    match decode_jwt_payload(jwt) {
        Ok(payload) => {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let time_until_expiry = payload.exp.saturating_sub(now);
            time_until_expiry < threshold_seconds
        }
        Err(_) => true, // If we can't decode, assume expired
    }
}
