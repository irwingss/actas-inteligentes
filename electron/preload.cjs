const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('actas', {
  isElectron: true
});
