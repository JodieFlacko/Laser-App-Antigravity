/**
 * Resolves the API base URL dynamically.
 *
 * - In Tauri: invokes the Rust `get_api_port` command, which returns the
 *   port the sidecar announced on stdout (SIDECAR_PORT=<n>).
 * - In dev mode (browser): falls back to VITE_API_URL or localhost:3001.
 * - In production build served by the server directly: empty string (same origin).
 */
export async function getApiBaseUrl(): Promise<string> {
    // window.__TAURI_INTERNALS__ is set by Tauri's injected JS when running inside the app
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const port = await invoke<number>('get_api_port');
        return `http://localhost:${port}`;
    }

    // Browser dev / production fallback
    return (import.meta as any).env?.VITE_API_URL ||
        ((import.meta as any).env?.PROD ? '' : 'http://localhost:3001');
}
