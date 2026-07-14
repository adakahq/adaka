use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use rand::Rng;
use serde::{Deserialize, Serialize};
use toml_edit::DocumentMut;

const ADAKA_DIR: &str = ".adaka";
const WORKSPACE_FILE: &str = "workspace.toml";
const CURRENT_VERSION: i64 = 1;

// ---------------------------------------------------------------------------
// Public types returned to the frontend via Tauri commands
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceInfo {
    pub id: String,
    pub name: String,
    pub version: i64,
    pub root: PathBuf,
    pub modules: ModuleToggles,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleToggles {
    pub api_client: bool,
    pub utilities: bool,
    pub mail: bool,
    pub db: bool,
    pub logs: bool,
}

impl Default for ModuleToggles {
    fn default() -> Self {
        Self {
            api_client: true,
            utilities: true,
            mail: false,
            db: false,
            logs: false,
        }
    }
}

// ---------------------------------------------------------------------------
// Error type — keeps Tauri's InvokeError serialization happy
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum WorkspaceError {
    #[error("directory does not exist: {0}")]
    DirNotFound(PathBuf),
    #[error("workspace not initialised (no .adaka/workspace.toml)")]
    NotInitialised,
    #[error("workspace already exists at {0}")]
    AlreadyExists(PathBuf),
    #[error("path traversal rejected: {0}")]
    PathTraversal(String),
    #[error("TOML parse error: {0}")]
    TomlParse(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl WorkspaceError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::DirNotFound(_) => "DIR_NOT_FOUND",
            Self::NotInitialised => "NOT_INITIALISED",
            Self::AlreadyExists(_) => "ALREADY_EXISTS",
            Self::PathTraversal(_) => "PATH_TRAVERSAL",
            Self::TomlParse(_) => "PARSE",
            Self::Io(_) => "IO",
        }
    }
}

