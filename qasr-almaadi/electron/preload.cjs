const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("setupApi", {
  submit: (form) => ipcRenderer.invoke("setup:submit", form),
});
