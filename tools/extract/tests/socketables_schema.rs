use std::path::PathBuf;

#[test]
fn socketables_schema_has_expected_shape() {
    let out = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent().unwrap()
        .parent().unwrap()
        .join("src-frontend/data/socketables.json");
    if !out.exists() {
        eprintln!("skipping: {} not present (run `just extract`)", out.display());
        return;
    }
    let raw = std::fs::read_to_string(&out).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
    let obj = parsed.as_object().expect("top-level object");
    assert!(obj.len() >= 20, "expected >=20 socketables, got {}", obj.len());

    // Spot-check three known names that exist in the upstream file.
    let spot = [
        "Lady Hestra's Rune of Winter",
        "Soul Core of Quipolatl",
        "Soul Core of Topotante",
    ];
    for name in spot {
        let entry = obj.get(name).unwrap_or_else(|| panic!("missing: {}", name));
        let slots = entry.get("slots").and_then(|v| v.as_object())
            .unwrap_or_else(|| panic!("{} has no slots object", name));
        assert!(!slots.is_empty(), "{} has empty slots", name);
        for (slot_name, slot_entry) in slots {
            let mods = slot_entry.get("mods").and_then(|v| v.as_array())
                .unwrap_or_else(|| panic!("{}/{} has no mods array", name, slot_name));
            assert!(!mods.is_empty(), "{}/{} has empty mods", name, slot_name);
        }
    }
}
