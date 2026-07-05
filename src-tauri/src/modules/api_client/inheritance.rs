use std::collections::BTreeMap;
use std::path::Path;

use crate::core::workspace;

use super::format::{parse_collection, AuthConfig, CollectionDefaults, RequestFile};
use super::ApiClientError;

/// Walk from the request's folder upward to `requests/`, collecting
/// collection.toml defaults at each level, then apply inheritance rules:
/// - Headers: merge downward (parent → child), request-level wins
/// - Auth: request `auth.type = "inherit"` resolves to nearest concrete auth
///   walking upward from innermost folder
pub fn resolve_inheritance(
    root: &Path,
    request_path: &str,
    mut req: RequestFile,
) -> Result<RequestFile, ApiClientError> {
    let folder_chain = ancestor_folders(request_path);
    let defaults_chain = load_defaults_chain(root, &folder_chain)?;

    // Merge headers: start from outermost ancestor, layer inward, request wins
    let mut merged_headers: BTreeMap<String, String> = BTreeMap::new();
    for defaults in &defaults_chain {
        for (k, v) in &defaults.headers {
            merged_headers.insert(k.clone(), v.clone());
        }
    }
    for (k, v) in &req.headers {
        merged_headers.insert(k.clone(), v.clone());
    }
    req.headers = merged_headers;

    // Auth: if request says "inherit", walk the chain innermost-first
    if req.auth.auth_type == "inherit" {
        for defaults in defaults_chain.iter().rev() {
            if let Some(auth) = &defaults.auth {
                if auth.auth_type != "inherit" {
                    req.auth = auth.clone();
                    break;
                }
            }
        }
        if req.auth.auth_type == "inherit" {
            req.auth = AuthConfig {
                auth_type: "none".to_string(),
                ..Default::default()
            };
        }
    }

    Ok(req)
}

fn ancestor_folders(request_path: &str) -> Vec<String> {
    let normalized = request_path.replace('\\', "/");
    let parts: Vec<&str> = normalized.split('/').collect();
    let folder_parts = &parts[..parts.len().saturating_sub(1)];

    let mut chain = Vec::new();
    let mut accumulated = String::new();
    for part in folder_parts {
        if accumulated.is_empty() {
            accumulated = (*part).to_string();
        } else {
            accumulated = format!("{}/{}", accumulated, part);
        }
        chain.push(accumulated.clone());
    }
    chain
}

fn load_defaults_chain(
    root: &Path,
    folders: &[String],
) -> Result<Vec<CollectionDefaults>, ApiClientError> {
    let mut chain = Vec::new();
    for folder in folders {
        let collection_path = format!("{}/collection.toml", folder);
        match workspace::read_file(root, &collection_path) {
            Ok(raw) => {
                let config = parse_collection(&raw, &collection_path).map_err(|detail| {
                    ApiClientError::Parse {
                        file: collection_path,
                        detail,
                    }
                })?;
                chain.push(config.defaults);
            }
            Err(workspace::WorkspaceError::Io(ref e))
                if e.kind() == std::io::ErrorKind::NotFound =>
            {
                chain.push(CollectionDefaults::default());
            }
            Err(workspace::WorkspaceError::Io(_)) => {
                chain.push(CollectionDefaults::default());
            }
            Err(e) => return Err(e.into()),
        }
    }
    Ok(chain)
}

