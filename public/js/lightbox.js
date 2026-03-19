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
    this.infoPanelClose = document.getElementById('info-panel-close');
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
    this.infoPanelClose.addEventListener('click', () => this.closeInfoPanel());

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
      this.displayMediaInfo(info);
    } catch (error) {
      console.error('Error loading media info:', error);
      this.infoPanelContent.innerHTML = '<div class="error">情報の読み込みに失敗しました</div>';
    }
  }

  displayMediaInfo(info) {
    let html = '<div class="info-section">';

    html += this._infoItem('📄', info.filename, this.formatFileSize(info.size));

    if (info.width && info.height) {
      html += this._infoItem('📏', `${info.width} × ${info.height}`,
        info.megapixels ? `${info.megapixels}MP` : '');
    }

    if (info.exif) {
      if (info.exif.dateTime) {
        html += this._infoItem('📅', this.formatDateTime(info.exif.dateTime));
      }

      if (info.exif.make || info.exif.model) {
        const camera = [info.exif.make, info.exif.model].filter(Boolean).join(' ');
        const settings = [];
        if (info.exif.fNumber) settings.push(`f/${info.exif.fNumber}`);
        if (info.exif.exposureTime) settings.push(`1/${Math.round(1/info.exif.exposureTime)}s`);
        if (info.exif.focalLength) settings.push(`${info.exif.focalLength}mm`);
        if (info.exif.iso) settings.push(`ISO${info.exif.iso}`);
        html += this._infoItem('📷', camera, settings.join(' '));
      }

      if (info.exif.lens) {
        html += this._infoItem('🔍', info.exif.lens);
      }
    }

    if (info.type === 'video') {
      if (info.duration) {
        html += this._infoItem('⏱', '再生時間', this.formatDuration(info.duration));
      }
      if (info.codec) {
        html += this._infoItem('🎬', info.codec.toUpperCase(),
          info.fps ? `${info.fps.toFixed(0)} fps` : '');
      }
    }

    html += this._infoItem('🕐', '更新日時', this.formatDateTime(info.modified));

    if (info.exif && info.exif.gps) {
      const { latitude: lat, longitude: lng } = info.exif.gps;
      html += this._infoItem('📍', '位置情報', `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      html += `<div class="info-map">
        <iframe width="100%" height="200" frameborder="0" style="border:0"
          src="https://maps.google.com/maps?q=${lat},${lng}&z=14&output=embed"
          allowfullscreen></iframe>
      </div>`;
    }

    html += '</div>';
    this.infoPanelContent.innerHTML = html;
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

  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
