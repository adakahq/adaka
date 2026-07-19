#![cfg(test)]

//! Hostile input torture tests: TOML fuzzing, cURL parser battery, import edge cases.

use adaka_lib::core::workspace;
use adaka_lib::modules::api_client::import::{import_postman, parse_curl};

fn tmp_workspace() -> tempfile::TempDir {
    let root = tempfile::tempdir().expect("failed to create temp dir");
    adaka_lib::test_helpers::create_workspace(root.path());
    root
}

// ===========================================================================
// TOML fuzzing — every parser touchpoint must reject or handle gracefully
// ===========================================================================

#[test]
fn toml_10mb_value_accepted_or_rejected_cleanly() {
    let root = tmp_workspace();
    let big_value = "x".repeat(10 * 1024 * 1024);
    let content = format!("version = 1\n\n[vars]\nBIG = \"{big_value}\"\n");

    // write_file validates TOML before writing — should either succeed or
    // return a clean error, never panic or corrupt.
    let result = workspace::write_file(root.path(), "environments/huge.toml", &content);
    // Either outcome is acceptable as long as no panic occurred.
    match result {
        Ok(()) => {
            let read_back = workspace::read_file(root.path(), "environments/huge.toml").unwrap();
            assert!(read_back.contains(&big_value[..100]));
        }
        Err(e) => {
            let msg = e.to_string();
            assert!(
                !msg.is_empty(),
                "Error should have a message, got empty string"
            );
        }
    }
}

#[test]
fn toml_deeply_nested_tables() {
    let root = tmp_workspace();
    // 50-level deep nesting
    let mut content = String::from("version = 1\n");
    let mut path = String::new();
    for i in 0..50 {
        if !path.is_empty() {
            path.push('.');
        }
        path.push_str(&format!("level{i}"));
        content.push_str(&format!("[{path}]\nkey = \"val{i}\"\n"));
    }

    let result = workspace::write_file(root.path(), "environments/deep.toml", &content);
    // toml_edit should handle this fine — it's valid TOML
    assert!(result.is_ok(), "Deep nesting should be valid TOML");
}

#[test]
fn toml_unicode_all_planes() {
    let root = tmp_workspace();
    // BMP, SMP (emoji), RTL, zero-width
    let content = concat!(
        "version = 1\n\n[vars]\n",
        "emoji = \"🎉🦀💯🔥\"\n",
        "rtl = \"مرحبا بالعالم\"\n",
        "chinese = \"你好世界\"\n",
        "zwj = \"👨\u{200D}👩\u{200D}👧\u{200D}👦\"\n",
        "zerowidth = \"abc\u{200B}def\u{FEFF}ghi\"\n",
        "astral = \"\u{1F600}\u{1F4A9}\u{1F680}\"\n",
    );

    let result = workspace::write_file(root.path(), "environments/unicode.toml", content);
    assert!(result.is_ok(), "Unicode should be valid TOML: {result:?}");

    let read_back = workspace::read_file(root.path(), "environments/unicode.toml").unwrap();
    assert!(read_back.contains("🎉🦀💯🔥"));
    assert!(read_back.contains("مرحبا"));
    assert!(read_back.contains("你好世界"));
}

#[test]
fn toml_crlf_lf_mix() {
    let root = tmp_workspace();
    let content =
        "version = 1\r\n\r\n[vars]\r\nkey1 = \"value1\"\nkey2 = \"value2\"\r\nkey3 = \"value3\"\n";

    let result = workspace::write_file(root.path(), "environments/crlf.toml", content);
    assert!(result.is_ok(), "CRLF/LF mix should parse as valid TOML");

    let read_back = workspace::read_file(root.path(), "environments/crlf.toml").unwrap();
    assert!(read_back.contains("value1"));
    assert!(read_back.contains("value2"));
    assert!(read_back.contains("value3"));
}

#[test]
fn toml_null_bytes_rejected_cleanly() {
    let root = tmp_workspace();
    let content = "version = 1\n\n[vars]\nbad = \"hello\x00world\"\n";

    let result = workspace::write_file(root.path(), "environments/null.toml", content);
    // Null bytes in TOML are invalid — should be rejected with a parse error
    assert!(
        result.is_err(),
        "Null bytes should be rejected by TOML parser"
    );
    let err_msg = result.unwrap_err().to_string();
    assert!(!err_msg.is_empty());
}

