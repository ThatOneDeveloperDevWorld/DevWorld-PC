const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 550,
        resizable: true,
        frame: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    Menu.setApplicationMenu(null);
    mainWindow.loadFile('res/main/launcher.html');
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

const cacheDir = path.join(app.getPath('userData'), 'cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
});

// Fixed GitHub API URL for your repository releases
ipcMain.handle('get-github-releases', async () => {
    return new Promise((resolve) => {
        const url = 'https://api.github.com/repos/ThatOneDeveloper/DevWorld-PC/releases';
        https.get(url, { headers: { 'User-Agent': 'DevWorld-Launcher' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const releases = JSON.parse(data);
                    if (!Array.isArray(releases)) {
                        resolve([]);
                        return;
                    }
                    const formatted = releases.map(rel => ({
                        tag: rel.tag_name || rel.name,
                        name: rel.name || rel.tag_name,
                        body: rel.body || "No release notes provided.",
                        assets: (rel.assets || []).map(asset => ({
                            name: asset.name,
                            url: asset.browser_download_url
                        }))
                    }));
                    resolve(formatted);
                } catch (e) {
                    resolve([]);
                }
            });
        }).on('error', () => resolve([]));
    });
});

ipcMain.handle('launch-version', async (event, versionTag, assets) => {
    const safeVersionTag = versionTag.replace(/[^a-zA-Z0-9.-]/g, '_');
    const versionFolder = path.join(cacheDir, safeVersionTag);
    const entryPoint = path.join(versionFolder, 'index.html');

    const isCached = fs.existsSync(entryPoint);

    if (!isCached) {
        if (!assets || assets.length === 0) {
            return { success: false, error: "No files found for this version release." };
        }

        if (!fs.existsSync(versionFolder)) {
            fs.mkdirSync(versionFolder, { recursive: true });
        }

        try {
            for (const file of assets) {
                const filePath = path.join(versionFolder, file.name);
                await downloadFile(file.url, filePath);
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    mainWindow.loadFile(entryPoint);
    mainWindow.setFullScreen(true);
    return { success: true };
});

function downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(destination);
        
        https.get(url, { headers: { 'User-Agent': 'DevWorld-Launcher' } }, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                return downloadFile(response.headers.location, destination).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to download ${url} (Status: ${response.statusCode})`));
            }

            response.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(destination, () => reject(err));
        });
    });
}
