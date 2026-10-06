import { contextBridge } from 'electron';

/** preload はほぼ空にする。データアクセスはすべて app://tsugi/api 経由（docs/adr/0007） */
contextBridge.exposeInMainWorld('tsugi', {
  platform: process.platform,
});
