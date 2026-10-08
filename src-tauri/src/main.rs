#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct Asset {
    name: String,
    url: String,
}

#[tauri::command]
async fn launch_version(app: tauri::AppHandle, version_tag: String, assets: Vec<Asset>) -> Result<String, String> {
    // Points to the user's desktop or local app cache directory structured as devworldpc/cache/<version_tag>
    let base_dir = app.path().cache_dir().map_err(|e| e.to_string())?;
    let version_folder = base_dir.join("devworldpc").join("cache").join(&version_tag);
    let entry_point = version_folder.join("editor.html");

    // Check if it's already downloaded, if not download it
    if !entry_point.exists() {
        if assets.is_empty() {
            return Err("No files found for this version release.".into());
        }

        fs::create_dir_all(&version_folder).map_err(|e| e.to_string())?;

        let client = reqwest::Client::builder()
            .user_agent("DevWorld-Launcher")
            .build()
            .map_err(|e| e.to_string())?;

        for file in assets {
            let file_path = version_folder.join(&file.name);
            let resp = client.get(&file.url).send().await.map_err(|e| e.to_string())?;
            let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
            fs::write(&file_path, bytes).map_err(|e| e.to_string())?;
        }
    }

    Ok(entry_point.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![launch_version])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
