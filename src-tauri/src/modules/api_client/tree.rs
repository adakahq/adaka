use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::core::workspace::{self, WorkspaceError};

use super::format;
use super::inheritance::resolve_order;

// ---------------------------------------------------------------------------
// Tree node types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum TreeNode {
    #[serde(rename = "folder")]
    Folder {
        name: String,
        path: String,
        children: Vec<TreeNode>,
    },
    #[serde(rename = "request")]
    Request {
        name: String,
        path: String,
        method: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        parse_error: Option<String>,
    },
}

// ---------------------------------------------------------------------------
// List requests
// ---------------------------------------------------------------------------

/// Walk `.adaka/requests/` and return a tree of folders + requests,
/// applying `collection.toml` ordering where present.
pub fn list_requests(root: &Path) -> Result<Vec<TreeNode>, WorkspaceError> {
    let adaka_dir = root.join(".adaka");
    if !adaka_dir.join("workspace.toml").is_file() {
        return Err(WorkspaceError::NotInitialised);
    }
    let requests_dir = adaka_dir.join("requests");
    if !requests_dir.is_dir() {
        return Ok(Vec::new());
    }
    build_tree(root, &requests_dir, "requests")
}

fn build_tree(
    root: &Path,
    dir: &Path,
    relative_prefix: &str,
) -> Result<Vec<TreeNode>, WorkspaceError> {
    let mut folders: Vec<TreeNode> = Vec::new();
    let mut requests: Vec<TreeNode> = Vec::new();

    let entries = std::fs::read_dir(dir)?;
    for entry in entries {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name == "collection.toml" {
            continue;
        }

        let relative_path = format!("{}/{}", relative_prefix, file_name);

        if file_type.is_dir() {
            let children = build_tree(root, &entry.path(), &relative_path)?;
            folders.push(TreeNode::Folder {
                name: file_name,
                path: relative_path,
                children,
            });
        } else if file_name.ends_with(".req.toml") {
            let node = parse_request_node(root, &relative_path, &file_name);
            requests.push(node);
        }
    }

    // Read collection.toml ordering via format::parse_collection
    let order = read_collection_order(root, relative_prefix);

    // Collect slugs for resolve_order
    let all_slugs: Vec<String> = folders
        .iter()
        .chain(requests.iter())
        .map(|n| node_slug(n).to_string())
        .collect();

    let ordered_slugs = resolve_order(&order, &all_slugs);

    // Build a combined vec and sort by the resolved order
    let mut all: Vec<TreeNode> = Vec::with_capacity(folders.len() + requests.len());
    all.extend(folders);
    all.extend(requests);

    all.sort_by_key(|n| {
        ordered_slugs
            .iter()
            .position(|s| s == node_slug(n))
            .unwrap_or(usize::MAX)
    });

    Ok(all)
}

/// Parse a request file, returning a TreeNode. Broken files get an error badge
/// instead of silently defaulting to GET.
fn parse_request_node(root: &Path, relative_path: &str, file_name: &str) -> TreeNode {
    let slug = file_name.strip_suffix(".req.toml").unwrap_or(file_name);

    match workspace::read_file(root, relative_path) {
        Ok(raw) => match format::parse_request(&raw, relative_path) {
            Ok(req) => TreeNode::Request {
                name: req.name,
                path: relative_path.to_string(),
                method: req.method,
                parse_error: None,
            },
            Err(detail) => TreeNode::Request {
                name: slug.to_string(),
                path: relative_path.to_string(),
                method: "GET".to_string(),
                parse_error: Some(detail),
            },
        },
        Err(e) => TreeNode::Request {
            name: slug.to_string(),
            path: relative_path.to_string(),
            method: "GET".to_string(),
            parse_error: Some(e.to_string()),
        },
    }
}

fn read_collection_order(root: &Path, folder_relative: &str) -> Vec<String> {
    let collection_path = format!("{}/collection.toml", folder_relative);
    let raw = match workspace::read_file(root, &collection_path) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    match format::parse_collection(&raw, &collection_path) {
        Ok(config) => config.order,
        Err(_) => Vec::new(),
    }
}

