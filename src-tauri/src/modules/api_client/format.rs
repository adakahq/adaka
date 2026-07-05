use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use toml_edit::DocumentMut;

// ---------------------------------------------------------------------------
// Request file (.req.toml) — M1 §3.1
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RequestFile {
    pub version: i64,
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub headers_disabled: BTreeMap<String, String>,
    #[serde(default)]
    pub query: BTreeMap<String, String>,
    #[serde(default)]
    pub query_disabled: BTreeMap<String, String>,
    #[serde(default)]
    pub auth: AuthConfig,
    #[serde(default)]
    pub body: BodyConfig,
    #[serde(default)]
    pub settings: RequestSettings,
    #[serde(default)]
    pub tests: TestsConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AuthConfig {
    #[serde(rename = "type", default = "default_auth_type")]
    pub auth_type: String,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub key: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(rename = "in", default)]
    pub location: Option<String>,
}

fn default_auth_type() -> String {
    "inherit".to_string()
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            auth_type: default_auth_type(),
            token: None,
            username: None,
            password: None,
            key: None,
            value: None,
            location: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BodyConfig {
    #[serde(rename = "type", default = "default_body_type")]
    pub body_type: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub fields: Vec<FormField>,
}

fn default_body_type() -> String {
    "none".to_string()
}

impl Default for BodyConfig {
    fn default() -> Self {
        Self {
            body_type: default_body_type(),
            content: None,
            content_type: None,
            fields: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FormField {
    pub name: String,
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RequestSettings {
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    #[serde(default = "default_true")]
    pub follow_redirects: bool,
    #[serde(default = "default_true")]
    pub verify_tls: bool,
}

fn default_timeout() -> u64 {
    30_000
}

impl Default for RequestSettings {
    fn default() -> Self {
        Self {
            timeout_ms: default_timeout(),
            follow_redirects: true,
            verify_tls: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct TestsConfig {
    #[serde(default)]
    pub status: Option<u16>,
}

// ---------------------------------------------------------------------------
// Collection file (collection.toml) — M1 §3.2
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CollectionConfig {
    pub version: i64,
    #[serde(default)]
    pub order: Vec<String>,
    #[serde(default)]
    pub defaults: CollectionDefaults,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct CollectionDefaults {
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub auth: Option<AuthConfig>,
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

pub fn parse_request(raw: &str, file_hint: &str) -> Result<RequestFile, String> {
    let _doc: DocumentMut = raw
        .parse()
        .map_err(|e: toml_edit::TomlError| e.to_string())?;

    let mut req: RequestFile = toml_edit::de::from_str(raw).map_err(|e| e.to_string())?;

    if req.name.is_empty() {
        req.name = filename_stem(file_hint);
    }

    Ok(req)
}

pub fn parse_collection(raw: &str, _file_hint: &str) -> Result<CollectionConfig, String> {
    let _doc: DocumentMut = raw
        .parse()
        .map_err(|e: toml_edit::TomlError| e.to_string())?;
    let config: CollectionConfig = toml_edit::de::from_str(raw).map_err(|e| e.to_string())?;
    Ok(config)
}

fn filename_stem(path: &str) -> String {
    let fname = path.rsplit('/').next().unwrap_or(path);
    let fname = fname.rsplit('\\').next().unwrap_or(fname);
    fname
        .strip_suffix(".req.toml")
        .or_else(|| fname.strip_suffix(".toml"))
        .unwrap_or(fname)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_minimal_request() {
        let toml = r#"
version = 1
name = "Get users"
method = "GET"
url = "{{BASE_URL}}/users"
"#;
        let req = parse_request(toml, "get-users.req.toml").unwrap();
        assert_eq!(req.version, 1);
        assert_eq!(req.name, "Get users");
        assert_eq!(req.method, "GET");
        assert_eq!(req.auth.auth_type, "inherit");
        assert_eq!(req.settings.timeout_ms, 30_000);
    }

    #[test]
    fn parse_full_request() {
        let toml = r#"
version = 1
name = "Create user"
method = "POST"
url = "{{BASE_URL}}/users"

[headers]
Content-Type = "application/json"

[auth]
type = "bearer"
token = "{{API_TOKEN}}"

[body]
type = "json"
content = '{ "name": "Ama" }'

[settings]
timeout_ms = 5000
follow_redirects = false
verify_tls = false

[tests]
status = 201
"#;
        let req = parse_request(toml, "create-user.req.toml").unwrap();
        assert_eq!(req.method, "POST");
        assert_eq!(req.headers.get("Content-Type").unwrap(), "application/json");
        assert_eq!(req.auth.auth_type, "bearer");
        assert_eq!(req.body.body_type, "json");
        assert_eq!(req.settings.timeout_ms, 5000);
        assert!(!req.settings.follow_redirects);
        assert_eq!(req.tests.status, Some(201));
    }

    #[test]
    fn unknown_keys_preserved_in_toml() {
        let toml = r#"
version = 1
name = "Test"
method = "GET"
url = "http://example.com"
custom_field = "should survive"

[future_section]
key = "value"
"#;
        let req = parse_request(toml, "test.req.toml").unwrap();
        assert_eq!(req.name, "Test");

        let doc: DocumentMut = toml.parse().unwrap();
        assert_eq!(
            doc.get("custom_field").and_then(|v| v.as_str()),
            Some("should survive")
        );
        assert!(doc.get("future_section").is_some());
    }

    #[test]
    fn parse_collection_with_defaults() {
        let toml = r#"
version = 1
order = ["list-users", "create-user"]

[defaults.headers]
Accept = "application/json"

[defaults.auth]
type = "bearer"
token = "{{API_TOKEN}}"
"#;
        let coll = parse_collection(toml, "collection.toml").unwrap();
        assert_eq!(coll.version, 1);
        assert_eq!(coll.order, vec!["list-users", "create-user"]);
        assert_eq!(
            coll.defaults.headers.get("Accept").unwrap(),
            "application/json"
        );
        let auth = coll.defaults.auth.as_ref().unwrap();
        assert_eq!(auth.auth_type, "bearer");
    }
}
