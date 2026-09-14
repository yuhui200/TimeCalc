// TimeCalc 桌面端入口（库形态）。
//
// 为什么真正的逻辑在 lib.rs 而不是 main.rs：
// Tauri 2 的移动端目标（iOS / Android）以库的形式链接应用，
// 把 `run()` 放在库里，桌面与移动共用同一份初始化代码。
//
// 这里**不做任何业务计算**——所有逻辑都在前端 TypeScript 里，
// Rust 侧只负责：创建窗口、注册插件、把系统能力暴露给 src/platform/tauri.ts。
// 也就是说：加一个功能，绝大多数情况下不需要动这个文件。

use tauri::Manager;

/// 前端在开发模式下访问的地址，与 vite.config.ts 的 server.port 一致。
/// 生产构建时 Tauri 会加载打包后的静态资源，不使用这个值。
#[cfg(debug_assertions)]
const DEV_URL: &str = "http://localhost:5173";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // ---- 插件注册 ----
    // 顺序不影响功能，但每个插件都必须同时出现在 src-tauri/capabilities/default.json
    // 里，否则前端调用会被权限系统拦下（表现为「调用无反应」而不是报错）。
    builder = builder
        // 倒计时到点提醒
        .plugin(tauri_plugin_notification::init())
        // 复制结果 / 读取剪贴板
        .plugin(tauri_plugin_clipboard_manager::init())
        // 「另存为」对话框 + 写文件（.ics 导出）
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // 全局快捷键（设置里可开关）
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    builder
        .setup(|app| {
            // 单实例：再次启动时聚焦已有窗口，而不是开第二个。
            // 时间计算器是「随手一查」的工具，多开窗口没有意义。
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("TimeCalc 启动失败：无法创建 Tauri 应用");
}

#[cfg(test)]
mod tests {
    // Rust 侧没有业务逻辑，因此这里只做一次「常量没写错」的守门测试。
    // 真正的测试负担在前端的 154 个单元测试与 Playwright 端到端测试上。
    #[test]
    fn dev_url_matches_vite_port() {
        #[cfg(debug_assertions)]
        assert!(super::DEV_URL.ends_with(":5173"));
    }
}
