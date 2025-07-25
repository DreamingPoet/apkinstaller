# apkinstaller

apk 文件安装器

https://tauri.app/

安装依赖： npm i
启动测试： npm run tauri dev
构建： npm run tauri build


开发任务：前端放置文件，获取apk 文件的地址，前端按钮点击， 把文件地址传给后端，后端调用adb install ...

前后端交互路径：

第一步， rust 中定义函数, 加注解（宏）  #[tauri::command] ，注册函数名称 generate_handler[..., ...]
第二步， 前端调用 invoke()

    await invoke("greet", {
      path: greetInputEl.value,
    });

#  rustc版本
rustc 1.83.0 (90b35a623 2024-11-26)
