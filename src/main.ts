import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";


let appNameEl: HTMLElement | null;
let installResultEl: HTMLElement | null;
let appPackageNameEl: HTMLElement | null;
let appHasObbEl: HTMLElement | null;
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

  if (appNameEl && appPackageNameEl && appHasObbEl && installResultEl) {
    const result: string = await invoke("drop_file", {
      path: filePath
    })

    // 将字符串格式化为有效的 JSON 格式
    const jsonString = result.replace(/(\w+):/g, '"$1":') // 将键名加上双引号
      .replace(/'/g, '"'); // 将单引号替换为双引号
    // 解析为对象
    const parsedObject = JSON.parse(`{${jsonString}}`);
    console.log('parsedObject', parsedObject)
    appNameEl.textContent = `名称: ${parsedObject.name}`;
    // appPackageNameEl.textContent = `包名: ${parsedObject.package_name}`;
    appHasObbEl.textContent = parsedObject.has_obb == "true" ? "存在obb文件安装时间较长" : "";
    installFilePath = filePath;

    installResultEl.textContent = ''
  }
}


async function installAPK() {
  if (installResultEl) {
    installResultEl.textContent = '安装中...'

    installResultEl.textContent = await invoke("install", {
      path: installFilePath
    })
  }
}


window.addEventListener("DOMContentLoaded", () => {
  appNameEl = document.querySelector("#app-name");
  installResultEl = document.querySelector("#install-result");
  appPackageNameEl = document.querySelector("#app-package-name");
  appHasObbEl = document.querySelector("#app-has-obb");



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