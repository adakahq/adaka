use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::core::env::{self, Environment};
use crate::core::workspace;

use super::inheritance::resolve_inheritance;
use super::ApiClientError;

const MAX_BODY_BYTES: usize = 5 * 1024 * 1024; // 5 MB cap

// ---------------------------------------------------------------------------
// Response DTO
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendResponse {
    pub request_id: String,
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub body_size: usize,
    pub truncated: bool,
    pub binary: bool,
    pub timing: TimingInfo,
    pub url_resolved: String,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingInfo {
    pub total_ms: u64,
    /// Time to first byte (approximated: from request start to first chunk).
    /// reqwest does not expose DNS/connect/TLS phases separately without
    /// lower-level hyper hooks. We capture total + first-byte; the rest are
    /// approximated as 0 and documented as such in the spec update.
    pub first_byte_ms: u64,
    pub dns_ms: u64,
    pub connect_ms: u64,
    pub tls_ms: u64,
    pub download_ms: u64,
}

// ---------------------------------------------------------------------------
// Traced env resolution (secret redaction support)
// ---------------------------------------------------------------------------

/// Resolve `{{VAR}}` placeholders and track which resolved from [secrets].
pub struct ResolveResult {
    pub resolved: String,
    pub redacted: String,
    pub secret_names: Vec<String>,
}

/// Resolve template, returning both the real value and a redacted version
/// where secret values are replaced with •••.
pub fn resolve_traced(
    template: &str,
    env_ctx: &EnvContext,
) -> Result<ResolveResult, ApiClientError> {
    let resolved = resolve_all_vars(template, env_ctx)?;
    let mut redacted = resolved.clone();
    let mut secret_names = Vec::new();

    for name in &env_ctx.secret_values {
        let (sname, sval) = name;
        if !sval.is_empty() && redacted.contains(sval.as_str()) {
            redacted = redacted.replace(sval.as_str(), "•••");
            secret_names.push(sname.clone());
        }
    }

    Ok(ResolveResult {
        resolved,
        redacted,
        secret_names,
    })
}

/// Environment context for variable resolution during send.
pub struct EnvContext {
    pub vars: HashMap<String, String>,
    /// (name, resolved_value) pairs for secrets
    pub secret_values: Vec<(String, String)>,
}

impl EnvContext {
    pub fn from_environment(env: &Environment) -> Self {
        // For secrets: keychain not yet implemented, so we store empty values.
        // When keychain lands, this will resolve from the OS keychain.
        let secret_values: Vec<(String, String)> = env
            .secrets
            .iter()
            .map(|name| (name.clone(), String::new()))
            .collect();
        Self {
            vars: env.vars.clone(),
            secret_values,
        }
    }

    pub fn empty() -> Self {
        Self {
            vars: HashMap::new(),
            secret_values: Vec::new(),
        }
    }
}

fn resolve_all_vars(template: &str, ctx: &EnvContext) -> Result<String, ApiClientError> {
    let mut result = String::with_capacity(template.len());
    let bytes = template.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut literal_start = 0;

    while i < len {
        if i + 1 < len && bytes[i] == b'\\' && bytes[i + 1] == b'{' {
            result.push_str(&template[literal_start..i]);
            result.push('{');
            i += 2;
            literal_start = i;
            continue;
        }

        if i + 1 < len && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some(close) = find_closing_braces(template, i + 2) {
                result.push_str(&template[literal_start..i]);
                let var_raw = &template[i + 2..close];
                let var_name = var_raw.trim();

                if var_name.is_empty() {
                    result.push_str("{{}}");
                    i = close + 2;
                    literal_start = i;
                    continue;
                }

                // Check secrets first, then env vars, then OS env
                let secret_match = ctx
                    .secret_values
                    .iter()
                    .find(|(sname, _)| sname == var_name);

                if let Some((_, sval)) = secret_match {
                    if sval.is_empty() {
                        return Err(ApiClientError::UnresolvedVar(var_name.to_string()));
                    }
                    result.push_str(sval);
                } else if let Some(v) = ctx.vars.get(var_name) {
                    result.push_str(v);
                } else if let Ok(v) = std::env::var(var_name) {
                    result.push_str(&v);
                } else {
                    return Err(ApiClientError::UnresolvedVar(var_name.to_string()));
                }

                i = close + 2;
                literal_start = i;
                continue;
            }
        }

        i += 1;
    }

    result.push_str(&template[literal_start..]);
    Ok(result)
}

