// What this machine can run (T-26): memory, CPUs, and the free disk where local
// models are kept (Ollama keeps them under the home folder). The GPU is read in
// the WebView through WebGPU.
use serde::Serialize;
use sysinfo::{Disks, System};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hardware {
    ram_gb: f64,
    cpus: usize,
    disk_free_gb: Option<f64>,
}

const GB: f64 = 1_000_000_000.0;

#[tauri::command]
pub fn hardware() -> Hardware {
    let mut sys = System::new();
    sys.refresh_memory();
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(std::path::PathBuf::from);
    let disks = Disks::new_with_refreshed_list();
    // The disk whose mount point is the longest prefix of the home folder.
    let disk_free_gb = home.and_then(|h| {
        disks
            .list()
            .iter()
            .filter(|d| h.starts_with(d.mount_point()))
            .max_by_key(|d| d.mount_point().as_os_str().len())
            .map(|d| d.available_space() as f64 / GB)
    });
    Hardware {
        ram_gb: sys.total_memory() as f64 / GB,
        cpus: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
        disk_free_gb,
    }
}
