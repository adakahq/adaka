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

// ---------------------------------------------------------------------------
// Serialization — merge DTO onto existing document (preserves comments/unknown keys)
// ---------------------------------------------------------------------------

pub fn serialize_request(def: &RequestFile, existing: Option<&str>) -> Result<String, String> {
    let mut doc = match existing {
        Some(raw) => raw.parse::<DocumentMut>().map_err(|e| e.to_string())?,
        None => DocumentMut::new(),
    };

    // Top-level scalars — always present
    doc["version"] = toml_edit::value(def.version);
    doc["name"] = toml_edit::value(def.name.as_str());
    doc["method"] = toml_edit::value(def.method.as_str());
    doc["url"] = toml_edit::value(def.url.as_str());

    // Map sections — remove if empty, replace if present
    apply_string_table(&mut doc, "headers", &def.headers);
    apply_string_table(&mut doc, "headers_disabled", &def.headers_disabled);
    apply_string_table(&mut doc, "query", &def.query);
    apply_string_table(&mut doc, "query_disabled", &def.query_disabled);

    // [auth] — omit when type=inherit (the default)
    if def.auth.auth_type == "inherit" {
        doc.remove("auth");
    } else {
        let mut t = toml_edit::Table::new();
        t["type"] = toml_edit::value(def.auth.auth_type.as_str());
        if let Some(v) = &def.auth.token {
            t["token"] = toml_edit::value(v.as_str());
        }
        if let Some(v) = &def.auth.username {
            t["username"] = toml_edit::value(v.as_str());
        }
        if let Some(v) = &def.auth.password {
            t["password"] = toml_edit::value(v.as_str());
        }
        if let Some(v) = &def.auth.key {
            t["key"] = toml_edit::value(v.as_str());
        }
        if let Some(v) = &def.auth.value {
            t["value"] = toml_edit::value(v.as_str());
        }
        if let Some(v) = &def.auth.location {
            t["in"] = toml_edit::value(v.as_str());
        }
        doc["auth"] = toml_edit::Item::Table(t);
    }

    // [body] — omit when type=none (the default)
    if def.body.body_type == "none" {
        doc.remove("body");
    } else {
        let mut t = toml_edit::Table::new();
        t["type"] = toml_edit::value(def.body.body_type.as_str());
        if let Some(v) = &def.body.content {
            t["content"] = toml_edit::value(v.as_str());
        }
        if let Some(v) = &def.body.content_type {
            t["content_type"] = toml_edit::value(v.as_str());
        }
        if !def.body.fields.is_empty() {
            let mut arr = toml_edit::Array::new();
            for field in &def.body.fields {
                let mut it = toml_edit::InlineTable::new();
                it.insert("name", field.name.as_str().into());
                it.insert("value", field.value.as_str().into());
                if !field.enabled {
                    it.insert("enabled", false.into());
                }
                arr.push(toml_edit::Value::InlineTable(it));
            }
            t["fields"] = toml_edit::Item::Value(toml_edit::Value::Array(arr));
        }
        doc["body"] = toml_edit::Item::Table(t);
    }

    // [settings] — omit when all defaults
    let s = &def.settings;
    if s.timeout_ms == 30_000 && s.follow_redirects && s.verify_tls {
        doc.remove("settings");
    } else {
        let mut t = toml_edit::Table::new();
        if s.timeout_ms != 30_000 {
            t["timeout_ms"] = toml_edit::value(s.timeout_ms as i64);
        }
        if !s.follow_redirects {
            t["follow_redirects"] = toml_edit::value(false);
        }
        if !s.verify_tls {
            t["verify_tls"] = toml_edit::value(false);
        }
        doc["settings"] = toml_edit::Item::Table(t);
    }

    // [tests] — omit when no assertions defined
    match def.tests.status {
        None => {
            doc.remove("tests");
        }
        Some(code) => {
            let mut t = toml_edit::Table::new();
            t["status"] = toml_edit::value(code as i64);
            doc["tests"] = toml_edit::Item::Table(t);
        }
    }

    Ok(doc.to_string())
}