#[test]
fn toml_invalid_content_never_writes_partial_file() {
    let root = tmp_workspace();
    // First write a valid file
    workspace::write_file(
        root.path(),
        "environments/test.toml",
        "version = 1\n\n[vars]\nfoo = \"bar\"\n",
    )
    .unwrap();

    // Attempt to overwrite with invalid TOML
    let invalid = "this is not valid [[[[ toml ]]]] = {{{";
    let result = workspace::write_file(root.path(), "environments/test.toml", invalid);
    assert!(result.is_err());

    // Original file should be untouched
    let read_back = workspace::read_file(root.path(), "environments/test.toml").unwrap();
    assert!(read_back.contains("foo = \"bar\""));
}

// ===========================================================================
// cURL parser nasty battery
// ===========================================================================

#[test]
fn curl_nested_quotes() {
    // Single quotes containing doubles, doubles containing escaped doubles
    let input = r#"curl -H "Authorization: Bearer 'token with spaces'" -d '{"nested": "\"escaped\""}' https://api.example.com"#;
    let result = parse_curl(input).unwrap();
    assert_eq!(result.url, "https://api.example.com");
    assert!(result
        .headers
        .get("Authorization")
        .unwrap()
        .contains("token with spaces"));
    assert!(result.body.unwrap().contains("\\\"escaped\\\""));
}

#[test]
fn curl_50_headers() {
    let headers: String = (0..50)
        .map(|i| format!("-H 'X-Header-{i}: value-{i}'"))
        .collect::<Vec<_>>()
        .join(" ");
    let input = format!("curl {headers} https://api.example.com/stress");
    let result = parse_curl(&input).unwrap();
    assert_eq!(result.headers.len(), 50);
    assert_eq!(result.headers.get("X-Header-0").unwrap(), "value-0");
    assert_eq!(result.headers.get("X-Header-49").unwrap(), "value-49");
}

#[test]
fn curl_100kb_data_arg() {
    let big_body = "x".repeat(100 * 1024);
    let input = format!("curl -X POST -d '{big_body}' https://api.example.com/big");
    let result = parse_curl(&input).unwrap();
    assert_eq!(result.method, "POST");
    assert_eq!(result.body.as_ref().unwrap().len(), 100 * 1024);
}

#[test]
fn curl_windows_crlf_continuation() {
    let input = "curl \\\r\n  -X POST \\\r\n  -H 'Content-Type: application/json' \\\r\n  https://api.example.com";
    let result = parse_curl(input).unwrap();
    assert_eq!(result.method, "POST");
    assert_eq!(result.url, "https://api.example.com");
}

#[test]
fn curl_unicode_url_and_data() {
    let input = "curl -X POST -d '{\"name\":\"日本語テスト🎌\"}' 'https://api.example.com/你好'";
    let result = parse_curl(input).unwrap();
    assert!(result.url.contains("你好"));
    assert!(result.body.as_ref().unwrap().contains("日本語テスト🎌"));
}

#[test]
fn curl_empty_string_args() {
    let input = "curl -H '' -d '' https://api.example.com";
    let result = parse_curl(input).unwrap();
    assert_eq!(result.url, "https://api.example.com");
}

#[test]
fn curl_url_only_no_flags() {
    let result = parse_curl("curl https://example.com/path?q=1&r=2").unwrap();
    assert_eq!(result.method, "GET");
    assert_eq!(result.url, "https://example.com/path?q=1&r=2");
}

#[test]
fn curl_multiple_data_args_concatenated() {
    let input = "curl -d 'a=1' -d 'b=2' -d 'c=3' https://api.example.com";
    let result = parse_curl(input).unwrap();
    assert_eq!(result.body.unwrap(), "a=1&b=2&c=3");
}

#[test]
fn curl_mixed_quote_styles() {
    let input = r#"curl -H "Content-Type: application/json" -H 'Accept: */*' -d "{\"key\": \"value\"}" https://api.example.com"#;
    let result = parse_curl(input).unwrap();
    assert_eq!(
        result.headers.get("Content-Type").unwrap(),
        "application/json"
    );
    assert_eq!(result.headers.get("Accept").unwrap(), "*/*");
}

#[test]
fn curl_data_raw_flag() {
    let input = "curl --data-raw '{\"raw\":true}' https://api.example.com";
    let result = parse_curl(input).unwrap();
    assert_eq!(result.body.unwrap(), "{\"raw\":true}");
}

