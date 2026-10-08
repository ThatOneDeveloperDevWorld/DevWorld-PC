#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct Asset {
    name: String,
    url: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct Release {
    tag: String,
    name: String,
    body: String,
    assets: Vec<Asset>,
}

#[tauri::command]
async fn get_github_releases() -> Result<Vec<Release>, String> {
    let client = reqwest::Client::builder()
        .user_agent("DevWorld-Launcher")
        .build()
        .map_err(|e| e.to_string())?;

    let url = "https://api.github.com/repos/ThatOneDeveloperDevWorld/DevWorld-PC/releases";
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    
    if !resp.status().is_success() {
        return Ok(vec![]);
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let items = json.as_array().ok_or("Invalid response format")?;

    let mut releases = Vec::new();
    for item in items {
        let tag = item["tag_name"].as_str().unwrap_or("v1.0.0").to_string();
        let name = item["name"].as_str().unwrap_or(&tag).to_string();
        let body = item["body"].as_str().unwrap_or("No release notes provided.").to_string();

        let mut assets = Vec::new();
        if let Some(asset_array) = item["assets"].as_array() {
            for a in asset_array {
                if let (Some(a_name), Some(a_url)) = (a["name"].as_str(), a["browser_download_url"].as_str()) {
                    assets.push(Asset {
                        name: a_name.to_string(),
                        url: a_url.to_string(),
                    });
                }
            }
        }

        releases.push(Release { tag, name, body, assets });
    }

    Ok(releases)
}

#[tauri::command]
async fn launch_version(app: tauri::AppHandle, version_tag: String, assets: Vec<Asset>) -> Result<String, String> {
    let app_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    
    // Uses the exact version tag for the folder (e.g., cache/0.1.5/)
    let version_folder = app_dir.join("cache").join(&version_tag);
    let entry_point = version_folder.join("index.html");

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
        .invoke_handler(tauri::generate_handler![get_github_releases, launch_version])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