fn node_slug(node: &TreeNode) -> &str {
    match node {
        TreeNode::Folder { name, .. } => name,
        TreeNode::Request { path, .. } => {
            let fname = path.rsplit('/').next().unwrap_or(path);
            fname.strip_suffix(".req.toml").unwrap_or(fname)
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_workspace(tmp: &tempfile::TempDir) {
        workspace::create(tmp.path(), Some("Test")).unwrap();
        // Remove seeded welcome.req.toml so tree tests start clean
        let welcome = tmp.path().join(".adaka").join("requests").join("welcome.req.toml");
        let _ = std::fs::remove_file(welcome);
    }

    fn write_file(tmp: &tempfile::TempDir, relative: &str, content: &str) {
        workspace::write_file(tmp.path(), relative, content).unwrap();
    }

    #[test]
    fn empty_workspace_returns_empty_vec() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);
        let result = list_requests(tmp.path()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn single_request_found() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);
        write_file(
            &tmp,
            "requests/get-users.req.toml",
            "version = 1\nname = \"Get Users\"\nmethod = \"GET\"\nurl = \"http://example.com\"\n",
        );

        let result = list_requests(tmp.path()).unwrap();
        assert_eq!(result.len(), 1);
        match &result[0] {
            TreeNode::Request {
                name,
                method,
                path,
                parse_error,
            } => {
                assert_eq!(name, "Get Users");
                assert_eq!(method, "GET");
                assert_eq!(path, "requests/get-users.req.toml");
                assert!(parse_error.is_none());
            }
            _ => panic!("expected Request node"),
        }
    }

    #[test]
    fn folder_with_children() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);
        write_file(
            &tmp,
            "requests/users/list.req.toml",
            "version = 1\nname = \"List Users\"\nmethod = \"GET\"\nurl = \"http://example.com/users\"\n",
        );
        write_file(
            &tmp,
            "requests/users/create.req.toml",
            "version = 1\nname = \"Create User\"\nmethod = \"POST\"\nurl = \"http://example.com/users\"\n",
        );

        let result = list_requests(tmp.path()).unwrap();
        assert_eq!(result.len(), 1);
        match &result[0] {
            TreeNode::Folder { name, children, .. } => {
                assert_eq!(name, "users");
                assert_eq!(children.len(), 2);
            }
            _ => panic!("expected Folder node"),
        }
    }

    #[test]
    fn collection_toml_ordering_applied() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);
        write_file(
            &tmp,
            "requests/b-second.req.toml",
            "version = 1\nname = \"B Second\"\nmethod = \"GET\"\nurl = \"http://example.com\"\n",
        );
        write_file(
            &tmp,
            "requests/a-first.req.toml",
            "version = 1\nname = \"A First\"\nmethod = \"POST\"\nurl = \"http://example.com\"\n",
        );
        write_file(
            &tmp,
            "requests/collection.toml",
            "version = 1\norder = [\"b-second\", \"a-first\"]\n",
        );

        let result = list_requests(tmp.path()).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(node_slug(&result[0]), "b-second");
        assert_eq!(node_slug(&result[1]), "a-first");
    }

    #[test]
    fn unordered_items_sort_alphabetically_after_ordered() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);
        write_file(
            &tmp,
            "requests/z-last.req.toml",
            "version = 1\nname = \"Z Last\"\nmethod = \"GET\"\nurl = \"http://x.com\"\n",
        );
        write_file(
            &tmp,
            "requests/a-first.req.toml",
            "version = 1\nname = \"A First\"\nmethod = \"GET\"\nurl = \"http://x.com\"\n",
        );
        write_file(
            &tmp,
            "requests/m-ordered.req.toml",
            "version = 1\nname = \"M Ordered\"\nmethod = \"GET\"\nurl = \"http://x.com\"\n",
        );
        write_file(
            &tmp,
            "requests/collection.toml",
            "version = 1\norder = [\"m-ordered\"]\n",
        );

        let result = list_requests(tmp.path()).unwrap();
        assert_eq!(result.len(), 3);
        assert_eq!(node_slug(&result[0]), "m-ordered");
        assert_eq!(node_slug(&result[1]), "a-first");
        assert_eq!(node_slug(&result[2]), "z-last");
    }

    #[test]
    fn non_initialised_workspace_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let err = list_requests(tmp.path()).unwrap_err();
        assert!(matches!(err, WorkspaceError::NotInitialised));
    }

    #[test]
    fn broken_toml_surfaces_parse_error() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);
        // Write invalid TOML directly (workspace::write_file rejects invalid TOML)
        let requests_dir = tmp.path().join(".adaka").join("requests");
        std::fs::create_dir_all(&requests_dir).unwrap();
        std::fs::write(
            requests_dir.join("broken.req.toml"),
            "this is not valid toml {{{",
        )
        .unwrap();

        let result = list_requests(tmp.path()).unwrap();
        assert_eq!(result.len(), 1);
        match &result[0] {
            TreeNode::Request {
                name, parse_error, ..
            } => {
                assert_eq!(name, "broken");
                assert!(parse_error.is_some(), "expected parse_error to be set");
            }
            _ => panic!("expected Request"),
        }
    }

    #[test]
    fn empty_folder_appears_in_tree() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);
        // Create an empty folder with just a collection.toml
        write_file(
            &tmp,
            "requests/empty-group/collection.toml",
            "version = 1\norder = []\n",
        );

        let result = list_requests(tmp.path()).unwrap();
        assert_eq!(result.len(), 1);
        match &result[0] {
            TreeNode::Folder { name, children, .. } => {
                assert_eq!(name, "empty-group");
                assert!(children.is_empty());
            }
            _ => panic!("expected Folder node"),
        }
    }

    #[test]
    fn unlisted_files_come_after_ordered_ones() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);
        write_file(
            &tmp,
            "requests/delta.req.toml",
            "version = 1\nname = \"Delta\"\nmethod = \"DELETE\"\nurl = \"http://x.com\"\n",
        );
        write_file(
            &tmp,
            "requests/alpha.req.toml",
            "version = 1\nname = \"Alpha\"\nmethod = \"GET\"\nurl = \"http://x.com\"\n",
        );
        write_file(
            &tmp,
            "requests/charlie.req.toml",
            "version = 1\nname = \"Charlie\"\nmethod = \"PUT\"\nurl = \"http://x.com\"\n",
        );
        // Only delta is in the order list
        write_file(
            &tmp,
            "requests/collection.toml",
            "version = 1\norder = [\"delta\"]\n",
        );

        let result = list_requests(tmp.path()).unwrap();
        assert_eq!(result.len(), 3);
        // delta first (ordered), then alpha, charlie (alphabetical)
        assert_eq!(node_slug(&result[0]), "delta");
        assert_eq!(node_slug(&result[1]), "alpha");
        assert_eq!(node_slug(&result[2]), "charlie");
    }

    #[test]
    fn order_with_nonexistent_entries_skips_them() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);
        write_file(
            &tmp,
            "requests/real.req.toml",
            "version = 1\nname = \"Real\"\nmethod = \"GET\"\nurl = \"http://x.com\"\n",
        );
        write_file(
            &tmp,
            "requests/collection.toml",
            "version = 1\norder = [\"ghost\", \"real\", \"phantom\"]\n",
        );

        let result = list_requests(tmp.path()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(node_slug(&result[0]), "real");
    }
}
