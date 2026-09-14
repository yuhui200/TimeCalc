// TimeCalc 桌面端可执行入口。
//
// 这个文件故意保持极薄：真正的初始化在 `timecalc_lib::run()` 里，
// 因为 Tauri 2 的移动端目标只能链接库，不能链接可执行文件。
// 桌面与移动共用 lib.rs，就不会出现「两端行为不一致」的问题。

// 发布版在 Windows 上不弹出黑色控制台窗口；调试版保留，方便看 panic 输出。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    timecalc_lib::run()
}
