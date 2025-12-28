class Gallery {
  constructor(container) {
    this.container = container;
    this.mediaItems = [];
    this.filteredItems = [];
    this.selectedYear = '';
    this.searchQuery = '';
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
      this.container.innerHTML = '<div class="loading">メディアが見つかりません</div>';
      return;
    }

    const html = this.filteredItems.map((item, index) => {
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

    this.render();
  }

  /**
   * Get all unique years
   */
  getYears() {
    const years = new Set(this.mediaItems.map(item => item.year));
    return Array.from(years).sort();
  }

  /**
   * Get item by index in filtered items
   */
  getItem(index) {
    return this.filteredItems[index];
  }
}
