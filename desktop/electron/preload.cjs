const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  '__DRIFTLANDS_SERVER_URL__',
  process.env.DRIFTLANDS_DESKTOP_SERVER_URL || '',
);

contextBridge.exposeInMainWorld('__DRIFTLANDS_DESKTOP__', {
  getWorldOptions: () => ipcRenderer.invoke('desktop:get-world-options'),
  listLanWorlds: () => ipcRenderer.invoke('desktop:list-lan-worlds'),
  refreshLanWorlds: () => ipcRenderer.invoke('desktop:refresh-lan-worlds'),
  setWorldMode: (options) => ipcRenderer.invoke('desktop:set-world-mode', {
    mode: options?.mode,
    joinServerUrl: options?.joinServerUrl,
    sharedServerUrl: options?.sharedServerUrl,
  }),
  onWorldsChanged: (callback) => {
    if (typeof callback !== 'function') {
      return () => undefined;
    }

    const listener = () => callback();
    ipcRenderer.on('desktop:worlds-changed', listener);
    return () => ipcRenderer.off('desktop:worlds-changed', listener);
  },
});
