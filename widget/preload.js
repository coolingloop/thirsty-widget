'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('thirsty',{
 stats:()=>ipcRenderer.invoke('stats'),settings:patch=>ipcRenderer.invoke('settings',patch),
 poke:()=>ipcRenderer.invoke('poke'),dashboard:()=>ipcRenderer.send('dashboard'),menu:()=>ipcRenderer.send('menu'),
 drag:(dx,dy,end=false)=>ipcRenderer.send('drag',{dx,dy,end}),play:()=>ipcRenderer.send('play'),
 share:data=>ipcRenderer.invoke('share',data),csv:()=>ipcRenderer.invoke('csv'),
 on:(name,handler)=>{if(['stats','sip','badge','milestone','progress','visibility','toast'].includes(name))ipcRenderer.on(name,(_,data)=>handler(data));}
});