fn find_closing_braces(template: &str, start: usize) -> Option<usize> {
    let bytes = template.as_bytes();
    let mut i = start;
    while i + 1 < bytes.len() {
        if bytes[i] == b'}' && bytes[i + 1] == b'}' {
            return Some(i);
        }
        i += 1;
    }
    None
}

// ---------------------------------------------------------------------------
// Cancellation registry
// ---------------------------------------------------------------------------

type CancelMap = Arc<Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>>;

static CANCEL_MAP: std::sync::OnceLock<CancelMap> = std::sync::OnceLock::new();

fn cancel_registry() -> &'static CancelMap {
    CANCEL_MAP.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

// ---------------------------------------------------------------------------
// Send logic
// ---------------------------------------------------------------------------

pub async fn execute_send(
    workspace_path: &str,
    request_path: &str,
    env_name: Option<&str>,
) -> Result<SendResponse, ApiClientError> {
    let root = std::path::Path::new(workspace_path);

    // 1. Parse request
    let raw = workspace::read_file(root, request_path)?;
    let req = super::format::parse_request(&raw, request_path).map_err(|detail| {
        ApiClientError::Parse {
            file: request_path.to_string(),
            detail,
        }
    })?;

    // 2. Resolve inheritance
    let req = resolve_inheritance(root, request_path, req)?;

    // 3. Load environment
    let env_ctx = if let Some(name) = env_name {
        let environment = env::load_environment(root, name)?;
        EnvContext::from_environment(&environment)
    } else {
        EnvContext::empty()
    };

    // 4. Resolve variables (UNRESOLVED_VAR error before any network I/O)
    let url_result = resolve_traced(&req.url, &env_ctx)?;
    let url_resolved = url_result.resolved;
    let url_redacted = url_result.redacted;

    let mut resolved_headers: Vec<(String, String)> = Vec::new();
    for (k, v) in &req.headers {
        let rk = resolve_all_vars(k, &env_ctx)?;
        let rv = resolve_all_vars(v, &env_ctx)?;
        resolved_headers.push((rk, rv));
    }

    let mut resolved_query: Vec<(String, String)> = Vec::new();
    for (k, v) in &req.query {
        let rk = resolve_all_vars(k, &env_ctx)?;
        let rv = resolve_all_vars(v, &env_ctx)?;
        resolved_query.push((rk, rv));
    }

    let resolved_body = match req.body.body_type.as_str() {
        "none" => None,
        _ => {
            if let Some(content) = &req.body.content {
                Some(resolve_all_vars(content, &env_ctx)?)
            } else {
                None
            }
        }
    };

    // Resolve auth tokens/passwords
    let resolved_auth_token = if let Some(t) = &req.auth.token {
        Some(resolve_all_vars(t, &env_ctx)?)
    } else {
        None
    };
    let resolved_auth_password = if let Some(p) = &req.auth.password {
        Some(resolve_all_vars(p, &env_ctx)?)
    } else {
        None
    };
    let resolved_auth_value = if let Some(v) = &req.auth.value {
        Some(resolve_all_vars(v, &env_ctx)?)
    } else {
        None
    };

    // 5. Build reqwest client with settings
    let request_id = Uuid::new_v4().to_string();

    let redirect_policy = if req.settings.follow_redirects {
        Policy::limited(10)
    } else {
        Policy::none()
    };

    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(req.settings.timeout_ms))
        .redirect(redirect_policy);

    if !req.settings.verify_tls {
        client_builder = client_builder.danger_accept_invalid_certs(true);
    }

    let client = client_builder
        .build()
        .map_err(|e| ApiClientError::Network(e.to_string()))?;

    // Register cancellation token
    let (cancel_tx, mut cancel_rx) = tokio::sync::watch::channel(false);
    {
        let registry = cancel_registry();
        let mut map = registry.lock().await;
        map.insert(request_id.clone(), cancel_tx);
    }

    // 6. Build request
    let method =
        reqwest::Method::from_bytes(req.method.as_bytes()).map_err(|_| ApiClientError::Parse {
            file: request_path.to_string(),
            detail: format!("invalid HTTP method: {}", req.method),
        })?;

    let mut request_builder = client.request(method.clone(), &url_resolved);

    for (k, v) in &resolved_headers {
        request_builder = request_builder.header(k.as_str(), v.as_str());
    }

    if !resolved_query.is_empty() {
        request_builder = request_builder.query(&resolved_query);
    }

    // Auth
    match req.auth.auth_type.as_str() {
        "bearer" => {
            if let Some(token) = &resolved_auth_token {
                request_builder =
                    request_builder.header("Authorization", format!("Bearer {}", token));
            }
        }
        "basic" => {
            if let (Some(user), pass) = (&req.auth.username, &resolved_auth_password) {
                request_builder =
                    request_builder.basic_auth(user, pass.as_ref().map(|s| s.as_str()));
            }
        }
        "apikey" => {
            if let (Some(key), Some(val)) = (&req.auth.key, &resolved_auth_value) {
                let location = req.auth.location.as_deref().unwrap_or("header");
                if location == "header" {
                    request_builder = request_builder.header(key.as_str(), val.as_str());
                }
                // "query" location handled by appending to query params
                if location == "query" {
                    request_builder = request_builder.query(&[(key.as_str(), val.as_str())]);
                }
            }
        }
        _ => {}
    }

    // Body
    if let Some(body_content) = resolved_body {
        match req.body.body_type.as_str() {
            "json" => {
                request_builder = request_builder
                    .header("Content-Type", "application/json")
                    .body(body_content);
            }
            "raw" => {
                if let Some(ct) = &req.body.content_type {
                    request_builder = request_builder.header("Content-Type", ct.as_str());
                }
                request_builder = request_builder.body(body_content);
            }
            "form" => {
                // form-urlencoded from fields
                let mut form_data = Vec::new();
                for field in &req.body.fields {
                    if field.enabled {
                        let fv = resolve_all_vars(&field.value, &env_ctx)?;
                        form_data.push((field.name.clone(), fv));
                    }
                }
                request_builder = request_builder.form(&form_data);
            }
            _ => {
                request_builder = request_builder.body(body_content);
            }
        }
    } else if req.body.body_type == "form" && !req.body.fields.is_empty() {
        let mut form_data = Vec::new();
        for field in &req.body.fields {
            if field.enabled {
                let fv = resolve_all_vars(&field.value, &env_ctx)?;
                form_data.push((field.name.clone(), fv));
            }
        }
        request_builder = request_builder.form(&form_data);
    }

    // 7. Execute with timing
    let start = Instant::now();

    let response = tokio::select! {
        res = request_builder.send() => {
            res.map_err(|e| {
                if e.is_timeout() {
                    ApiClientError::Timeout(e.to_string())
                } else {
                    ApiClientError::Network(e.to_string())
                }
            })?
        }
        _ = wait_for_cancel(&mut cancel_rx) => {
            cleanup_cancel(&request_id).await;
            return Err(ApiClientError::Cancelled(request_id));
        }
    };

    let first_byte_ms = start.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let mut resp_headers: HashMap<String, String> = HashMap::new();
    for (name, value) in response.headers().iter() {
        let name_str: String = name.to_string();
        let val_str: String = value.to_str().unwrap_or("").to_string();
        resp_headers.insert(name_str, val_str);
    }

    let content_type = resp_headers
        .get("content-type")
        .cloned()
        .unwrap_or_default();

    // Stream body with cap
    let body_bytes = tokio::select! {
        res = read_body_capped(response) => res?,
        _ = wait_for_cancel(&mut cancel_rx) => {
            cleanup_cancel(&request_id).await;
            return Err(ApiClientError::Cancelled(request_id));
        }
    };

    let total_ms = start.elapsed().as_millis() as u64;
    let download_ms = total_ms.saturating_sub(first_byte_ms);

    let body_size = body_bytes.len();
    let truncated = body_size >= MAX_BODY_BYTES;

    // Binary detection: content-type heuristic + UTF-8 validity
    let is_binary = is_binary_content(&content_type, &body_bytes);
    let body_string = if is_binary {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(&body_bytes)
    } else {
        String::from_utf8_lossy(&body_bytes).into_owned()
    };

    // Cleanup cancel token
    cleanup_cancel(&request_id).await;

    Ok(SendResponse {
        request_id,
        status,
        status_text,
        headers: resp_headers,
        body: body_string,
        body_size,
        truncated,
        binary: is_binary,
        timing: TimingInfo {
            total_ms,
            first_byte_ms,
            dns_ms: 0,
            connect_ms: 0,
            tls_ms: 0,
            download_ms,
        },
        url_resolved: url_redacted,
        method: method.to_string(),
    })
}

