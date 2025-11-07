import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from '@tauri-apps/api/event';

let appNameEl: HTMLElement | null;
let installResultEl: HTMLElement | null;
let appHasObbEl: HTMLElement | null;
let installFilePath: string = "";
let installAppBtn: HTMLElement | null;
let installAppAndStartBtn: HTMLElement | null;
let progressContainer: HTMLElement | null;
let progressText: HTMLElement | null;
let progressFill: HTMLElement | null;
let deviceInfo: HTMLElement | null;
let selectedDeviceId: string | null = null;
let deviceList: string[] = [];
let deviceModal: HTMLElement | null;
let deviceModalList: HTMLElement | null;
let deviceModalInstallBtn: HTMLElement | null;
let deviceModalInstallAndStartBtn: HTMLElement | null;
let deviceModalCancelBtn: HTMLElement | null;
let pakFileNameEl: HTMLElement | null;
let pakFileInstallPathEl: HTMLInputElement | null;
let installPakFileBtn: HTMLElement | null;
let pakFilePath: string = "";
let deletePakFilesBtn: HTMLElement | null;
let deleteConfirmModal: HTMLElement | null;
let deleteConfirmYesBtn: HTMLElement | null;
let deleteConfirmNoBtn: HTMLElement | null;

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


//  监听已连接的设备
async function pollDevices() {
  try {
    const result = await invoke("get_devices");
    // 你可以在这里更新UI或触发事件
    console.log("设备信息：", result);
    if (deviceInfo) {
      const processedDevices = processDeviceInfo((result as string));
      deviceList = processedDevices;
      // 创建列表显示设备信息
      const list = document.createElement('ul');
      list.classList.add('device-list'); // 添加CSS类用于样式化
      processedDevices.forEach(deviceLine => {
        const [deviceId, status] = deviceLine.split('\t');

        const listItem = document.createElement('li');
        listItem.classList.add('device-item');

        // 创建设备ID和状态的显示元素
        const idSpan = document.createElement('span');
        idSpan.classList.add('device-id');
        idSpan.textContent = deviceId;

        const statusSpan = document.createElement('span');
        statusSpan.classList.add('device-status');
        statusSpan.textContent = `${status}`;

        // 添加到列表项
        listItem.appendChild(idSpan);
        listItem.appendChild(statusSpan);

        // 添加到列表
        list.appendChild(listItem);
      });

      // 清空容器并添加新内容
      deviceInfo.innerHTML = '';
      deviceInfo.appendChild(list);
    }
  } catch (e) {
    console.error("获取设备失败", e);
  }

}

//  定时器
function intervalPollDevices() {
  setInterval(async () => {
    pollDevices();
  }, 2000);
}


// 处理设备信息字符串的函数
function processDeviceInfo(input: string): string[] {
  // 1. 移除开头的"List of devices attached"部分
  // 2. 按换行符分割字符串
  // 3. 过滤掉空行
  const lines = input
    .replace(/^List of devices attached\s*/i, '') // 移除标题部分
    .split('\n')                                 // 按换行符分割
    .filter(line => line.trim() !== '');          // 移除空行

  // 4. 处理每行的格式（确保每行只包含单个制表符或空格）
  return lines.map(line => {
    // 将连续空白符替换为单个制表符
    return line.replace(/\s+/g, '\t');
  });
}


async function dropFile(filePath: string) {
  // 检查文件扩展名
  const fileExtension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  
  if (fileExtension === '.pak') {
    // 处理 .pak 文件
    if (pakFileNameEl && installResultEl) {
      const fileName = filePath.substring(filePath.lastIndexOf('\\') + 1);
      pakFileNameEl.textContent = `pak文件名: ${fileName}`;
      pakFilePath = filePath;
      installPakFileBtn?.removeAttribute('disabled');
      installResultEl.textContent = '';
      
      // 清空 APK 相关信息
      if (appNameEl) appNameEl.textContent = '';
      if (appHasObbEl) appHasObbEl.textContent = '';
      installAppBtn?.setAttribute('disabled', 'true');
      installAppAndStartBtn?.setAttribute('disabled', 'true');
    }
  } else if (fileExtension === '.apk') {
    // 处理 .apk 文件（保持原逻辑）
    if (appNameEl && appHasObbEl && installResultEl) {
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
      installAppBtn?.removeAttribute('disabled');
      installAppAndStartBtn?.removeAttribute('disabled');
      // appPackageNameEl.textContent = `包名: ${parsedObject.package_name}`;
      appHasObbEl.textContent = parsedObject.has_obb == "true" ? "存在obb文件安装时间较长" : "";
      installFilePath = filePath;
      installResultEl.textContent = '';
      
      // 清空 pak 文件相关信息
      if (pakFileNameEl) pakFileNameEl.textContent = '';
      installPakFileBtn?.setAttribute('disabled', 'true');
    }
  }
}

