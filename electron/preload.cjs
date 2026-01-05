const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('actas', {
  isElectron: true,
  // Deep link handling
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (event, data) => callback(data));
  },
  getPendingDeepLink: () => ipcRenderer.invoke('get-pending-deep-link'),
  removeDeepLinkListener: () => {
    ipcRenderer.removeAllListeners('deep-link');
  }
});