impl Serialize for WorkspaceError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("WorkspaceError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/// Open an existing workspace: validate the directory, read workspace.toml,
/// return structured info. The raw TOML is parsed with `toml_edit` so we can
/// later round-trip unknown keys on writes, but here we only need the known
/// fields.
pub fn open(root: &Path) -> Result<WorkspaceInfo, WorkspaceError> {
    if !root.is_dir() {
        return Err(WorkspaceError::DirNotFound(root.to_path_buf()));
    }
    let ws_path = root.join(ADAKA_DIR).join(WORKSPACE_FILE);
    if !ws_path.is_file() {
        return Err(WorkspaceError::NotInitialised);
    }
    let raw = fs::read_to_string(&ws_path)?;
    parse_workspace_toml(&raw, root)
}

/// Create a new workspace: generate an 8-hex id, write workspace.toml
/// atomically, return the resulting info. When `name` is None, falls
/// back to the directory's own name (the last path component).
pub fn create(root: &Path, name: Option<&str>) -> Result<WorkspaceInfo, WorkspaceError> {
    if !root.is_dir() {
        return Err(WorkspaceError::DirNotFound(root.to_path_buf()));
    }
    let adaka_dir = root.join(ADAKA_DIR);
    let ws_path = adaka_dir.join(WORKSPACE_FILE);
    if ws_path.exists() {
        return Err(WorkspaceError::AlreadyExists(ws_path));
    }

    let resolved_name = name.map(|s| s.to_string()).unwrap_or_else(|| {
        root.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Untitled")
            .to_string()
    });

    fs::create_dir_all(&adaka_dir)?;

    let id = generate_hex_id();
    let modules = ModuleToggles::default();

    let mut doc = DocumentMut::new();
    doc["version"] = toml_edit::value(CURRENT_VERSION);
    doc["name"] = toml_edit::value(&resolved_name);
    doc["id"] = toml_edit::value(&id);

    let mut tbl = toml_edit::Table::new();
    tbl["api-client"] = toml_edit::value(modules.api_client);
    tbl["utilities"] = toml_edit::value(modules.utilities);
    tbl["mail"] = toml_edit::value(modules.mail);
    tbl["db"] = toml_edit::value(modules.db);
    tbl["logs"] = toml_edit::value(modules.logs);
    doc["modules"] = toml_edit::Item::Table(tbl);

    atomic_write(&ws_path, &doc.to_string())?;

    // Seed a starter environment so the default "local" env works immediately.
    let env_path = adaka_dir.join("environments").join("local.toml");
    fs::create_dir_all(env_path.parent().unwrap())?;
    atomic_write(
        &env_path,
        concat!(
            "# Variables for this environment — use {{BASE_URL}} in requests\n",
            "version = 1\n",
            "\n",
            "[vars]\n",
            "BASE_URL = \"http://localhost:3000\"\n",
        ),
    )?;

    // Seed a welcome request so new users have something to send immediately.
    let req_dir = adaka_dir.join("requests");
    fs::create_dir_all(&req_dir)?;
    atomic_write(
        &req_dir.join("welcome.req.toml"),
        concat!(
            "version = 1\n",
            "name = \"My first request\"\n",
            "method = \"GET\"\n",
            "url = \"{{BASE_URL}}/\"\n",
        ),
    )?;

    Ok(WorkspaceInfo {
        id,
        name: resolved_name,
        version: CURRENT_VERSION,
        root: root.to_path_buf(),
        modules,
    })
}

/// Read an arbitrary TOML file scoped to `.adaka/`. Returns the raw string
/// content. The `relative` path is resolved against `.adaka/` and must not
/// escape it (no `..` traversal).
pub fn read_file(root: &Path, relative: &str) -> Result<String, WorkspaceError> {
    let resolved = resolve_scoped_path(root, relative)?;
    Ok(fs::read_to_string(resolved)?)
}

/// Write a TOML file scoped to `.adaka/`. The write is atomic (temp + rename)
/// and round-trip safe: if the file already exists, the existing document is
/// parsed, then the caller's content replaces it wholesale. For field-level
/// merging, callers should read first, patch the `DocumentMut`, then pass the
/// result here.
pub fn write_file(root: &Path, relative: &str, content: &str) -> Result<(), WorkspaceError> {
    let resolved = resolve_scoped_path(root, relative)?;
    // Validate that content is parseable TOML before writing.
    content
        .parse::<DocumentMut>()
        .map_err(|e| WorkspaceError::TomlParse(e.to_string()))?;

    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent)?;
    }
    atomic_write(&resolved, content)
}

/// Delete a file scoped to `.adaka/`. Path traversal checked.
pub fn delete_file(root: &Path, relative: &str) -> Result<(), WorkspaceError> {
    let resolved = resolve_scoped_path(root, relative)?;
    fs::remove_file(resolved)?;
    Ok(())
}

/// Reveal a path inside `.adaka/` in the OS file manager.
/// Opens the containing folder. Path traversal checked.
pub fn reveal_path(root: &Path, relative: &str) -> Result<(), WorkspaceError> {
    let resolved = resolve_scoped_path(root, relative)?;
    let dir = if resolved.is_dir() {
        resolved
    } else {
        resolved
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| resolved.clone())
    };

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(WorkspaceError::Io)?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(WorkspaceError::Io)?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(WorkspaceError::Io)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Parse workspace.toml into `WorkspaceInfo`. Uses `toml_edit` to access
/// fields without losing unknown keys (the Document itself is discarded here;
/// callers that need to mutate should hold onto the raw string).
fn parse_workspace_toml(raw: &str, root: &Path) -> Result<WorkspaceInfo, WorkspaceError> {
    let doc: DocumentMut = raw
        .parse()
        .map_err(|e: toml_edit::TomlError| WorkspaceError::TomlParse(e.to_string()))?;

    let version = doc
        .get("version")
        .and_then(|v| v.as_integer())
        .unwrap_or(CURRENT_VERSION);
    // TODO(migrations): reject version > CURRENT_VERSION once migration support lands
    let name = doc
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let id = doc
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let modules = if let Some(tbl) = doc.get("modules").and_then(|v| v.as_table()) {
        ModuleToggles {
            api_client: bool_field(tbl, "api-client", true),
            utilities: bool_field(tbl, "utilities", true),
            mail: bool_field(tbl, "mail", false),
            db: bool_field(tbl, "db", false),
            logs: bool_field(tbl, "logs", false),
        }
    } else {
        ModuleToggles::default()
    };

    Ok(WorkspaceInfo {
        id,
        name,
        version,
        root: root.to_path_buf(),
        modules,
    })
}

