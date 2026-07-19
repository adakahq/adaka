#![cfg(test)]

//! Filesystem hostility tests: unicode paths, read-only dirs, deleted workspaces,
//! concurrent atomic writes proving last-write-wins without corruption.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

use adaka_lib::core::workspace;

// ===========================================================================
// Workspace on a path with spaces and unicode
// ===========================================================================

#[test]
fn workspace_with_spaces_in_path() {
    let base = tempfile::tempdir().unwrap();
    let spaced = base.path().join("My Projects").join("API Tests");
    fs::create_dir_all(&spaced).unwrap();

    let info = workspace::create(&spaced, Some("Spaced Path Test")).unwrap();
    assert_eq!(info.name, "Spaced Path Test");

    // Write and read back a file
    workspace::write_file(
        &spaced,
        "environments/local.toml",
        "version = 1\n\n[vars]\nBASE = \"http://localhost\"\n",
    )
    .unwrap();
    let content = workspace::read_file(&spaced, "environments/local.toml").unwrap();
    assert!(content.contains("BASE"));

    // Reopen
    let reopened = workspace::open(&spaced).unwrap();
    assert_eq!(reopened.id, info.id);
}

#[test]
fn workspace_with_unicode_path() {
    let base = tempfile::tempdir().unwrap();
    let unicode_path = base.path().join("项目").join("テスト_🚀");
    fs::create_dir_all(&unicode_path).unwrap();

    let info = workspace::create(&unicode_path, Some("Unicode Path")).unwrap();
    assert_eq!(info.name, "Unicode Path");

    workspace::write_file(
        &unicode_path,
        "requests/test.req.toml",
        "version = 1\nname = \"Test\"\nmethod = \"GET\"\nurl = \"http://localhost\"\n",
    )
    .unwrap();

    let content = workspace::read_file(&unicode_path, "requests/test.req.toml").unwrap();
    assert!(content.contains("Test"));

    let reopened = workspace::open(&unicode_path).unwrap();
    assert_eq!(reopened.id, info.id);
}

// ===========================================================================
// Read-only .adaka dir — every write surfaces a teaching error, no crash
// ===========================================================================

#[cfg(unix)]
#[test]
fn readonly_adaka_dir_surfaces_clean_error() {
    use std::os::unix::fs::PermissionsExt;

    let root = tempfile::tempdir().unwrap();
    workspace::create(root.path(), Some("Readonly Test")).unwrap();

    let adaka_dir = root.path().join(".adaka");
    let env_dir = adaka_dir.join("environments");

    // Make the environments directory read-only
    fs::set_permissions(&env_dir, fs::Permissions::from_mode(0o555)).unwrap();

    // Attempt to write — should fail with IO error, not panic
    let result = workspace::write_file(
        root.path(),
        "environments/new.toml",
        "version = 1\n[vars]\nfoo = \"bar\"\n",
    );
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("Permission denied") || err.contains("permission") || err.contains("IO"),
        "Error should be about permissions: {err}"
    );

    // Restore permissions for cleanup
    fs::set_permissions(&env_dir, fs::Permissions::from_mode(0o755)).unwrap();
}

#[cfg(windows)]
#[test]
fn readonly_file_surfaces_clean_error() {
    let root = tempfile::tempdir().unwrap();
    workspace::create(root.path(), Some("Readonly Test")).unwrap();

    // Write a file, then make it read-only
    workspace::write_file(
        root.path(),
        "environments/locked.toml",
        "version = 1\n[vars]\noriginal = \"true\"\n",
    )
    .unwrap();

    let file_path = root
        .path()
        .join(".adaka")
        .join("environments")
        .join("locked.toml");
    let mut perms = fs::metadata(&file_path).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&file_path, perms).unwrap();

    // Attempt to overwrite — should fail cleanly
    let result = workspace::write_file(
        root.path(),
        "environments/locked.toml",
        "version = 1\n[vars]\nchanged = \"true\"\n",
    );
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        !err.is_empty(),
        "Should give a meaningful error for read-only file"
    );

    // Restore for cleanup
    let mut perms = fs::metadata(&file_path).unwrap().permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    perms.set_readonly(false);
    fs::set_permissions(&file_path, perms).unwrap();
}

