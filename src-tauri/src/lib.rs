// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Command;

#[tauri::command]
fn get_devices(handle: AppHandle) -> String {
    let resource_dir = handle.path().resource_dir().unwrap();
    let adb_path = resource_dir.join("platform-tools/ADB/adb.exe");

    let mut cmd = Command::new(adb_path);
    cmd.args(["devices"]);
    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let get_devices_result = cmd.output();
    match get_devices_result {
        Ok(output) => {
            if !output.status.success() {
                return format!("获取设备失败: {}", String::from_utf8_lossy(&output.stderr));
            } else {
                return String::from_utf8_lossy(&output.stdout).to_string();
            }
        }
        Err(e) => return format!("无法执行adb: {}", e),
    }
}

#[tauri::command]
fn drop_file(path: String) -> String {
    if path.ends_with(".apk") {
        // let package_name = match get_apk_package_name(path) {
        //     Ok(name) => name,
        //     Err(e) => return format!("获取包名失败: {}", e),
        // };

        let has_obb = check_has_obb(&path);
        let package_name = "".to_string();

        // install(path)
        let name: &str = path.split("\\").last().unwrap();
        format!(
            "name:'{}',package_name:'{}',has_obb:'{}'",
            name, package_name, has_obb
        )
    } else {
        format!("仅支持 .apk 文件")
    }
}

#[tauri::command]
async fn install_apk(
    handle: AppHandle,
    path: String,
    start_app: bool,
    device_id: String,
) -> String {
    println!("install_apk()  开始安装 {}, {}", &path, &device_id);

    // 发送开始安装通知
    handle.emit("install_progress", "开始安装...").unwrap();

    let resource_dir = handle.path().resource_dir().unwrap();
    let adb_path = resource_dir.join("platform-tools/ADB/adb.exe");
    // 将 PathBuf 转换为字符串并克隆以延长生命周期
    let adb_path_str = adb_path.to_str().unwrap().to_string();

    let path_clone = path.clone();
    let path_clone2 = path.clone();
    let adb_path_str_clone = adb_path_str.clone();
    let handle_clone = handle.clone();
    // 拼接 adb 参数
    let adb_install_args = vec![
        "-s".to_string(),
        device_id.clone(),
        "install".to_string(),
        "-g".to_string(),
        "-r".to_string(),
        path.clone(),
    ];
    // println!("adb_install_args {:?}", &adb_install_args);
    let (install_result, package_name_result) = tokio::join!(
        tokio::task::spawn_blocking(move || {
            handle_clone
                .emit("install_progress", "正在安装 APK...")
                .unwrap();
            let mut cmd = Command::new(&adb_path_str);
            cmd.args(&adb_install_args);
            #[cfg(windows)]
            {
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }
            cmd.output()
        }),
        get_apk_package_name(&path_clone)
    );

    // 获取包名结果
    let package_name: String = match package_name_result {
        Ok(name) => name,
        Err(e) => return format!("获取包名失败: {}", e),
    };
    println!("package_name: {}", package_name);

    // 获取安装结果
    let output = match install_result {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => return format!("安装失败: {}", e),
        Err(e) => return format!("安装任务执行失败: {}", e),
    };

    if !output.status.success() {
        println!(
            "install output: {},{},{}",
            output.status.to_string(),
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&output.stdout)
        );
        return format!(
            "安装失败: {}{}",
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&output.stdout)
        );
    }

    // 安装OBB文件
    handle
        .emit("install_progress", "正在安装 OBB 文件...")
        .unwrap();
    let obb_result = install_obb(&package_name, &path_clone2, &adb_path_str_clone, &device_id);
    println!("obb_result: {}", obb_result);

    // // 设置读写权限
    // let permissions = [
    //     "android.permission.READ_EXTERNAL_STORAGE",
    //     "android.permission.WRITE_EXTERNAL_STORAGE",
    //     "android.permission.MODIFY_AUDIO_SETTINGS",
    //     "android.permission.RECORD_AUDIO",
    // ];

    // // 设置权限
    // handle
    //     .emit("install_progress", "正在设置应用权限...")
    //     .unwrap();
    // for permission in permissions {
    //     let grant_result = std::process::Command::new(&adb_path_str_clone)
    //         .args(["shell", "pm", "grant", &package_name, permission])
    //         .output();

    //     if let Err(e) = grant_result {
    //         return format!("Failed to grant permission {}: {}", permission, e);
    //     }
    // }

    let mut start_app_result: String = String::default();
    if start_app {
        let mut start_args = vec![];
        start_args.push("-s");
        start_args.push(&device_id);
        start_args.extend(["shell", "monkey", "-p", &package_name, "1"]);
        let mut cmd = Command::new(&adb_path_str_clone);
        cmd.args(&start_args);
        #[cfg(windows)]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let start_result = cmd.output();

        match start_result {
            Ok(output) => {
                if !output.status.success() {
                    println!("启动应用失败: {}", String::from_utf8_lossy(&output.stderr));
                    start_app_result = format!(
                        "，应用启动失败: {}",
                        String::from_utf8_lossy(&output.stderr)
                    );
                } else {
                    println!("成功启动应用: {}", package_name);
                    start_app_result = format!("，应用成功启动");
                }
            }
            Err(e) => println!("启动应用错误: {}", e),
        }
    }

    format!("已成功安装并授予权限: {}{}", package_name, start_app_result)
}

