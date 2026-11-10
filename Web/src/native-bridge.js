/* ORBIT 3.0 native WebView2 bridge. All messages carry a request id and a typed command.
   The native host validates commands; external webpages cannot invoke these actions. */
const pending = new Map();
let requestNumber = 0;
const host = globalThis.chrome?.webview;
if (host) {
  host.addEventListener('message', ({data}) => {
    if (!data || typeof data.id !== 'number' || !pending.has(data.id)) return;
    const promise = pending.get(data.id);pending.delete(data.id);
    if (data.ok) promise.resolve(data.result);
    else promise.reject(new Error(data.error || 'Native ORBIT action failed.'));
  });
}
export function isTauri(){return !!host;} // compatibility name; ORBIT 3 uses WebView2, not Tauri.
export function invoke(cmd, args = {}) {
  if (!host) return Promise.reject(new Error('This operation needs the ORBIT Windows app.'));
  return new Promise((resolve,reject)=>{
    const id=++requestNumber;
    const timeout=setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error(`${cmd}: operation timed out`));}},30000);
    pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v);},reject:e=>{clearTimeout(timeout);reject(e);}});
    host.postMessage({id,cmd,args});
  });
}
export async function open(options={}){return invoke('pick_files',{multiple:!!options.multiple,extensions:options.filters?.flatMap(f=>f.extensions||[])||[]});}
export async function openUrl(url){return invoke('open_url',{url});}
export async function isPermissionGranted(){return isTauri();}
export async function requestPermission(){return isTauri()?'granted':'denied';}
export async function sendNotification(payload){return invoke('show_notification',payload);}
export async function enableAutostart(){return invoke('set_autostart',{enabled:true});}
export async function disableAutostart(){return invoke('set_autostart',{enabled:false});}
export async function autostartIsEnabled(){return invoke('get_autostart');}