function showDeviceModal(devices: string[]) {
  if (!deviceModal || !deviceModalList || !deviceModalInstallBtn || !deviceModalInstallAndStartBtn || !deviceModalCancelBtn) return;
  deviceModal.style.display = 'flex';
  deviceModalList.innerHTML = '';
  selectedDeviceId = null;
  devices.forEach(deviceLine => {
    const [deviceId, status] = deviceLine.split('\t');
    const item = document.createElement('div');
    item.className = 'device-modal-item';
    item.textContent = `${deviceId} (${status})`;
    item.onclick = () => {
      selectedDeviceId = deviceId;
      Array.from(deviceModalList!.children).forEach(child => child.classList.remove('selected'));
      item.classList.add('selected');
      deviceModalInstallBtn?.removeAttribute('disabled');
      deviceModalInstallAndStartBtn?.removeAttribute('disabled');
    };
    if (deviceModalList)
      deviceModalList.appendChild(item);
  });
  deviceModalInstallAndStartBtn?.setAttribute('disabled', 'true');
  deviceModalInstallBtn?.setAttribute('disabled', 'true');

}

function hideDeviceModal() {
  if (deviceModal) deviceModal.style.display = 'none';
}

function showDeleteConfirmModal() {
  if (deleteConfirmModal) {
    deleteConfirmModal.style.display = 'flex';
  }
}

function hideDeleteConfirmModal() {
  if (deleteConfirmModal) {
    deleteConfirmModal.style.display = 'none';
  }
}

