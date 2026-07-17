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
    pub first_byte_ms: u64,
    pub dns_ms: u64,
    pub connect_ms: u64,
    pub tls_ms: u64,
    pub download_ms: u64,
}

// ---------------------------------------------------------------------------
// Prepared request — result of parse/inherit/env-resolve, before network I/O
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct PreparedRequest {
    pub request_id: String,
    pub method: String,
    pub url_resolved: String,
    pub url_redacted: String,
    pub headers_resolved: Vec<(String, String)>,
    pub headers_redacted: Vec<(String, String)>,
    pub query_resolved: Vec<(String, String)>,
    pub query_redacted: Vec<(String, String)>,
    pub body_resolved: Option<String>,
    pub body_redacted: Option<String>,
    pub auth_token: Option<String>,
    pub auth_password: Option<String>,
    pub auth_value: Option<String>,
    pub auth_type: String,
    pub auth_username: Option<String>,
    pub auth_key: Option<String>,
    pub auth_location: Option<String>,
    pub body_type: String,
    pub body_content_type: Option<String>,
    pub fields: Vec<(String, String)>,
    pub settings: PreparedSettings,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreparedSettings {
    pub timeout_ms: u64,
    pub follow_redirects: bool,
    pub verify_tls: bool,
}

impl PreparedRequest {
    /// Build a redacted JSON snapshot for history storage.
    pub fn redacted_snapshot(&self) -> String {
        let snapshot = serde_json::json!({
            "method": self.method,
            "url": self.url_redacted,
            "headers": self.headers_redacted,
            "query": self.query_redacted,
            "body": self.body_redacted,
        });
        serde_json::to_string(&snapshot).unwrap_or_default()
    }
}

// ---------------------------------------------------------------------------
// Traced env resolution (secret redaction support)
// ---------------------------------------------------------------------------

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

    for (sname, sval) in &env_ctx.secret_values {
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
                        // NOTE(keychain-M3): when keychain lands, add an end-to-end integration
                        // test proving redaction through the full api_send_request path — the
                        // unit tests on resolve_traced/redacted_snapshot are the interim guarantee.
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
// Variable resolution for a whole request — extracted so prepare() can catch
// UnresolvedVar once and enrich the error message.
// ---------------------------------------------------------------------------

struct ResolvedVars {
    url: ResolveResult,
    headers_resolved: Vec<(String, String)>,
    headers_redacted: Vec<(String, String)>,
    query_resolved: Vec<(String, String)>,
    query_redacted: Vec<(String, String)>,
    body_resolved: Option<String>,
    body_redacted: Option<String>,
    fields: Vec<(String, String)>,
    auth_token: Option<String>,
    auth_password: Option<String>,
    auth_value: Option<String>,
}

fn resolve_request_vars(
    req: &super::format::RequestFile,
    env_ctx: &EnvContext,
) -> Result<ResolvedVars, ApiClientError> {
    let url = resolve_traced(&req.url, env_ctx)?;

    let mut headers_resolved = Vec::new();
    let mut headers_redacted = Vec::new();
    for (k, v) in &req.headers {
        let rk = resolve_traced(k, env_ctx)?;
        let rv = resolve_traced(v, env_ctx)?;
        headers_resolved.push((rk.resolved.clone(), rv.resolved.clone()));
        headers_redacted.push((rk.redacted, rv.redacted));
    }

    let mut query_resolved = Vec::new();
    let mut query_redacted = Vec::new();
    for (k, v) in &req.query {
        let rk = resolve_traced(k, env_ctx)?;
        let rv = resolve_traced(v, env_ctx)?;
        query_resolved.push((rk.resolved.clone(), rv.resolved.clone()));
        query_redacted.push((rk.redacted, rv.redacted));
    }

    let (body_resolved, body_redacted) = match req.body.body_type.as_str() {
        "none" => (None, None),
        "form" => (None, None),
        _ => {
            if let Some(content) = &req.body.content {
                let r = resolve_traced(content, env_ctx)?;
                (Some(r.resolved), Some(r.redacted))
            } else {
                (None, None)
            }
        }
    };

    let mut fields = Vec::new();
    if req.body.body_type == "form" {
        for field in &req.body.fields {
            if field.enabled {
                let fv = resolve_all_vars(&field.value, env_ctx)?;
                fields.push((field.name.clone(), fv));
            }
        }
    }

    let auth_token = if let Some(t) = &req.auth.token {
        Some(resolve_all_vars(t, env_ctx)?)
    } else {
        None
    };
    let auth_password = if let Some(p) = &req.auth.password {
        Some(resolve_all_vars(p, env_ctx)?)
    } else {
        None
    };
    let auth_value = if let Some(v) = &req.auth.value {
        Some(resolve_all_vars(v, env_ctx)?)
    } else {
        None
    };

    Ok(ResolvedVars {
        url,
        headers_resolved,
        headers_redacted,
        query_resolved,
        query_redacted,
        body_resolved,
        body_redacted,
        fields,
        auth_token,
        auth_password,
        auth_value,
    })
}

/// Scan all environments in the workspace to find which one defines the missing variable.
fn enrich_unresolved_var(
    root: &std::path::Path,
    var_name: &str,
    active_env: Option<&str>,
) -> ApiClientError {
    if let Ok(env_names) = env::list_environments(root) {
        for name in &env_names {
            if active_env == Some(name.as_str()) {
                continue;
            }
            if let Ok(environment) = env::load_environment(root, name) {
                if environment.vars.contains_key(var_name) {
                    return ApiClientError::UnresolvedVar(format!(
                        "{var_name} — the '{name}' environment defines it, switch environments in the Variables dropdown"
                    ));
                }
            }
        }
    }
    ApiClientError::UnresolvedVar(var_name.to_string())
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
// Prepare phase — parse/inherit/env-resolve, no network
// ---------------------------------------------------------------------------

/// Prepare a request for sending: parse, resolve inheritance, resolve env vars.
/// Returns a PreparedRequest with request_id assigned, or an error (e.g.
/// UNRESOLVED_VAR) that short-circuits before any network I/O.
pub async fn prepare(
    workspace_path: &str,
    request_path: &str,
    env_name: Option<&str>,
) -> Result<PreparedRequest, ApiClientError> {
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

    // 4. Resolve variables — UNRESOLVED_VAR error before network
    //    If resolution fails, enrich the error with a hint about which env defines
    //    the missing variable (if any).
    let resolve_result = resolve_request_vars(&req, &env_ctx);
    let resolved = match resolve_result {
        Ok(r) => r,
        Err(ApiClientError::UnresolvedVar(ref var_name)) => {
            return Err(enrich_unresolved_var(root, var_name, env_name));
        }
        Err(e) => return Err(e),
    };

    let url_result = resolved.url;
    let headers_resolved = resolved.headers_resolved;
    let headers_redacted = resolved.headers_redacted;
    let query_resolved = resolved.query_resolved;
    let query_redacted = resolved.query_redacted;
    let body_resolved = resolved.body_resolved;
    let body_redacted = resolved.body_redacted;
    let fields = resolved.fields;
    let auth_token = resolved.auth_token;
    let auth_password = resolved.auth_password;
    let auth_value = resolved.auth_value;

    // 5. Validate URL structure before any network I/O
    if let Err(e) = url::Url::parse(&url_result.resolved) {
        let hint = if !url_result.resolved.contains("://") {
            format!(
                "\"{}\" is not a valid URL — it needs a scheme, e.g. http://{}",
                url_result.redacted, url_result.redacted
            )
        } else {
            format!("\"{}\" is not a valid URL: {}", url_result.redacted, e)
        };
        return Err(ApiClientError::InvalidUrl(hint));
    }

    let request_id = Uuid::new_v4().to_string();

    Ok(PreparedRequest {
        request_id,
        method: req.method.clone(),
        url_resolved: url_result.resolved,
        url_redacted: url_result.redacted,
        headers_resolved,
        headers_redacted,
        query_resolved,
        query_redacted,
        body_resolved,
        body_redacted,
        auth_token,
        auth_password,
        auth_value,
        auth_type: req.auth.auth_type.clone(),
        auth_username: req.auth.username.clone(),
        auth_key: req.auth.key.clone(),
        auth_location: req.auth.location.clone(),
        body_type: req.body.body_type.clone(),
        body_content_type: req.body.content_type.clone(),
        fields,
        settings: PreparedSettings {
            timeout_ms: req.settings.timeout_ms,
            follow_redirects: req.settings.follow_redirects,
            verify_tls: req.settings.verify_tls,
        },
    })
}

// ---------------------------------------------------------------------------
// Perform phase — network I/O with the prepared request
// ---------------------------------------------------------------------------

/// Execute the HTTP call from a PreparedRequest. Registers the request_id in
/// the cancel map before starting, and always removes it on completion.
pub async fn perform(prepared: &PreparedRequest) -> Result<SendResponse, ApiClientError> {
    let request_id = &prepared.request_id;

    let redirect_policy = if prepared.settings.follow_redirects {
        Policy::limited(10)
    } else {
        Policy::none()
    };

    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(
            prepared.settings.timeout_ms,
        ))
        .redirect(redirect_policy);

    if !prepared.settings.verify_tls {
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

    let method = reqwest::Method::from_bytes(prepared.method.as_bytes()).map_err(|_| {
        ApiClientError::Parse {
            file: String::new(),
            detail: format!("invalid HTTP method: {}", prepared.method),
        }
    })?;

    let mut request_builder = client.request(method.clone(), &prepared.url_resolved);

    for (k, v) in &prepared.headers_resolved {
        request_builder = request_builder.header(k.as_str(), v.as_str());
    }

    if !prepared.query_resolved.is_empty() {
        request_builder = request_builder.query(&prepared.query_resolved);
    }

    // Auth
    match prepared.auth_type.as_str() {
        "bearer" => {
            if let Some(token) = &prepared.auth_token {
                request_builder =
                    request_builder.header("Authorization", format!("Bearer {}", token));
            }
        }
        "basic" => {
            if let (Some(user), pass) = (&prepared.auth_username, &prepared.auth_password) {
                request_builder =
                    request_builder.basic_auth(user, pass.as_ref().map(|s| s.as_str()));
            }
        }
        "apikey" => {
            if let (Some(key), Some(val)) = (&prepared.auth_key, &prepared.auth_value) {
                let location = prepared.auth_location.as_deref().unwrap_or("header");
                if location == "header" {
                    request_builder = request_builder.header(key.as_str(), val.as_str());
                }
                if location == "query" {
                    request_builder = request_builder.query(&[(key.as_str(), val.as_str())]);
                }
            }
        }
        _ => {}
    }

    // Body
    match prepared.body_type.as_str() {
        "json" => {
            if let Some(body_content) = &prepared.body_resolved {
                request_builder = request_builder
                    .header("Content-Type", "application/json")
                    .body(body_content.clone());
            }
        }
        "raw" => {
            if let Some(body_content) = &prepared.body_resolved {
                if let Some(ct) = &prepared.body_content_type {
                    request_builder = request_builder.header("Content-Type", ct.as_str());
                }
                request_builder = request_builder.body(body_content.clone());
            }
        }
        "form" => {
            if !prepared.fields.is_empty() {
                request_builder = request_builder.form(&prepared.fields);
            }
        }
        _ => {
            if let Some(body_content) = &prepared.body_resolved {
                request_builder = request_builder.body(body_content.clone());
            }
        }
    }

    // Execute with timing — wrapped to guarantee cancel-map cleanup
    let result = perform_inner(
        request_id,
        request_builder,
        &mut cancel_rx,
        &method,
        &prepared.url_redacted,
    )
    .await;

    // Always cleanup cancel token, regardless of success or error
    cleanup_cancel(request_id).await;

    result
}

// ---------------------------------------------------------------------------
// Convenience: prepare + perform in one call (used by tests)
// ---------------------------------------------------------------------------

pub async fn execute_send(
    workspace_path: &str,
    request_path: &str,
    env_name: Option<&str>,
) -> Result<SendResponse, ApiClientError> {
    let prepared = prepare(workspace_path, request_path, env_name).await?;
    perform(&prepared).await
}

// ---------------------------------------------------------------------------
// Inner perform — separated so the caller can guarantee cleanup
// ---------------------------------------------------------------------------

async fn perform_inner(
    request_id: &str,
    request_builder: reqwest::RequestBuilder,
    cancel_rx: &mut tokio::sync::watch::Receiver<bool>,
    method: &reqwest::Method,
    url_redacted: &str,
) -> Result<SendResponse, ApiClientError> {
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
        _ = wait_for_cancel(cancel_rx) => {
            return Err(ApiClientError::Cancelled(request_id.to_string()));
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

    let body_bytes = tokio::select! {
        res = read_body_capped(response) => res?,
        _ = wait_for_cancel(cancel_rx) => {
            return Err(ApiClientError::Cancelled(request_id.to_string()));
        }
    };

    let total_ms = start.elapsed().as_millis() as u64;
    let download_ms = total_ms.saturating_sub(first_byte_ms);

    let body_size = body_bytes.len();
    let truncated = body_size >= MAX_BODY_BYTES;

    let is_binary = is_binary_content(&content_type, &body_bytes);
    let body_string = if is_binary {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(&body_bytes)
    } else {
        String::from_utf8_lossy(&body_bytes).into_owned()
    };

    Ok(SendResponse {
        request_id: request_id.to_string(),
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
        url_resolved: url_redacted.to_string(),
        method: method.to_string(),
    })
}

// ---------------------------------------------------------------------------
// Body reading and binary detection
// ---------------------------------------------------------------------------

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
    if ct_lower.contains("octet-stream")
        || ct_lower.contains("image/")
        || ct_lower.contains("audio/")
        || ct_lower.contains("video/")
        || ct_lower.contains("application/pdf")
        || ct_lower.contains("application/zip")
    {
        return true;
    }
    std::str::from_utf8(body).is_err()
}

// ---------------------------------------------------------------------------
// Cancellation helpers
// ---------------------------------------------------------------------------

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
    for tx in map.values() {
        let _ = tx.send(true);
    }
}

// ---------------------------------------------------------------------------
// Test-only: prepare with injected EnvContext (bypasses env file loading)
// ---------------------------------------------------------------------------

#[cfg(test)]
pub fn prepare_with_ctx(
    workspace_path: &str,
    request_path: &str,
    ctx: EnvContext,
) -> Result<PreparedRequest, ApiClientError> {
    let root = std::path::Path::new(workspace_path);
    let raw = workspace::read_file(root, request_path)?;
    let req = super::format::parse_request(&raw, request_path).map_err(|detail| {
        ApiClientError::Parse {
            file: request_path.to_string(),
            detail,
        }
    })?;
    let req = resolve_inheritance(root, request_path, req)?;

    let url_result = resolve_traced(&req.url, &ctx)?;

    if let Err(e) = url::Url::parse(&url_result.resolved) {
        let hint = if !url_result.resolved.contains("://") {
            format!(
                "\"{}\" is not a valid URL — it needs a scheme, e.g. http://{}",
                url_result.redacted, url_result.redacted
            )
        } else {
            format!("\"{}\" is not a valid URL: {}", url_result.redacted, e)
        };
        return Err(ApiClientError::InvalidUrl(hint));
    }

    let mut headers_resolved: Vec<(String, String)> = Vec::new();
    let mut headers_redacted: Vec<(String, String)> = Vec::new();
    for (k, v) in &req.headers {
        let rk = resolve_traced(k, &ctx)?;
        let rv = resolve_traced(v, &ctx)?;
        headers_resolved.push((rk.resolved.clone(), rv.resolved.clone()));
        headers_redacted.push((rk.redacted, rv.redacted));
    }

    let mut query_resolved: Vec<(String, String)> = Vec::new();
    let mut query_redacted: Vec<(String, String)> = Vec::new();
    for (k, v) in &req.query {
        let rk = resolve_traced(k, &ctx)?;
        let rv = resolve_traced(v, &ctx)?;
        query_resolved.push((rk.resolved.clone(), rv.resolved.clone()));
        query_redacted.push((rk.redacted, rv.redacted));
    }

    let (body_resolved, body_redacted) = match req.body.body_type.as_str() {
        "none" | "form" => (None, None),
        _ => {
            if let Some(content) = &req.body.content {
                let r = resolve_traced(content, &ctx)?;
                (Some(r.resolved), Some(r.redacted))
            } else {
                (None, None)
            }
        }
    };

    let mut fields = Vec::new();
    if req.body.body_type == "form" {
        for field in &req.body.fields {
            if field.enabled {
                let fv = resolve_all_vars(&field.value, &ctx)?;
                fields.push((field.name.clone(), fv));
            }
        }
    }

    let auth_token = if let Some(t) = &req.auth.token {
        Some(resolve_all_vars(t, &ctx)?)
    } else {
        None
    };
    let auth_password = if let Some(p) = &req.auth.password {
        Some(resolve_all_vars(p, &ctx)?)
    } else {
        None
    };
    let auth_value = if let Some(v) = &req.auth.value {
        Some(resolve_all_vars(v, &ctx)?)
    } else {
        None
    };

    let request_id = Uuid::new_v4().to_string();

    Ok(PreparedRequest {
        request_id,
        method: req.method.clone(),
        url_resolved: url_result.resolved,
        url_redacted: url_result.redacted,
        headers_resolved,
        headers_redacted,
        query_resolved,
        query_redacted,
        body_resolved,
        body_redacted,
        auth_token,
        auth_password,
        auth_value,
        auth_type: req.auth.auth_type.clone(),
        auth_username: req.auth.username.clone(),
        auth_key: req.auth.key.clone(),
        auth_location: req.auth.location.clone(),
        body_type: req.body.body_type.clone(),
        body_content_type: req.body.content_type.clone(),
        fields,
        settings: PreparedSettings {
            timeout_ms: req.settings.timeout_ms,
            follow_redirects: req.settings.follow_redirects,
            verify_tls: req.settings.verify_tls,
        },
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schemeless_url_returns_invalid_url_error() {
        let tmp = tempfile::tempdir().unwrap();
        crate::core::workspace::create(tmp.path(), Some("URLTest")).unwrap();

        let req_content =
            "version = 1\nname = \"bad\"\nmethod = \"GET\"\nurl = \"example.com/api\"\n";
        crate::core::workspace::write_file(tmp.path(), "requests/bad.req.toml", req_content)
            .unwrap();

        let ctx = EnvContext::empty();
        let err = prepare_with_ctx(tmp.path().to_str().unwrap(), "requests/bad.req.toml", ctx)
            .unwrap_err();

        assert!(
            matches!(err, ApiClientError::InvalidUrl(_)),
            "expected InvalidUrl, got: {err}"
        );
        let msg = err.to_string();
        assert!(
            msg.contains("http://"),
            "error should suggest adding http://: {msg}"
        );
    }

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

    #[test]
    fn resolve_traced_with_populated_secret_redacts_and_reports() {
        let ctx = EnvContext {
            vars: HashMap::from([("HOST".to_string(), "api.example.com".to_string())]),
            secret_values: vec![("API_SECRET".to_string(), "sk-live-9x8y7z".to_string())],
        };
        let result = resolve_traced("https://{{HOST}}/v1?token={{API_SECRET}}", &ctx).unwrap();

        assert_eq!(
            result.resolved,
            "https://api.example.com/v1?token=sk-live-9x8y7z"
        );
        assert!(!result.redacted.contains("sk-live-9x8y7z"));
        assert!(result.redacted.contains("•••"));
        assert_eq!(result.secret_names, vec!["API_SECRET".to_string()]);
    }

    #[test]
    fn redacted_snapshot_replaces_secret_in_url_headers_body() {
        let tmp = tempfile::tempdir().unwrap();
        crate::core::workspace::create(tmp.path(), Some("Test")).unwrap();

        let req_content = r#"
version = 1
name = "Redact test"
method = "POST"
url = "https://api.test/v1?key={{SECRET}}"

[headers]
Authorization = "Bearer {{SECRET}}"

[body]
type = "json"
content = '{"token":"{{SECRET}}"}'
"#;
        crate::core::workspace::write_file(tmp.path(), "requests/redact.req.toml", req_content)
            .unwrap();

        let ctx = EnvContext {
            vars: HashMap::new(),
            secret_values: vec![("SECRET".to_string(), "real-secret-val-42".to_string())],
        };

        let prepared = prepare_with_ctx(
            tmp.path().to_str().unwrap(),
            "requests/redact.req.toml",
            ctx,
        )
        .unwrap();

        // Wire variants contain the real value
        assert!(prepared.url_resolved.contains("real-secret-val-42"));
        assert!(prepared.headers_resolved[0]
            .1
            .contains("real-secret-val-42"));
        assert!(prepared
            .body_resolved
            .as_ref()
            .unwrap()
            .contains("real-secret-val-42"));

        // Redacted variants do NOT contain the real value
        assert!(!prepared.url_redacted.contains("real-secret-val-42"));
        assert!(!prepared.headers_redacted[0]
            .1
            .contains("real-secret-val-42"));
        assert!(!prepared
            .body_redacted
            .as_ref()
            .unwrap()
            .contains("real-secret-val-42"));

        // Redacted variants contain •••
        assert!(prepared.url_redacted.contains("•••"));
        assert!(prepared.headers_redacted[0].1.contains("•••"));
        assert!(prepared.body_redacted.as_ref().unwrap().contains("•••"));

        // redacted_snapshot uses the redacted variants
        let snapshot = prepared.redacted_snapshot();
        assert!(!snapshot.contains("real-secret-val-42"));
        assert!(snapshot.contains("•••"));
    }

    #[test]
    fn enrich_unresolved_var_names_defining_env() {
        let tmp = tempfile::tempdir().unwrap();
        crate::core::workspace::create(tmp.path(), Some("Test")).unwrap();

        let env_content = "version = 1\n\n[vars]\nAPI_KEY = \"abc123\"\n";
        crate::core::workspace::write_file(tmp.path(), "environments/staging.toml", env_content)
            .unwrap();

        let err = enrich_unresolved_var(tmp.path(), "API_KEY", None);
        let msg = err.to_string();
        assert!(msg.contains("staging"), "should name the env: {msg}");
        assert!(
            msg.contains("switch environments"),
            "should suggest switching: {msg}"
        );
    }

    #[test]
    fn enrich_unresolved_var_skips_active_env() {
        let tmp = tempfile::tempdir().unwrap();
        crate::core::workspace::create(tmp.path(), Some("Test")).unwrap();

        let env_content = "version = 1\n\n[vars]\nAPI_KEY = \"abc123\"\n";
        crate::core::workspace::write_file(tmp.path(), "environments/staging.toml", env_content)
            .unwrap();

        let err = enrich_unresolved_var(tmp.path(), "API_KEY", Some("staging"));
        let msg = err.to_string();
        assert!(
            !msg.contains("staging"),
            "should not suggest the active env: {msg}"
        );
    }

    #[test]
    fn enrich_unresolved_var_bare_name_when_undefined_everywhere() {
        let tmp = tempfile::tempdir().unwrap();
        crate::core::workspace::create(tmp.path(), Some("Test")).unwrap();

        let err = enrich_unresolved_var(tmp.path(), "TOTALLY_MISSING", None);
        let msg = err.to_string();
        assert!(
            msg.contains("TOTALLY_MISSING"),
            "should contain var name: {msg}"
        );
        assert!(
            !msg.contains("switch environments"),
            "no switch hint when undefined: {msg}"
        );
    }
}
