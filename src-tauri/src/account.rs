// ── ExileCompass account link (device flow) ──────────────────────────────────
//
// Signs the overlay into the user's exilecompass.com account via the OAuth
// device flow (RFC 8628, better-auth's deviceAuthorization plugin): the app
// requests a code, the user approves it at exilecompass.com/device, and the
// app receives a site session token. That token lives in the OS keychain
// (same tier as the ElevenLabs key in tts.rs) and authenticates site API
// calls as `Authorization: Bearer`.
//
// The one call that matters today is /api/app/poe-token: it returns the
// user's Path of Exile access token, refreshed server-side. The PoE refresh
// token never reaches this machine (a GGG requirement) — when the 28-day
// access token lapses, the app simply asks the site again. PoE API calls are
// then made directly from this process with the user's own token, so GGG's
// rate limits land on the player's IP/account, not on the site's server.

use serde::{Deserialize, Serialize};

const CLIENT_ID: &str = "exilecompass-app";
const KEYCHAIN_SERVICE: &str = "exilecompass-account";
const KEYCHAIN_ACCOUNT: &str = "site-session";

fn site_base() -> String {
    std::env::var("EXILECOMPASS_SITE_URL")
        .unwrap_or_else(|_| "https://exilecompass.com".to_string())
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("ExileCompass/{}", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

fn keychain_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())
}

fn load_session_token() -> Result<Option<String>, String> {
    match keychain_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn store_session_token(token: &str) -> Result<(), String> {
    keychain_entry()?.set_password(token).map_err(|e| e.to_string())
}

fn clear_session_token() -> Result<(), String> {
    match keychain_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ── device flow ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_in: Option<u64>,
    pub interval: Option<u64>,
}

#[tauri::command]
pub async fn account_begin_link() -> Result<DeviceCodeResponse, String> {
    let client = http_client()?;
    let response = client
        .post(format!("{}/api/auth/device/code", site_base()))
        .json(&serde_json::json!({ "client_id": CLIENT_ID }))
        .send()
        .await
        .map_err(|e| format!("Network error contacting exilecompass.com: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "exilecompass.com returned HTTP {} starting the sign-in",
            response.status()
        ));
    }
    response.json().await.map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct PollResult {
    /// "linked" | "pending" | "slow_down" | "denied" | "expired"
    pub status: String,
    pub name: Option<String>,
}

#[tauri::command]
pub async fn account_poll_link(device_code: String) -> Result<PollResult, String> {
    let client = http_client()?;
    let response = client
        .post(format!("{}/api/auth/device/token", site_base()))
        .json(&serde_json::json!({
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": device_code,
            "client_id": CLIENT_ID,
        }))
        .send()
        .await
        .map_err(|e| format!("Network error contacting exilecompass.com: {e}"))?;

    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    if let Some(token) = body.get("access_token").and_then(|v| v.as_str()) {
        store_session_token(token)?;
        let name = fetch_session_name(&client, token).await;
        return Ok(PollResult { status: "linked".to_string(), name });
    }

    let status = match body.get("error").and_then(|v| v.as_str()) {
        Some("authorization_pending") => "pending",
        Some("slow_down") => "slow_down",
        Some("access_denied") => "denied",
        Some("expired_token") => "expired",
        other => {
            return Err(format!(
                "Unexpected response from exilecompass.com: {}",
                other.unwrap_or("no error code")
            ))
        }
    };
    Ok(PollResult { status: status.to_string(), name: None })
}

async fn fetch_session_name(client: &reqwest::Client, token: &str) -> Option<String> {
    let body: serde_json::Value = client
        .get(format!("{}/api/auth/get-session", site_base()))
        .bearer_auth(token)
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    body.get("user")?.get("name")?.as_str().map(str::to_string)
}

// ── status / unlink ──────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AccountStatus {
    pub linked: bool,
    pub name: Option<String>,
    pub poe_linked: bool,
    /// The site's stored PoE refresh token hit GGG's 90-day ceiling — the
    /// user has to re-connect PoE at exilecompass.com/settings.
    pub poe_expired: bool,
    /// The GGG account name of the connected PoE account.
    pub poe_name: Option<String>,
}

const NOT_LINKED: AccountStatus = AccountStatus {
    linked: false,
    name: None,
    poe_linked: false,
    poe_expired: false,
    poe_name: None,
};

#[tauri::command]
pub async fn account_status() -> Result<AccountStatus, String> {
    let Some(token) = load_session_token()? else {
        return Ok(NOT_LINKED);
    };
    let client = http_client()?;

    let response = client
        .get(format!("{}/api/auth/get-session", site_base()))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Network error contacting exilecompass.com: {e}"))?;
    let session: serde_json::Value = response.json().await.unwrap_or(serde_json::Value::Null);
    let name = session
        .get("user")
        .and_then(|u| u.get("name"))
        .and_then(|n| n.as_str())
        .map(str::to_string);
    if name.is_none() {
        // The session was revoked or expired server-side; the stale token is
        // useless, so drop it and present as signed out.
        let _ = clear_session_token();
        return Ok(NOT_LINKED);
    }

    let poe = poe_token_raw(&client, &token).await.unwrap_or(serde_json::Value::Null);
    Ok(AccountStatus {
        linked: true,
        name,
        poe_linked: poe.get("linked").and_then(|v| v.as_bool()).unwrap_or(false),
        poe_expired: poe.get("expired").and_then(|v| v.as_bool()).unwrap_or(false),
        poe_name: poe.get("name").and_then(|v| v.as_str()).map(str::to_string),
    })
}

#[tauri::command]
pub async fn account_unlink() -> Result<(), String> {
    if let Some(token) = load_session_token()? {
        // Best effort: revoke the session server-side so the token is dead
        // even if someone captured it; the keychain entry goes regardless.
        if let Ok(client) = http_client() {
            let _ = client
                .post(format!("{}/api/auth/sign-out", site_base()))
                .bearer_auth(&token)
                .json(&serde_json::json!({}))
                .send()
                .await;
        }
    }
    clear_session_token()
}

// ── PoE access token ─────────────────────────────────────────────────────────

async fn poe_token_raw(
    client: &reqwest::Client,
    token: &str,
) -> Result<serde_json::Value, String> {
    let response = client
        .get(format!("{}/api/app/poe-token", site_base()))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Network error contacting exilecompass.com: {e}"))?;
    if response.status().as_u16() == 401 {
        return Err("app session rejected".to_string());
    }
    response.json().await.map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct PoeTokenInfo {
    pub linked: bool,
    pub expired: bool,
    pub access_token: Option<String>,
    pub expires_at: Option<String>,
    pub uuid: Option<String>,
    pub name: Option<String>,
}

/// The user's PoE access token for direct api.pathofexile.com calls. Features
/// consuming this must send GGG's required User-Agent and honor the
/// X-Rate-Limit headers.
#[tauri::command]
pub async fn account_poe_token() -> Result<PoeTokenInfo, String> {
    let Some(token) = load_session_token()? else {
        return Err("Not signed in to ExileCompass".to_string());
    };
    let client = http_client()?;
    let body = poe_token_raw(&client, &token).await?;
    Ok(PoeTokenInfo {
        linked: body.get("linked").and_then(|v| v.as_bool()).unwrap_or(false),
        expired: body.get("expired").and_then(|v| v.as_bool()).unwrap_or(false),
        access_token: body
            .get("accessToken")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        expires_at: body
            .get("expiresAt")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        uuid: body.get("uuid").and_then(|v| v.as_str()).map(str::to_string),
        name: body.get("name").and_then(|v| v.as_str()).map(str::to_string),
    })
}
