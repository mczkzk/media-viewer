// Tauri app initialization and folder selection
// Only active when running inside Tauri (window.__TAURI__ exists)

class TauriApp {
  constructor() {
    this.isTauri = !!window.__TAURI__;
    this.mediaBasePath = null;
  }

  async init() {
    if (!this.isTauri) return;

    // Load stored path
    this.mediaBasePath = await this.getStoredPath();

    if (!this.mediaBasePath) {
      // First launch: show folder selection
      this.mediaBasePath = await this.selectFolder();
    }
  }

  async getStoredPath() {
    try {
      const result = await window.__TAURI__.core.invoke('get_stored_path');
      return result || null;
    } catch (e) {
      console.error('Failed to get stored path:', e);
      return null;
    }
  }

  async setStoredPath(path) {
    try {
      await window.__TAURI__.core.invoke('set_stored_path', { path });
      this.mediaBasePath = path;
    } catch (e) {
      console.error('Failed to set stored path:', e);
    }
  }

  async selectFolder() {
    try {
      const path = await window.__TAURI__.dialog.open({
        directory: true,
        title: 'メディアフォルダを選択'
      });
      if (path) {
        await this.setStoredPath(path);
        return path;
      }
      return null;
    } catch (e) {
      console.error('Folder selection failed:', e);
      return null;
    }
  }

  async changeFolder() {
    const path = await this.selectFolder();
    if (path) {
      location.reload();
    }
  }
}

// Expose globally
window.TauriApp = TauriApp;
