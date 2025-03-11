// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};

#[tauri::command]
fn drop_file(path: &str) -> String {
    if path.ends_with(".apk") {
        // let package_name = match get_apk_package_name(path) {
        //     Ok(name) => name,
        //     Err(e) => return format!("获取包名失败: {}", e),
        // };

        let has_obb = check_has_obb(path);
        let package_name="".to_string();

        // install(path)
        let name: &str = path.split("\\").last().unwrap();
        format!("name:'{}',package_name:'{}',has_obb:'{}'", name, package_name, has_obb)
    } else {
        format!("仅支持 .apk 文件")
    }
}

#[tauri::command]
fn install(handle: AppHandle, path: &str) -> String {
    // 1. First get package name from APK
    let package_name = match get_apk_package_name(path) {
        Ok(name) => name,
        Err(e) => return format!("获取包名失败: {}", e),
    };
    println!("package_name: {}", package_name);

    // 2. Install the APK
    let resource_dir = handle.path().resource_dir().unwrap();
    let adb_path = resource_dir.join("platform-tools/ADB/adb.exe");
    let adb_path_str = adb_path.to_str().unwrap();

    let install_result = std::process::Command::new(adb_path_str)
        .args(["install", "-r", path])
        .output();

    match install_result {
        Ok(output) => {
            if !output.status.success() {
                return format!("安装失败: {}", String::from_utf8_lossy(&output.stderr));
            }

            // 安装OBB文件
            let obb_result = install_obb(&package_name, path, adb_path_str);
            println!("obb_result: {}", obb_result);

            // 3. Grant permissions
            let permissions = [
                "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.WRITE_EXTERNAL_STORAGE",
            ];

            for permission in permissions {
                let grant_result = std::process::Command::new(adb_path_str)
                    .args(["shell", "pm", "grant", &package_name, permission])
                    .output();

                if let Err(e) = grant_result {
                    return format!("Failed to grant permission {}: {}", permission, e);
                }
            }

            format!(
                "Successfully installed and granted permissions for {}",
                package_name
            )
        }
        Err(e) => format!("安装失败: {}", e),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![install, drop_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn get_apk_package_name(path: &str) -> Result<String, String> {
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

fn install_obb(package_name: &str, apk_path: &str, adb_path: &str) -> String {
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
    let create_dir_result = std::process::Command::new(adb_path)
        .args([
            "shell",
            "mkdir",
            "-p",
            &format!("/sdcard/Android/obb/{}", package_name),
        ])
        .output();

    if let Err(e) = create_dir_result {
        return format!("Failed to create OBB directory: {}", e);
    }

    // 复制每个OBB文件到设备
    let mut success_count = 0;
    for obb_path in &obb_files {
        let obb_file_name = obb_path.file_name().unwrap().to_string_lossy();

        // 使用adb push命令复制文件
        let push_result = std::process::Command::new(adb_path)
            .args([
                "push",
                obb_path.to_str().unwrap(),
                &format!("/sdcard/Android/obb/{}/{}", package_name, obb_file_name),
            ])
            .output();

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
