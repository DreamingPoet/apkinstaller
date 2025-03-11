import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";


let appNameEl: HTMLElement | null;
let installResultEl: HTMLElement | null;
let installFilePath: string = "";

// async function greet() {
//   if (greetMsgEl && greetInputEl) {
//     // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
//     greetMsgEl.textContent =
//       await invoke("greet", {
//         name: greetInputEl.value,
//       });
//   }
// }



async function dropFile(filePath: string) {

  if (appNameEl) {
    appNameEl.textContent = await invoke("drop_file", {
      path: filePath
    })
    installFilePath = filePath;
  }
}


async function installAPK() {
  if (installResultEl) {
    installResultEl.textContent = await invoke("install", {
      path: installFilePath
    })

    console.log('installResult')
  }
}


window.addEventListener("DOMContentLoaded", () => {
  appNameEl = document.querySelector("#app-name");
  installResultEl = document.querySelector("#install-result");
  document.querySelector("#install-form")?.addEventListener("click", () => {
    installAPK();
  });
});

// 监听 拖拽
await getCurrentWebview().onDragDropEvent((event) => {
  if (event.payload.type === 'over') {
    // console.log('User hovering', event.payload.position);
  } else if (event.payload.type === 'drop') {
    console.log('User dropped', event.payload.paths);
    dropFile(event.payload.paths[0])
  } else {
    console.log('File drop cancelled');
  }
});