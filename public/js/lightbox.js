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

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Listen for item clicks from gallery
    document.addEventListener('itemClick', (e) => {
      this.show(e.detail.index);
    });

    // Close button
    this.closeBtn.addEventListener('click', () => this.close());

    // Previous/Next buttons
    this.prevBtn.addEventListener('click', () => this.prev());
    this.nextBtn.addEventListener('click', () => this.next());

    // Info button
    this.infoBtn.addEventListener('click', () => this.toggleInfoPanel());
    this.infoPanelClose.addEventListener('click', () => this.closeInfoPanel());

    // Keyboard navigation
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

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });
  }

  /**
   * Show lightbox with item at index
   */
  async show(index) {
    this.currentIndex = index;
    const item = this.gallery.getItem(index);

    if (!item) return;

    // Clear content
    this.content.innerHTML = '<div class="loading">読み込み中...</div>';

    // Create appropriate element
    const mediaUrl = await this.gallery.getMediaUrl(item);
    this.content.innerHTML = '';
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

    // Update info
    const filename = this.info.querySelector('.lightbox-filename');
    const counter = this.info.querySelector('.lightbox-counter');
    filename.textContent = item.filename;
    counter.textContent = `${index + 1} / ${this.gallery.filteredItems.length}`;

    // Show modal
    this.modal.classList.add('active');

    // Reload info panel if open
    if (this.infoPanel.classList.contains('active')) {
      this.loadMediaInfo();
    }
  }

  /**
   * Close lightbox
   */
  close() {
    this.modal.classList.remove('active');
    this.closeInfoPanel();

    // Stop video if playing
    const video = this.content.querySelector('video');
    if (video) {
      video.pause();
    }
  }

  /**
   * Show previous item
   */
  prev() {
    const newIndex = this.currentIndex - 1;
    if (newIndex >= 0) {
      this.show(newIndex);
    }
  }

  /**
   * Show next item
   */
  next() {
    const newIndex = this.currentIndex + 1;
    if (newIndex < this.gallery.filteredItems.length) {
      this.show(newIndex);
    }
  }

  /**
   * Toggle info panel
   */
  async toggleInfoPanel() {
    if (this.infoPanel.classList.contains('active')) {
      this.closeInfoPanel();
    } else {
      this.openInfoPanel();
    }
  }

  /**
   * Open info panel
   */
  async openInfoPanel() {
    this.infoPanel.classList.add('active');
    this.modal.classList.add('info-open');
    await this.loadMediaInfo();
  }

  /**
   * Close info panel
   */
  closeInfoPanel() {
    this.infoPanel.classList.remove('active');
    this.modal.classList.remove('info-open');
  }

  /**
   * Load media info from API
   */
  async loadMediaInfo() {
    const item = this.gallery.getItem(this.currentIndex);
    if (!item) return;

    this.infoPanelContent.innerHTML = '<div class="loading">読み込み中...</div>';

    try {
      const response = await fetch(`/api/media-info?path=${encodeURIComponent(item.path)}`);
      if (!response.ok) throw new Error('Failed to load info');

      const info = await response.json();
      this.displayMediaInfo(info);
    } catch (error) {
      console.error('Error loading media info:', error);
      this.infoPanelContent.innerHTML = '<div class="error">情報の読み込みに失敗しました</div>';
    }
  }

  /**
   * Display media info in panel
   */
  displayMediaInfo(info) {
    let html = '<div class="info-section">';

    // File info
    html += '<div class="info-item">';
    html += '<div class="info-icon">📄</div>';
    html += '<div class="info-details">';
    html += `<div class="info-label">${info.filename}</div>`;
    html += `<div class="info-value">${this.formatFileSize(info.size)}</div>`;
    html += '</div></div>';

    // Dimensions and megapixels
    if (info.width && info.height) {
      html += '<div class="info-item">';
      html += '<div class="info-icon">📏</div>';
      html += '<div class="info-details">';
      html += `<div class="info-label">${info.width} × ${info.height}</div>`;
      if (info.megapixels) {
        html += `<div class="info-value">${info.megapixels}MP</div>`;
      }
      html += '</div></div>';
    }

    // EXIF data (images only)
    if (info.exif) {
      // Date/Time
      if (info.exif.dateTime) {
        html += '<div class="info-item">';
        html += '<div class="info-icon">📅</div>';
        html += '<div class="info-details">';
        html += `<div class="info-label">${this.formatDateTime(info.exif.dateTime)}</div>`;
        html += '</div></div>';
      }

      // Camera
      if (info.exif.make || info.exif.model) {
        html += '<div class="info-item">';
        html += '<div class="info-icon">📷</div>';
        html += '<div class="info-details">';
        const camera = [info.exif.make, info.exif.model].filter(Boolean).join(' ');
        html += `<div class="info-label">${camera}</div>`;

        // Camera settings
        const settings = [];
        if (info.exif.fNumber) settings.push(`f/${info.exif.fNumber}`);
        if (info.exif.exposureTime) settings.push(`1/${Math.round(1/info.exif.exposureTime)}s`);
        if (info.exif.focalLength) settings.push(`${info.exif.focalLength}mm`);
        if (info.exif.iso) settings.push(`ISO${info.exif.iso}`);

        if (settings.length > 0) {
          html += `<div class="info-value">${settings.join(' ')}</div>`;
        }
        html += '</div></div>';
      }

      // Lens
      if (info.exif.lens) {
        html += '<div class="info-item">';
        html += '<div class="info-icon">🔍</div>';
        html += '<div class="info-details">';
        html += `<div class="info-label">${info.exif.lens}</div>`;
        html += '</div></div>';
      }
    }

    // Video info
    if (info.type === 'video') {
      if (info.duration) {
        html += '<div class="info-item">';
        html += '<div class="info-icon">⏱</div>';
        html += '<div class="info-details">';
        html += `<div class="info-label">再生時間</div>`;
        html += `<div class="info-value">${this.formatDuration(info.duration)}</div>`;
        html += '</div></div>';
      }

      if (info.codec) {
        html += '<div class="info-item">';
        html += '<div class="info-icon">🎬</div>';
        html += '<div class="info-details">';
        html += `<div class="info-label">${info.codec.toUpperCase()}</div>`;
        if (info.fps) {
          html += `<div class="info-value">${info.fps.toFixed(0)} fps</div>`;
        }
        html += '</div></div>';
      }
    }

    // Modified date
    html += '<div class="info-item">';
    html += '<div class="info-icon">🕐</div>';
    html += '<div class="info-details">';
    html += `<div class="info-label">更新日時</div>`;
    html += `<div class="info-value">${this.formatDateTime(info.modified)}</div>`;
    html += '</div></div>';

    // GPS (at the bottom)
    if (info.exif && info.exif.gps) {
      const lat = info.exif.gps.latitude;
      const lng = info.exif.gps.longitude;

      html += '<div class="info-item">';
      html += '<div class="info-icon">📍</div>';
      html += '<div class="info-details">';
      html += `<div class="info-label">位置情報</div>`;
      html += `<div class="info-value">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>`;
      html += '</div></div>';

      // Embedded map
      html += '<div class="info-map">';
      html += `<iframe
        width="100%"
        height="200"
        frameborder="0"
        style="border:0"
        src="https://maps.google.com/maps?q=${lat},${lng}&z=14&output=embed"
        allowfullscreen>
      </iframe>`;
      html += '</div>';
    }

    html += '</div>';
    this.infoPanelContent.innerHTML = html;
  }

  /**
   * Format file size
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  /**
   * Format date/time
   */
  formatDateTime(dateTime) {
    const date = new Date(dateTime);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Format duration (seconds to MM:SS)
   */
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
