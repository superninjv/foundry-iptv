// Generate uniffi scaffolding from the UDL unconditionally. The scaffolding
// file is only *included* when the `uniffi` feature is on (see lib.rs), so
// the generated file is harmless for non-uniffi builds — it just sits in
// OUT_DIR unused.
fn main() {
    uniffi_build::generate_scaffolding("src/foundry_core.udl").unwrap();
}
