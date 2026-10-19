const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('orbita', {
  platform: process.platform,
  chooseFiles: () => ipcRenderer.invoke('files:choose'),
  chooseOutputDirectory: () => ipcRenderer.invoke('output:choose'),
  inspectFiles: (paths) => ipcRenderer.invoke('files:inspect', paths),
  pathsFromFiles: (files) => Array.from(files, (file) => webUtils.getPathForFile(file)).filter(Boolean),
  processFiles: (payload) => ipcRenderer.invoke('files:process', payload),
  getOverlayFiles: () => ipcRenderer.invoke('overlay:get-files'),
  closeOverlay: () => ipcRenderer.send('overlay:close'),
  revealFile: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  onProgress: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('job:progress', listener);
    return () => ipcRenderer.removeListener('job:progress', listener);
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
});
