use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use toml_edit::DocumentMut;

use super::workspace;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub name: String,
    pub vars: HashMap<String, String>,
    /// Secret names — values are always "keychain" in the file.
    /// Resolution will fail with SecretUnavailable until keychain
    /// integration is implemented.
    pub secrets: Vec<String>,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum EnvError {
    #[error("environment not found: {0}")]
    NotFound(String),
    #[error("unknown variable: {0}")]
    UnknownVar(String),
    #[error("secret unavailable (keychain not yet implemented): {0}")]
    SecretUnavailable(String),
    #[error("workspace error: {0}")]
    Workspace(#[from] workspace::WorkspaceError),
    #[error("IO error: {0}")]
    Io(String),
    #[error("TOML parse error: {0}")]
    TomlParse(String),
}

impl EnvError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound(_) => "ENV_NOT_FOUND",
            Self::UnknownVar(_) => "UNRESOLVED_VAR",
            Self::SecretUnavailable(_) => "SECRET_UNAVAILABLE",
            Self::Workspace(_) => "WORKSPACE",
            Self::Io(_) => "IO",
            Self::TomlParse(_) => "PARSE",
        }
    }
}

impl Serialize for EnvError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("EnvError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/// Parse an environment file from raw TOML content.
pub fn parse_environment(name: &str, raw: &str) -> Result<Environment, EnvError> {
    let doc: DocumentMut = raw
        .parse()
        .map_err(|e: toml_edit::TomlError| EnvError::TomlParse(e.to_string()))?;

    let mut vars = HashMap::new();
    if let Some(tbl) = doc.get("vars").and_then(|v| v.as_table()) {
        for (key, val) in tbl.iter() {
            if let Some(s) = val.as_str() {
                vars.insert(key.to_string(), s.to_string());
            }
        }
    }

    let mut secrets = Vec::new();
    if let Some(tbl) = doc.get("secrets").and_then(|v| v.as_table()) {
        for (key, _) in tbl.iter() {
            secrets.push(key.to_string());
        }
    }

    Ok(Environment {
        name: name.to_string(),
        vars,
        secrets,
    })
}

/// Load an environment by name from a workspace's `environments/` dir.
pub fn load_environment(root: &Path, env_name: &str) -> Result<Environment, EnvError> {
    let relative = format!("environments/{}.toml", env_name);
    let raw = workspace::read_file(root, &relative).map_err(|e| match &e {
        workspace::WorkspaceError::Io(io_err) if io_err.kind() == std::io::ErrorKind::NotFound => {
            EnvError::NotFound(env_name.to_string())
        }
        _ => EnvError::Workspace(e),
    })?;
    parse_environment(env_name, &raw)
}

/// List environment names by scanning `environments/*.toml` in the workspace.
pub fn list_environments(root: &Path) -> Result<Vec<String>, EnvError> {
    let env_dir = root.join(".adaka").join("environments");
    if !env_dir.is_dir() {
        return Ok(vec![]);
    }
    let mut names = Vec::new();
    for entry in std::fs::read_dir(&env_dir).map_err(|e| EnvError::Io(e.to_string()))? {
        let entry = entry.map_err(|e| EnvError::Io(e.to_string()))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("toml") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

/// Resolve `{{VAR}}` placeholders in a template string.
///
/// Resolution order (later wins):
/// 1. OS environment variables
/// 2. Environment `[vars]`
/// 3. Environment `[secrets]` → SecretUnavailable error for now
///
/// Escaped braces `\{{` pass through as literal `{{`.
/// Whitespace inside braces is trimmed: `{{ VAR }}` == `{{VAR}}`.
/// No recursive resolution — a var whose value contains `{{X}}` stays literal.
pub fn resolve(template: &str, env: &Environment) -> Result<String, EnvError> {
    let mut result = String::with_capacity(template.len());
    let bytes = template.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    // Tracks the start of a run of literal text. We flush
    // template[literal_start..i] whenever we hit a special sequence,
    // avoiding per-byte char conversion that would corrupt multi-byte UTF-8.
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

                if env.secrets.contains(&var_name.to_string()) {
                    return Err(EnvError::SecretUnavailable(var_name.to_string()));
                }

                let value = env
                    .vars
                    .get(var_name)
                    .cloned()
                    .or_else(|| std::env::var(var_name).ok());

                match value {
                    Some(v) => result.push_str(&v),
                    None => return Err(EnvError::UnknownVar(var_name.to_string())),
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

/// Find the position of `}}` starting from `start` in the template.
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
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn env_list(path: String) -> Result<Vec<String>, EnvError> {
    list_environments(Path::new(&path))
}

#[tauri::command]
pub fn env_resolve(path: String, env_name: String, template: String) -> Result<String, EnvError> {
    let env = load_environment(Path::new(&path), &env_name)?;
    resolve(&template, &env)
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
        workspace::create(root.path(), Some("Env Test")).unwrap();
        root
    }

    fn write_env(root: &Path, name: &str, content: &str) {
        let relative = format!("environments/{}.toml", name);
        workspace::write_file(root, &relative, content).unwrap();
    }

    fn sample_env() -> Environment {
        let mut vars = HashMap::new();
        vars.insert("BASE_URL".to_string(), "http://localhost:8000".to_string());
        vars.insert("API_VERSION".to_string(), "v1".to_string());
        Environment {
            name: "local".to_string(),
            vars,
            secrets: vec![],
        }
    }

    #[test]
    fn basic_substitution() {
        let env = sample_env();
        let result = resolve("{{BASE_URL}}/{{API_VERSION}}/users", &env).unwrap();
        assert_eq!(result, "http://localhost:8000/v1/users");
    }

    #[test]
    fn whitespace_inside_braces() {
        let env = sample_env();
        let result = resolve("{{ BASE_URL }}/{{ API_VERSION }}", &env).unwrap();
        assert_eq!(result, "http://localhost:8000/v1");
    }

    #[test]
    fn unknown_var_error() {
        let env = sample_env();
        let err = resolve("{{NONEXISTENT}}", &env).unwrap_err();
        assert!(
            matches!(err, EnvError::UnknownVar(ref name) if name == "NONEXISTENT"),
            "expected UnknownVar, got: {err}"
        );
    }

    #[test]
    fn os_env_var_resolved() {
        // Set an OS env var, don't put it in [vars] — should still resolve.
        std::env::set_var("ADAKA_TEST_OS_VAR", "from_os");
        let env = sample_env();
        let result = resolve("{{ADAKA_TEST_OS_VAR}}", &env).unwrap();
        assert_eq!(result, "from_os");
        std::env::remove_var("ADAKA_TEST_OS_VAR");
    }

    #[test]
    fn env_vars_override_os_vars() {
        // [vars] should win over OS env vars (later wins in resolution order).
        std::env::set_var("BASE_URL", "http://os-level");
        let env = sample_env();
        let result = resolve("{{BASE_URL}}", &env).unwrap();
        assert_eq!(result, "http://localhost:8000");
        std::env::remove_var("BASE_URL");
    }

    #[test]
    fn escaped_braces() {
        let env = sample_env();
        let result = resolve(r"\{{literal}}", &env).unwrap();
        assert_eq!(result, "{{literal}}");
    }

    #[test]
    fn no_recursive_resolution() {
        // A var value containing {{X}} must stay literal — no second pass.
        let mut vars = HashMap::new();
        vars.insert("OUTER".to_string(), "{{INNER}}".to_string());
        vars.insert("INNER".to_string(), "should not appear".to_string());
        let env = Environment {
            name: "test".to_string(),
            vars,
            secrets: vec![],
        };
        let result = resolve("{{OUTER}}", &env).unwrap();
        assert_eq!(result, "{{INNER}}");
    }

    #[test]
    fn secret_unavailable() {
        let env = Environment {
            name: "test".to_string(),
            vars: HashMap::new(),
            secrets: vec!["API_TOKEN".to_string()],
        };
        let err = resolve("Bearer {{API_TOKEN}}", &env).unwrap_err();
        assert!(
            matches!(err, EnvError::SecretUnavailable(ref name) if name == "API_TOKEN"),
            "expected SecretUnavailable, got: {err}"
        );
    }

    #[test]
    fn missing_environment_file() {
        let root = tmp_workspace();
        let err = load_environment(root.path(), "nonexistent").unwrap_err();
        assert!(
            matches!(err, EnvError::NotFound(ref name) if name == "nonexistent"),
            "expected NotFound, got: {err}"
        );
    }

    #[test]
    fn parse_and_load_roundtrip() {
        let root = tmp_workspace();
        let content = "name = \"staging\"\n\n[vars]\nBASE_URL = \"https://staging.example.com\"\n\n[secrets]\nAPI_TOKEN = \"keychain\"\n";
        write_env(root.path(), "staging", content);

        let env = load_environment(root.path(), "staging").unwrap();
        assert_eq!(env.name, "staging");
        assert_eq!(env.vars["BASE_URL"], "https://staging.example.com");
        assert!(env.secrets.contains(&"API_TOKEN".to_string()));
    }

    #[test]
    fn list_environments_returns_sorted_names() {
        let root = tmp_workspace();
        let content = "name = \"x\"\n\n[vars]\n";
        write_env(root.path(), "staging", content);
        write_env(root.path(), "local", content);
        write_env(root.path(), "production", content);

        let names = list_environments(root.path()).unwrap();
        assert_eq!(names, vec!["local", "production", "staging"]);
    }

    #[test]
    fn fresh_workspace_has_seeded_local_env() {
        let root = tmp_workspace();
        let names = list_environments(root.path()).unwrap();
        assert_eq!(names, vec!["local"]);
    }

    #[test]
    fn template_with_no_placeholders() {
        let env = sample_env();
        let result = resolve("plain text, no vars", &env).unwrap();
        assert_eq!(result, "plain text, no vars");
    }

    #[test]
    fn unclosed_braces_stay_literal() {
        let env = sample_env();
        let result = resolve("{{unclosed", &env).unwrap();
        assert_eq!(result, "{{unclosed");
    }

    #[test]
    fn multibyte_utf8_around_placeholder() {
        let env = sample_env();
        let result = resolve("café → {{BASE_URL}} — done ✓", &env).unwrap();
        assert_eq!(result, "café → http://localhost:8000 — done ✓");
    }

    #[test]
    fn multibyte_utf8_in_var_value() {
        let mut vars = HashMap::new();
        vars.insert("GREETING".to_string(), "héllo wörld 🌍".to_string());
        let env = Environment {
            name: "test".to_string(),
            vars,
            secrets: vec![],
        };
        let result = resolve("say: {{GREETING}}!", &env).unwrap();
        assert_eq!(result, "say: héllo wörld 🌍!");
    }
}
