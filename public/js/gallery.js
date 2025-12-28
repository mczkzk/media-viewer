class Gallery {
  constructor(container) {
    this.container = container;
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
      const response = await fetch('/api/media');
      if (!response.ok) {
        throw new Error('Failed to fetch media data');
      }

      this.mediaItems = await response.json();
      this.sortItems();
      this.filteredItems = this.mediaItems;
      this.render();
    } catch (error) {
      console.error('Error loading media:', error);
      throw error;
    }
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

    let currentYear = null;
    const html = this.filteredItems.map((item, index) => {
      const videoClass = item.type === 'video' ? 'video' : '';

      // Add year divider when year changes
      let yearDivider = '';
      if (item.year !== currentYear) {
        currentYear = item.year;
        yearDivider = `<div class="year-divider" data-year="${item.year}">${item.year}</div>`;
      }

      return yearDivider + `
        <div class="grid-item ${videoClass} loading" data-index="${index}">
          <img src="/api/thumbnail?path=${encodeURIComponent(item.path)}"
               alt="${item.filename}"
               loading="lazy"
               onload="this.parentElement.classList.remove('loading')"
               onerror="this.parentElement.classList.add('error')">
          <div class="caption">${item.event}</div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = html;
    this.attachClickHandlers();
    this.updateYearIndex();
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
    return `
      <div class="grid-item ${videoClass} loading" data-index="${index}">
        <img src="/api/thumbnail?path=${encodeURIComponent(item.path)}"
             alt="${item.filename}"
             loading="lazy"
             onload="this.parentElement.classList.remove('loading')"
             onerror="this.parentElement.classList.add('error')">
        <div class="caption">${item.event}</div>
      </div>
    `;
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
  }

  /**
   * Apply all filters
   */
  applyFilters() {
    this.filteredItems = this.mediaItems.filter(item => {
      const matchesYear = !this.selectedYear || item.year === this.selectedYear;
      const matchesSearch = !this.searchQuery ||
        item.event.toLowerCase().includes(this.searchQuery) ||
        item.filename.toLowerCase().includes(this.searchQuery);
      return matchesYear && matchesSearch;
    });

    this.sortFilteredItems();
    this.render();
  }

  /**
   * Sort items by year, event, and filename
   */
  sortItems() {
    this.mediaItems.sort((a, b) => {
      // Primary sort: by year
      const yearCompare = this.sortOrder === 'desc'
        ? b.year.localeCompare(a.year)
        : a.year.localeCompare(b.year);

      if (yearCompare !== 0) return yearCompare;

      // Secondary sort: by event name
      const eventCompare = this.sortOrder === 'desc'
        ? b.event.localeCompare(a.event)
        : a.event.localeCompare(b.event);

      if (eventCompare !== 0) return eventCompare;

      // Tertiary sort: by filename
      return this.sortOrder === 'desc'
        ? b.filename.localeCompare(a.filename)
        : a.filename.localeCompare(b.filename);
    });
  }

  /**
   * Sort filtered items
   */
  sortFilteredItems() {
    this.filteredItems.sort((a, b) => {
      // Primary sort: by year
      const yearCompare = this.sortOrder === 'desc'
        ? b.year.localeCompare(a.year)
        : a.year.localeCompare(b.year);

      if (yearCompare !== 0) return yearCompare;

      // Secondary sort: by event name
      const eventCompare = this.sortOrder === 'desc'
        ? b.event.localeCompare(a.event)
        : a.event.localeCompare(b.event);

      if (eventCompare !== 0) return eventCompare;

      // Tertiary sort: by filename
      return this.sortOrder === 'desc'
        ? b.filename.localeCompare(a.filename)
        : a.filename.localeCompare(b.filename);
    });
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
   * Get all unique years
   */
  getYears() {
    const years = new Set(this.mediaItems.map(item => item.year));
    return Array.from(years).sort((a, b) => b.localeCompare(a)); // Descending order
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
        const yearDivider = document.querySelector(`.year-divider[data-year="${year}"]`);
        if (yearDivider) {
          yearDivider.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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
