class VirtualScroller {
  constructor(container, gallery) {
    this.container = container;
    this.gallery = gallery;
    this.rows = [];
    this.tops = [];
    this.totalHeight = 0;
    this.cols = 1;
    this.itemSize = 190;
    this.gap = 4;
    this.dividerHeight = 63;
    this.BUFFER_ROWS = 5;
    this.renderedRange = { start: -1, end: -1 };
    this._domPool = new Map();
    this._thumbTimer = null;
    this._gridTemplate = '';

    this._onScroll = this._onScroll.bind(this);
    this._onResize = this._onResize.bind(this);
    this._resizeTimer = null;
    this._rafPending = false;
    this._yearTopsCache = new Map();

    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  rebuild(filteredItems, yearCounts) {
    this._measureGrid();
    if (!this._dividerMeasured) {
      this._measureDividerHeight();
      this._dividerMeasured = true;
    }
    this.rows = this._buildRows(filteredItems, yearCounts);
    this._calcTops();
    this.container.classList.add('vscroll-active');
    this.container.style.height = this.totalHeight + 'px';
    this.renderedRange = { start: -1, end: -1 };
    this._clearDOM();
    this._buildYearTopsCache();
    this._render();
  }

  _measureGrid() {
    // Temporarily restore grid display to measure columns
    this.container.classList.remove('vscroll-active');
    this.container.style.height = '';

    // Insert a dummy item to force grid track computation
    const dummy = document.createElement('div');
    dummy.className = 'grid-item';
    dummy.style.visibility = 'hidden';
    this.container.appendChild(dummy);

    const style = getComputedStyle(this.container);
    const tracks = style.gridTemplateColumns.trim().split(/\s+/);
    this.cols = Math.max(1, tracks.length);
    this.itemSize = parseFloat(tracks[0]) || 190;
    this.gap = parseFloat(style.gap) || parseFloat(style.rowGap) || 4;
    this._gridTemplate = style.gridTemplateColumns;
    this._containerPadding = parseFloat(style.paddingLeft) || 20;

    dummy.remove();
  }

  _measureDividerHeight() {
    const dummy = document.createElement('div');
    dummy.className = 'year-divider';
    dummy.style.visibility = 'hidden';
    dummy.style.position = 'absolute';
    dummy.innerHTML = '2024 <span class="year-count">(0件)</span>';
    document.body.appendChild(dummy);
    const h = dummy.offsetHeight + parseFloat(getComputedStyle(dummy).marginBottom || '0');
    dummy.remove();
    this.dividerHeight = h || 63;
  }

  _buildRows(filteredItems, yearCounts) {
    const rows = [];
    let currentYear = null;
    let rowBuf = [];

    const flushBuf = () => {
      for (let i = 0; i < rowBuf.length; i += this.cols) {
        rows.push({ type: 'items', items: rowBuf.slice(i, i + this.cols) });
      }
      rowBuf = [];
    };

    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      if (item.year !== currentYear) {
        flushBuf();
        currentYear = item.year;
        rows.push({ type: 'divider', year: item.year, count: yearCounts[item.year] || 0 });
      }
      rowBuf.push({ item, filteredIndex: i });
    }
    flushBuf();
    return rows;
  }

  _calcTops() {
    this.tops = [];
    let y = this._containerPadding; // top padding
    for (const row of this.rows) {
      this.tops.push(y);
      if (row.type === 'divider') {
        y += this.dividerHeight;
      } else {
        y += this.itemSize + this.gap;
      }
    }
    this.totalHeight = y + this._containerPadding; // bottom padding
  }

  _getVisibleRange() {
    const scrollTop = window.scrollY;
    const containerRect = this.container.getBoundingClientRect();
    const containerTop = containerRect.top + scrollTop;
    const viewTop = Math.max(0, scrollTop - containerTop);
    const viewBottom = viewTop + window.innerHeight;

    const startRow = Math.max(0, this._binarySearch(viewTop) - this.BUFFER_ROWS);
    const endRow = Math.min(this.rows.length - 1, this._binarySearch(viewBottom) + this.BUFFER_ROWS);
    return { start: startRow, end: endRow };
  }