fn bool_field(tbl: &toml_edit::Table, key: &str, default: bool) -> bool {
    tbl.get(key).and_then(|v| v.as_bool()).unwrap_or(default)
}

/// Resolve `relative` against `<root>/.adaka/` and reject any path that
/// escapes the `.adaka/` directory. Uses `canonicalize` on the parent so
/// symlinks are resolved before comparison.
fn resolve_scoped_path(root: &Path, relative: &str) -> Result<PathBuf, WorkspaceError> {
    // Fast reject: forbid components that could escape. The drive-letter
    // check catches Windows absolute paths like C:\evil or C:/evil.
    let has_drive_letter = relative.len() >= 2
        && relative.as_bytes()[0].is_ascii_alphabetic()
        && relative.as_bytes()[1] == b':';
    if relative.contains("..")
        || relative.starts_with('/')
        || relative.starts_with('\\')
        || has_drive_letter
    {
        return Err(WorkspaceError::PathTraversal(relative.to_string()));
    }

    let adaka_dir = root.join(ADAKA_DIR);
    let target = adaka_dir.join(relative);

    // Canonicalize the parent directory (it must exist for writes). For reads
    // we canonicalize the target itself. Either way we compare the prefix.
    let canonical_base = fs::canonicalize(&adaka_dir).unwrap_or_else(|_| adaka_dir.clone());
    let check_path = if target.exists() {
        fs::canonicalize(&target)?
    } else if let Some(parent) = target.parent() {
        // Parent might not exist yet (write_file creates it), so we walk up
        // to find the nearest existing ancestor.
        let existing_ancestor = nearest_existing_ancestor(parent);
        let canonical_ancestor = fs::canonicalize(&existing_ancestor)?;
        // Rebuild the remainder that doesn't exist yet.
        let remainder = target
            .strip_prefix(&existing_ancestor)
            .map_err(|_| WorkspaceError::PathTraversal(relative.to_string()))?;
        canonical_ancestor.join(remainder)
    } else {
        return Err(WorkspaceError::PathTraversal(relative.to_string()));
    };

    if !check_path.starts_with(&canonical_base) {
        return Err(WorkspaceError::PathTraversal(relative.to_string()));
    }

    Ok(target)
}

/// Walk up from `path` until we find an ancestor that exists on disk.
fn nearest_existing_ancestor(path: &Path) -> PathBuf {
    let mut p = path.to_path_buf();
    while !p.exists() {
        if !p.pop() {
            break;
        }
    }
    p
}

/// Atomic + durable write: create a sibling temp file, write content,
/// fsync the file to flush to disk, then rename. Without the fsync a
/// power loss could leave the final path pointing at an empty or
/// partial file (the rename landed in the journal but the data didn't
/// reach the platter). On Unix we also fsync the parent directory after
/// the rename so the directory entry itself is durable.
fn atomic_write(path: &Path, content: &str) -> Result<(), WorkspaceError> {
    let parent = path.parent().ok_or_else(|| {
        WorkspaceError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "path has no parent directory",
        ))
    })?;
    fs::create_dir_all(parent)?;

    // Temp file lives in the same directory so rename stays on the same
    // filesystem.
    let mut tmp_path = parent.to_path_buf();
    tmp_path.push(format!(".adaka-tmp-{}", generate_hex_id()));

    // Explicit File::create → write_all → sync_all instead of fs::write
    // so we guarantee data is on disk before the rename.
    let mut file = File::create(&tmp_path)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;
    // Drop the handle before rename — Windows requires the file to be
    // closed before it can be atomically replaced.
    drop(file);

    if let Err(e) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(WorkspaceError::Io(e));
    }

    // On Unix, fsync the parent directory so the new directory entry is
    // durable. Windows flushes directory metadata as part of NTFS
    // journaling so this isn't needed there.
    #[cfg(unix)]
    {
        if let Ok(dir) = File::open(parent) {
            let _ = dir.sync_all();
        }
    }

    Ok(())
}

