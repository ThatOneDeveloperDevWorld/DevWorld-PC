const { app, BrowserWindow, ipcMain } = require('electron');

const path = require('path');

const fs = require('fs');

const https = require('https');

const { spawn } = require('child_process');



let mainWindow;



function createWindow() {

    mainWindow = new BrowserWindow({

        width: 900,

        height: 550,

        resizable: false,

        frame: true,

        webPreferences: {

            preload: path.join(__dirname, 'preload.js'),

            nodeIntegration: false,

            contextIsolation: true

        }

    });



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



// Versions Directory inside User Data

const versionsDir = path.join(app.getPath('userData'), 'game_versions');

if (!fs.existsSync(versionsDir)) {

    fs.mkdirSync(versionsDir, { recursive: true });

}



// Fetch GitHub releases natively if needed from main process

ipcMain.handle('get-github-releases', async () => {

    return new Promise((resolve) => {

        const url = 'https://api.github.com/repos/ThatOneDeveloperDevWorld/DevWorld-PC/releases';

        https.get(url, { headers: { 'User-Agent': 'DevWorld-Launcher' } }, (res) => {

            let data = '';

            res.on('data', chunk => data += chunk);

            res.on('end', () => {

                try {

                    const releases = JSON.parse(data);

                    const formatted = releases.map(rel => {

                        const asset = rel.assets.find(a => a.name.endsWith('.exe')) || rel.assets[0];

                        return {

                            tag: rel.tag_name || rel.name,

                            url: asset ? asset.browser_download_url : null

                        };

                    });

                    resolve(formatted);

                } catch (e) {

                    resolve([]);

                }

            });

        }).on('error', () => resolve([]));

    });

});



// Handle version launch / download on demand when PLAY is pressed

ipcMain.handle('launch-version', async (event, versionTag, fileUrl) => {

    const safeVersionTag = versionTag.replace(/[^a-zA-Z0-9.-]/g, '_');

    const versionFolder = path.join(versionsDir, safeVersionTag);

    const exePath = path.join(versionFolder, 'DevWorld.exe');



    // 1. If already cached, run it immediately

    if (fs.existsSync(exePath)) {

        runGameExecutable(exePath);

        return { success: true };

    }



    // 2. Otherwise download into its own folder

    if (!fileUrl) {

        return { success: false, error: "No download URL provided for this version." };

    }



    if (!fs.existsSync(versionFolder)) {

        fs.mkdirSync(versionFolder, { recursive: true });

    }



    try {

        await downloadFile(fileUrl, exePath);

        runGameExecutable(exePath);

        return { success: true };

    } catch (err) {

        return { success: false, error: err.message };

    }

});



function downloadFile(url, destination) {

    return new Promise((resolve, reject) => {

        const fileStream = fs.createWriteStream(destination);

        

        https.get(url, { headers: { 'User-Agent': 'DevWorld-Launcher' } }, (response) => {

            if (response.statusCode === 302 || response.statusCode === 301) {

                return downloadFile(response.headers.location, destination).then(resolve).catch(reject);

            }



            if (response.statusCode !== 200) {

                return reject(new Error(`Failed to download, status code: ${response.statusCode}`));

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



function runGameExecutable(exePath) {

    const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });

    child.unref();

}