#[tauri::command]
fn install_pak_file(
    handle: AppHandle,
    pak_path: String,
    target_path: String,
    device_id: String,
) -> String {
    println!("install_pak_file() 开始推送 pak 文件: {} 到 {}", &pak_path, &target_path);

    let resource_dir = handle.path().resource_dir().unwrap();
    let adb_path = resource_dir.join("platform-tools/ADB/adb.exe");

    // 构建 adb push 命令参数
    let mut cmd = Command::new(&adb_path);
    let mut args = vec!["-s", &device_id, "push", &pak_path];
    
    // 确保目标路径以 /sdcard/ 开头（如果没有的话）
    let full_target_path = if target_path.starts_with("/") {
        target_path.clone()
    } else if target_path.starts_with("sdcard/") || target_path.starts_with("sdcard\\") {
        format!("/{}", target_path.replace("\\", "/"))
    } else {
        format!("/sdcard/{}", target_path.replace("\\", "/"))
    };
    
    args.push(&full_target_path);
    cmd.args(&args);
    
    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let push_result = cmd.output();

    match push_result {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                println!("pak 文件推送成功: {}", stdout);
                format!("pak 文件推送成功到: {}", full_target_path)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                println!("pak 文件推送失败: {}", stderr);
                format!("推送失败: {}", stderr)
            }
        }
        Err(e) => {
            let error_msg = format!("无法执行 adb push: {}", e);
            println!("{}", error_msg);
            error_msg
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            install_apk,
            drop_file,
            get_devices,
            install_pak_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn get_apk_package_name(path: &str) -> Result<String, String> {
    println!("获取 APK 文件路径: {}", path);
    // 尝试使用 abxml 库解析 APK 文件
    match abxml::apk::Apk::from_path(path) {
        Ok(mut apk) => {
            // 创建临时目录用于解压 APK 文件
            // 先移除临时目录
            let temp_dir = std::env::temp_dir().join("apk_extract");
            let _ = std::fs::remove_dir_all(&temp_dir);
            let _ = std::fs::create_dir_all(&temp_dir);

            // 使用 abxml 库导出 APK 内容到临时目录
            match apk.export(&temp_dir, true) {
                Ok(_) => {
                    // 尝试读取解压后的 AndroidManifest.xml 文件
                    let manifest_path = temp_dir.join("AndroidManifest.xml");
                    match std::fs::read_to_string(&manifest_path) {
                        Ok(manifest_content) => {
                            // 从 AndroidManifest.xml 中提取 package 属性
                            if let Some(package_start) = manifest_content.find("package=\"") {
                                if let Some(package_end) =
                                    manifest_content[package_start + 9..].find('\"')
                                {
                                    let package_name = &manifest_content
                                        [package_start + 9..package_start + 9 + package_end];
                                    println!("找到 APK 包名 abxml: {}", package_name);
                                    return Ok(package_name.to_string());
                                }
                            }

                            return Err(format!("AndroidManifest.xml 文件中没有找到 package 属性"));
                        }
                        Err(_) => {
                            return Err(format!("无法读取 AndroidManifest.xml 文件"));
                        }
                    }
                }
                Err(e) => {
                    return Err(format!("无法 使用 abxml 导出 APK 内容 {}", e));
                }
            }
        }
        Err(e) => {
            println!("无法使用 abxml 解析 APK 文件: {}", e);
            return Err(format!("无法使用 abxml 解析 APK 文件"));
        }
    }
}

fn install_obb(package_name: &str, apk_path: &str, adb_path: &str, device_id: &str) -> String {
    // 获取APK文件所在目录
    let apk_dir = Path::new(apk_path).parent().unwrap_or(Path::new(""));

    // 查找目录中的OBB文件
    let mut obb_files = Vec::new();
    if let Ok(entries) = fs::read_dir(apk_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.ends_with(".obb") {
                    obb_files.push(entry.path());
                }
            }
        }
    }

    if obb_files.is_empty() {
        return "No OBB files found".to_string();
    }

    // 创建设备上的OBB目录
    let mut cmd = Command::new(adb_path);
    cmd.args([
        "-s",
        device_id,
        "shell",
        "mkdir",
        "-p",
        &format!("/sdcard/Android/obb/{}", package_name),
    ]);
    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let create_dir_result = cmd.output();

    if let Err(e) = create_dir_result {
        return format!("Failed to create OBB directory: {}", e);
    }

    // 复制每个OBB文件到设备
    let mut success_count = 0;
    for obb_path in &obb_files {
        let obb_file_name = obb_path.file_name().unwrap().to_string_lossy();

        // 使用adb push命令复制文件
        let mut cmd = Command::new(adb_path);
        cmd.args([
            "-s",
            device_id,
            "push",
            obb_path.to_str().unwrap(),
            &format!("/sdcard/Android/obb/{}/{}", package_name, obb_file_name),
        ]);
        #[cfg(windows)]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let push_result = cmd.output();

        match push_result {
            Ok(output) => {
                if output.status.success() {
                    success_count += 1;
                    println!("Successfully copied OBB file: {}", obb_file_name);
                } else {
                    println!(
                        "Failed to copy OBB file: {}, Error: {}",
                        obb_file_name,
                        String::from_utf8_lossy(&output.stderr)
                    );
                }
            }
            Err(e) => {
                println!("Error executing adb push: {}", e);
            }
        }
    }

    let total_files = obb_files.len();
    format!(
        "Copied {}/{} OBB files successfully",
        success_count, total_files
    )
}

//
fn check_has_obb(path: &str) -> bool {
    // 获取APK文件所在目录
    let apk_path = Path::new(path);
    let dir = apk_path.parent().unwrap_or(Path::new(""));
    // 检查目录中是否有对应的.obb文件
    // OBB文件命名格式通常为: [main|patch].<version>.<package_name>.obb
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.ends_with(".obb") {
                    println!("Found OBB file: {}", file_name);
                    return true;
                }
            }
        }
    }

    false
}
