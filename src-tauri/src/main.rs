#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct Asset {
    name: String,
    url: String,
}

fn get_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app.path().cache_dir().map_err(|e| e.to_string())?;
    Ok(base_dir.join("devworldpc").join("cache"))
}

#[tauri::command]
async fn launch_version(app: tauri::AppHandle, version_tag: String, assets: Vec<Asset>) -> Result<String, String> {
    let cache_dir = get_cache_dir(&app)?;
    let version_folder = cache_dir.join(&version_tag);
    let entry_point = version_folder.join("index.html");

    if !entry_point.exists() {
        if assets.is_empty() {
            return Err("No files found for this version.".into());
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

#[tauri::command]
async fn get_installed_versions(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let cache_dir = get_cache_dir(&app)?;
    let mut installed = Vec::new();

    if cache_dir.exists() {
        if let Ok(entries) = fs::read_dir(cache_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Some(folder_name) = entry.file_name().to_str() {
                        installed.push(folder_name.to_string());
                    }
                }
            }
        }
    }
    Ok(installed)
}

#[tauri::command]
async fn delete_version(app: tauri::AppHandle, version_tag: String) -> Result<(), String> {
    let cache_dir = get_cache_dir(&app)?;
    let version_folder = cache_dir.join(&version_tag);
    if version_folder.exists() {
        fs::remove_dir_all(version_folder).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn open_discord_link() -> Result<(), String> {
    webbrowser::open("https://discord.gg/hDqN8MPTkj").map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            launch_version,
            get_installed_versions,
            delete_version,
            open_discord_link
        ])
        .run(tauri::generate_context!())
        .expect("error while running application, report to the developers!");
}