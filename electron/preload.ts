import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronApi } from '../src/types'

const api: ElectronApi = {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveTopics: (topics) => ipcRenderer.invoke('store:saveTopics', topics),
  saveSettings: (settings) => ipcRenderer.invoke('store:saveSettings', settings),
  pickFolder: (current) => ipcRenderer.invoke('dialog:pickFolder', current),
  openPath: (target) => ipcRenderer.invoke('shell:openPath', target),
  ensureMediaAccess: () => ipcRenderer.invoke('media:ensureAccess'),
  saveRecording: (req) => ipcRenderer.invoke('recording:save', req),
}

contextBridge.exposeInMainWorld('api', api)
