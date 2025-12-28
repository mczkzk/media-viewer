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
  show(index) {
    this.currentIndex = index;
    const item = this.gallery.getItem(index);

    if (!item) return;

    // Clear content
    this.content.innerHTML = '';

    // Create appropriate element
    if (item.type === 'image') {
      const img = document.createElement('img');
      // Use /api/image for HEIC conversion support
      img.src = `/api/image?path=${encodeURIComponent(item.path)}`;
      img.alt = item.filename;
      this.content.appendChild(img);
    } else if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = `/media/${item.path}`;
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
  }

  /**
   * Close lightbox
   */
  close() {
    this.modal.classList.remove('active');

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
}
