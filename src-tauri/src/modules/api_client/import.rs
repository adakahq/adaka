use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::format::{
    AuthConfig, BodyConfig, CollectionConfig, CollectionDefaults, FormField, RequestFile,
    RequestSettings, TestsConfig,
};
use crate::core::workspace;

// ---------------------------------------------------------------------------
// Import report — structured DTO returned to the frontend
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportReport {
    pub imported_count: usize,
    pub skipped: Vec<SkippedItem>,
    pub generated_env: Option<String>,
    pub files_written: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkippedItem {
    pub name: String,
    pub reason: String,
}

// ---------------------------------------------------------------------------
// Postman Collection v2.1 JSON types (subset we care about)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct PostmanCollection {
    info: PostmanInfo,
    #[serde(default)]
    item: Vec<PostmanItem>,
    #[serde(default)]
    variable: Vec<PostmanVariable>,
    #[serde(default)]
    auth: Option<PostmanAuth>,
}

#[derive(Debug, Deserialize)]
struct PostmanInfo {
    #[allow(dead_code)]
    name: String,
    #[serde(default)]
    schema: String,
}

#[derive(Debug, Deserialize)]
struct PostmanItem {
    name: String,
    #[serde(default)]
    item: Option<Vec<PostmanItem>>,
    #[serde(default)]
    request: Option<PostmanRequest>,
    #[serde(default)]
    event: Option<Vec<PostmanEvent>>,
}

