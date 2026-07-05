use std::path::Path;

use serde::{Deserialize, Serialize};

use super::workspace::WorkspaceError;

// ---------------------------------------------------------------------------
// Request tree types
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
    build_tree(&requests_dir, "requests")
}

fn build_tree(dir: &Path, relative_prefix: &str) -> Result<Vec<TreeNode>, WorkspaceError> {
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
            let children = build_tree(&entry.path(), &relative_path)?;
            folders.push(TreeNode::Folder {
                name: file_name,
                path: relative_path,
                children,
            });
        } else if file_name.ends_with(".req.toml") {
            let (name, method) = parse_request_meta(&entry.path());
            requests.push(TreeNode::Request {
                name,
                path: relative_path,
                method,
            });
        }
    }

    // Apply collection.toml ordering if present
    let collection_path = dir.join("collection.toml");
    let order = if collection_path.is_file() {
        parse_collection_order(&collection_path)
    } else {
        Vec::new()
    };

    let mut result = merge_with_order(folders, requests, &order);
    // Stable sort: ordered items first by order index, unordered items alphabetically after
    result.sort_by(|a, b| {
        let a_idx = order_index(&order, node_slug(a));
        let b_idx = order_index(&order, node_slug(b));
        match (a_idx, b_idx) {
            (Some(ai), Some(bi)) => ai.cmp(&bi),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => node_slug(a).cmp(node_slug(b)),
        }
    });

    Ok(result)
}

fn merge_with_order(
    folders: Vec<TreeNode>,
    requests: Vec<TreeNode>,
    _order: &[String],
) -> Vec<TreeNode> {
    let mut all = Vec::with_capacity(folders.len() + requests.len());
    all.extend(folders);
    all.extend(requests);
    all
}

fn node_slug(node: &TreeNode) -> &str {
    match node {
        TreeNode::Folder { name, .. } => name,
        TreeNode::Request { path, .. } => {
            // Slug is the filename without .req.toml
            let fname = path.rsplit('/').next().unwrap_or(path);
            fname.strip_suffix(".req.toml").unwrap_or(fname)
        }
    }
}

fn order_index(order: &[String], slug: &str) -> Option<usize> {
    order.iter().position(|s| s == slug)
}

fn parse_collection_order(path: &Path) -> Vec<String> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let doc: toml_edit::DocumentMut = match content.parse() {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };
    let Some(arr) = doc.get("order").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect()
}

fn parse_request_meta(path: &Path) -> (String, String) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return (slug_from_path(path), "GET".to_string()),
    };
    let doc: toml_edit::DocumentMut = match content.parse() {
        Ok(d) => d,
        Err(_) => return (slug_from_path(path), "GET".to_string()),
    };
    let name = doc
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| slug_from_path(path));
    let method = doc
        .get("method")
        .and_then(|v| v.as_str())
        .map(|s| s.to_uppercase())
        .unwrap_or_else(|| "GET".to_string());
    (name, method)
}

fn slug_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unnamed")
        .strip_suffix(".req")
        .unwrap_or(
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unnamed"),
        )
        .to_string()
}

// ---------------------------------------------------------------------------
// Tauri command
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn api_list_requests(workspace_path: String) -> Result<Vec<TreeNode>, WorkspaceError> {
    let root = Path::new(&workspace_path);
    list_requests(root)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::workspace;

    fn setup_workspace(tmp: &tempfile::TempDir) {
        workspace::create(tmp.path(), Some("Test")).unwrap();
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
            TreeNode::Request { name, method, path } => {
                assert_eq!(name, "Get Users");
                assert_eq!(method, "GET");
                assert_eq!(path, "requests/get-users.req.toml");
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
    fn collection_toml_ordering() {
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
        // b-second should come first per collection.toml
        match &result[0] {
            TreeNode::Request { name, .. } => assert_eq!(name, "B Second"),
            _ => panic!("expected Request"),
        }
        match &result[1] {
            TreeNode::Request { name, .. } => assert_eq!(name, "A First"),
            _ => panic!("expected Request"),
        }
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
        // m-ordered first (it's in the order list), then a-first, z-last alphabetically
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
    fn method_defaults_to_get_on_parse_error() {
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
            TreeNode::Request { method, .. } => assert_eq!(method, "GET"),
            _ => panic!("expected Request"),
        }
    }
}
