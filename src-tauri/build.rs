// Tauri 构建脚本。
//
// 只做一件事：读取 tauri.conf.json、校验权限清单，并生成编译期文件。
// 不要在这里加业务逻辑——它会在每次 `cargo build` 时重新运行。

fn main() {
    tauri_build::build()
}
