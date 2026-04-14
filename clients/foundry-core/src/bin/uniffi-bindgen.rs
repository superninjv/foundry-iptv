// Binary helper for generating foreign-language bindings from the UDL.
// Invoked as `cargo run --features uniffi --bin uniffi-bindgen -- generate ...`.
fn main() {
    uniffi::uniffi_bindgen_main()
}
