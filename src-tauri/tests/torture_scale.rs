#![cfg(test)]

//! Scale torture: import a 500-request/40-folder Postman collection and verify
//! it completes within budget, all files are parseable, and no corruption occurs.

use std::time::Instant;

use adaka_lib::modules::api_client::import::import_postman;

fn generate_postman_fixture(request_count: usize, folder_count: usize) -> String {
    let mut folders = Vec::new();
    let requests_per_folder = request_count / folder_count;

    for f in 0..folder_count {
        let start = f * requests_per_folder;
        let end = if f == folder_count - 1 {
            request_count
        } else {
            start + requests_per_folder
        };

        let mut items = Vec::new();
        for r in start..end {
            let method = match r % 5 {
                0 => "GET",
                1 => "POST",
                2 => "PUT",
                3 => "PATCH",
                _ => "DELETE",
            };
            let body = if matches!(method, "POST" | "PUT" | "PATCH") {
                format!(
                    r#","body":{{"mode":"raw","raw":"{{\"key_{r}\":\"value_{r}\",\"nested\":{{\"a\":{r}}}}}","options":{{"raw":{{"language":"json"}}}}}}"#,
                )
            } else {
                String::new()
            };
            items.push(format!(
                r#"{{"name":"request-{r}-abcdef","request":{{"method":"{method}","url":{{"raw":"https://api.example.com/v1/resource-{r}?page=1&limit=10","query":[{{"key":"page","value":"1"}},{{"key":"limit","value":"10"}}]}},"header":[{{"key":"Authorization","value":"Bearer {{{{TOKEN}}}}"}},{{"key":"X-Request-Id","value":"req-{r}"}}]{body}}}}}"#,
            ));
        }

        folders.push(format!(
            r#"{{"name":"folder-{f}-test","item":[{}]}}"#,
            items.join(",")
        ));
    }

    format!(
        r#"{{"info":{{"name":"Torture 500","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"}},"item":[{}],"variable":[{{"key":"TOKEN","value":"test-token"}},{{"key":"BASE_URL","value":"http://localhost:3000"}}]}}"#,
        folders.join(",")
    )
}

fn tmp_workspace() -> tempfile::TempDir {
    let root = tempfile::tempdir().expect("failed to create temp dir");
    adaka_lib::test_helpers::create_workspace(root.path());
    root
}

#[test]
fn import_500_requests_within_budget() {
    let root = tmp_workspace();
    let json = generate_postman_fixture(500, 40);

    // Verify it's valid JSON
    let parsed: serde_json::Value = serde_json::from_str(&json).expect("fixture is not valid JSON");
    let item_count: usize = parsed["item"]
        .as_array()
        .unwrap()
        .iter()
        .map(|folder| folder["item"].as_array().map(|a| a.len()).unwrap_or(0))
        .sum();
    assert_eq!(item_count, 500);

    let start = Instant::now();
    let report = import_postman(root.path(), &json, "").expect("import failed");
    let elapsed = start.elapsed();

    assert_eq!(report.imported_count, 500);

    // Budget: import of 500 requests should complete within 30 seconds on any machine.
    // On a modern SSD this typically takes 2-5s. We use a generous budget to avoid
    // flaky CI failures but catch catastrophic regressions.
    assert!(
        elapsed.as_secs() < 30,
        "Import took {elapsed:?} — budget is 30s"
    );

    // Every written .req.toml must be parseable
    let mut req_count = 0;
    for path in &report.files_written {
        if path.ends_with(".req.toml") {
            let raw = adaka_lib::core::workspace::read_file(root.path(), path)
                .unwrap_or_else(|e| panic!("failed to read {path}: {e}"));
            adaka_lib::modules::api_client::format::parse_request(&raw, path)
                .unwrap_or_else(|e| panic!("failed to parse {path}: {e}"));
            req_count += 1;
        }
    }
    assert_eq!(req_count, 500);

    // Collection ordering files should also parse
    for path in &report.files_written {
        if path.ends_with("collection.toml") {
            let raw = adaka_lib::core::workspace::read_file(root.path(), path).unwrap();
            adaka_lib::modules::api_client::format::parse_collection(&raw, path)
                .unwrap_or_else(|e| panic!("failed to parse {path}: {e}"));
        }
    }

    println!(
        "✓ 500-request import: {elapsed:?}, {} files written",
        report.files_written.len()
    );
}
