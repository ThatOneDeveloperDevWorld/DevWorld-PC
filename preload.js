const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getReleases: () => ipcRenderer.invoke('get-releases'),
    launchVersion: (version) => ipcRenderer.invoke('launch-version', version)
});