async fn read_body_capped(response: reqwest::Response) -> Result<Vec<u8>, ApiClientError> {
    let mut bytes = Vec::new();
    let mut stream = response;
    while let Some(chunk) = stream
        .chunk()
        .await
        .map_err(|e| ApiClientError::Network(e.to_string()))?
    {
        let remaining = MAX_BODY_BYTES.saturating_sub(bytes.len());
        if remaining == 0 {
            break;
        }
        let take = chunk.len().min(remaining);
        bytes.extend_from_slice(&chunk[..take]);
        if bytes.len() >= MAX_BODY_BYTES {
            break;
        }
    }
    Ok(bytes)
}

fn is_binary_content(content_type: &str, body: &[u8]) -> bool {
    let ct_lower = content_type.to_lowercase();
    // Text-like content types
    if ct_lower.contains("text/")
        || ct_lower.contains("json")
        || ct_lower.contains("xml")
        || ct_lower.contains("javascript")
        || ct_lower.contains("html")
        || ct_lower.contains("css")
        || ct_lower.contains("yaml")
        || ct_lower.contains("toml")
    {
        return false;
    }
    // If content-type suggests binary
    if ct_lower.contains("octet-stream")
        || ct_lower.contains("image/")
        || ct_lower.contains("audio/")
        || ct_lower.contains("video/")
        || ct_lower.contains("application/pdf")
        || ct_lower.contains("application/zip")
    {
        return true;
    }
    // Fallback: check if valid UTF-8
    std::str::from_utf8(body).is_err()
}

