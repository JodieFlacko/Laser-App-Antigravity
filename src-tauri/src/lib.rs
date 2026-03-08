// Prevents additional console window on Windows in release builds, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Holds the port the sidecar announces on stdout.
/// Wrapped in Arc<Mutex<>> so it can be shared across threads.
type ApiPort = Arc<Mutex<Option<u16>>>;

/// Tauri command: returns the API port once the sidecar has announced it.
/// The frontend calls `invoke('get_api_port')` on init.
#[tauri::command]
async fn get_api_port(state: tauri::State<'_, ApiPort>) -> Result<u16, String> {
    // Poll up to 10 seconds (100 × 100 ms) for the sidecar to announce its port
    for _ in 0..100 {
        {
            let guard = state.lock().map_err(|e| e.to_string())?;
            if let Some(port) = *guard {
                return Ok(port);
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    Err("Sidecar did not announce a port within 10 seconds".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let api_port: ApiPort = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(api_port.clone())
        .setup(move |app| {
            let app_handle: AppHandle = app.handle().clone();
            let api_port_setup = api_port.clone();

            // On Windows, Tauri's path resolver prepends \\?\ (extended-length
            // path prefix).  Strip it so Node.js / LoadLibraryEx receive a plain
            // Win32 path — some APIs reject the \\?\ form when called from a SEA.
            fn strip_unc(s: String) -> String {
                s.strip_prefix(r"\\?\").map(|s| s.to_string()).unwrap_or(s)
            }

            let app_data_dir = strip_unc(
                app_handle
                    .path()
                    .app_data_dir()
                    .expect("Failed to resolve app_data_dir")
                    .to_string_lossy()
                    .to_string(),
            );

            let resource_dir = strip_unc(
                app_handle
                    .path()
                    .resource_dir()
                    .expect("Failed to resolve resource_dir")
                    .to_string_lossy()
                    .to_string(),
            );

            // Spawn the server sidecar, injecting env vars so the Node.js
            // server knows where to store data and find its native addon
            let sidecar_command = app_handle
                .shell()
                .sidecar("server-sidecar")
                .expect("Could not find server-sidecar binary")
                .env("TAURI_SIDECAR", "true")
                .env("SIDECAR_DATA_DIR", &app_data_dir)
                .env("SIDECAR_RESOURCES_DIR", &resource_dir)
                .env("NODE_ENV", "production");

            let (mut rx, _child) = sidecar_command
                .spawn()
                .expect("Failed to spawn server-sidecar");

            // Listen to the sidecar's stdout for SIDECAR_PORT=<n>
            let api_port_listener = api_port_setup.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line_bytes) => {
                            let line = String::from_utf8_lossy(&line_bytes);
                            if let Some(port_str) = line.trim().strip_prefix("SIDECAR_PORT=") {
                                if let Ok(port) = port_str.parse::<u16>() {
                                    let mut guard = api_port_listener.lock().unwrap();
                                    *guard = Some(port);
                                    println!("[tauri] Sidecar port: {port}");
                                }
                            }
                        }
                        CommandEvent::Stderr(line_bytes) => {
                            let line = String::from_utf8_lossy(&line_bytes);
                            eprintln!("[sidecar stderr] {line}");
                        }
                        CommandEvent::Error(err) => {
                            eprintln!("[sidecar error] {err}");
                        }
                        CommandEvent::Terminated(status) => {
                            println!("[tauri] Sidecar terminated: {:?}", status);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_api_port])
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}