#[test]
fn curl_insecure_and_location_flags() {
    let input = "curl -k -L -v -s https://api.example.com/redirect";
    let result = parse_curl(input).unwrap();
    assert_eq!(result.method, "GET");
    assert_eq!(result.url, "https://api.example.com/redirect");
}

// ===========================================================================
// Import JSON edge cases
// ===========================================================================

#[test]
fn import_empty_folders_10_deep() {
    let root = tmp_workspace();
    // Nested empty folders — valid Postman JSON, just no requests in each level
    fn nest_folder(depth: usize) -> String {
        if depth == 0 {
            return r#"{"name":"leaf","request":{"method":"GET","url":{"raw":"/final"}}}"#
                .to_string();
        }
        format!(
            r#"{{"name":"level-{depth}","item":[{}]}}"#,
            nest_folder(depth - 1)
        )
    }

    let json = format!(
        r#"{{"info":{{"name":"Deep Nesting","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"}},"item":[{}]}}"#,
        nest_folder(10)
    );

    let report = import_postman(root.path(), &json, "").unwrap();
    assert_eq!(report.imported_count, 1);
    // The file should exist at the deeply nested path
    assert!(report.files_written.iter().any(|p| p.contains("leaf")));
}

#[test]
fn import_duplicate_names_x50() {
    let root = tmp_workspace();
    let items: Vec<String> = (0..50)
        .map(|_| {
            r#"{"name":"Get Users","request":{"method":"GET","url":{"raw":"/users"}}}"#.to_string()
        })
        .collect();

    let json = format!(
        r#"{{"info":{{"name":"Dups","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"}},"item":[{}]}}"#,
        items.join(",")
    );

    let report = import_postman(root.path(), &json, "").unwrap();
    // All 50 should import — later ones overwrite earlier (same slug = same path)
    // The slugify function produces "get-users" for all, so all 50 write to the same file.
    // This is acceptable: last-write-wins. The important thing is no crash.
    assert!(report.imported_count > 0);
    // Verify the file is parseable
    let raw = workspace::read_file(root.path(), "requests/get-users.req.toml").unwrap();
    adaka_lib::modules::api_client::format::parse_request(&raw, "get-users.req.toml").unwrap();
}

#[test]
fn import_missing_optional_fields_everywhere() {
    let root = tmp_workspace();
    // Minimal JSON: missing method, url, header, body, auth — all optional
    let json = r#"{
        "info": {"name": "Sparse", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
        "item": [
            {"name": "No Method", "request": {"url": {"raw": "/test"}}},
            {"name": "No URL", "request": {"method": "GET"}},
            {"name": "Empty Url Object", "request": {"method": "POST", "url": {}}},
            {"name": "Null Body", "request": {"method": "POST", "url": {"raw": "/test"}, "body": null}},
            {"name": "Empty Name", "request": {"method": "GET", "url": {"raw": "/"}}}
        ]
    }"#;

    let report = import_postman(root.path(), json, "").unwrap();
    assert_eq!(report.imported_count, 5);
}

#[test]
fn import_invalid_json_returns_error() {
    let root = tmp_workspace();
    let result = import_postman(root.path(), "not json at all {{{", "");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Invalid Postman JSON"));
}

#[test]
fn import_valid_json_but_wrong_shape() {
    let root = tmp_workspace();
    // Valid JSON but missing required "info" field
    let result = import_postman(root.path(), r#"{"items": []}"#, "");
    assert!(result.is_err());
}

#[test]
fn import_unicode_request_names() {
    let root = tmp_workspace();
    let json = r#"{
        "info": {"name": "Unicode", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
        "item": [
            {"name": "获取用户 🚀", "request": {"method": "GET", "url": {"raw": "/users"}}},
            {"name": "مستخدمين", "request": {"method": "GET", "url": {"raw": "/ar"}}},
            {"name": "日本語テスト", "request": {"method": "GET", "url": {"raw": "/jp"}}}
        ]
    }"#;

    let report = import_postman(root.path(), json, "").unwrap();
    assert_eq!(report.imported_count, 3);
}

#[test]
fn import_empty_collection() {
    let root = tmp_workspace();
    let json = r#"{
        "info": {"name": "Empty", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
        "item": []
    }"#;

    let report = import_postman(root.path(), json, "").unwrap();
    assert_eq!(report.imported_count, 0);
    assert!(report.files_written.is_empty());
}