async fn wait_for_cancel(rx: &mut tokio::sync::watch::Receiver<bool>) {
    loop {
        rx.changed().await.ok();
        if *rx.borrow() {
            return;
        }
    }
}

async fn cleanup_cancel(request_id: &str) {
    let registry = cancel_registry();
    let mut map = registry.lock().await;
    map.remove(request_id);
}

/// Cancel an in-flight request by ID.
pub async fn cancel_request(request_id: &str) -> Result<(), ApiClientError> {
    let registry = cancel_registry();
    let map = registry.lock().await;
    if let Some(tx) = map.get(request_id) {
        let _ = tx.send(true);
        Ok(())
    } else {
        Err(ApiClientError::Cancelled(request_id.to_string()))
    }
}

/// Get all pending request IDs (used by integration tests).
pub async fn pending_request_ids() -> Vec<String> {
    let registry = cancel_registry();
    let map = registry.lock().await;
    map.keys().cloned().collect()
}

/// Cancel all pending requests (used by integration tests).
pub async fn cancel_all_pending() {
    let registry = cancel_registry();
    let map = registry.lock().await;
    for (_, tx) in map.iter() {
        let _ = tx.send(true);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_all_vars_basic() {
        let mut vars = HashMap::new();
        vars.insert("HOST".to_string(), "localhost".to_string());
        vars.insert("PORT".to_string(), "8080".to_string());
        let ctx = EnvContext {
            vars,
            secret_values: vec![],
        };
        let result = resolve_all_vars("http://{{HOST}}:{{PORT}}/api", &ctx).unwrap();
        assert_eq!(result, "http://localhost:8080/api");
    }

    #[test]
    fn resolve_all_vars_unresolved() {
        let ctx = EnvContext::empty();
        let err = resolve_all_vars("{{MISSING}}", &ctx).unwrap_err();
        assert!(matches!(err, ApiClientError::UnresolvedVar(ref v) if v == "MISSING"));
    }

    #[test]
    fn resolve_traced_redacts_secrets() {
        let ctx = EnvContext {
            vars: HashMap::from([("HOST".to_string(), "example.com".to_string())]),
            secret_values: vec![("TOKEN".to_string(), "secret123".to_string())],
        };
        let result = resolve_traced("https://{{HOST}}/api?key=secret123", &ctx).unwrap();
        assert_eq!(result.resolved, "https://example.com/api?key=secret123");
        assert_eq!(result.redacted, "https://example.com/api?key=•••");
    }

    #[test]
    fn is_binary_json_not_binary() {
        assert!(!is_binary_content("application/json", b"{}"));
    }

    #[test]
    fn is_binary_octet_stream() {
        assert!(is_binary_content("application/octet-stream", &[0xFF, 0xFE]));
    }

    #[test]
    fn is_binary_invalid_utf8() {
        assert!(is_binary_content("", &[0xFF, 0xFE, 0x00, 0x01]));
    }

    #[test]
    fn is_binary_text_plain_not_binary() {
        assert!(!is_binary_content("text/plain", b"hello world"));
    }
}
