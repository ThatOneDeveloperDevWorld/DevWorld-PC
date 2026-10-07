const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getReleases: () => ipcRenderer.invoke('get-github-releases'),
    launchVersion: (versionTag, assets) => ipcRenderer.invoke('launch-version', versionTag, assets)
});