fn apply_string_table(doc: &mut DocumentMut, key: &str, map: &BTreeMap<String, String>) {
    if map.is_empty() {
        doc.remove(key);
    } else {
        let mut t = toml_edit::Table::new();
        for (k, v) in map {
            t[k.as_str()] = toml_edit::value(v.as_str());
        }
        doc[key] = toml_edit::Item::Table(t);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

    fn default_request() -> RequestFile {
        RequestFile {
            version: 1,
            name: "Test".to_string(),
            method: "GET".to_string(),
            url: "http://example.com".to_string(),
            headers: BTreeMap::new(),
            headers_disabled: BTreeMap::new(),
            query: BTreeMap::new(),
            query_disabled: BTreeMap::new(),
            auth: AuthConfig::default(),
            body: BodyConfig::default(),
            settings: RequestSettings::default(),
            tests: TestsConfig::default(),
        }
    }

    #[test]
    fn serialize_preserves_comments_and_unknown_keys() {
        let existing = "# My hand-written note\nversion = 1\nname = \"Test\"\nmethod = \"GET\"\nurl = \"http://example.com\"\ncustom_field = \"should survive\"\n\n[future_section]\nkey = \"value\"\n";
        let mut def = default_request();
        def.method = "POST".to_string();

        let result = serialize_request(&def, Some(existing)).unwrap();
        assert!(result.contains("method = \"POST\""));
        assert!(result.contains("# My hand-written note"));
        assert!(result.contains("custom_field = \"should survive\""));
        assert!(result.contains("[future_section]"));
        assert!(result.contains("key = \"value\""));

        let parsed = parse_request(&result, "test.req.toml").unwrap();
        assert_eq!(parsed.method, "POST");
    }

    #[test]
    fn serialize_method_change_with_unset_tests() {
        let mut def = default_request();
        def.method = "PUT".to_string();
        def.tests = TestsConfig { status: None };

        let result = serialize_request(&def, None).unwrap();
        assert!(result.contains("method = \"PUT\""));
        assert!(!result.contains("[tests]"));

        let parsed = parse_request(&result, "test.req.toml").unwrap();
        assert_eq!(parsed.method, "PUT");
        assert_eq!(parsed.tests.status, None);
    }

    #[test]
    fn serialize_new_file_canonical_shape() {
        let mut headers = BTreeMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        let def = RequestFile {
            version: 1,
            name: "Create User".to_string(),
            method: "POST".to_string(),
            url: "{{BASE_URL}}/users".to_string(),
            headers,
            headers_disabled: BTreeMap::new(),
            query: BTreeMap::new(),
            query_disabled: BTreeMap::new(),
            auth: AuthConfig {
                auth_type: "bearer".to_string(),
                token: Some("{{API_TOKEN}}".to_string()),
                ..AuthConfig::default()
            },
            body: BodyConfig {
                body_type: "json".to_string(),
                content: Some(r#"{ "name": "Ama" }"#.to_string()),
                ..BodyConfig::default()
            },
            settings: RequestSettings::default(),
            tests: TestsConfig { status: Some(201) },
        };

        let result = serialize_request(&def, None).unwrap();
        let parsed = parse_request(&result, "test.req.toml").unwrap();
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.name, "Create User");
        assert_eq!(parsed.method, "POST");
        assert_eq!(parsed.url, "{{BASE_URL}}/users");
        assert_eq!(
            parsed.headers.get("Content-Type").unwrap(),
            "application/json"
        );
        assert_eq!(parsed.auth.auth_type, "bearer");
        assert_eq!(parsed.auth.token, Some("{{API_TOKEN}}".to_string()));
        assert_eq!(parsed.body.body_type, "json");
        assert_eq!(
            parsed.body.content,
            Some(r#"{ "name": "Ama" }"#.to_string())
        );
        assert_eq!(parsed.tests.status, Some(201));
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
