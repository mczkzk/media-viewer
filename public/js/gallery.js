class Gallery {
  constructor(container, tauriApp) {
    this.container = container;
    this.tauriApp = tauriApp || null;
    this.mediaItems = [];
    this.filteredItems = [];
    this.selectedYear = '';
    this.searchQuery = '';
    this.sortOrder = 'desc';
    this.displayMode = 'flat'; // 'flat' or 'hierarchical'
    this.currentPath = [];
    this.tagMap = {};  // { relativePath: ["tag1", "tag2"] }
  }

  async load({ force = false } = {}) {
    try {
      let data;
      if (this.tauriApp && this.tauriApp.isTauri) {
        data = force ? await this.tauriApp.forceScan() : await this.tauriApp.scanMedia();
      } else {
        const response = await fetch('/api/media');
        if (!response.ok) {
          throw new Error('Failed to fetch media data');
        }
        data = await response.json();
      }

      this.mediaItems = data;
      this.preConvertSearchFields();
      this.sortItems();
      this.filteredItems = this.mediaItems;
      if (force) this._resetThumbnailBatcher();
      this.render();
    } catch (error) {
      console.error('Error loading media:', error);
      throw error;
    }
  }

  preConvertSearchFields() {
    if (!window.KanaConverter) return;

    const converter = window.KanaConverter;

    this.mediaItems.forEach(item => {
      if (!item._pathRomaji) {
        item._pathRomaji = converter.toRomaji(item.path).toLowerCase();
        item._pathHiragana = converter.toHiragana(item.path);
        item._pathKatakana = converter.toKatakana(item.path);

        item._eventRomaji = converter.toRomaji(item.event).toLowerCase();
        item._eventHiragana = converter.toHiragana(item.event);
        item._eventKatakana = converter.toKatakana(item.event);

        item._filenameRomaji = converter.toRomaji(item.filename).toLowerCase();
        item._filenameHiragana = converter.toHiragana(item.filename);
        item._filenameKatakana = converter.toKatakana(item.filename);
      }

      const tags = this.tagMap[item.path];
      if (tags && tags.length > 0) {
        const joined = tags.join(' ');
        item._tagsLower = joined.toLowerCase();
        item._tagsRomaji = converter.toRomaji(joined).toLowerCase();
        item._tagsHiragana = converter.toHiragana(joined);
        item._tagsKatakana = converter.toKatakana(joined);
      }
    });
  }

  render() {
    if (this.displayMode === 'flat') {
      this.renderFlat();
    } else {
      this.renderHierarchical();
    }
    if (this.onRender) this.onRender();
  }

  renderFlat() {
    if (this.filteredItems.length === 0) {
      this._destroyVirtualScroller();
      this.container.innerHTML = '<div class="loading-message">メディアが見つかりません</div>';
      return;
    }

    if (!this._vscroller) {
      this._vscroller = new VirtualScroller(this.container, this);
    }
    this._vscroller.rebuild(this.filteredItems, this.getYearCounts(this.filteredItems));
    this.updateYearIndex();
  }

  _destroyVirtualScroller() {
    if (this._vscroller) {
      this._vscroller.destroy();
      this._vscroller = null;
    }
  }

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
        return this.renderMediaCard(item, item._filteredIndex);
      }
    }).join('');

    this.container.innerHTML = html;
    this.attachClickHandlers();
    this.loadTauriThumbnails();
  }

  renderFolderCard(folder) {
    return `
      <div class="grid-item folder" data-folder-path="${folder.path}">
        <div class="folder-icon">
          <svg width="64" height="54" viewBox="0 0 64 54" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 8C2 5.79 3.79 4 6 4h16l6 6h30c2.21 0 4 1.79 4 4v2H2V8z" fill="#5AB0F7"/>
            <rect x="2" y="14" width="60" height="36" rx="3" fill="url(#folderGrad)"/>
            <defs>
              <linearGradient id="folderGrad" x1="32" y1="14" x2="32" y2="50" gradientUnits="userSpaceOnUse">
                <stop stop-color="#5AB0F7"/>
                <stop offset="1" stop-color="#3D8CE4"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div class="folder-name">${folder.name}</div>
        <div class="folder-count">${folder.itemCount}件</div>
      </div>
    `;
  }

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
             onerror="if(!window.__TAURI__ && this.src){this.parentElement.classList.add('error');this.parentElement.classList.remove('loading')}">
        <div class="caption">${this.getDisplayCaption(item)}</div>
      </div>
    `;
  }

  getThumbnailUrl(item) {
    if (this.tauriApp && this.tauriApp.isTauri) {
      return this.tauriApp.thumbnailUrl(item.path);
    }
    return `/api/thumbnail?path=${encodeURIComponent(item.path)}`;
  }

  _resetThumbnailBatcher() {
    if (this._thumbBatcher) {
      clearTimeout(this._thumbBatcher.timer);
      this._thumbBatcher.pending.length = 0;
    }
    this._thumbBatcher = null;
  }

  // Cached thumbnails load directly via HTTP. On 404 (cache miss),
  // images are batched and generated via IPC, then retried.
  _initThumbnailBatcher() {
    if (this._thumbBatcher) return;
    this._thumbBatcher = {
      pending: [],
      timer: null,
    };
    const batcher = this._thumbBatcher;

    batcher.schedule = () => {
      if (batcher.timer) return;
      batcher.timer = setTimeout(() => {
        batcher.timer = null;
        batcher.process();
      }, 200);
    };

    batcher.process = () => {
      if (batcher.pending.length === 0) return;
      const batch = batcher.pending.splice(0, 20);
      const paths = batch.map(img => img.dataset.path);

      this.tauriApp.batchEnsureThumbnails(paths).then(results => {
        batch.forEach((img, i) => {
          if (results[i]) {
            img.src = this.tauriApp.thumbnailUrl(img.dataset.path) + '?t=' + Date.now();
          }
        });
        if (batcher.pending.length > 0) batcher.schedule();
      }).catch(err => {
        console.error('Thumbnail batch failed:', err);
        batch.forEach(img => {
          img.parentElement.classList.add('error');
          img.parentElement.classList.remove('loading');
        });
      });
    };
  }

  loadTauriThumbnails() {
    if (!this.tauriApp || !this.tauriApp.isTauri) return;
    this._initThumbnailBatcher();
    const batcher = this._thumbBatcher;

    this.container.querySelectorAll('img[data-path]').forEach(img => {
      if (img.dataset.thumbHandled) return;
      img.dataset.thumbHandled = 'true';

      img.addEventListener('load', function() {
        this.parentElement.classList.remove('loading');
        this.parentElement.classList.remove('error');
      });
      if (img.complete && img.naturalWidth > 0) {
        img.parentElement.classList.remove('loading');
        img.parentElement.classList.remove('error');
      }

      img.onerror = function() {
        if (this.dataset.retried) {
          this.parentElement.classList.add('error');
          this.parentElement.classList.remove('loading');
          return;
        }
        this.dataset.retried = 'true';
        batcher.pending.push(this);
        batcher.schedule();
      };
      if (img.complete && img.naturalWidth === 0 && !img.dataset.retried) {
        img.dataset.retried = 'true';
        batcher.pending.push(img);
      }
    });
    if (batcher.pending.length > 0) batcher.schedule();
  }

  getMediaUrl(item) {
    if (this.tauriApp && this.tauriApp.isTauri) {
      return this.tauriApp.mediaUrl(item.path);
    }
    if (item.type === 'video') {
      return `/media/${item.path}`;
    }
    return `/api/image?path=${encodeURIComponent(item.path)}`;
  }

  // Use deepest parent folder name as caption, fall back to event name
  getDisplayCaption(item) {
    const pathParts = item.path.split('/');
    if (pathParts.length > 2) {
      return pathParts[pathParts.length - 2];
    }
    return item.event;
  }

  attachClickHandlers() {
    this.container.querySelectorAll('.grid-item.folder').forEach(folder => {
      folder.addEventListener('click', () => {
        this.navigateIntoFolder(folder.dataset.folderPath);
      });
    });

    this.container.querySelectorAll('.grid-item:not(.folder)').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        document.dispatchEvent(new CustomEvent('itemClick', { detail: { index } }));
      });
    });
  }

  filterByYear(year) {
    this.selectedYear = year;
    this.applyFilters();
  }

  filterByEvent(query) {
    this.searchQuery = query.toLowerCase();
    this.applyFilters();
    this.updateURL();
  }

  applyFilters() {
    const queryVariants = this.searchQuery ? this._buildQueryVariants(this.searchQuery) : null;
    this.filteredItems = this.mediaItems.filter(item => {
      const matchesYear = !this.selectedYear || item.year === this.selectedYear;
      if (!queryVariants) return matchesYear;
      return matchesYear && this._matchesQuery(queryVariants, item);
    });

    this.sortFilteredItems();
    this.render();
  }

  _buildQueryVariants(query) {
    const queryLower = query.toLowerCase();
    if (!window.KanaConverter) return { queryLower };
    const converter = window.KanaConverter;
    return {
      queryLower,
      queryRomaji: converter.toRomaji(query).toLowerCase(),
      queryHiragana: converter.toHiragana(query),
      queryKatakana: converter.toKatakana(query),
    };
  }

  // Search across original text, romaji, hiragana, and katakana using pre-converted fields
  _matchesQuery(q, item) {
    const fieldGroups = [
      ['path', '_pathRomaji', '_pathHiragana', '_pathKatakana'],
      ['event', '_eventRomaji', '_eventHiragana', '_eventKatakana'],
      ['filename', '_filenameRomaji', '_filenameHiragana', '_filenameKatakana'],
      [null, '_tagsRomaji', '_tagsHiragana', '_tagsKatakana'],
    ];

    for (const [raw, romaji, hiragana, katakana] of fieldGroups) {
      if (raw && item[raw].toLowerCase().includes(q.queryLower)) return true;
      if (!raw && item._tagsLower && item._tagsLower.includes(q.queryLower)) return true;
      if (q.queryRomaji) {
        if (item[romaji] && item[romaji].includes(q.queryRomaji)) return true;
        if (item[hiragana] && item[hiragana].includes(q.queryHiragana)) return true;
        if (item[katakana] && item[katakana].includes(q.queryKatakana)) return true;
      }
    }

    return false;
  }

  _compareItems(a, b) {
    const dir = this.sortOrder === 'desc' ? -1 : 1;
    const yearCmp = a.year.localeCompare(b.year) * dir;
    if (yearCmp !== 0) return yearCmp;
    // Within the same year, sort by mtime descending (newest first)
    const mtimeA = a.mtime || 0;
    const mtimeB = b.mtime || 0;
    return mtimeB - mtimeA;
  }

  sortItems() {
    this.mediaItems.sort((a, b) => this._compareItems(a, b));
  }

  sortFilteredItems() {
    this.filteredItems.sort((a, b) => this._compareItems(a, b));
  }

  setSortOrder(order) {
    this.sortOrder = order;
    this.sortItems();
    this.sortFilteredItems();
    this.render();
  }

  getYears(items = this.mediaItems) {
    const years = new Set(items.map(item => item.year));
    return Array.from(years).sort((a, b) =>
      this.sortOrder === 'desc' ? b.localeCompare(a) : a.localeCompare(b)
    );
  }

  getYearCounts(items = this.mediaItems) {
    const counts = {};
    items.forEach(item => {
      counts[item.year] = (counts[item.year] || 0) + 1;
    });
    return counts;
  }

  getItem(index) {
    return this.filteredItems[index];
  }

  // Returns filteredItems indices navigable from current view
  getNavigableIndices() {
    if (this.displayMode === 'flat') {
      return this.filteredItems.map((_, i) => i);
    }
    // Hierarchical: only files at current folder depth
    const indices = [];
    const depth = this.currentPath.length;
    this.filteredItems.forEach((item, i) => {
      const parts = item.path.split('/');
      if (depth > 0 && !this.currentPath.every((p, j) => parts[j] === p)) return;
      if (parts.length === depth + 1) indices.push(i);
    });
    return indices;
  }

  buildCurrentViewItems() {
    const folders = new Map();
    const files = [];
    const currentDepth = this.currentPath.length;

    this.filteredItems.forEach((item, filteredIndex) => {
      const pathParts = item.path.split('/');

      if (currentDepth > 0 && !this.currentPath.every((part, i) => pathParts[i] === part)) {
        return;
      }

      if (pathParts.length <= currentDepth) return;

      if (pathParts.length === currentDepth + 1) {
        item._filteredIndex = filteredIndex;
        files.push(item);
        return;
      }

      const nextPart = pathParts[currentDepth];
      if (!folders.has(nextPart)) {
        folders.set(nextPart, {
          type: 'folder',
          name: nextPart,
          path: [...this.currentPath, nextPart].join('/'),
          year: item.year,
          event: item.event,
          itemCount: 0
        });
      }
      folders.get(nextPart).itemCount++;
    });

    const allItems = [...folders.values(), ...files];
    allItems.sort((a, b) => {
      const nameA = a.type === 'folder' ? a.name : a.filename;
      const nameB = b.type === 'folder' ? b.name : b.filename;
      const compare = nameA.localeCompare(nameB, 'ja');
      return this.sortOrder === 'desc' ? -compare : compare;
    });

    return allItems;
  }

  navigateIntoFolder(folderPath) {
    this.currentPath = folderPath.split('/');
    this.render();
    this.updateBreadcrumb();
    this.updateURL();
  }

  navigateBack(depth) {
    this.currentPath = this.currentPath.slice(0, depth);
    this.render();
    this.updateBreadcrumb();
    this.updateURL();
  }

  switchToHierarchicalMode(year, initialPath = null) {
    this._destroyVirtualScroller();
    this.displayMode = 'hierarchical';
    this.selectedYear = year;
    this.currentPath = initialPath ? initialPath.split('/') : [year];
    this.applyFilters();
    this.updateBreadcrumb();
    this.updateURL();

    const yearIndex = document.getElementById('year-index');
    if (yearIndex) {
      yearIndex.style.display = 'none';
    }
  }

  switchToFlatMode() {
    this.displayMode = 'flat';
    this.selectedYear = '';
    this.currentPath = [];
    this.applyFilters();
    this.updateBreadcrumb();
    this.updateURL();
  }

  updateURL() {
    const params = new URLSearchParams();
    if (this.selectedYear) params.set('year', this.selectedYear);
    if (this.searchQuery) params.set('q', this.searchQuery);
    if (this.currentPath.length > 1) params.set('path', this.currentPath.join('/'));
    const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newURL);
  }

  restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    return {
      year: params.get('year'),
      query: params.get('q'),
      path: params.get('path'),
      hash: window.location.hash.replace('#', ''),
    };
  }

  scrollToYear(year) {
    const header = document.querySelector('.header');
    const headerHeight = header ? header.offsetHeight : 0;

    if (this._vscroller) {
      const top = this._vscroller.getYearTop(year);
      if (top !== null) {
        window.scrollTo({ top: top - headerHeight, behavior: 'smooth' });
        return;
      }
    }

    const yearDivider = document.querySelector(`.year-divider[data-year="${year}"]`);
    if (yearDivider) {
      const targetPosition = yearDivider.offsetTop - headerHeight;
      window.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  }

  updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    if (this.displayMode === 'flat') {
      breadcrumb.style.display = 'none';
      return;
    }

    breadcrumb.style.display = 'flex';

    const items = [
      `<span class="breadcrumb-item" data-action="all">All</span>`
    ];

    for (let i = 0; i < this.currentPath.length; i++) {
      const part = this.currentPath[i];
      const depth = i + 1;
      items.push(`<span class="breadcrumb-separator"></span>`);
      items.push(`<span class="breadcrumb-item" data-depth="${depth}">${part}</span>`);
    }

    breadcrumb.innerHTML = items.join('');

    breadcrumb.querySelector('[data-action="all"]').addEventListener('click', () => {
      document.getElementById('year-filter').value = '';
      this.switchToFlatMode();
    });

    breadcrumb.querySelectorAll('[data-depth]').forEach(item => {
      item.addEventListener('click', () => {
        const depth = parseInt(item.dataset.depth);
        this.navigateBack(depth);
      });
    });
  }

  rebuildLayout() {
    if (this._vscroller) {
      this._vscroller.rebuild(this.filteredItems, this.getYearCounts(this.filteredItems));
    }
  }

  getStats() {
    let items;
    if (this.displayMode === 'hierarchical') {
      items = this.filteredItems.filter(item => {
        const parts = item.path.split('/');
        return this.currentPath.every((p, i) => parts[i] === p);
      });
    } else {
      items = this.filteredItems;
    }
    let images = 0, videos = 0;
    for (const item of items) {
      if (item.type === 'image') images++;
      else if (item.type === 'video') videos++;
    }
    return { total: items.length, images, videos };
  }

  updateYearIndex() {
    const yearIndex = document.getElementById('year-index');
    if (!yearIndex) return;

    if (this.displayMode !== 'flat') {
      yearIndex.style.display = 'none';
      return;
    }

    yearIndex.style.display = 'flex';

    const allYears = this.getYears(this.filteredItems);

    // Calculate how many years fit on screen, thin out if needed
    const availableHeight = window.innerHeight - 140 - 20 - 30;
    const maxItems = Math.floor(availableHeight / 25);

    let years = allYears;
    if (allYears.length > maxItems) {
      const step = Math.ceil(allYears.length / maxItems);
      years = allYears.filter((_, index) => index % step === 0);

      if (!years.includes(allYears[0])) {
        years.unshift(allYears[0]);
      }
      if (!years.includes(allYears[allYears.length - 1])) {
        years.push(allYears[allYears.length - 1]);
      }
    }

    yearIndex.innerHTML = years.map(year =>
      `<div class="year-index-item" data-year="${year}">${year}</div>`
    ).join('');

    yearIndex.querySelectorAll('.year-index-item').forEach(item => {
      item.addEventListener('click', () => {
        window.location.hash = item.dataset.year;
        this.scrollToYear(item.dataset.year);
      });
    });

    this.updateActiveYear();

    if (!this.resizeListenerAdded) {
      this.resizeListenerAdded = true;
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (this.displayMode === 'flat') {
            this.updateYearIndex();
          }
        }, 200);
      });
    }
  }

  updateActiveYear() {
    if (this.displayMode !== 'flat') return;

    const yearIndexItems = document.querySelectorAll('.year-index-item');

    const handleScroll = () => {
      const scrollPos = window.scrollY + 150;
      let activeYear = null;

      if (this._vscroller) {
        const yearTops = this._vscroller.getYearTops();
        for (const [year, top] of yearTops) {
          if (scrollPos >= top) activeYear = year;
        }
      } else {
        document.querySelectorAll('.year-divider[data-year]').forEach(divider => {
          if (scrollPos >= divider.offsetTop) activeYear = divider.dataset.year;
        });
      }

      yearIndexItems.forEach(item => {
        item.classList.toggle('active', item.dataset.year === activeYear);
      });
    };

    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener);
    }

    this.scrollListener = handleScroll;
    window.addEventListener('scroll', handleScroll);
    handleScroll();
  }
}