#[derive(Debug, Deserialize)]
struct PostmanRequest {
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    url: Option<PostmanUrl>,
    #[serde(default)]
    header: Option<Vec<PostmanKeyValue>>,
    #[serde(default)]
    body: Option<PostmanBody>,
    #[serde(default)]
    auth: Option<PostmanAuth>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum PostmanUrl {
    Simple(String),
    Structured(PostmanUrlStructured),
}

#[derive(Debug, Deserialize)]
struct PostmanUrlStructured {
    raw: Option<String>,
    #[serde(default)]
    query: Option<Vec<PostmanKeyValue>>,
}

#[derive(Debug, Deserialize)]
struct PostmanKeyValue {
    key: String,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    disabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct PostmanBody {
    mode: Option<String>,
    #[serde(default)]
    raw: Option<String>,
    #[serde(default)]
    urlencoded: Option<Vec<PostmanKeyValue>>,
    #[serde(default)]
    formdata: Option<Vec<PostmanFormDataItem>>,
    #[serde(default)]
    options: Option<PostmanBodyOptions>,
}

#[derive(Debug, Deserialize)]
struct PostmanBodyOptions {
    #[serde(default)]
    raw: Option<PostmanRawOptions>,
}

#[derive(Debug, Deserialize)]
struct PostmanRawOptions {
    #[serde(default)]
    language: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PostmanFormDataItem {
    key: String,
    #[serde(default)]
    value: Option<String>,
    #[serde(rename = "type", default)]
    item_type: Option<String>,
    #[serde(default)]
    disabled: Option<bool>,
    #[serde(default)]
    #[allow(dead_code)]
    src: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct PostmanAuth {
    #[serde(rename = "type")]
    auth_type: String,
    #[serde(default)]
    bearer: Option<Vec<PostmanKeyValue>>,
    #[serde(default)]
    basic: Option<Vec<PostmanKeyValue>>,
    #[serde(default)]
    apikey: Option<Vec<PostmanKeyValue>>,
}

#[derive(Debug, Deserialize)]
struct PostmanVariable {
    key: String,
    #[serde(default)]
    value: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PostmanEvent {
    listen: String,
    #[serde(default)]
    script: Option<PostmanScript>,
}

#[derive(Debug, Deserialize)]
struct PostmanScript {
    #[serde(default)]
    exec: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Import logic
// ---------------------------------------------------------------------------

pub fn import_postman(
    root: &Path,
    json_content: &str,
    target_folder: &str,
) -> Result<ImportReport, String> {
    let collection: PostmanCollection =
        serde_json::from_str(json_content).map_err(|e| format!("Invalid Postman JSON: {e}"))?;

    // Validate schema — we accept v2.1.0 (the only export format Postman supports now)
    if !collection.info.schema.is_empty()
        && !collection.info.schema.contains("v2.1")
        && !collection.info.schema.contains("v2.0")
    {
        return Err(format!(
            "Unsupported Postman schema: {}. Only Collection v2.1 and v2.0 are supported.",
            collection.info.schema
        ));
    }

    let mut report = ImportReport {
        imported_count: 0,
        skipped: Vec::new(),
        generated_env: None,
        files_written: Vec::new(),
    };

    // Process items recursively
    let base_folder = if target_folder.is_empty() {
        "requests".to_string()
    } else {
        format!("requests/{target_folder}")
    };

    process_items(root, &collection.item, &base_folder, &mut report)?;

    // Generate environment from collection variables
    if !collection.variable.is_empty() {
        let env_name = unique_env_name(root, "imported");
        let env_content = generate_env_toml(&collection.variable);
        workspace::write_file(root, &format!("environments/{env_name}.toml"), &env_content)
            .map_err(|e| format!("Failed to write environment: {e}"))?;
        report.generated_env = Some(env_name.clone());
        report
            .files_written
            .push(format!("environments/{env_name}.toml"));
    }

    // Map collection-level auth to collection.toml defaults if present
    if let Some(ref auth) = collection.auth {
        let mapped = map_auth(auth);
        if mapped.auth_type != "inherit" && mapped.auth_type != "none" {
            let coll_path = format!("{base_folder}/collection.toml");
            // Read existing or create new
            let existing = workspace::read_file(root, &coll_path).ok();
            let mut coll_config = match &existing {
                Some(raw) => super::format::parse_collection(raw, &coll_path)
                    .unwrap_or_else(|_| default_collection()),
                None => default_collection(),
            };
            coll_config.defaults.auth = Some(mapped);
            let coll_toml = serialize_collection(&coll_config);
            workspace::write_file(root, &coll_path, &coll_toml)
                .map_err(|e| format!("Failed to write collection.toml: {e}"))?;
        }
    }

    Ok(report)
}

fn process_items(
    root: &Path,
    items: &[PostmanItem],
    folder: &str,
    report: &mut ImportReport,
) -> Result<(), String> {
    let mut order: Vec<String> = Vec::new();

    for item in items {
        if let Some(ref children) = item.item {
            // This is a folder
            let folder_slug = slugify(&item.name);
            let subfolder = format!("{folder}/{folder_slug}");

            // Create collection.toml for subfolder
            let coll_path = format!("{subfolder}/collection.toml");
            process_items(root, children, &subfolder, report)?;

            // Read back or create the collection.toml to set order
            let existing = workspace::read_file(root, &coll_path).ok();
            if existing.is_none() {
                let coll = default_collection();
                let coll_toml = serialize_collection(&coll);
                workspace::write_file(root, &coll_path, &coll_toml)
                    .map_err(|e| format!("Failed to write {coll_path}: {e}"))?;
                report.files_written.push(coll_path);
            }

            order.push(folder_slug);
        } else if let Some(ref request) = item.request {
            // This is a request
            let slug = slugify(&item.name);
            let req_path = format!("{folder}/{slug}.req.toml");

            let mut skips: Vec<SkippedItem> = Vec::new();

            let req_file = convert_request(&item.name, request, &mut skips);

            // Check for scripts
            if let Some(ref events) = item.event {
                for ev in events {
                    let has_script = ev
                        .script
                        .as_ref()
                        .and_then(|s| s.exec.as_ref())
                        .map(|exec| match exec {
                            serde_json::Value::Array(arr) => {
                                !arr.is_empty()
                                    && !arr.iter().all(|v| {
                                        v.as_str().map(|s| s.trim().is_empty()).unwrap_or(true)
                                    })
                            }
                            serde_json::Value::String(s) => !s.trim().is_empty(),
                            _ => false,
                        })
                        .unwrap_or(false);

                    if has_script {
                        skips.push(SkippedItem {
                            name: item.name.clone(),
                            reason: format!(
                                "{} script not imported (scripting not yet supported)",
                                if ev.listen == "prerequest" {
                                    "Pre-request"
                                } else {
                                    "Test"
                                }
                            ),
                        });
                    }
                }
            }

            let toml = super::format::serialize_request(&req_file, None)
                .map_err(|e| format!("Failed to serialize {}: {e}", item.name))?;
            workspace::write_file(root, &req_path, &toml)
                .map_err(|e| format!("Failed to write {req_path}: {e}"))?;

            report.imported_count += 1;
            report.files_written.push(req_path);
            report.skipped.append(&mut skips);
            order.push(slug);
        }
    }

    // Write/update collection.toml with ordering
    if !order.is_empty() {
        let coll_path = format!("{folder}/collection.toml");
        let existing = workspace::read_file(root, &coll_path).ok();
        let mut coll_config = match &existing {
            Some(raw) => super::format::parse_collection(raw, &coll_path)
                .unwrap_or_else(|_| default_collection()),
            None => default_collection(),
        };
        coll_config.order = order;
        let coll_toml = serialize_collection(&coll_config);
        workspace::write_file(root, &coll_path, &coll_toml)
            .map_err(|e| format!("Failed to write {coll_path}: {e}"))?;
        if !report.files_written.contains(&coll_path) {
            report.files_written.push(coll_path);
        }
    }

    Ok(())
}

fn convert_request(name: &str, req: &PostmanRequest, skips: &mut Vec<SkippedItem>) -> RequestFile {
    let method = req.method.as_deref().unwrap_or("GET").to_uppercase();

    let url = match &req.url {
        Some(PostmanUrl::Simple(s)) => s.clone(),
        Some(PostmanUrl::Structured(s)) => s.raw.clone().unwrap_or_default(),
        None => String::new(),
    };

    // Headers
    let mut headers = BTreeMap::new();
    let mut headers_disabled = BTreeMap::new();
    if let Some(ref header_list) = req.header {
        for h in header_list {
            let val = h.value.clone().unwrap_or_default();
            if h.disabled.unwrap_or(false) {
                headers_disabled.insert(h.key.clone(), val);
            } else {
                headers.insert(h.key.clone(), val);
            }
        }
    }

    // Query params from structured URL
    let mut query = BTreeMap::new();
    let mut query_disabled = BTreeMap::new();
    if let Some(PostmanUrl::Structured(ref s)) = req.url {
        if let Some(ref params) = s.query {
            for p in params {
                let val = p.value.clone().unwrap_or_default();
                if p.disabled.unwrap_or(false) {
                    query_disabled.insert(p.key.clone(), val);
                } else {
                    query.insert(p.key.clone(), val);
                }
            }
        }
    }

    // Auth
    let auth = req.auth.as_ref().map(map_auth).unwrap_or_default();

    // Body
    let (body, body_skips) = req
        .body
        .as_ref()
        .map(|b| map_body(name, b))
        .unwrap_or_else(|| (BodyConfig::default(), Vec::new()));
    skips.extend(body_skips);

    // Auth skip reporting for unsupported types
    if let Some(ref pm_auth) = req.auth {
        let t = pm_auth.auth_type.as_str();
        if !matches!(t, "bearer" | "basic" | "apikey" | "noauth" | "inherit") {
            skips.push(SkippedItem {
                name: name.to_string(),
                reason: format!("Auth type '{t}' not supported — imported without auth"),
            });
        }
    }

    RequestFile {
        version: 1,
        name: name.to_string(),
        method,
        url,
        headers,
        headers_disabled,
        query,
        query_disabled,
        auth,
        body,
        settings: RequestSettings::default(),
        tests: TestsConfig::default(),
    }
}

fn map_auth(auth: &PostmanAuth) -> AuthConfig {
    match auth.auth_type.as_str() {
        "bearer" => {
            let token = auth
                .bearer
                .as_ref()
                .and_then(|kvs| find_kv(kvs, "token"))
                .unwrap_or_default();
            AuthConfig {
                auth_type: "bearer".to_string(),
                token: Some(token),
                ..AuthConfig::default()
            }
        }
        "basic" => {
            let username = auth
                .basic
                .as_ref()
                .and_then(|kvs| find_kv(kvs, "username"))
                .unwrap_or_default();
            let password = auth
                .basic
                .as_ref()
                .and_then(|kvs| find_kv(kvs, "password"))
                .unwrap_or_default();
            AuthConfig {
                auth_type: "basic".to_string(),
                username: Some(username),
                password: Some(password),
                ..AuthConfig::default()
            }
        }
        "apikey" => {
            let key = auth
                .apikey
                .as_ref()
                .and_then(|kvs| find_kv(kvs, "key"))
                .unwrap_or_default();
            let value = auth
                .apikey
                .as_ref()
                .and_then(|kvs| find_kv(kvs, "value"))
                .unwrap_or_default();
            let location = auth
                .apikey
                .as_ref()
                .and_then(|kvs| find_kv(kvs, "in"))
                .unwrap_or_else(|| "header".to_string());
            AuthConfig {
                auth_type: "apikey".to_string(),
                key: Some(key),
                value: Some(value),
                location: Some(location),
                ..AuthConfig::default()
            }
        }
        "noauth" => AuthConfig {
            auth_type: "none".to_string(),
            ..AuthConfig::default()
        },
        _ => AuthConfig::default(),
    }
}

fn map_body(name: &str, body: &PostmanBody) -> (BodyConfig, Vec<SkippedItem>) {
    let mut skips = Vec::new();

    let mode = body.mode.as_deref().unwrap_or("none");

    match mode {
        "raw" => {
            let content = body.raw.clone().unwrap_or_default();
            let language = body
                .options
                .as_ref()
                .and_then(|o| o.raw.as_ref())
                .and_then(|r| r.language.as_ref())
                .map(|s| s.as_str())
                .unwrap_or("");

            let (body_type, content_type) = match language {
                "json" => ("json", Some("application/json")),
                "xml" => ("raw", Some("application/xml")),
                "html" => ("raw", Some("text/html")),
                "text" => ("raw", Some("text/plain")),
                _ => ("raw", None),
            };

            (
                BodyConfig {
                    body_type: body_type.to_string(),
                    content: Some(content),
                    content_type: content_type.map(|s| s.to_string()),
                    fields: Vec::new(),
                },
                skips,
            )
        }
        "urlencoded" => {
            let fields = body
                .urlencoded
                .as_ref()
                .map(|kvs| {
                    kvs.iter()
                        .map(|kv| FormField {
                            name: kv.key.clone(),
                            value: kv.value.clone().unwrap_or_default(),
                            enabled: !kv.disabled.unwrap_or(false),
                        })
                        .collect()
                })
                .unwrap_or_default();

            (
                BodyConfig {
                    body_type: "form-urlencoded".to_string(),
                    content: None,
                    content_type: None,
                    fields,
                },
                skips,
            )
        }
        "formdata" => {
            // Import text fields, skip file fields
            let mut fields = Vec::new();
            if let Some(ref items) = body.formdata {
                for fd in items {
                    let is_file = fd
                        .item_type
                        .as_deref()
                        .map(|t| t == "file")
                        .unwrap_or(false);
                    if is_file {
                        skips.push(SkippedItem {
                            name: name.to_string(),
                            reason: format!(
                                "Form-data file field '{}' skipped (file uploads not yet supported)",
                                fd.key
                            ),
                        });
                    } else {
                        fields.push(FormField {
                            name: fd.key.clone(),
                            value: fd.value.clone().unwrap_or_default(),
                            enabled: !fd.disabled.unwrap_or(false),
                        });
                    }
                }
            }

            if fields.is_empty() && !skips.is_empty() {
                // All fields were files — body becomes none
                (BodyConfig::default(), skips)
            } else {
                (
                    BodyConfig {
                        body_type: "form-urlencoded".to_string(),
                        content: None,
                        content_type: None,
                        fields,
                    },
                    skips,
                )
            }
        }
        _ => (BodyConfig::default(), skips),
    }
}

// ---------------------------------------------------------------------------
// cURL import
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurlParseResult {
    pub method: String,
    pub url: String,
    pub headers: BTreeMap<String, String>,
    pub body: Option<String>,
    pub body_type: String,
    pub warnings: Vec<String>,
}

/// Parse a curl command string into a CurlParseResult.
/// Handles common flags: -X, -H, -d/--data, --json, -u, -F (noted as unsupported).
pub fn parse_curl(input: &str) -> Result<CurlParseResult, String> {
    let input = input.trim();

    // Strip leading `curl` (with optional path prefix)
    let rest = if let Some(stripped) = input.strip_prefix("curl") {
        stripped
    } else if input.contains("curl ") {
        // e.g. "/usr/bin/curl ..." — find 'curl ' and take the rest
        let idx = input.find("curl ").unwrap();
        &input[idx + 4..]
    } else {
        return Err("Not a curl command".to_string());
    };

    let tokens = tokenize_shell(rest)?;

    let mut method: Option<String> = None;
    let mut url: Option<String> = None;
    let mut headers = BTreeMap::new();
    let mut data_parts: Vec<String> = Vec::new();
    let mut body_type = "none".to_string();
    let mut warnings = Vec::new();
    let mut is_json = false;
    let mut basic_auth: Option<String> = None;

    let mut i = 0;
    while i < tokens.len() {
        let tok = &tokens[i];

        if tok == "-X" || tok == "--request" {
            i += 1;
            if i < tokens.len() {
                method = Some(tokens[i].to_uppercase());
            }
        } else if tok == "-H" || tok == "--header" {
            i += 1;
            if i < tokens.len() {
                if let Some((k, v)) = tokens[i].split_once(':') {
                    headers.insert(k.trim().to_string(), v.trim().to_string());
                }
            }
        } else if tok == "-d" || tok == "--data" || tok == "--data-raw" || tok == "--data-binary" {
            i += 1;
            if i < tokens.len() {
                data_parts.push(tokens[i].clone());
                if body_type == "none" {
                    body_type = "raw".to_string();
                }
            }
        } else if tok == "--json" {
            i += 1;
            if i < tokens.len() {
                data_parts.push(tokens[i].clone());
                is_json = true;
            }
        } else if tok == "-u" || tok == "--user" {
            i += 1;
            if i < tokens.len() {
                basic_auth = Some(tokens[i].clone());
            }
        } else if tok == "-F" || tok == "--form" {
            i += 1;
            warnings.push("Form-data (-F) not supported — field skipped".to_string());
        } else if tok.starts_with('-') {
            // Skip known flags that take no argument
            if matches!(
                tok.as_str(),
                "-v" | "--verbose"
                    | "-s"
                    | "--silent"
                    | "-S"
                    | "--show-error"
                    | "-k"
                    | "--insecure"
                    | "-L"
                    | "--location"
                    | "-i"
                    | "--include"
                    | "-I"
                    | "--head"
                    | "--compressed"
            ) {
                if (tok == "-I" || tok == "--head") && method.is_none() {
                    method = Some("HEAD".to_string());
                }
                // no-arg, skip
            } else if tok.starts_with("--") && tok.contains('=') {
                // --flag=value style, skip
            } else {
                // Unknown flag that might take a value — skip the next token to be safe
                // but only if it looks like a flag pair
                if i + 1 < tokens.len() && !tokens[i + 1].starts_with('-') {
                    i += 1;
                }
            }
        } else if url.is_none() {
            // Bare argument is the URL
            url = Some(tok.clone());
        }

        i += 1;
    }

    let url = url.ok_or("No URL found in curl command")?;

    if is_json {
        body_type = "json".to_string();
        headers
            .entry("Content-Type".to_string())
            .or_insert_with(|| "application/json".to_string());
        headers
            .entry("Accept".to_string())
            .or_insert_with(|| "application/json".to_string());
    }

    // If data was provided but no content-type and not --json, check headers
    if !data_parts.is_empty() && !is_json {
        if let Some(ct) = headers.get("Content-Type") {
            if ct.contains("json") {
                body_type = "json".to_string();
            }
        }
    }

    let body = if data_parts.is_empty() {
        None
    } else {
        Some(data_parts.join("&"))
    };

    let method = method.unwrap_or_else(|| {
        if body.is_some() {
            "POST".to_string()
        } else {
            "GET".to_string()
        }
    });

    // Handle basic auth
    if let Some(ref creds) = basic_auth {
        if let Some((user, pass)) = creds.split_once(':') {
            headers.insert(
                "Authorization".to_string(),
                format!("Basic {}", base64_encode(&format!("{user}:{pass}"))),
            );
        }
    }

    Ok(CurlParseResult {
        method,
        url,
        headers,
        body,
        body_type,
        warnings,
    })
}

fn base64_encode(input: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(input)
}

/// Tokenize a shell command, handling single and double quotes and backslash escapes.
fn tokenize_shell(input: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = input.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        let c = chars[i];

        match c {
            ' ' | '\t' | '\n' | '\r' => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            '\\' if i + 1 < len => {
                let next = chars[i + 1];
                if next == '\n' || next == '\r' {
                    // Line continuation — skip both
                    i += 1;
                    if next == '\r' && i + 1 < len && chars[i + 1] == '\n' {
                        i += 1;
                    }
                } else {
                    current.push(next);
                    i += 1;
                }
            }
            '\'' => {
                i += 1;
                while i < len && chars[i] != '\'' {
                    current.push(chars[i]);
                    i += 1;
                }
                // skip closing quote
            }
            '"' => {
                i += 1;
                while i < len && chars[i] != '"' {
                    if chars[i] == '\\' && i + 1 < len {
                        let next = chars[i + 1];
                        match next {
                            '"' | '\\' | '$' | '`' => {
                                current.push(next);
                                i += 1;
                            }
                            _ => {
                                current.push('\\');
                                current.push(next);
                                i += 1;
                            }
                        }
                    } else {
                        current.push(chars[i]);
                    }
                    i += 1;
                }
                // skip closing quote
            }
            _ => {
                current.push(c);
            }
        }

        i += 1;
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    Ok(tokens)
}

// ---------------------------------------------------------------------------
// Copy-as-cURL export
// ---------------------------------------------------------------------------

/// Generate a curl command from a RequestFile.
/// `resolved_url` is the URL after env resolution (for display/copy).
/// `redact_secrets` — if true, secret values are replaced with placeholder names.
pub fn export_curl(req: &RequestFile, resolved_url: Option<&str>) -> String {
    let mut parts = vec!["curl".to_string()];

    // Method (omit for GET since it's default)
    if req.method != "GET" {
        parts.push("-X".to_string());
        parts.push(req.method.clone());
    }

    // URL
    let url = resolved_url.unwrap_or(&req.url);
    parts.push(shell_quote(url));

    // Headers
    for (k, v) in &req.headers {
        parts.push("-H".to_string());
        parts.push(shell_quote(&format!("{k}: {v}")));
    }

    // Auth
    match req.auth.auth_type.as_str() {
        "bearer" => {
            if let Some(ref token) = req.auth.token {
                parts.push("-H".to_string());
                parts.push(shell_quote(&format!("Authorization: Bearer {token}")));
            }
        }
        "basic" => {
            let user = req.auth.username.as_deref().unwrap_or("");
            let pass = req.auth.password.as_deref().unwrap_or("");
            parts.push("-u".to_string());
            parts.push(shell_quote(&format!("{user}:{pass}")));
        }
        "apikey" => {
            let key = req.auth.key.as_deref().unwrap_or("X-API-Key");
            let val = req.auth.value.as_deref().unwrap_or("");
            let loc = req.auth.location.as_deref().unwrap_or("header");
            if loc == "header" {
                parts.push("-H".to_string());
                parts.push(shell_quote(&format!("{key}: {val}")));
            }
            // query-param apikey can't be cleanly represented in curl flags
        }
        _ => {}
    }

    // Body
    match req.body.body_type.as_str() {
        "json" => {
            if let Some(ref content) = req.body.content {
                parts.push("--json".to_string());
                parts.push(shell_quote(content));
            }
        }
        "raw" => {
            if let Some(ref content) = req.body.content {
                parts.push("-d".to_string());
                parts.push(shell_quote(content));
                if let Some(ref ct) = req.body.content_type {
                    // Add content-type header if not already present
                    if !req.headers.contains_key("Content-Type") {
                        parts.push("-H".to_string());
                        parts.push(shell_quote(&format!("Content-Type: {ct}")));
                    }
                }
            }
        }
        "form-urlencoded" => {
            for field in &req.body.fields {
                if field.enabled {
                    parts.push("-d".to_string());
                    parts.push(shell_quote(&format!("{}={}", field.name, field.value)));
                }
            }
        }
        _ => {}
    }

    parts.join(" ")
}

fn shell_quote(s: &str) -> String {
    if s.chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | '/' | ':' | ',' | '='))
    {
        return s.to_string();
    }
    format!("'{}'", s.replace('\'', "'\\''"))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn slugify(name: &str) -> String {
    let slug: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();

    // Collapse runs of dashes and trim edges
    let mut result = String::new();
    let mut prev_dash = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_dash && !result.is_empty() {
                result.push('-');
            }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }
    result.trim_end_matches('-').to_string()
}

fn find_kv(kvs: &[PostmanKeyValue], key: &str) -> Option<String> {
    kvs.iter()
        .find(|kv| kv.key == key)
        .and_then(|kv| kv.value.clone())
}

fn generate_env_toml(vars: &[PostmanVariable]) -> String {
    let mut lines = vec![
        "version = 1".to_string(),
        String::new(),
        "[vars]".to_string(),
    ];
    for v in vars {
        let val = v.value.as_deref().unwrap_or("");
        // Escape TOML string value
        let escaped = val.replace('\\', "\\\\").replace('"', "\\\"");
        lines.push(format!("{} = \"{}\"", v.key, escaped));
    }
    lines.push(String::new());
    lines.join("\n")
}

fn unique_env_name(root: &Path, base: &str) -> String {
    let env_dir = root.join(".adaka").join("environments");
    if !env_dir.join(format!("{base}.toml")).exists() {
        return base.to_string();
    }
    for i in 2..100 {
        let candidate = format!("{base}-{i}");
        if !env_dir.join(format!("{candidate}.toml")).exists() {
            return candidate;
        }
    }
    format!("{base}-{}", rand::random::<u16>())
}

fn default_collection() -> CollectionConfig {
    CollectionConfig {
        version: 1,
        order: Vec::new(),
        defaults: CollectionDefaults::default(),
    }
}

fn serialize_collection(config: &CollectionConfig) -> String {
    let mut doc = toml_edit::DocumentMut::new();
    doc["version"] = toml_edit::value(config.version);

    let mut arr = toml_edit::Array::new();
    for item in &config.order {
        arr.push(item.as_str());
    }
    doc["order"] = toml_edit::Item::Value(toml_edit::Value::Array(arr));

    // defaults.headers
    if !config.defaults.headers.is_empty() {
        let mut defaults = toml_edit::Table::new();
        let mut h = toml_edit::Table::new();
        for (k, v) in &config.defaults.headers {
            h[k.as_str()] = toml_edit::value(v.as_str());
        }
        defaults["headers"] = toml_edit::Item::Table(h);
        doc["defaults"] = toml_edit::Item::Table(defaults);
    }

    // defaults.auth
    if let Some(ref auth) = config.defaults.auth {
        let defaults_item = doc
            .entry("defaults")
            .or_insert(toml_edit::Item::Table(toml_edit::Table::new()));
        if let Some(tbl) = defaults_item.as_table_mut() {
            let mut a = toml_edit::Table::new();
            a["type"] = toml_edit::value(auth.auth_type.as_str());
            if let Some(ref v) = auth.token {
                a["token"] = toml_edit::value(v.as_str());
            }
            if let Some(ref v) = auth.username {
                a["username"] = toml_edit::value(v.as_str());
            }
            if let Some(ref v) = auth.password {
                a["password"] = toml_edit::value(v.as_str());
            }
            if let Some(ref v) = auth.key {
                a["key"] = toml_edit::value(v.as_str());
            }
            if let Some(ref v) = auth.value {
                a["value"] = toml_edit::value(v.as_str());
            }
            if let Some(ref v) = auth.location {
                a["in"] = toml_edit::value(v.as_str());
            }
            tbl["auth"] = toml_edit::Item::Table(a);
        }
    }

    doc.to_string()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tmp_workspace() -> TempDir {
        let root = tempfile::tempdir().expect("failed to create temp dir");
        crate::core::workspace::create(root.path(), Some("Import Test")).unwrap();
        root
    }

    // -- Postman import tests ------------------------------------------------

    fn minimal_postman_json() -> String {
        serde_json::json!({
            "info": {
                "name": "Test Collection",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": [
                {
                    "name": "Get Users",
                    "request": {
                        "method": "GET",
                        "url": {
                            "raw": "{{BASE_URL}}/users",
                            "query": []
                        }
                    }
                }
            ]
        })
        .to_string()
    }

    #[test]
    fn import_minimal_collection() {
        let root = tmp_workspace();
        let json = minimal_postman_json();
        let report = import_postman(root.path(), &json, "").unwrap();

        assert_eq!(report.imported_count, 1);
        assert!(report.skipped.is_empty());

        // Verify the generated file is valid TOML we can parse back
        let raw = workspace::read_file(root.path(), "requests/get-users.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "get-users.req.toml").unwrap();
        assert_eq!(req.method, "GET");
        assert_eq!(req.url, "{{BASE_URL}}/users");
        assert_eq!(req.name, "Get Users");
    }

    #[test]
    fn import_nested_folders() {
        let root = tmp_workspace();
        let json = serde_json::json!({
            "info": { "name": "Nested", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
            "item": [
                {
                    "name": "Users",
                    "item": [
                        {
                            "name": "List Users",
                            "request": { "method": "GET", "url": { "raw": "/users" } }
                        },
                        {
                            "name": "Create User",
                            "request": {
                                "method": "POST",
                                "url": { "raw": "/users" },
                                "body": {
                                    "mode": "raw",
                                    "raw": "{\"name\": \"Ama\"}",
                                    "options": { "raw": { "language": "json" } }
                                }
                            }
                        }
                    ]
                }
            ]
        })
        .to_string();

        let report = import_postman(root.path(), &json, "").unwrap();
        assert_eq!(report.imported_count, 2);

        let raw = workspace::read_file(root.path(), "requests/users/list-users.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "list-users.req.toml").unwrap();
        assert_eq!(req.method, "GET");

        let raw = workspace::read_file(root.path(), "requests/users/create-user.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "create-user.req.toml").unwrap();
        assert_eq!(req.method, "POST");
        assert_eq!(req.body.body_type, "json");
    }

    #[test]
    fn import_all_auth_types() {
        let root = tmp_workspace();
        let json = serde_json::json!({
            "info": { "name": "Auth Test", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
            "item": [
                {
                    "name": "Bearer Auth",
                    "request": {
                        "method": "GET",
                        "url": { "raw": "/api" },
                        "auth": {
                            "type": "bearer",
                            "bearer": [{ "key": "token", "value": "{{API_TOKEN}}" }]
                        }
                    }
                },
                {
                    "name": "Basic Auth",
                    "request": {
                        "method": "GET",
                        "url": { "raw": "/api" },
                        "auth": {
                            "type": "basic",
                            "basic": [
                                { "key": "username", "value": "admin" },
                                { "key": "password", "value": "secret" }
                            ]
                        }
                    }
                },
                {
                    "name": "API Key Auth",
                    "request": {
                        "method": "GET",
                        "url": { "raw": "/api" },
                        "auth": {
                            "type": "apikey",
                            "apikey": [
                                { "key": "key", "value": "X-Api-Key" },
                                { "key": "value", "value": "my-secret-key" },
                                { "key": "in", "value": "header" }
                            ]
                        }
                    }
                },
                {
                    "name": "OAuth2 Auth",
                    "request": {
                        "method": "GET",
                        "url": { "raw": "/api" },
                        "auth": {
                            "type": "oauth2",
                            "oauth2": []
                        }
                    }
                },
                {
                    "name": "No Auth",
                    "request": {
                        "method": "GET",
                        "url": { "raw": "/api" },
                        "auth": { "type": "noauth" }
                    }
                }
            ]
        })
        .to_string();

        let report = import_postman(root.path(), &json, "").unwrap();
        assert_eq!(report.imported_count, 5);

        // Bearer
        let raw = workspace::read_file(root.path(), "requests/bearer-auth.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "bearer-auth.req.toml").unwrap();
        assert_eq!(req.auth.auth_type, "bearer");
        assert_eq!(req.auth.token, Some("{{API_TOKEN}}".to_string()));

        // Basic
        let raw = workspace::read_file(root.path(), "requests/basic-auth.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "basic-auth.req.toml").unwrap();
        assert_eq!(req.auth.auth_type, "basic");
        assert_eq!(req.auth.username, Some("admin".to_string()));

        // API Key
        let raw = workspace::read_file(root.path(), "requests/api-key-auth.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "api-key-auth.req.toml").unwrap();
        assert_eq!(req.auth.auth_type, "apikey");
        assert_eq!(req.auth.key, Some("X-Api-Key".to_string()));

        // OAuth2 — should be imported without auth + skip entry
        let raw = workspace::read_file(root.path(), "requests/oauth2-auth.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "oauth2-auth.req.toml").unwrap();
        assert_eq!(req.auth.auth_type, "inherit");
        assert!(report.skipped.iter().any(|s| s.reason.contains("oauth2")));

        // No auth
        let raw = workspace::read_file(root.path(), "requests/no-auth.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "no-auth.req.toml").unwrap();
        assert_eq!(req.auth.auth_type, "none");
    }

    #[test]
    fn import_body_types() {
        let root = tmp_workspace();
        let json = serde_json::json!({
            "info": { "name": "Body Test", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
            "item": [
                {
                    "name": "JSON Body",
                    "request": {
                        "method": "POST",
                        "url": { "raw": "/api" },
                        "body": {
                            "mode": "raw",
                            "raw": "{\"key\": \"value\"}",
                            "options": { "raw": { "language": "json" } }
                        }
                    }
                },
                {
                    "name": "URL Encoded",
                    "request": {
                        "method": "POST",
                        "url": { "raw": "/api" },
                        "body": {
                            "mode": "urlencoded",
                            "urlencoded": [
                                { "key": "username", "value": "admin" },
                                { "key": "disabled_field", "value": "x", "disabled": true }
                            ]
                        }
                    }
                },
                {
                    "name": "Form Data With File",
                    "request": {
                        "method": "POST",
                        "url": { "raw": "/upload" },
                        "body": {
                            "mode": "formdata",
                            "formdata": [
                                { "key": "name", "value": "test", "type": "text" },
                                { "key": "file", "type": "file", "src": "/path/to/file.png" }
                            ]
                        }
                    }
                }
            ]
        })
        .to_string();

        let report = import_postman(root.path(), &json, "").unwrap();
        assert_eq!(report.imported_count, 3);

        // JSON body
        let raw = workspace::read_file(root.path(), "requests/json-body.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "json-body.req.toml").unwrap();
        assert_eq!(req.body.body_type, "json");
        assert_eq!(req.body.content, Some("{\"key\": \"value\"}".to_string()));

        // URL encoded
        let raw = workspace::read_file(root.path(), "requests/url-encoded.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "url-encoded.req.toml").unwrap();
        assert_eq!(req.body.body_type, "form-urlencoded");
        assert_eq!(req.body.fields.len(), 2);
        assert!(!req.body.fields[1].enabled);

        // Form data — file field should be skipped
        assert!(report
            .skipped
            .iter()
            .any(|s| s.reason.contains("file") && s.reason.contains("file uploads")));
    }

    #[test]
    fn import_collection_variables_create_env() {
        let root = tmp_workspace();
        let json = serde_json::json!({
            "info": { "name": "Vars Test", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
            "item": [
                { "name": "Test", "request": { "method": "GET", "url": { "raw": "{{BASE_URL}}/test" } } }
            ],
            "variable": [
                { "key": "BASE_URL", "value": "http://localhost:3000" },
                { "key": "API_VERSION", "value": "v1" }
            ]
        })
        .to_string();

        let report = import_postman(root.path(), &json, "").unwrap();
        assert_eq!(report.generated_env, Some("imported".to_string()));

        // Verify env file was written and is parseable
        let raw = workspace::read_file(root.path(), "environments/imported.toml").unwrap();
        assert!(raw.contains("BASE_URL"));
        assert!(raw.contains("http://localhost:3000"));
    }

    #[test]
    fn import_scripts_reported() {
        let root = tmp_workspace();
        let json = serde_json::json!({
            "info": { "name": "Script Test", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
            "item": [
                {
                    "name": "With Scripts",
                    "request": { "method": "GET", "url": { "raw": "/api" } },
                    "event": [
                        {
                            "listen": "prerequest",
                            "script": { "exec": ["console.log('pre');"] }
                        },
                        {
                            "listen": "test",
                            "script": { "exec": ["pm.test('ok', function() {});"] }
                        }
                    ]
                }
            ]
        })
        .to_string();

        let report = import_postman(root.path(), &json, "").unwrap();
        assert_eq!(report.imported_count, 1);
        assert!(report
            .skipped
            .iter()
            .any(|s| s.reason.contains("Pre-request script")));
        assert!(report
            .skipped
            .iter()
            .any(|s| s.reason.contains("Test script")));
    }

    #[test]
    fn import_with_target_folder() {
        let root = tmp_workspace();
        let json = minimal_postman_json();
        let report = import_postman(root.path(), &json, "imported-api").unwrap();
        assert_eq!(report.imported_count, 1);

        let raw =
            workspace::read_file(root.path(), "requests/imported-api/get-users.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "get-users.req.toml").unwrap();
        assert_eq!(req.method, "GET");
    }

    #[test]
    fn import_headers_with_disabled() {
        let root = tmp_workspace();
        let json = serde_json::json!({
            "info": { "name": "Header Test", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
            "item": [{
                "name": "Headers",
                "request": {
                    "method": "GET",
                    "url": { "raw": "/api" },
                    "header": [
                        { "key": "Accept", "value": "application/json" },
                        { "key": "X-Debug", "value": "true", "disabled": true }
                    ]
                }
            }]
        })
        .to_string();

        let report = import_postman(root.path(), &json, "").unwrap();
        assert_eq!(report.imported_count, 1);

        let raw = workspace::read_file(root.path(), "requests/headers.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "headers.req.toml").unwrap();
        assert_eq!(req.headers.get("Accept").unwrap(), "application/json");
        assert_eq!(req.headers_disabled.get("X-Debug").unwrap(), "true");
    }

    #[test]
    fn import_query_params() {
        let root = tmp_workspace();
        let json = serde_json::json!({
            "info": { "name": "Query Test", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
            "item": [{
                "name": "Query Params",
                "request": {
                    "method": "GET",
                    "url": {
                        "raw": "/api?page=1&limit=10",
                        "query": [
                            { "key": "page", "value": "1" },
                            { "key": "limit", "value": "10" },
                            { "key": "debug", "value": "true", "disabled": true }
                        ]
                    }
                }
            }]
        })
        .to_string();

        let report = import_postman(root.path(), &json, "").unwrap();
        assert_eq!(report.imported_count, 1);

        let raw = workspace::read_file(root.path(), "requests/query-params.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "query-params.req.toml").unwrap();
        assert_eq!(req.query.get("page").unwrap(), "1");
        assert_eq!(req.query.get("limit").unwrap(), "10");
        assert_eq!(req.query_disabled.get("debug").unwrap(), "true");
    }

    #[test]
    fn import_roundtrip_all_files_parseable() {
        let root = tmp_workspace();
        let json = serde_json::json!({
            "info": { "name": "Roundtrip", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
            "item": [
                {
                    "name": "Auth Folder",
                    "item": [
                        {
                            "name": "Login",
                            "request": {
                                "method": "POST",
                                "url": { "raw": "{{BASE_URL}}/auth/login" },
                                "body": { "mode": "raw", "raw": "{}", "options": { "raw": { "language": "json" } } },
                                "auth": { "type": "basic", "basic": [{ "key": "username", "value": "admin" }, { "key": "password", "value": "pass" }] }
                            }
                        },
                        {
                            "name": "Logout",
                            "request": { "method": "POST", "url": { "raw": "{{BASE_URL}}/auth/logout" } }
                        }
                    ]
                },
                {
                    "name": "Get Status",
                    "request": { "method": "GET", "url": { "raw": "{{BASE_URL}}/status" } }
                }
            ],
            "variable": [
                { "key": "BASE_URL", "value": "http://localhost:8000" }
            ]
        })
        .to_string();

        let report = import_postman(root.path(), &json, "").unwrap();
        assert_eq!(report.imported_count, 3);

        // Every .req.toml file should parse without error
        for path in &report.files_written {
            if path.ends_with(".req.toml") {
                let raw = workspace::read_file(root.path(), path).unwrap();
                let result = super::super::format::parse_request(&raw, path);
                assert!(
                    result.is_ok(),
                    "Failed to parse {path}: {}",
                    result.unwrap_err()
                );
            }
        }

        // Collection.toml files should also parse
        for path in &report.files_written {
            if path.ends_with("collection.toml") {
                let raw = workspace::read_file(root.path(), path).unwrap();
                let result = super::super::format::parse_collection(&raw, path);
                assert!(
                    result.is_ok(),
                    "Failed to parse {path}: {}",
                    result.unwrap_err()
                );
            }
        }
    }

    #[test]
    fn import_collection_level_auth() {
        let root = tmp_workspace();
        let json = serde_json::json!({
            "info": { "name": "Collection Auth", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
            "auth": {
                "type": "bearer",
                "bearer": [{ "key": "token", "value": "{{GLOBAL_TOKEN}}" }]
            },
            "item": [
                { "name": "Test", "request": { "method": "GET", "url": { "raw": "/api" } } }
            ]
        })
        .to_string();

        let report = import_postman(root.path(), &json, "").unwrap();
        assert_eq!(report.imported_count, 1);

        // Collection.toml should have defaults.auth
        let raw = workspace::read_file(root.path(), "requests/collection.toml").unwrap();
        let coll = super::super::format::parse_collection(&raw, "collection.toml").unwrap();
        let auth = coll.defaults.auth.unwrap();
        assert_eq!(auth.auth_type, "bearer");
        assert_eq!(auth.token, Some("{{GLOBAL_TOKEN}}".to_string()));
    }

    #[test]
    fn import_simple_url_string() {
        let root = tmp_workspace();
        let json = serde_json::json!({
            "info": { "name": "Simple URL", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
            "item": [{
                "name": "Simple",
                "request": {
                    "method": "GET",
                    "url": "https://api.example.com/users"
                }
            }]
        })
        .to_string();

        let report = import_postman(root.path(), &json, "").unwrap();
        assert_eq!(report.imported_count, 1);

        let raw = workspace::read_file(root.path(), "requests/simple.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "simple.req.toml").unwrap();
        assert_eq!(req.url, "https://api.example.com/users");
    }

    // -- cURL parser tests ---------------------------------------------------

    #[test]
    fn curl_simple_get() {
        let result = parse_curl("curl https://api.example.com/users").unwrap();
        assert_eq!(result.method, "GET");
        assert_eq!(result.url, "https://api.example.com/users");
        assert!(result.body.is_none());
    }

    #[test]
    fn curl_post_with_data() {
        let result =
            parse_curl(r#"curl -X POST https://api.example.com/users -d '{"name":"Ama"}'"#)
                .unwrap();
        assert_eq!(result.method, "POST");
        assert_eq!(result.body, Some(r#"{"name":"Ama"}"#.to_string()));
    }

    #[test]
    fn curl_with_headers() {
        let result = parse_curl(
            r#"curl -H "Content-Type: application/json" -H "Authorization: Bearer tok123" https://api.example.com"#,
        )
        .unwrap();
        assert_eq!(
            result.headers.get("Content-Type").unwrap(),
            "application/json"
        );
        assert_eq!(
            result.headers.get("Authorization").unwrap(),
            "Bearer tok123"
        );
    }

    #[test]
    fn curl_json_shorthand() {
        let result =
            parse_curl(r#"curl --json '{"key":"value"}' https://api.example.com"#).unwrap();
        assert_eq!(result.method, "POST");
        assert_eq!(result.body_type, "json");
        assert_eq!(result.body, Some(r#"{"key":"value"}"#.to_string()));
        assert_eq!(
            result.headers.get("Content-Type").unwrap(),
            "application/json"
        );
    }

    #[test]
    fn curl_basic_auth() {
        let result = parse_curl("curl -u admin:password https://api.example.com").unwrap();
        assert!(result
            .headers
            .get("Authorization")
            .unwrap()
            .starts_with("Basic "));
    }

    #[test]
    fn curl_multiline_backslash() {
        let input = "curl \\\n  -X POST \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"key\": \"value\"}' \\\n  https://api.example.com";
        let result = parse_curl(input).unwrap();
        assert_eq!(result.method, "POST");
        assert_eq!(result.url, "https://api.example.com");
        assert_eq!(
            result.headers.get("Content-Type").unwrap(),
            "application/json"
        );
    }

    #[test]
    fn curl_double_quoted_url() {
        let result = parse_curl(r#"curl "https://api.example.com/search?q=hello world""#).unwrap();
        assert_eq!(result.url, "https://api.example.com/search?q=hello world");
    }

    #[test]
    fn curl_data_implies_post() {
        let result = parse_curl(r#"curl -d "name=Ama" https://api.example.com"#).unwrap();
        assert_eq!(result.method, "POST");
    }

    #[test]
    fn curl_head_method() {
        let result = parse_curl("curl -I https://api.example.com").unwrap();
        assert_eq!(result.method, "HEAD");
    }

    #[test]
    fn curl_form_data_warning() {
        let result =
            parse_curl(r#"curl -F "file=@/path/to/file" https://api.example.com"#).unwrap();
        assert!(!result.warnings.is_empty());
        assert!(result.warnings[0].contains("Form-data"));
    }

    #[test]
    fn curl_not_a_curl_command() {
        let result = parse_curl("wget https://example.com");
        assert!(result.is_err());
    }

    // -- cURL export tests ---------------------------------------------------

    #[test]
    fn export_simple_get() {
        let req = RequestFile {
            version: 1,
            name: "Test".to_string(),
            method: "GET".to_string(),
            url: "https://api.example.com/users".to_string(),
            headers: BTreeMap::new(),
            headers_disabled: BTreeMap::new(),
            query: BTreeMap::new(),
            query_disabled: BTreeMap::new(),
            auth: AuthConfig::default(),
            body: BodyConfig::default(),
            settings: RequestSettings::default(),
            tests: TestsConfig::default(),
        };
        let curl = export_curl(&req, None);
        assert_eq!(curl, "curl https://api.example.com/users");
    }

    #[test]
    fn export_post_with_json() {
        let req = RequestFile {
            version: 1,
            name: "Test".to_string(),
            method: "POST".to_string(),
            url: "https://api.example.com/users".to_string(),
            headers: BTreeMap::new(),
            headers_disabled: BTreeMap::new(),
            query: BTreeMap::new(),
            query_disabled: BTreeMap::new(),
            auth: AuthConfig::default(),
            body: BodyConfig {
                body_type: "json".to_string(),
                content: Some(r#"{"name": "Ama"}"#.to_string()),
                content_type: None,
                fields: Vec::new(),
            },
            settings: RequestSettings::default(),
            tests: TestsConfig::default(),
        };
        let curl = export_curl(&req, None);
        assert!(curl.contains("-X POST"));
        assert!(curl.contains("--json"));
        assert!(curl.contains(r#"{"name": "Ama"}"#));
    }

    #[test]
    fn export_with_bearer_auth() {
        let req = RequestFile {
            version: 1,
            name: "Test".to_string(),
            method: "GET".to_string(),
            url: "https://api.example.com".to_string(),
            headers: BTreeMap::new(),
            headers_disabled: BTreeMap::new(),
            query: BTreeMap::new(),
            query_disabled: BTreeMap::new(),
            auth: AuthConfig {
                auth_type: "bearer".to_string(),
                token: Some("my-token".to_string()),
                ..AuthConfig::default()
            },
            body: BodyConfig::default(),
            settings: RequestSettings::default(),
            tests: TestsConfig::default(),
        };
        let curl = export_curl(&req, None);
        assert!(curl.contains("Authorization: Bearer my-token"));
    }

    #[test]
    fn export_with_resolved_url() {
        let req = RequestFile {
            version: 1,
            name: "Test".to_string(),
            method: "GET".to_string(),
            url: "{{BASE_URL}}/users".to_string(),
            headers: BTreeMap::new(),
            headers_disabled: BTreeMap::new(),
            query: BTreeMap::new(),
            query_disabled: BTreeMap::new(),
            auth: AuthConfig::default(),
            body: BodyConfig::default(),
            settings: RequestSettings::default(),
            tests: TestsConfig::default(),
        };
        let curl = export_curl(&req, Some("https://api.example.com/users"));
        assert!(curl.contains("https://api.example.com/users"));
        assert!(!curl.contains("BASE_URL"));
    }

    // -- Slug tests ----------------------------------------------------------

    #[test]
    fn slug_basic() {
        assert_eq!(slugify("Get Users"), "get-users");
    }

    #[test]
    fn slug_special_chars() {
        assert_eq!(slugify("Create User (v2)"), "create-user-v2");
    }

    #[test]
    fn slug_consecutive_special() {
        assert_eq!(slugify("test -- thing"), "test-thing");
    }

    #[test]
    fn slug_trailing_special() {
        assert_eq!(slugify("hello-"), "hello");
    }

    // -- Shell tokenizer tests -----------------------------------------------

    #[test]
    fn tokenize_simple() {
        let tokens = tokenize_shell("hello world").unwrap();
        assert_eq!(tokens, vec!["hello", "world"]);
    }

    #[test]
    fn tokenize_single_quotes() {
        let tokens = tokenize_shell("'hello world' foo").unwrap();
        assert_eq!(tokens, vec!["hello world", "foo"]);
    }

    #[test]
    fn tokenize_double_quotes() {
        let tokens = tokenize_shell(r#""hello world" foo"#).unwrap();
        assert_eq!(tokens, vec!["hello world", "foo"]);
    }

    #[test]
    fn tokenize_escaped_in_double_quotes() {
        let tokens = tokenize_shell(r#""hello \"world\"" foo"#).unwrap();
        assert_eq!(tokens, vec![r#"hello "world""#, "foo"]);
    }

    #[test]
    fn tokenize_line_continuation() {
        let tokens = tokenize_shell("hello \\\nworld").unwrap();
        assert_eq!(tokens, vec!["hello", "world"]);
    }

    #[test]
    fn unique_env_name_no_collision() {
        let tmp = tempfile::tempdir().unwrap();
        crate::core::workspace::create(tmp.path(), Some("Test")).unwrap();
        assert_eq!(unique_env_name(tmp.path(), "imported"), "imported");
    }

    #[test]
    fn unique_env_name_collision_suffixes() {
        let tmp = tempfile::tempdir().unwrap();
        crate::core::workspace::create(tmp.path(), Some("Test")).unwrap();
        crate::core::workspace::write_file(
            tmp.path(),
            "environments/imported.toml",
            "version = 1\n[vars]\n",
        )
        .unwrap();
        assert_eq!(unique_env_name(tmp.path(), "imported"), "imported-2");

        crate::core::workspace::write_file(
            tmp.path(),
            "environments/imported-2.toml",
            "version = 1\n[vars]\n",
        )
        .unwrap();
        assert_eq!(unique_env_name(tmp.path(), "imported"), "imported-3");
    }
}
