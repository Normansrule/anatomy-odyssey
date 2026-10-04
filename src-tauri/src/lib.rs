//! Anatomy Odyssey desktop shell.
//!
//! The desktop app is the same static web app as the GitHub Pages site,
//! bundled into a native window. It registers no custom commands and grants
//! the page no system permissions (see capabilities/default.json), opens no
//! network listeners, and needs no network access after install.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Anatomy Odyssey could not start");
}