fn generate_hex_id() -> String {
    let mut rng = rand::rng();
    format!("{:08x}", rng.random::<u32>())
}

// ---------------------------------------------------------------------------
// Tauri commands — thin wrappers that delegate to the pure functions above.
// Naming follows FOUNDATION §5: core:workspace_*
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn workspace_open(path: String) -> Result<WorkspaceInfo, WorkspaceError> {
    open(Path::new(&path))
}

#[tauri::command]
pub fn workspace_create(
    path: String,
    name: Option<String>,
) -> Result<WorkspaceInfo, WorkspaceError> {
    create(Path::new(&path), name.as_deref())
}

#[tauri::command]
pub fn workspace_read_file(path: String, relative: String) -> Result<String, WorkspaceError> {
    read_file(Path::new(&path), &relative)
}

#[tauri::command]
pub fn workspace_write_file(
    path: String,
    relative: String,
    content: String,
) -> Result<(), WorkspaceError> {
    write_file(Path::new(&path), &relative, &content)
}

#[tauri::command]
pub fn workspace_delete_file(path: String, relative: String) -> Result<(), WorkspaceError> {
    delete_file(Path::new(&path), &relative)
}

#[tauri::command]
pub fn workspace_reveal_path(path: String, relative: String) -> Result<(), WorkspaceError> {
    reveal_path(Path::new(&path), &relative)
}

#[tauri::command]
pub fn workspace_default_dir(app: tauri::AppHandle) -> Result<String, WorkspaceError> {
    use tauri::Manager;
    let docs = app.path().document_dir().map_err(|e| {
        WorkspaceError::Io(std::io::Error::other(e.to_string()))
    })?;
    Ok(docs.join("Adaka").to_string_lossy().to_string())
}

#[tauri::command]
pub fn workspace_quick_create(
    name: String,
    app: tauri::AppHandle,
) -> Result<WorkspaceInfo, WorkspaceError> {
    use tauri::Manager;
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(WorkspaceError::PathTraversal(
            "workspace name cannot be empty".into(),
        ));
    }
    if !is_safe_folder_name(&name) {
        return Err(WorkspaceError::PathTraversal(format!(
            "name contains characters not allowed in folder names: {name}"
        )));
    }
    let docs = app.path().document_dir().map_err(|e| {
        WorkspaceError::Io(std::io::Error::other(e.to_string()))
    })?;
    let ws_root = docs.join("Adaka").join(&name);
    if ws_root.exists() {
        return Err(WorkspaceError::AlreadyExists(ws_root));
    }
    std::fs::create_dir_all(&ws_root)?;
    create(&ws_root, Some(&name))
}

