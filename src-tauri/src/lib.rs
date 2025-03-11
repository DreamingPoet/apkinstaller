// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn install(path: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(
            tauri::generate_handler![
                greet, 
                install
                ])
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
                                if let Some(package_end) = manifest_content[package_start + 9..].find('\"') {
                                    let package_name = &manifest_content[package_start + 9..package_start + 9 + package_end];
                                    println!("找到 APK 包名 abxml: {}", package_name);
                                    return Ok(package_name.to_string());
                                }
                            }
                            
                            // 如果无法从 AndroidManifest.xml 中提取 package 属性，尝试使用 zip 库直接解析 APK 文件
                            return Err(format!("AndroidManifest.xml 文件中没有找到 package 属性"));
                        }
                        Err(_) => {
                            // 如果无法读取 AndroidManifest.xml 文件，尝试使用 zip 库直接解析 APK 文件
                            return Err(format!("无法读取 AndroidManifest.xml 文件"));
                        }
                    }
                }
                Err(e) => {
                    // 如果无法导出 APK 内容，尝试使用 zip 库直接解析 APK 文件
                    return Err(format!("无法 使用 abxml 导出 APK 内容 {}", e));
                }
            }
        }
        Err(e) => {
            // 如果无法使用 abxml 库解析 APK 文件，尝试使用 zip 库直接解析 APK 文件
            println!("无法使用 abxml 解析 APK 文件: {}", e);
            return Err(format!("无法使用 abxml 解析 APK 文件"));
        }
    }
}