  _binarySearch(targetY) {
    let lo = 0, hi = this.tops.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.tops[mid] <= targetY) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return Math.max(0, hi);
  }

  _render() {
    const { start, end } = this._getVisibleRange();

    if (start === this.renderedRange.start && end === this.renderedRange.end) return;

    for (const [idx, el] of this._domPool) {
      if (idx < start || idx > end) {
        el.remove();
        this._domPool.delete(idx);
      }
    }

    const fragment = document.createDocumentFragment();
    for (let i = start; i <= end; i++) {
      if (this._domPool.has(i)) continue;
      const el = this._createRowElement(i);
      this._domPool.set(i, el);
      fragment.appendChild(el);
    }
    this.container.appendChild(fragment);

    this.renderedRange = { start, end };
    this._scheduleThumbnailLoad();
  }

  _createRowElement(rowIndex) {
    const row = this.rows[rowIndex];
    const top = this.tops[rowIndex];

    const el = document.createElement('div');
    this._positionRow(el, top);

    if (row.type === 'divider') {
      el.className = 'year-divider vscroll-row';
      el.dataset.year = row.year;
      el.innerHTML = `${row.year} <span class="year-count">(${row.count}件)</span>`;
      return el;
    }

    el.className = 'vscroll-row';
    el.style.display = 'grid';
    el.style.gridTemplateColumns = this._gridTemplate;
    el.style.gap = this.gap + 'px';

    const html = row.items.map(({ item, filteredIndex }) =>
      this.gallery.renderMediaCard(item, filteredIndex)
    ).join('');

    el.innerHTML = html;

    el.querySelectorAll('.grid-item').forEach(gridItem => {
      gridItem.addEventListener('click', () => {
        const index = parseInt(gridItem.dataset.index);
        document.dispatchEvent(new CustomEvent('itemClick', { detail: { index } }));
      });
    });

    return el;
  }

  _positionRow(el, top) {
    el.style.position = 'absolute';
    el.style.top = top + 'px';
    el.style.left = this._containerPadding + 'px';
    el.style.right = this._containerPadding + 'px';
  }

  _scheduleThumbnailLoad() {
    if (this._thumbTimer) clearTimeout(this._thumbTimer);
    this._thumbTimer = setTimeout(() => {
      this.gallery.loadTauriThumbnails();
    }, 100);
  }

  _clearDOM() {
    this._domPool.clear();
    this.container.innerHTML = '';
  }

  _onScroll() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._render();
    });
  }

  _onResize() {
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => {
      const prevCols = this.cols;
      const prevItemSize = this.itemSize;
      this._measureGrid();
      if (this.cols !== prevCols || Math.abs(this.itemSize - prevItemSize) > 1) {
        this.rebuild(this.gallery.filteredItems, this.gallery.getYearCounts(this.gallery.filteredItems));
      } else {
        this._calcTops();
        this.container.classList.add('vscroll-active');
        this.container.style.height = this.totalHeight + 'px';
        this.renderedRange = { start: -1, end: -1 };
        this._render();
      }
    }, 200);
  }

  _buildYearTopsCache() {
    const containerTop = this.container.getBoundingClientRect().top + window.scrollY;
    this._yearTopsCache = new Map();
    for (let i = 0; i < this.rows.length; i++) {
      if (this.rows[i].type === 'divider') {
        this._yearTopsCache.set(this.rows[i].year, containerTop + this.tops[i]);
      }
    }
  }

  getYearTop(year) {
    return this._yearTopsCache.get(year) ?? null;
  }

  getYearTops() {
    return this._yearTopsCache;
  }

  destroy() {
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    if (this._thumbTimer) clearTimeout(this._thumbTimer);
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
    this._clearDOM();
    this.container.classList.remove('vscroll-active');
    this.container.style.height = '';
  }
}
