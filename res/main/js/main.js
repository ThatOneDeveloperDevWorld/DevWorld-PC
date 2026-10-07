const { app, BrowserWindow, dialog } = require('electron');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let mainWindow;

function fetchRemoteText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'DevWorld-Launcher' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch: ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function getFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

async function verifyHtmlFiles() {
  try {
    const releaseApiUrl = 'https://api.github.com/repos/ThatOneDeveloperDevWorld/DevWorld-PC/releases/latest';
    const releaseData = JSON.parse(await fetchRemoteText(releaseApiUrl));
    const tagName = releaseData.tag_name;

    // Pointing directly to launcher.html
    const htmlFilesToCheck = ['res/main/launcher.html'];

    for (const relativePath of htmlFilesToCheck) {
      const localFullPath = path.join(__dirname, relativePath);
      
      if (!fs.existsSync(localFullPath)) {
        throw new Error("Local file missing");
      }

      const localHash = getFileHash(localFullPath);
      const rawFileUrl = `https://raw.githubusercontent.com/ThatOneDeveloperDevWorld/DevWorld-PC/${tagName}/${relativePath}`;
      const remoteContent = await fetchRemoteText(rawFileUrl);
      const remoteHash = crypto.createHash('sha256').update(remoteContent).digest('hex');

      if (localHash !== remoteHash) {
        return false; // Mismatch found
      }
    }
    return true;
  } catch (error) {
    console.error("Verification error:", error);
    return true; // Allows offline play if GitHub cannot be reached
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#5ce1e6',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  // Loads launcher.html first inside res/main/
  mainWindow.loadFile(path.join(__dirname, 'res/main/launcher.html'));
}

app.whenReady().then(async () => {
  const isMatch = await verifyHtmlFiles();

  if (!isMatch) {
    dialog.showErrorBox("Launch Failed", "launch failed - changes found");
    require('electron').shell.openExternal('https://github.com/ThatOneDeveloperDevWorld/DevWorld-PC/releases/latest');
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
