class Gallery {
  constructor(container) {
    this.container = container;
    this.mediaItems = [];
    this.filteredItems = [];
    this.selectedYear = '';
    this.searchQuery = '';
    this.sortOrder = 'desc'; // Default: newest first
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
        yearDivider = `<div class="year-divider">${item.year}</div>`;
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
  }

  /**
   * Attach click handlers to grid items
   */
  attachClickHandlers() {
    const items = this.container.querySelectorAll('.grid-item');
    items.forEach(item => {
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
    this.applyFilters();
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
}