fn is_safe_folder_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 100 {
        return false;
    }
    if name.starts_with('.') || name.ends_with('.') || name.ends_with(' ') {
        return false;
    }
    let forbidden = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    !name
        .chars()
        .any(|c| forbidden.contains(&c) || c.is_control())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Helper: create a temp directory that acts as a workspace root.
    fn tmp_root() -> TempDir {
        tempfile::tempdir().expect("failed to create temp dir")
    }

    #[test]
    fn create_then_open_roundtrip() {
        let root = tmp_root();
        let info = create(root.path(), Some("Test Project")).unwrap();

        assert_eq!(info.name, "Test Project");
        assert_eq!(info.version, 1);
        assert_eq!(info.id.len(), 8);
        assert!(info.modules.api_client);
        assert!(info.modules.utilities);
        assert!(!info.modules.mail);

        // Re-open the same workspace.
        let reopened = open(root.path()).unwrap();
        assert_eq!(reopened.id, info.id);
        assert_eq!(reopened.name, info.name);
    }

    #[test]
    fn unknown_keys_preserved_on_roundtrip() {
        let root = tmp_root();
        create(root.path(), Some("Preserve Test")).unwrap();

        let ws_path = root.path().join(ADAKA_DIR).join(WORKSPACE_FILE);
        let original = fs::read_to_string(&ws_path).unwrap();

        // Inject an unknown key by editing the raw TOML.
        let mut doc: DocumentMut = original.parse().unwrap();
        doc["custom_field"] = toml_edit::value("should survive");
        let modified = doc.to_string();
        fs::write(&ws_path, &modified).unwrap();

        // Read it back and verify the unknown key is still there.
        let raw_after = fs::read_to_string(&ws_path).unwrap();
        let doc_after: DocumentMut = raw_after.parse().unwrap();
        assert_eq!(
            doc_after.get("custom_field").and_then(|v| v.as_str()),
            Some("should survive")
        );

        // And the known fields still parse correctly.
        let info = open(root.path()).unwrap();
        assert_eq!(info.name, "Preserve Test");
    }

    #[test]
    fn write_file_roundtrip() {
        let root = tmp_root();
        create(root.path(), Some("Write Test")).unwrap();

        let content = "version = 1\nname = \"local\"\n\n[vars]\nBASE_URL = \"http://localhost\"\n";
        write_file(root.path(), "environments/local.toml", content).unwrap();

        let read_back = read_file(root.path(), "environments/local.toml").unwrap();
        assert_eq!(read_back, content);
    }

    #[test]
    fn path_traversal_rejected_dotdot() {
        let root = tmp_root();
        create(root.path(), Some("Traversal Test")).unwrap();

        let err = read_file(root.path(), "../etc/passwd").unwrap_err();
        assert!(
            matches!(err, WorkspaceError::PathTraversal(_)),
            "expected PathTraversal, got: {err}"
        );
    }

    #[test]
    fn path_traversal_rejected_absolute() {
        let root = tmp_root();
        create(root.path(), Some("Traversal Abs")).unwrap();

        let err = read_file(root.path(), "/etc/passwd").unwrap_err();
        assert!(
            matches!(err, WorkspaceError::PathTraversal(_)),
            "expected PathTraversal, got: {err}"
        );
    }

    #[test]
    fn path_traversal_rejected_backslash() {
        let root = tmp_root();
        create(root.path(), Some("Traversal BS")).unwrap();

        let err = read_file(root.path(), "\\Windows\\System32\\config").unwrap_err();
        assert!(
            matches!(err, WorkspaceError::PathTraversal(_)),
            "expected PathTraversal, got: {err}"
        );
    }

    #[test]
    fn atomic_write_no_partial_on_invalid_toml() {
        let root = tmp_root();
        create(root.path(), Some("Atomic Test")).unwrap();

        // Attempt to write invalid TOML — should fail validation.
        let bad = "this is [not valid {toml";
        let err = write_file(root.path(), "bad.toml", bad);
        assert!(err.is_err());

        // The file must not exist (no partial write).
        let target = root.path().join(ADAKA_DIR).join("bad.toml");
        assert!(
            !target.exists(),
            "partial file should not exist after failed write"
        );
    }

    #[test]
    fn create_fails_if_already_exists() {
        let root = tmp_root();
        create(root.path(), Some("First")).unwrap();

        let err = create(root.path(), Some("Second")).unwrap_err();
        assert!(
            matches!(err, WorkspaceError::AlreadyExists(_)),
            "expected AlreadyExists, got: {err}"
        );
    }

    #[test]
    fn open_fails_on_missing_dir() {
        let err = open(Path::new("/nonexistent/path/that/should/not/exist")).unwrap_err();
        assert!(matches!(err, WorkspaceError::DirNotFound(_)));
    }

    #[test]
    fn open_fails_without_workspace_toml() {
        let root = tmp_root();
        let err = open(root.path()).unwrap_err();
        assert!(matches!(err, WorkspaceError::NotInitialised));
    }

    #[test]
    fn create_with_none_name_uses_dir_name() {
        let dir = tempfile::Builder::new()
            .prefix("my-project")
            .tempdir()
            .unwrap();
        let info = create(dir.path(), None).unwrap();
        let dir_name = dir.path().file_name().unwrap().to_str().unwrap();
        assert_eq!(info.name, dir_name);
    }

    #[test]
    fn write_file_rejects_invalid_toml() {
        let root = tmp_root();
        create(root.path(), Some("Validate")).unwrap();

        let err = write_file(root.path(), "test.toml", "[broken").unwrap_err();
        assert!(
            matches!(err, WorkspaceError::TomlParse(_)),
            "expected TomlParse, got: {err}"
        );
    }

    #[test]
    #[cfg(windows)]
    fn path_traversal_rejected_windows_drive_backslash() {
        let root = tmp_root();
        create(root.path(), Some("Win Drive")).unwrap();

        let err = read_file(root.path(), r"C:\evil").unwrap_err();
        assert!(
            matches!(err, WorkspaceError::PathTraversal(_)),
            "expected PathTraversal, got: {err}"
        );
    }

    #[test]
    #[cfg(windows)]
    fn path_traversal_rejected_windows_drive_slash() {
        let root = tmp_root();
        create(root.path(), Some("Win Drive Fwd")).unwrap();

        let err = read_file(root.path(), "C:/evil").unwrap_err();
        assert!(
            matches!(err, WorkspaceError::PathTraversal(_)),
            "expected PathTraversal, got: {err}"
        );
    }

    #[test]
    fn write_file_creates_deep_parent_dirs() {
        let root = tmp_root();
        create(root.path(), Some("Deep Write")).unwrap();

        let content = "version = 1\nname = \"deep\"\nmethod = \"GET\"\nurl = \"\"\n";
        write_file(
            root.path(),
            "requests/new-folder/deep/file.req.toml",
            content,
        )
        .unwrap();

        let read_back = read_file(root.path(), "requests/new-folder/deep/file.req.toml").unwrap();
        assert_eq!(read_back, content);
    }

    #[test]
    fn path_traversal_rejected_through_created_dirs() {
        let root = tmp_root();
        create(root.path(), Some("Traversal Dirs")).unwrap();

        let err =
            write_file(root.path(), "requests/../../etc/evil.toml", "version = 1\n").unwrap_err();
        assert!(
            matches!(err, WorkspaceError::PathTraversal(_)),
            "expected PathTraversal, got: {err}"
        );
    }

    #[test]
    fn create_seeds_local_environment() {
        let root = tmp_root();
        create(root.path(), Some("Seed Test")).unwrap();

        let content = read_file(root.path(), "environments/local.toml").unwrap();
        assert!(content.contains("[vars]"));
        assert!(content.contains("BASE_URL"));
    }

    #[test]
    fn delete_file_removes_existing() {
        let root = tmp_root();
        create(root.path(), Some("Delete Test")).unwrap();

        let content = "version = 1\nname = \"doomed\"\nmethod = \"GET\"\nurl = \"\"\n";
        write_file(root.path(), "requests/doomed.req.toml", content).unwrap();

        // File exists
        assert!(read_file(root.path(), "requests/doomed.req.toml").is_ok());

        // Delete it
        delete_file(root.path(), "requests/doomed.req.toml").unwrap();

        // File is gone
        let err = read_file(root.path(), "requests/doomed.req.toml").unwrap_err();
        assert!(matches!(err, WorkspaceError::Io(_)));
    }

    #[test]
    fn delete_file_rejects_traversal() {
        let root = tmp_root();
        create(root.path(), Some("Delete Traversal")).unwrap();

        let err = delete_file(root.path(), "../etc/passwd").unwrap_err();
        assert!(
            matches!(err, WorkspaceError::PathTraversal(_)),
            "expected PathTraversal, got: {err}"
        );
    }

    #[test]
    fn reveal_path_rejects_traversal() {
        let root = tmp_root();
        create(root.path(), Some("Reveal Traversal")).unwrap();

        let err = reveal_path(root.path(), "../etc/passwd").unwrap_err();
        assert!(
            matches!(err, WorkspaceError::PathTraversal(_)),
            "expected PathTraversal, got: {err}"
        );
    }

    #[test]
    fn welcome_request_seeded_on_create() {
        let root = tmp_root();
        create(root.path(), Some("Welcome")).unwrap();

        let content = read_file(root.path(), "requests/welcome.req.toml").unwrap();
        assert!(content.contains("My first request"));
        assert!(content.contains("{{BASE_URL}}"));
    }

    #[test]
    fn seeds_are_idempotent_across_opens() {
        let root = tmp_root();
        create(root.path(), Some("Idempotent")).unwrap();

        let env_after_create = read_file(root.path(), "environments/local.toml").unwrap();
        let req_after_create = read_file(root.path(), "requests/welcome.req.toml").unwrap();

        for _ in 0..3 {
            let _info = open(root.path()).unwrap();
        }

        let env_after_opens = read_file(root.path(), "environments/local.toml").unwrap();
        let req_after_opens = read_file(root.path(), "requests/welcome.req.toml").unwrap();
        assert_eq!(
            env_after_create, env_after_opens,
            "env file must not be rewritten on open"
        );
        assert_eq!(
            req_after_create, req_after_opens,
            "request file must not be rewritten on open"
        );
    }

    #[test]
    fn env_seed_is_idempotent_across_opens() {
        let root = tmp_root();
        create(root.path(), Some("Idempotent")).unwrap();

        let after_create = read_file(root.path(), "environments/local.toml").unwrap();

        // "Open" the workspace 3 times — open() never rewrites env files
        for _ in 0..3 {
            let _info = open(root.path()).unwrap();
        }

        let after_opens = read_file(root.path(), "environments/local.toml").unwrap();
        assert_eq!(
            after_create, after_opens,
            "env file must not be rewritten on open"
        );
    }

    #[test]
    fn safe_folder_name_rejects_forbidden_chars() {
        assert!(!is_safe_folder_name(""));
        assert!(!is_safe_folder_name("foo/bar"));
        assert!(!is_safe_folder_name("foo\\bar"));
        assert!(!is_safe_folder_name("foo:bar"));
        assert!(!is_safe_folder_name("foo*bar"));
        assert!(!is_safe_folder_name(".hidden"));
        assert!(!is_safe_folder_name("trailing."));
        assert!(!is_safe_folder_name("trailing "));
        assert!(!is_safe_folder_name(&"a".repeat(101)));
    }

    #[test]
    fn safe_folder_name_accepts_valid_names() {
        assert!(is_safe_folder_name("My Project"));
        assert!(is_safe_folder_name("api-tests"));
        assert!(is_safe_folder_name("workspace_1"));
        assert!(is_safe_folder_name("Тест"));
        assert!(is_safe_folder_name(&"a".repeat(100)));
    }

    #[test]
    #[cfg(unix)]
    fn path_traversal_rejected_symlink_escape() {
        use std::os::unix::fs as unix_fs;

        let root = tmp_root();
        create(root.path(), Some("Symlink Escape")).unwrap();

        let adaka_dir = root.path().join(ADAKA_DIR);
        let link_path = adaka_dir.join("escape-link");
        // Symlink pointing outside .adaka/ — should be caught by
        // canonicalize-based containment check.
        unix_fs::symlink("/tmp", &link_path).unwrap();

        let err = read_file(root.path(), "escape-link/some-file").unwrap_err();
        assert!(
            matches!(err, WorkspaceError::PathTraversal(_)),
            "expected PathTraversal for symlink escape, got: {err}"
        );
    }
}
