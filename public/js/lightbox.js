class Lightbox {
  constructor(gallery) {
    this.gallery = gallery;
    this.currentIndex = 0;
    this.modal = document.getElementById('lightbox');
    this.content = document.getElementById('lightbox-content');
    this.closeBtn = document.getElementById('lightbox-close');
    this.prevBtn = document.getElementById('lightbox-prev');
    this.nextBtn = document.getElementById('lightbox-next');
    this.info = document.getElementById('lightbox-info');
    this.infoBtn = document.getElementById('lightbox-info-btn');
    this.infoPanel = document.getElementById('lightbox-info-panel');
    this.infoPanelContent = document.getElementById('info-panel-content');

    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener('itemClick', (e) => {
      this.show(e.detail.index);
    });

    this.closeBtn.addEventListener('click', () => this.close());
    this.prevBtn.addEventListener('click', () => this.prev());
    this.nextBtn.addEventListener('click', () => this.next());
    this.infoBtn.addEventListener('click', () => this.toggleInfoPanel());

    document.addEventListener('keydown', (e) => {
      if (!this.modal.classList.contains('active')) return;

      switch (e.key) {
        case 'Escape':
          this.close();
          break;
        case 'ArrowLeft':
          this.prev();
          break;
        case 'ArrowRight':
          this.next();
          break;
      }
    });

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });
  }

  show(index) {
    this.currentIndex = index;
    const item = this.gallery.getItem(index);

    if (!item) return;

    this.content.innerHTML = '';

    const mediaUrl = this.gallery.getMediaUrl(item);
    if (item.type === 'image') {
      const img = document.createElement('img');
      img.src = mediaUrl;
      img.alt = item.filename;
      this.content.appendChild(img);
    } else if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = mediaUrl;
      video.controls = true;
      video.autoplay = true;
      video.volume = 0.5;
      this.content.appendChild(video);
    }

    this.info.querySelector('.lightbox-filename').textContent = item.filename;
    this.info.querySelector('.lightbox-counter').textContent = `${index + 1} / ${this.gallery.filteredItems.length}`;

    this.modal.classList.add('active');

    if (this.infoPanel.classList.contains('active')) {
      this.loadMediaInfo();
    }
  }

  close() {
    this.modal.classList.remove('active');
    this.closeInfoPanel();

    const video = this.content.querySelector('video');
    if (video) {
      video.pause();
    }
  }

  prev() {
    if (this.currentIndex > 0) {
      this.show(this.currentIndex - 1);
    }
  }

  next() {
    if (this.currentIndex < this.gallery.filteredItems.length - 1) {
      this.show(this.currentIndex + 1);
    }
  }

  async toggleInfoPanel() {
    if (this.infoPanel.classList.contains('active')) {
      this.closeInfoPanel();
    } else {
      this.openInfoPanel();
    }
  }

  async openInfoPanel() {
    this.infoPanel.classList.add('active');
    this.modal.classList.add('info-open');
    await this.loadMediaInfo();
  }

  closeInfoPanel() {
    this.infoPanel.classList.remove('active');
    this.modal.classList.remove('info-open');
  }

  async loadMediaInfo() {
    const item = this.gallery.getItem(this.currentIndex);
    if (!item) return;

    this.infoPanelContent.innerHTML = '<div class="loading">読み込み中...</div>';

    try {
      let info;
      const tauriApp = this.gallery.tauriApp;
      if (tauriApp && tauriApp.isTauri) {
        info = await tauriApp.getMediaInfo(item.path);
      } else {
        const response = await fetch(`/api/media-info?path=${encodeURIComponent(item.path)}`);
        if (!response.ok) throw new Error('Failed to load info');
        info = await response.json();
      }
      this.displayMediaInfo(info, item.path);
    } catch (error) {
      console.error('Error loading media info:', error);
      this.infoPanelContent.innerHTML = '<div class="error">情報の読み込みに失敗しました</div>';
    }
  }

  // SVG icons (20x20, stroke-based)
  static ICONS = {
    file: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    dimension: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h18"/></svg>',
    calendar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    lens: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>',
    clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    location: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    duration: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
    codec: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>',
    finder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  };

  displayMediaInfo(info, itemPath) {
    const I = Lightbox.ICONS;
    let html = '<div class="info-section">';

    const hasFinder = this.gallery.tauriApp && this.gallery.tauriApp.isTauri && this.gallery.tauriApp.mediaBasePath;
    const finderBtn = hasFinder
      ? ` <a class="info-finder-link" href="#" data-path="${this._escapeAttr(itemPath)}" title="Finderで表示">${I.finder}</a>`
      : '';
    html += this._infoItem(I.file, info.filename + finderBtn, this.formatFileSize(info.size));

    if (info.width && info.height) {
      html += this._infoItem(I.dimension, `${info.width} × ${info.height}`,
        info.megapixels ? `${info.megapixels}MP` : '');
    }

    if (info.exif) {
      if (info.exif.dateTime) {
        html += this._infoItem(I.calendar, this.formatDateTime(info.exif.dateTime));
      }

      if (info.exif.make || info.exif.model) {
        const camera = [info.exif.make, info.exif.model].filter(Boolean).join(' ');
        const settings = [];
        if (info.exif.fNumber) settings.push(`f/${info.exif.fNumber}`);
        if (info.exif.exposureTime) settings.push(`1/${Math.round(1/info.exif.exposureTime)}s`);
        if (info.exif.focalLength) settings.push(`${info.exif.focalLength}mm`);
        if (info.exif.iso) settings.push(`ISO${info.exif.iso}`);
        html += this._infoItem(I.camera, camera, settings.join(' '));
      }

      if (info.exif.lens) {
        html += this._infoItem(I.lens, info.exif.lens);
      }
    }

    if (info.type === 'video') {
      if (info.duration) {
        html += this._infoItem(I.duration, '再生時間', this.formatDuration(info.duration));
      }
      if (info.codec) {
        html += this._infoItem(I.codec, info.codec.toUpperCase(),
          info.fps ? `${info.fps.toFixed(0)} fps` : '');
      }
    }

    html += this._infoItem(I.clock, '更新日時', this.formatDateTime(info.modified));

    if (info.exif && info.exif.gps) {
      const { latitude: lat, longitude: lng } = info.exif.gps;
      html += this._infoItem(I.location, '位置情報', `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      html += `<div class="info-map">
        <iframe width="100%" height="200" frameborder="0" style="border:0"
          src="https://maps.google.com/maps?q=${lat},${lng}&z=14&output=embed"
          allowfullscreen></iframe>
      </div>`;
    }

    // Tags
    const tags = this.gallery.tagMap && this.gallery.tagMap[itemPath];
    if (tags && tags.length > 0) {
      html += '<div class="info-tags">';
      tags.forEach(tag => {
        html += `<span class="info-tag">${tag}</span>`;
      });
      html += '</div>';
    }

    html += '</div>';
    this.infoPanelContent.innerHTML = html;

    // Bind Finder link click
    const finderLink = this.infoPanelContent.querySelector('.info-finder-link');
    if (finderLink) {
      finderLink.addEventListener('click', (e) => {
        e.preventDefault();
        const path = finderLink.dataset.path;
        const basePath = this.gallery.tauriApp.mediaBasePath;
        window.__TAURI__.core.invoke('show_in_finder', { path, basePath });
      });
    }
  }

  _infoItem(icon, label, value) {
    let html = '<div class="info-item">';
    html += `<div class="info-icon">${icon}</div>`;
    html += '<div class="info-details">';
    html += `<div class="info-label">${label}</div>`;
    if (value) html += `<div class="info-value">${value}</div>`;
    html += '</div></div>';
    return html;
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  formatDateTime(dateTime) {
    return new Date(dateTime).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
