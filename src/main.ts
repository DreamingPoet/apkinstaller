import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from '@tauri-apps/api/event';

let appNameEl: HTMLElement | null;
let installResultEl: HTMLElement | null;
let appHasObbEl: HTMLElement | null;
let installFilePath: string = "";
let progressContainer: HTMLElement | null;
let progressText: HTMLElement | null;
let progressFill: HTMLElement | null;

// 定义安装步骤和对应的进度百分比
const installSteps = {
  "开始安装...": 0,
  "正在安装 APK...": 25,
  "正在安装 OBB 文件...": 50,
  "正在设置应用权限...": 75
};

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
  if (appNameEl  && appHasObbEl && installResultEl) {
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

async function installAPK(startApp: boolean = false) {
  if (installResultEl && progressContainer && progressText && progressFill) {
    // 显示进度条
    progressContainer.style.display = 'block';
    progressText.textContent = '准备安装...';
    progressFill.style.width = '0%';
    installResultEl.textContent = '';

    try {
      const result = await invoke("install_apk", {
        path: installFilePath,
        startApp: startApp
      }) as string;
      
      // 安装完成，设置进度为100%
      progressFill.style.width = '100%';
      progressText.textContent = '安装完成';
      
      installResultEl.textContent = result;
    } catch (error) {
      // 确保error是字符串类型
      const errorMessage = error instanceof Error ? error.message : String(error);
      installResultEl.textContent = `安装失败: ${errorMessage}`;
      
      // 安装失败，重置进度条
      progressFill.style.width = '0%';
      progressText.textContent = '安装失败';
    } finally {
      // 3秒后隐藏进度条
      setTimeout(() => {
        if (progressContainer) {
          progressContainer.style.display = 'none';
        }
      }, 3000);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  appNameEl = document.querySelector("#app-name");
  installResultEl = document.querySelector("#install-result");
  appHasObbEl = document.querySelector("#app-has-obb");
  progressContainer = document.querySelector(".progress-container");
  progressText = document.querySelector("#progress-text");
  progressFill = document.querySelector(".progress-fill");

  // 监听安装进度事件
  listen('install_progress', (event: any) => {
    if (progressText && progressFill) {
      const message = event.payload;
      progressText.textContent = message;
      
      // 根据消息更新进度条
      if (installSteps.hasOwnProperty(message)) {
        progressFill.style.width = `${installSteps[message as keyof typeof installSteps]}%`;
      }
    }
  });

  document.querySelector("#installAppAndStart")?.addEventListener("click", () => {
    installAPK(true);
  });
  document.querySelector("#installApp")?.addEventListener("click", () => {
    installAPK(false);
  });


  // document.querySelector("#install-form")?.addEventListener("click", () => {
  //   installAPK();
  // });
});

// 监听 拖拽
getCurrentWebview().onDragDropEvent((event) => {
  if (event.payload.type === 'over') {
    // console.log('User hovering', event.payload.position);
  } else if (event.payload.type === 'drop') {
    console.log('User dropped', event.payload.paths);
    dropFile(event.payload.paths[0])
  } else {
    console.log('File drop cancelled');
  }
});