#[allow(dead_code)]
pub fn resolve_order(order: &[String], files_on_disk: &[String]) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for entry in order {
        if files_on_disk.contains(entry) {
            result.push(entry.clone());
            seen.insert(entry.clone());
        }
    }

    let mut remaining: Vec<&String> = files_on_disk
        .iter()
        .filter(|f| !seen.contains(*f))
        .collect();
    remaining.sort();
    for f in remaining {
        result.push(f.clone());
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::workspace;
    use tempfile::TempDir;

    fn setup_workspace(tmp: &TempDir) {
        workspace::create(tmp.path(), Some("Test")).unwrap();
    }

    fn write_req(tmp: &TempDir, relative: &str, content: &str) {
        workspace::write_file(tmp.path(), relative, content).unwrap();
    }

    #[test]
    fn inheritance_three_levels_headers_merge() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);

        write_req(
            &tmp,
            "requests/collection.toml",
            "version = 1\n[defaults.headers]\nAccept = \"application/json\"\nX-Root = \"root-value\"\n",
        );
        write_req(
            &tmp,
            "requests/users/collection.toml",
            "version = 1\n[defaults.headers]\nAccept = \"text/plain\"\nX-Mid = \"mid-value\"\n",
        );
        write_req(
            &tmp,
            "requests/users/admin/collection.toml",
            "version = 1\n[defaults.headers]\nX-Leaf = \"leaf-value\"\n",
        );

        let req_content = "version = 1\nname = \"Create admin\"\nmethod = \"POST\"\nurl = \"http://example.com\"\n\n[headers]\nX-Request = \"req-value\"\nX-Leaf = \"overridden-by-request\"\n";
        write_req(&tmp, "requests/users/admin/create.req.toml", req_content);

        let raw = workspace::read_file(tmp.path(), "requests/users/admin/create.req.toml").unwrap();
        let req = super::super::format::parse_request(&raw, "requests/users/admin/create.req.toml")
            .unwrap();
        let resolved =
            resolve_inheritance(tmp.path(), "requests/users/admin/create.req.toml", req).unwrap();

        assert_eq!(resolved.headers.get("X-Root").unwrap(), "root-value");
        assert_eq!(resolved.headers.get("X-Mid").unwrap(), "mid-value");
        assert_eq!(resolved.headers.get("Accept").unwrap(), "text/plain");
        assert_eq!(
            resolved.headers.get("X-Leaf").unwrap(),
            "overridden-by-request"
        );
        assert_eq!(resolved.headers.get("X-Request").unwrap(), "req-value");
    }

    #[test]
    fn inheritance_auth_walks_up_to_nearest_concrete() {
        let tmp = tempfile::tempdir().unwrap();
        setup_workspace(&tmp);

        write_req(
            &tmp,
            "requests/collection.toml",
            "version = 1\n[defaults.auth]\ntype = \"bearer\"\ntoken = \"root-token\"\n",
        );
        write_req(
            &tmp,
            "requests/users/collection.toml",
            "version = 1\n[defaults.auth]\ntype = \"basic\"\nusername = \"admin\"\npassword = \"secret\"\n",
        );

        let req_content =
            "version = 1\nname = \"Get user\"\nmethod = \"GET\"\nurl = \"http://example.com\"\n";
        write_req(&tmp, "requests/users/admin/get-user.req.toml", req_content);

        let raw =
            workspace::read_file(tmp.path(), "requests/users/admin/get-user.req.toml").unwrap();
        let req =
            super::super::format::parse_request(&raw, "requests/users/admin/get-user.req.toml")
                .unwrap();
        let resolved =
            resolve_inheritance(tmp.path(), "requests/users/admin/get-user.req.toml", req).unwrap();

        assert_eq!(resolved.auth.auth_type, "basic");
        assert_eq!(resolved.auth.username.as_deref(), Some("admin"));
    }

    #[test]
    fn order_semantics_missing_entries_ignored() {
        let order = vec![
            "list-users".to_string(),
            "create-user".to_string(),
            "ghost".to_string(),
        ];
        let on_disk = vec![
            "list-users".to_string(),
            "create-user".to_string(),
            "delete-user".to_string(),
        ];
        let result = resolve_order(&order, &on_disk);
        assert_eq!(result, vec!["list-users", "create-user", "delete-user"]);
    }

    #[test]
    fn order_semantics_unlisted_files_sorted_alpha() {
        let order = vec!["zebra".to_string()];
        let on_disk = vec!["zebra".to_string(), "alpha".to_string(), "beta".to_string()];
        let result = resolve_order(&order, &on_disk);
        assert_eq!(result, vec!["zebra", "alpha", "beta"]);
    }
}
