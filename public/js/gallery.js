class Gallery {
  constructor(container, tauriApp) {
    this.container = container;
    this.tauriApp = tauriApp || null;
    this.mediaItems = [];
    this.filteredItems = [];
    this.selectedYear = '';
    this.searchQuery = '';
    this.sortOrder = 'desc'; // Default: newest first
    this.displayMode = 'flat'; // 'flat' or 'hierarchical'
    this.currentPath = []; // Current folder path in hierarchical mode
  }

  /**
   * Load media data from API
   */
  async load() {
    try {
      let data;
      if (this.tauriApp && this.tauriApp.isTauri) {
        data = await this.tauriApp.scanMedia();
      } else {
        const response = await fetch('/api/media');
        if (!response.ok) {
          throw new Error('Failed to fetch media data');
        }
        data = await response.json();
      }

      this.mediaItems = data;

      // Pre-convert all searchable fields to different formats for performance
      this.preConvertSearchFields();

      this.sortItems();
      this.filteredItems = this.mediaItems;
      this.render();
    } catch (error) {
      console.error('Error loading media:', error);
      throw error;
    }
  }

  /**
   * Pre-convert searchable fields to romaji, hiragana, and katakana for fast search
   */
  preConvertSearchFields() {
    if (!window.KanaConverter) return;

    const converter = window.KanaConverter;

    this.mediaItems.forEach(item => {
      // Pre-convert path (most important for subdirectory matching)
      item._pathRomaji = converter.toRomaji(item.path).toLowerCase();
      item._pathHiragana = converter.toHiragana(item.path);
      item._pathKatakana = converter.toKatakana(item.path);

      // Pre-convert event name
      item._eventRomaji = converter.toRomaji(item.event).toLowerCase();
      item._eventHiragana = converter.toHiragana(item.event);
      item._eventKatakana = converter.toKatakana(item.event);

      // Pre-convert filename
      item._filenameRomaji = converter.toRomaji(item.filename).toLowerCase();
      item._filenameHiragana = converter.toHiragana(item.filename);
      item._filenameKatakana = converter.toKatakana(item.filename);
    });
  }

  /**
   * Render gallery grid
   */
  render() {
    if (this.displayMode === 'flat') {
      this.renderFlat();
    } else {
      this.renderHierarchical();
    }
  }

  /**
   * Render flat mode (original behavior)
   */
  renderFlat() {
    if (this.filteredItems.length === 0) {
      this.container.innerHTML = '<div class="loading-message">メディアが見つかりません</div>';
      return;
    }

    const yearCounts = this.getYearCounts();
    let currentYear = null;
    const html = this.filteredItems.map((item, index) => {
      const videoClass = item.type === 'video' ? 'video' : '';

      // Add year divider when year changes
      let yearDivider = '';
      if (item.year !== currentYear) {
        currentYear = item.year;
        const count = yearCounts[item.year] || 0;
        yearDivider = `<div class="year-divider" data-year="${item.year}">${item.year} <span class="year-count">(${count}件)</span></div>`;
      }

      const thumbSrc = this.getThumbnailUrl(item);
      return yearDivider + `
        <div class="grid-item ${videoClass} loading" data-index="${index}">
          <img src="${thumbSrc}"
               data-path="${item.path}"
               alt="${item.filename}"
               loading="lazy"
               onload="this.parentElement.classList.remove('loading');this.parentElement.classList.remove('error')"
               onerror="if(this.src && !window.__TAURI__){this.parentElement.classList.add('error');this.parentElement.classList.remove('loading')}">
          <div class="caption">${this.getDisplayCaption(item)}</div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = html;
    this.attachClickHandlers();
    this.updateYearIndex();
    this.loadTauriThumbnails();
  }

  /**
   * Render hierarchical mode (folder/file mixed)
   */
  renderHierarchical() {
    const items = this.buildCurrentViewItems();

    if (items.length === 0) {
      this.container.innerHTML = '<div class="loading-message">メディアが見つかりません</div>';
      return;
    }

    const html = items.map((item) => {
      if (item.type === 'folder') {
        return this.renderFolderCard(item);
      } else {
        // Find actual index in filteredItems for lightbox navigation
        const actualIndex = this.filteredItems.indexOf(item);
        return this.renderMediaCard(item, actualIndex);
      }
    }).join('');

    this.container.innerHTML = html;
    this.attachClickHandlers();
    this.loadTauriThumbnails();
  }

  /**
   * Render folder card
   */
  renderFolderCard(folder) {
    return `
      <div class="grid-item folder" data-folder-path="${folder.path}">
        <div class="folder-icon">📁</div>
        <div class="folder-name">${folder.name}</div>
        <div class="folder-count">${folder.itemCount}件</div>
      </div>
    `;
  }

  /**
   * Render media card
   */
  renderMediaCard(item, index) {
    const videoClass = item.type === 'video' ? 'video' : '';
    const thumbSrc = this.getThumbnailUrl(item);
    return `
      <div class="grid-item ${videoClass} loading" data-index="${index}">
        <img src="${thumbSrc}"
             data-path="${item.path}"
             alt="${item.filename}"
             loading="lazy"
             onload="this.parentElement.classList.remove('loading');this.parentElement.classList.remove('error')"
             onerror="if(this.src){this.parentElement.classList.add('error');this.parentElement.classList.remove('loading')}">
        <div class="caption">${this.getDisplayCaption(item)}</div>
      </div>
    `;
  }

  /**
   * Get thumbnail URL for a media item
   */
  getThumbnailUrl(item) {
    if (this.tauriApp && this.tauriApp.isTauri) {
      // Direct URL to cached thumbnail (no IPC needed)
      return this.tauriApp.thumbnailUrl(item.path);
    }
    return `/api/thumbnail?path=${encodeURIComponent(item.path)}`;
  }

  /**
   * Load thumbnails for Tauri mode.
   * Cached thumbnails are loaded directly by the browser (src is already set).
   * Uncached ones (onerror/404) are batch-generated then retried.
   */
  loadTauriThumbnails() {
    if (!this.tauriApp || !this.tauriApp.isTauri) return;

    // Collect images that fail to load (not yet cached)
    let pendingBatch = [];
    let batchTimer = null;

    const scheduleBatch = () => {
      if (batchTimer) return;
      batchTimer = setTimeout(() => {
        batchTimer = null;
        processBatch();
      }, 200); // Batch every 200ms
    };

    const processBatch = () => {
      if (pendingBatch.length === 0) return;

      // Take visible items first
      const batch = pendingBatch.splice(0, 20);
      const paths = batch.map(img => img.dataset.path);

      this.tauriApp.batchEnsureThumbnails(paths).then(results => {
        batch.forEach((img, i) => {
          if (results[i]) {
            // Re-trigger load with cache-busted URL
            img.src = this.tauriApp.thumbnailUrl(img.dataset.path) + '?t=' + Date.now();
          }
        });
        // Process remaining
        if (pendingBatch.length > 0) scheduleBatch();
      });
    };

    // Ensure loading class is removed when image loads (inline onload may not fire for media:// URLs)
    this.container.querySelectorAll('img[data-path]').forEach(img => {
      img.addEventListener('load', function() {
        this.parentElement.classList.remove('loading');
        this.parentElement.classList.remove('error');
      });
      // If already loaded (cached), remove loading immediately
      if (img.complete && img.naturalWidth > 0) {
        img.parentElement.classList.remove('loading');
        img.parentElement.classList.remove('error');
      }
    });

    // Override onerror for all thumbnail images to batch-generate
    this.container.querySelectorAll('img[data-path]').forEach(img => {
      const originalOnerror = img.onerror;
      img.onerror = function() {
        if (this.dataset.retried) {
          // Already retried, give up
          this.parentElement.classList.add('error');
          this.parentElement.classList.remove('loading');
          return;
        }
        this.dataset.retried = 'true';
        pendingBatch.push(this);
        scheduleBatch();
      };
    });
  }

  /**
   * Get full media URL for a media item
   */
  getMediaUrl(item) {
    if (this.tauriApp && this.tauriApp.isTauri) {
      return this.tauriApp.mediaUrl(item.path);
    }
    if (item.type === 'video') {
      return `/media/${item.path}`;
    }
    return `/api/image?path=${encodeURIComponent(item.path)}`;
  }

  /**
   * Get display caption (use deepest folder name if available)
   */
  getDisplayCaption(item) {
    const pathParts = item.path.split('/');
    // If file is in a subdirectory (more than 2 parts: year/event/file)
    if (pathParts.length > 2) {
      // Return the parent folder name (e.g., "Canada" from "2013/2013-05-14_RTW/Canada/photo.jpg")
      return pathParts[pathParts.length - 2];
    }
    // Otherwise use event name
    return item.event;
  }

  /**
   * Attach click handlers to grid items
   */
  attachClickHandlers() {
    // Folder click handlers
    const folders = this.container.querySelectorAll('.grid-item.folder');
    folders.forEach(folder => {
      folder.addEventListener('click', () => {
        const folderPath = folder.dataset.folderPath;
        this.navigateIntoFolder(folderPath);
      });
    });

    // Media click handlers
    const mediaItems = this.container.querySelectorAll('.grid-item:not(.folder)');
    mediaItems.forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        const event = new CustomEvent('itemClick', { detail: { index } });
        document.dispatchEvent(event);
      });
    });
  }

  /**
   * Filter by year
   */
  filterByYear(year) {
    this.selectedYear = year;
    this.applyFilters();
  }

  /**
   * Filter by event name (search)
   */
  filterByEvent(query) {
    this.searchQuery = query.toLowerCase();
    this.applyFilters();
    this.updateURL();
  }

  /**
   * Apply all filters
   */
  applyFilters() {
    this.filteredItems = this.mediaItems.filter(item => {
      const matchesYear = !this.selectedYear || item.year === this.selectedYear;

      if (!this.searchQuery) {
        return matchesYear;
      }

      // Multi-format search: pass item object with pre-converted fields
      const matchesSearch = this.multiFormatSearch(this.searchQuery, [item]);

      return matchesYear && matchesSearch;
    });

    this.sortFilteredItems();
    this.render();
  }

  /**
   * Search across multiple formats (romaji, hiragana, katakana)
   * Uses pre-converted fields for performance
   */
  multiFormatSearch(query, targets) {
    if (!window.KanaConverter) {
      // Fallback to simple search if converter not available
      return targets.some(target =>
        target.toLowerCase().includes(query.toLowerCase())
      );
    }

    const converter = window.KanaConverter;

    // Generate search variants from query (only convert query, not targets)
    const queryLower = query.toLowerCase();
    const queryRomaji = converter.toRomaji(query).toLowerCase();
    const queryHiragana = converter.toHiragana(query);
    const queryKatakana = converter.toKatakana(query);

    // Check against pre-converted fields (passed as item object)
    const item = targets[0]; // Expecting item object, not array of strings

    // Direct match in original text
    if (item.event.toLowerCase().includes(queryLower)) return true;
    if (item.filename.toLowerCase().includes(queryLower)) return true;
    if (item.path.toLowerCase().includes(queryLower)) return true;

    // Match in romaji
    if (item._pathRomaji && item._pathRomaji.includes(queryRomaji)) return true;
    if (item._eventRomaji && item._eventRomaji.includes(queryRomaji)) return true;
    if (item._filenameRomaji && item._filenameRomaji.includes(queryRomaji)) return true;

    // Match in hiragana
    if (item._pathHiragana && item._pathHiragana.includes(queryHiragana)) return true;
    if (item._eventHiragana && item._eventHiragana.includes(queryHiragana)) return true;
    if (item._filenameHiragana && item._filenameHiragana.includes(queryHiragana)) return true;

    // Match in katakana
    if (item._pathKatakana && item._pathKatakana.includes(queryKatakana)) return true;
    if (item._eventKatakana && item._eventKatakana.includes(queryKatakana)) return true;
    if (item._filenameKatakana && item._filenameKatakana.includes(queryKatakana)) return true;

    return false;
  }

  _compareItems(a, b) {
    const dir = this.sortOrder === 'desc' ? -1 : 1;
    return (a.year.localeCompare(b.year) * dir)
      || (a.event.localeCompare(b.event) * dir)
      || (a.path.localeCompare(b.path) * dir);
  }

  sortItems() {
    this.mediaItems.sort((a, b) => this._compareItems(a, b));
  }

  sortFilteredItems() {
    this.filteredItems.sort((a, b) => this._compareItems(a, b));
  }

  /**
   * Set sort order
   */
  setSortOrder(order) {
    this.sortOrder = order;
    this.sortItems();
    this.sortFilteredItems();
    this.render();

    // Update year index if in flat mode
    if (this.displayMode === 'flat') {
      this.updateYearIndex();
    }
  }

  /**
   * Get all unique years (sorted by sortOrder)
   */
  getYears() {
    const years = new Set(this.mediaItems.map(item => item.year));
    return Array.from(years).sort((a, b) =>
      this.sortOrder === 'desc' ? b.localeCompare(a) : a.localeCompare(b)
    );
  }

  /**
   * Get year counts (number of items per year)
   */
  getYearCounts() {
    const counts = {};
    this.mediaItems.forEach(item => {
      counts[item.year] = (counts[item.year] || 0) + 1;
    });
    return counts;
  }

  /**
   * Get item by index in filtered items
   */
  getItem(index) {
    return this.filteredItems[index];
  }

  /**
   * Extract folders at current path depth
   */
  extractFoldersAtCurrentPath() {
    const folders = new Map();
    const currentDepth = this.currentPath.length;

    this.filteredItems.forEach(item => {
      const pathParts = item.path.split('/');

      // Skip if doesn't match current path
      if (currentDepth > 0) {
        const matchesCurrentPath = this.currentPath.every((part, i) =>
          pathParts[i] === part
        );
        if (!matchesCurrentPath) return;
      }

      // Get next path part (potential folder)
      if (pathParts.length <= currentDepth) return;
      const nextPart = pathParts[currentDepth];

      // Check if this is a folder (has more levels after nextPart)
      const isFolder = pathParts.length > currentDepth + 1;

      if (isFolder && !folders.has(nextPart)) {
        const folderPath = [...this.currentPath, nextPart].join('/');
        folders.set(nextPart, {
          type: 'folder',
          name: nextPart,
          path: folderPath,
          year: item.year,
          event: item.event,
          itemCount: 0
        });
      }

      if (isFolder) {
        folders.get(nextPart).itemCount++;
      }
    });

    return Array.from(folders.values());
  }

  /**
   * Extract files at current path (only direct children)
   */
  extractFilesAtCurrentPath() {
    const currentDepth = this.currentPath.length;

    return this.filteredItems.filter(item => {
      const pathParts = item.path.split('/');

      // Must match current path
      if (currentDepth > 0) {
        const matchesCurrentPath = this.currentPath.every((part, i) =>
          pathParts[i] === part
        );
        if (!matchesCurrentPath) return false;
      }

      // Must be a file (not a folder) - pathParts.length === currentDepth + 1
      return pathParts.length === currentDepth + 1;
    });
  }

  /**
   * Build current view items (folders + files mixed)
   */
  buildCurrentViewItems() {
    const folders = this.extractFoldersAtCurrentPath();
    const files = this.extractFilesAtCurrentPath();

    // Combine folders and files
    const allItems = [...folders, ...files];

    // Sort by name (Finder-like) with sort order
    allItems.sort((a, b) => {
      const nameA = a.type === 'folder' ? a.name : a.filename;
      const nameB = b.type === 'folder' ? b.name : b.filename;
      const compare = nameA.localeCompare(nameB, 'ja');
      return this.sortOrder === 'desc' ? -compare : compare;
    });

    return allItems;
  }

  /**
   * Navigate into a folder
   */
  navigateIntoFolder(folderPath) {
    this.currentPath = folderPath.split('/');
    this.render();
    this.updateBreadcrumb();
  }

  /**
   * Navigate back to a specific depth
   */
  navigateBack(depth) {
    this.currentPath = this.currentPath.slice(0, depth);
    this.render();
    this.updateBreadcrumb();
  }

  /**
   * Switch to hierarchical mode
   */
  switchToHierarchicalMode(year) {
    this.displayMode = 'hierarchical';
    this.selectedYear = year;
    this.currentPath = [year]; // Start from year folder, showing event folders directly
    this.applyFilters();
    this.updateBreadcrumb();
    this.updateURL();

    // Hide year index in hierarchical mode
    const yearIndex = document.getElementById('year-index');
    if (yearIndex) {
      yearIndex.style.display = 'none';
    }
  }

  /**
   * Switch to flat mode
   */
  switchToFlatMode() {
    this.displayMode = 'flat';
    this.selectedYear = '';
    this.currentPath = [];
    this.applyFilters();
    this.updateBreadcrumb();
    this.updateURL();
  }

  /**
   * Update URL with current state
   */
  updateURL() {
    const params = new URLSearchParams();

    if (this.selectedYear) {
      params.set('year', this.selectedYear);
    }

    if (this.searchQuery) {
      params.set('q', this.searchQuery);
    }

    const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newURL);
  }

  /**
   * Restore state from URL parameters
   */
  restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const year = params.get('year');
    const query = params.get('q');
    const hash = window.location.hash.replace('#', '');

    return { year, query, hash };
  }

  /**
   * Scroll to specific year
   */
  scrollToYear(year) {
    const yearDivider = document.querySelector(`.year-divider[data-year="${year}"]`);
    if (yearDivider) {
      const header = document.querySelector('.header');
      const headerHeight = header ? header.offsetHeight : 0;
      const targetPosition = yearDivider.offsetTop - headerHeight;
      window.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  }

  /**
   * Update breadcrumb navigation
   */
  updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    // Hide breadcrumb in flat mode or at year level (depth <= 1)
    if (this.displayMode === 'flat' || this.currentPath.length <= 1) {
      breadcrumb.style.display = 'none';
      return;
    }

    breadcrumb.style.display = 'flex';

    // Build breadcrumb items starting from year (depth 1)
    const items = [
      `<span class="breadcrumb-item" data-depth="1">📁 ${this.selectedYear}</span>`
    ];

    // Add path parts after year
    for (let i = 1; i < this.currentPath.length; i++) {
      const part = this.currentPath[i];
      const depth = i + 1;
      items.push(`<span class="breadcrumb-separator"></span>`);
      items.push(`<span class="breadcrumb-item" data-depth="${depth}">${part}</span>`);
    }

    breadcrumb.innerHTML = items.join('');

    // Attach click handlers
    breadcrumb.querySelectorAll('.breadcrumb-item').forEach(item => {
      item.addEventListener('click', () => {
        const depth = parseInt(item.dataset.depth);
        this.navigateBack(depth);
      });
    });
  }

  /**
   * Update year index navigation
   */
  updateYearIndex() {
    const yearIndex = document.getElementById('year-index');
    if (!yearIndex) return;

    // Show only in flat mode
    if (this.displayMode !== 'flat') {
      yearIndex.style.display = 'none';
      return;
    }

    yearIndex.style.display = 'flex';

    // Get unique years from filtered items (sort based on sortOrder)
    const allYears = [...new Set(this.filteredItems.map(item => item.year))].sort((a, b) =>
      this.sortOrder === 'desc' ? b.localeCompare(a) : a.localeCompare(b)
    );

    // Calculate how many years can fit on screen
    const topOffset = 140; // CSS top value
    const bottomOffset = 20; // CSS bottom value
    const padding = 30; // Top + bottom padding
    const availableHeight = window.innerHeight - topOffset - bottomOffset - padding;
    const minItemHeight = 25; // Minimum height per item (font + padding)
    const maxItems = Math.floor(availableHeight / minItemHeight);

    // Thin out years if needed
    let years = allYears;
    if (allYears.length > maxItems) {
      const step = Math.ceil(allYears.length / maxItems);
      years = allYears.filter((_, index) => index % step === 0);

      // Always include the first year (newest) and last year (oldest)
      if (!years.includes(allYears[0])) {
        years.unshift(allYears[0]);
      }
      if (!years.includes(allYears[allYears.length - 1])) {
        years.push(allYears[allYears.length - 1]);
      }
    }

    // Build year index items
    const html = years.map(year =>
      `<div class="year-index-item" data-year="${year}">${year}</div>`
    ).join('');

    yearIndex.innerHTML = html;

    // Attach click handlers
    yearIndex.querySelectorAll('.year-index-item').forEach(item => {
      item.addEventListener('click', () => {
        const year = item.dataset.year;
        // Update URL hash
        window.location.hash = year;
        this.scrollToYear(year);
      });
    });

    // Update active year on scroll
    this.updateActiveYear();

    // Add resize listener for recalculation
    if (!this.resizeListenerAdded) {
      this.resizeListenerAdded = true;
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (this.displayMode === 'flat') {
            this.updateYearIndex();
          }
        }, 200); // 200ms debounce
      });
    }
  }

  /**
   * Update active year in year index based on scroll position
   */
  updateActiveYear() {
    if (this.displayMode !== 'flat') return;

    const yearDividers = document.querySelectorAll('.year-divider[data-year]');
    const yearIndexItems = document.querySelectorAll('.year-index-item');

    const handleScroll = () => {
      const scrollPos = window.scrollY + 150; // Offset for header

      let activeYear = null;
      yearDividers.forEach(divider => {
        const top = divider.offsetTop;
        if (scrollPos >= top) {
          activeYear = divider.dataset.year;
        }
      });

      yearIndexItems.forEach(item => {
        if (item.dataset.year === activeYear) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    };

    // Remove old listener if exists
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener);
    }

    this.scrollListener = handleScroll;
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial update
  }
}