// ===========================================================================
// Workspace deleted from disk — graceful error, not panic
// ===========================================================================

#[test]
fn deleted_workspace_gives_clean_error() {
    let root = tempfile::tempdir().unwrap();
    let ws_path = root.path().to_path_buf();
    workspace::create(&ws_path, Some("Ephemeral")).unwrap();

    // Delete the .adaka dir
    fs::remove_dir_all(ws_path.join(".adaka")).unwrap();

    // Attempting to open should fail cleanly
    let result = workspace::open(&ws_path);
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("not initialised") || err.contains("workspace.toml"),
        "Should mention missing workspace.toml: {err}"
    );

    // Reading a file from a deleted workspace should also fail cleanly
    let result = workspace::read_file(&ws_path, "environments/local.toml");
    assert!(result.is_err());
}

#[test]
fn nonexistent_directory_gives_clean_error() {
    let path = PathBuf::from(if cfg!(windows) {
        "C:\\nonexistent_adaka_test_path_12345"
    } else {
        "/tmp/nonexistent_adaka_test_path_12345"
    });

    let result = workspace::open(&path);
    assert!(result.is_err());

    let result = workspace::create(&path, Some("Test"));
    assert!(result.is_err());
}

// ===========================================================================
// Concurrent atomic writes — last-write-wins without corruption
// ===========================================================================

#[test]
fn concurrent_atomic_writes_no_corruption() {
    let root = tempfile::tempdir().unwrap();
    workspace::create(root.path(), Some("Concurrent")).unwrap();

    let root_path = Arc::new(root.path().to_path_buf());
    let mut handles = Vec::new();

    // 20 threads writing to the same file simultaneously
    for i in 0..20 {
        let path = Arc::clone(&root_path);
        handles.push(thread::spawn(move || {
            let content =
                format!("version = 1\n\n[vars]\nwriter = \"thread-{i}\"\nsequence = \"{i}\"\n");
            // Each thread writes 10 times
            for _ in 0..10 {
                let _ = workspace::write_file(&path, "environments/contested.toml", &content);
                thread::yield_now();
            }
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    // The file must exist and be valid TOML — not corrupted by interleaving
    let final_content = workspace::read_file(root.path(), "environments/contested.toml").unwrap();

    // Must parse as valid TOML
    let doc: toml_edit::DocumentMut = final_content
        .parse()
        .expect("File was corrupted by concurrent writes — not valid TOML");

    // Must have the expected structure
    assert_eq!(doc["version"].as_integer(), Some(1));
    let writer = doc["vars"]["writer"].as_str().unwrap();
    assert!(
        writer.starts_with("thread-"),
        "Content should be from one of the writers: {writer}"
    );
}

#[test]
fn concurrent_writes_to_different_files_no_interference() {
    let root = tempfile::tempdir().unwrap();
    workspace::create(root.path(), Some("Parallel")).unwrap();

    let root_path = Arc::new(root.path().to_path_buf());
    let mut handles = Vec::new();

    // 10 threads, each writing to their own file
    for i in 0..10 {
        let path = Arc::clone(&root_path);
        handles.push(thread::spawn(move || {
            let file_rel = format!("requests/req-{i}.req.toml");
            let content = format!(
                "version = 1\nname = \"Request {i}\"\nmethod = \"GET\"\nurl = \"http://localhost/{i}\"\n"
            );
            workspace::write_file(&path, &file_rel, &content).unwrap();
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    // Verify all 10 files are intact and parseable
    for i in 0..10 {
        let file_rel = format!("requests/req-{i}.req.toml");
        let content = workspace::read_file(root.path(), &file_rel).unwrap();
        let req = adaka_lib::modules::api_client::format::parse_request(&content, &file_rel)
            .unwrap_or_else(|e| panic!("File {file_rel} corrupted: {e}"));
        assert_eq!(req.name, format!("Request {i}"));
        assert_eq!(req.url, format!("http://localhost/{i}"));
    }
}
