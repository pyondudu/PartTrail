const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pt', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onExpand: (cb) => ipcRenderer.on('expand', () => cb()),
  setIgnoreMouse: (v) => ipcRenderer.send('set-ignore-mouse', v),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', { dx, dy }),
  dragEnd: () => ipcRenderer.send('drag-end'),
  openItem: (id) => ipcRenderer.send('open-item', id),
  openDashboard: () => ipcRenderer.send('open-dashboard'),
  openSetup: () => ipcRenderer.send('open-setup'),
  refresh: () => ipcRenderer.send('refresh'),
  hide: () => ipcRenderer.send('hide'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  login: (form) => ipcRenderer.invoke('login', form),
  logout: () => ipcRenderer.invoke('logout'),
})