async function installAPK(startApp: boolean = false) {
  if (installResultEl && progressContainer && progressText && progressFill) {
    // 检查设备数量
    if (deviceList.length >= 2) {
      showDeviceModal(deviceList);
      return;
    }
    // 显示进度条
    progressContainer.style.display = 'block';
    progressText.textContent = '准备安装...';
    progressFill.style.width = '0%';
    installResultEl.textContent = '';

    try {
      const result = await invoke("install_apk", {
        path: installFilePath,
        startApp: startApp,
        deviceId: deviceList[0] ? deviceList[0].split('\t')[0] : undefined
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

async function installPakFile() {
  if (!pakFileInstallPathEl || !installResultEl || !progressContainer || !progressText || !progressFill) return;
  
  const installPath = pakFileInstallPathEl.value.trim();
  if (!installPath) {
    installResultEl.textContent = '请输入 pak 文件安装路径';
    return;
  }

  // 显示进度条
  progressContainer.style.display = 'block';
  progressText.textContent = '正在推送 pak 文件...';
  progressFill.style.width = '50%';
  installResultEl.textContent = '';

  try {
    const deviceId = deviceList.length > 0 ? deviceList[0].split('\t')[0] : undefined;
    const result = await invoke("install_pak_file", {
      pakPath: pakFilePath,
      targetPath: installPath,
      deviceId: deviceId
    }) as string;

    // 安装完成，设置进度为100%
    progressFill.style.width = '100%';
    progressText.textContent = 'pak 文件推送完成';
    installResultEl.textContent = result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    installResultEl.textContent = `推送失败: ${errorMessage}`;
    progressFill.style.width = '0%';
    progressText.textContent = '推送失败';
  } finally {
    // 3秒后隐藏进度条
    setTimeout(() => {
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
    }, 3000);
  }
}

async function deletePakFiles() {
  if (!pakFileInstallPathEl || !installResultEl || !progressContainer || !progressText || !progressFill) return;
  
  const installPath = pakFileInstallPathEl.value.trim();
  if (!installPath) {
    installResultEl.textContent = '请输入 pak 文件路径';
    return;
  }

  // 显示进度条
  progressContainer.style.display = 'block';
  progressText.textContent = '正在删除 pak 文件...';
  progressFill.style.width = '50%';
  installResultEl.textContent = '';

  try {
    const deviceId = deviceList.length > 0 ? deviceList[0].split('\t')[0] : undefined;
    const result = await invoke("delete_pak_files", {
      targetPath: installPath,
      deviceId: deviceId
    }) as string;

    // 删除完成，设置进度为100%
    progressFill.style.width = '100%';
    progressText.textContent = 'pak 文件删除完成';
    installResultEl.textContent = result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    installResultEl.textContent = `删除失败: ${errorMessage}`;
    progressFill.style.width = '0%';
    progressText.textContent = '删除失败';
  } finally {
    // 3秒后隐藏进度条
    setTimeout(() => {
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
    }, 3000);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  appNameEl = document.querySelector("#app-name");
  installResultEl = document.querySelector("#install-result");
  appHasObbEl = document.querySelector("#app-has-obb");
  installAppBtn = document.getElementById('install-app');
  installAppAndStartBtn = document.getElementById('install-app-start');
  progressContainer = document.querySelector(".progress-container");
  progressText = document.querySelector("#progress-text");
  progressFill = document.querySelector(".progress-fill");
  deviceInfo = document.querySelector("#device-info");
  deviceModal = document.getElementById('device-modal');
  deviceModalList = document.getElementById('device-modal-list');
  deviceModalInstallBtn = document.getElementById('device-modal-install');
  deviceModalInstallAndStartBtn = document.getElementById("device-modal-install-start");
  deviceModalCancelBtn = document.getElementById('device-modal-cancel');
  pakFileNameEl = document.getElementById('pak-file-name');
  pakFileInstallPathEl = document.getElementById('pak-file-install-path') as HTMLInputElement;
  installPakFileBtn = document.getElementById('install-pak-file');
  deletePakFilesBtn = document.getElementById('delete-pak-files');
  deleteConfirmModal = document.getElementById('delete-confirm-modal');
  deleteConfirmYesBtn = document.getElementById('delete-confirm-yes');
  deleteConfirmNoBtn = document.getElementById('delete-confirm-no');

  //  已连接的设备
  pollDevices();
  // 定时器调用 查询已连接的设备
  intervalPollDevices();

  //  未拖入安装包的时候，按钮禁止点击
  installAppBtn?.setAttribute('disabled', 'true');
  installAppAndStartBtn?.setAttribute('disabled', 'true');
  installPakFileBtn?.setAttribute('disabled', 'true');


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

  installAppBtn?.addEventListener("click", () => {
    installAPK(false);
  });
  installAppAndStartBtn?.addEventListener("click", () => {
    installAPK(true);
  });

  // pak 文件安装按钮点击事件
  installPakFileBtn?.addEventListener("click", () => {
    installPakFile();
  });

  // pak 文件删除按钮点击事件
  deletePakFilesBtn?.addEventListener("click", () => {
    showDeleteConfirmModal();
  });

  // 删除确认对话框按钮事件
  deleteConfirmYesBtn?.addEventListener('click', () => {
    hideDeleteConfirmModal();
    deletePakFiles();
  });

  deleteConfirmNoBtn?.addEventListener('click', hideDeleteConfirmModal);

  deleteConfirmModal?.addEventListener('click', (e) => {
    if (e.target === deleteConfirmModal) hideDeleteConfirmModal();
  });

  // 设备弹窗按钮事件
  deviceModalInstallBtn?.addEventListener('click', () => {
    if (selectedDeviceId) {
      hideDeviceModal();
      installAPKWithDevice(false, selectedDeviceId);
    }
  });
  // 设备弹窗按钮事件
  deviceModalInstallAndStartBtn?.addEventListener('click', () => {
    if (selectedDeviceId) {
      hideDeviceModal();
      installAPKWithDevice(true, selectedDeviceId);
    }
  });

  deviceModalCancelBtn?.addEventListener('click', hideDeviceModal);
  deviceModal?.addEventListener('click', (e) => {
    if (e.target === deviceModal) hideDeviceModal();
  });


  // document.querySelector("#install-form")?.addEventListener("click", () => {
  //   installAPK();
  // });
});

function installAPKWithDevice(startApp: boolean = false, deviceId: string) {
  if (!installResultEl || !progressContainer || !progressText || !progressFill) return

  progressContainer.style.display = 'block';
  progressText.textContent = '准备安装...';
  progressFill.style.width = '0%';
  installResultEl.textContent = '';
  invoke("install_apk", {
    path: installFilePath,
    startApp: startApp,
    deviceId: deviceId
  }).then((result: any) => {
    if (!installResultEl || !progressText || !progressFill) return
    progressFill.style.width = '100%';
    progressText.textContent = '安装完成';
    installResultEl.textContent = result;
  }).catch((error: any) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!installResultEl || !progressText || !progressFill) return
    installResultEl.textContent = `安装失败: ${errorMessage}`;
    progressFill.style.width = '0%';
    progressText.textContent = '安装失败';
  }).finally(() => {
    setTimeout(() => {
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
    }, 3000);
  });

}

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