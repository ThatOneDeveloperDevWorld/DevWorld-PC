const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');

let mainWindow;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'DevWorld-Launcher' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': 'DevWorld-Launcher' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: Status ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

// Fetch GitHub releases
ipcMain.handle('get-releases', async () => {
  try {
    const releases = await fetchJson('https://api.github.com/repos/ThatOneDeveloperDevWorld/DevWorld-PC/releases');
    return releases.map(r => ({
      tag: r.tag_name,
      zipballUrl: r.zipball_url
    }));
  } catch (err) {
    console.error("Failed to fetch releases:", err);
    return [{ tag: "0.1.6", zipballUrl: "" }];
  }
});

// Cache and Load version from devworldpc/cache/version.devworld
ipcMain.handle('launch-version', async (event, version) => {
  const cacheFolder = path.join(__dirname, 'cache', `${version}.devworld`);
  const targetHtml = path.join(cacheFolder, 'res', 'main', 'index.html');

  // If already cached, load it directly
  if (fs.existsSync(targetHtml)) {
    mainWindow.loadFile(targetHtml);
    return true;
  }

  try {
    fs.mkdirSync(cacheFolder, { recursive: true });
    const zipPath = path.join(cacheFolder, 'temp.zip');

    // Fetch release details to grab the correct download URL
    const releases = await fetchJson('https://api.github.com/repos/ThatOneDeveloperDevWorld/DevWorld-PC/releases');
    const targetRelease = releases.find(r => r.tag_name === version);

    if (!targetRelease || !targetRelease.zipball_url) {
      dialog.showErrorBox("Download Error", `Could not find release archive for version ${version}.`);
      return false;
    }

    // Download zip from GitHub repository
    await downloadFile(targetRelease.zipball_url, zipPath);

    // Extract zip contents into cache directory
    await extract(zipPath, { dir: cacheFolder });
    fs.unlinkSync(zipPath); // Clean up temp zip file

    // GitHub zipballs wrap contents inside a subfolder (e.g. user-repo-hash/), let's handle normalization if needed
    const subdirs = fs.readdirSync(cacheFolder).filter(f => fs.statSync(path.join(cacheFolder, f)).isDirectory());
    if (subdirs.length === 1) {
      const innerPath = path.join(cacheFolder, subdirs[0]);
      const innerFiles = fs.readdirSync(innerPath);
      innerFiles.forEach(file => {
        fs.renameSync(path.join(innerPath, file), path.join(cacheFolder, file));
      });
      fs.rmdirSync(innerPath);
    }

    if (fs.existsSync(targetHtml)) {
      mainWindow.loadFile(targetHtml);
      return true;
    } else {
      dialog.showErrorBox("Launch Error", "Cached files structure mismatch.");
      return false;
    }
  } catch (err) {
    console.error("Caching failed:", err);
    dialog.showErrorBox("Error", `Failed to download version ${version}: ${err.message}`);
    return false;
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile(path.join(__dirname, 'res/main/launcher.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});