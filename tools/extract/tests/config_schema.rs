use std::path::PathBuf;

#[test]
fn config_schema_has_expected_shape() {
    let out = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent().unwrap()
        .parent().unwrap()
        .join("src-frontend/data/config-schema.json");
    if !out.exists() {
        eprintln!("skipping: {} not present (run `just extract`)", out.display());
        return;
    }
    let raw = std::fs::read_to_string(&out).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
    let sections = parsed["sections"].as_array().expect("sections array");
    assert!(sections.len() >= 5, "expected >=5 sections, got {}", sections.len());

    let mut total_options = 0;
    let mut found = (false, false, false);
    for s in sections {
        for o in s["options"].as_array().unwrap() {
            total_options += 1;
            match o["var"].as_str().unwrap_or("") {
                "resistancePenalty" => found.0 = true,
                "conditionLowLife" => found.1 = true,
                "enemyIsBoss" => found.2 = true,
                _ => {}
            }
        }
    }
    assert!(total_options >= 400, "expected >=400 options, got {}", total_options);
    assert!(found.0 && found.1 && found.2, "missing spot-check options: {:?}", found);
}
