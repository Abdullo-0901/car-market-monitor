// =========================================================
// STATE & DOM ELEMENTS
// =========================================================
let allCars = [];
let allStats = {};
let filterOptions = {};

const dom = {
  // Stats
  statTotalCars: document.getElementById('statTotalCars'),
  statAvgPrice: document.getElementById('statAvgPrice'),
  statWithPhone: document.getElementById('statWithPhone'),
  statSellersCount: document.getElementById('statSellersCount'),

  // Filters
  searchInput: document.getElementById('searchInput'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  sellerSelect: document.getElementById('sellerSelect'),
  brandSelect: document.getElementById('brandSelect'),
  minPriceInput: document.getElementById('minPriceInput'),
  maxPriceInput: document.getElementById('maxPriceInput'),
  phoneOnlyCheck: document.getElementById('phoneOnlyCheck'),
  sortSelect: document.getElementById('sortSelect'),
  btnResetFilters: document.getElementById('btnResetFilters'),
  btnEmptyReset: document.getElementById('btnEmptyReset'),

  // Containers
  resultsCount: document.getElementById('resultsCount'),
  carsGrid: document.getElementById('carsGrid'),
  emptyState: document.getElementById('emptyState'),
  activeFilterTags: document.getElementById('activeFilterTags'),

  // Actions
  btnRefresh: document.getElementById('btnRefresh'),
  btnDailyChecks: document.getElementById('btnDailyChecks'),

  // Modals
  detailModal: document.getElementById('detailModal'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
  modalContent: document.getElementById('modalContent'),

  dailyModal: document.getElementById('dailyModal'),
  dailyModalCloseBtn: document.getElementById('dailyModalCloseBtn'),
  dailyChecksTableWrapper: document.getElementById('dailyChecksTableWrapper'),
};

// =========================================================
// API CALLS
// =========================================================

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Stats fetch error');
    allStats = await res.json();
    updateStatsUI(allStats);
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

async function fetchFilterOptions() {
  try {
    const res = await fetch('/api/filters');
    if (!res.ok) throw new Error('Filters fetch error');
    filterOptions = await res.json();
    populateDropdowns(filterOptions);
  } catch (err) {
    console.error('Failed to fetch filters:', err);
  }
}

async function fetchCars() {
  const params = new URLSearchParams();

  const search = dom.searchInput.value.trim();
  if (search) params.append('search', search);

  const seller = dom.sellerSelect.value;
  if (seller) params.append('seller', seller);

  const brand = dom.brandSelect.value;
  if (brand) params.append('brand', brand);

  const minPrice = dom.minPriceInput.value.trim();
  if (minPrice) params.append('min_price', minPrice);

  const maxPrice = dom.maxPriceInput.value.trim();
  if (maxPrice) params.append('max_price', maxPrice);

  if (dom.phoneOnlyCheck.checked) {
    params.append('has_phone', 'true');
  }

  const sort = dom.sortSelect.value;
  if (sort) params.append('sort', sort);

  try {
    const res = await fetch(`/api/cars?${params.toString()}`);
    if (!res.ok) throw new Error('Cars fetch error');
    const data = await res.json();
    allCars = data.cars || [];
    renderCarsGrid(allCars);
    updateFilterTags();
  } catch (err) {
    console.error('Failed to fetch cars:', err);
  }
}

async function fetchDailyChecks() {
  try {
    const res = await fetch('/api/daily-checks');
    if (!res.ok) throw new Error('Daily checks fetch error');
    const data = await res.json();
    renderDailyChecksTable(data.checks || []);
    dom.dailyModal.style.display = 'flex';
  } catch (err) {
    console.error('Failed to fetch daily checks:', err);
  }
}

// =========================================================
// UI RENDERING
// =========================================================

function formatNumber(num) {
  if (num === null || num === undefined) return '--';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function updateStatsUI(stats) {
  dom.statTotalCars.textContent = formatNumber(stats.total_cars || 0);
  dom.statAvgPrice.textContent = stats.avg_price_tjs ? `${formatNumber(stats.avg_price_tjs)} c` : '--';
  dom.statWithPhone.textContent = formatNumber(stats.with_phone || 0);
  dom.statSellersCount.textContent = formatNumber(stats.sellers_count || 0);
}

function populateDropdowns(options) {
  // Sellers
  const currentSeller = dom.sellerSelect.value;
  dom.sellerSelect.innerHTML = '<option value="">All Sellers</option>';
  (options.sellers || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = `@${s}`;
    dom.sellerSelect.appendChild(opt);
  });
  dom.sellerSelect.value = currentSeller;

  // Brands
  const currentBrand = dom.brandSelect.value;
  dom.brandSelect.innerHTML = '<option value="">All Brands</option>';
  (options.brands || []).forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    dom.brandSelect.appendChild(opt);
  });
  dom.brandSelect.value = currentBrand;
}

function renderCarsGrid(cars) {
  dom.resultsCount.textContent = cars.length;

  if (cars.length === 0) {
    dom.carsGrid.innerHTML = '';
    dom.emptyState.style.display = 'block';
    return;
  }

  dom.emptyState.style.display = 'none';

  const cardsHtml = cars.map(car => {
    const title = `${car.brand || 'Vehicle'} ${car.model || ''} ${car.year ? `(${car.year})` : ''}`.trim();
    
    // Robust Image URL Resolution
    let imageSrc = '';
    if (car.image_path) {
      imageSrc = car.image_path.startsWith('/') ? car.image_path : `/${car.image_path}`;
    } else if (car.image_url) {
      imageSrc = car.image_url;
    }

    let imageElement = '';
    if (imageSrc) {
      imageElement = `<img src="${imageSrc}" alt="${title}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'image-fallback\\'>🚗<span>No Image</span></div>';">`;
    } else {
      imageElement = `<div class="image-fallback">🚗<span>No Image Available</span></div>`;
    }

    // Source Badge
    const isPost = car.source_type === 'POST_CAPTION';
    const sourceBadge = isPost 
      ? `<span class="source-badge">🔗 Post Caption</span>`
      : `<span class="source-badge">📸 Story OCR</span>`;

    // Specs pills
    const pills = [];
    if (car.year) pills.push(`<span class="spec-pill">📅 ${car.year}${car.month ? `.${car.month < 10 ? '0' + car.month : car.month}` : ''}</span>`);
    if (car.mileage) pills.push(`<span class="spec-pill">🐎 ${formatNumber(car.mileage)} km</span>`);
    if (car.engine) pills.push(`<span class="spec-pill">🔋 ${car.engine}L</span>`);
    if (car.transmission) pills.push(`<span class="spec-pill">⚙️ ${car.transmission}</span>`);
    if (car.fuel) pills.push(`<span class="spec-pill">⛽ ${car.fuel}</span>`);
    if (car.production) pills.push(`<span class="spec-pill">🏁 ${car.production}</span>`);

    // Prices
    let priceHtml = '';
    if (car.price_tjs) {
      priceHtml += `<span class="price-tjs">${formatNumber(car.price_tjs)} <small>TJS</small></span>`;
    }
    if (car.price_usd) {
      priceHtml += `<span class="price-usd">$${formatNumber(car.price_usd)} USD</span>`;
    }
    if (!priceHtml) {
      priceHtml = `<span class="price-usd">Price Negotiable</span>`;
    }

    // Phone / WhatsApp
    let phoneClean = '';
    if (car.phone_number) {
      phoneClean = car.phone_number.replace(/[^\d]/g, '');
    }

    return `
      <div class="car-card" data-id="${car.id}">
        <div class="car-image-box">
          ${imageElement}
          ${sourceBadge}
          <span class="seller-badge">@${car.seller_username}</span>
        </div>

        <div class="car-card-body">
          <div class="car-header">
            <h3 class="car-title">${title}</h3>
          </div>

          <div class="car-price-group">
            ${priceHtml}
          </div>

          ${car.phone_number ? `
            <div class="phone-badge">
              <span>📞 ${car.phone_number}</span>
            </div>
          ` : ''}

          <div class="specs-pills">
            ${pills.join('')}
          </div>

          <div class="car-card-actions">
            ${car.phone_number ? `
              <a href="tel:${car.phone_number.replace(/\s+/g, '')}" class="btn btn-call btn-sm" title="Call Seller">
                <span>📞 Call</span>
              </a>
              <a href="https://wa.me/${phoneClean}" target="_blank" class="btn btn-whatsapp btn-sm" title="Chat on WhatsApp">
                <span>💬 WhatsApp</span>
              </a>
            ` : ''}
            
            ${car.source_url ? `
              <a href="${car.source_url}" target="_blank" rel="noopener noreferrer" class="btn btn-ig btn-sm" title="View on Instagram">
                <span>🔗 Post</span>
              </a>
            ` : ''}

            <button class="btn btn-secondary btn-sm btn-details" onclick="openDetailModal(${car.id})">
              <span>ℹ️ Details</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  dom.carsGrid.innerHTML = cardsHtml;
}

function updateFilterTags() {
  const tags = [];
  const search = dom.searchInput.value.trim();
  const seller = dom.sellerSelect.value;
  const brand = dom.brandSelect.value;
  const minPrice = dom.minPriceInput.value;
  const maxPrice = dom.maxPriceInput.value;
  const phoneOnly = dom.phoneOnlyCheck.checked;

  if (search) tags.push(`Search: "${search}"`);
  if (seller) tags.push(`Seller: @${seller}`);
  if (brand) tags.push(`Make: ${brand}`);
  if (minPrice) tags.push(`Min: ${formatNumber(minPrice)} TJS`);
  if (maxPrice) tags.push(`Max: ${formatNumber(maxPrice)} TJS`);
  if (phoneOnly) tags.push(`Phone Only 📞`);

  dom.activeFilterTags.innerHTML = tags.map(t => `<span class="filter-tag">${t}</span>`).join('');
}

// =========================================================
// MODALS
// =========================================================

window.openDetailModal = function(carId) {
  const car = allCars.find(c => c.id === carId);
  if (!car) return;

  const title = `${car.brand || 'Vehicle'} ${car.model || ''} ${car.year ? `(${car.year})` : ''}`.trim();
  
  let imageSrc = '';
  if (car.image_path) {
    imageSrc = car.image_path.startsWith('/') ? car.image_path : `/${car.image_path}`;
  } else if (car.image_url) {
    imageSrc = car.image_url;
  }

  let imageHtml = '';
  if (imageSrc) {
    imageHtml = `<img src="${imageSrc}" style="width:100%; max-height:350px; object-fit:cover; border-radius:12px; margin-bottom:1rem;" onerror="this.style.display='none'">`;
  }

  dom.modalContent.innerHTML = `
    ${imageHtml}
    <h2 style="font-size:1.5rem; margin-bottom:0.5rem; color:#fff;">${title}</h2>
    <div style="display:flex; gap:0.5rem; margin-bottom:1rem; flex-wrap:wrap;">
      <span class="seller-badge" style="position:static;">@${car.seller_username}</span>
      <span class="source-badge" style="position:static;">${car.source_type}</span>
      <span class="spec-pill" style="color:#94a3b8;">📅 ${car.created_at || 'Recently'}</span>
    </div>

    <div style="display:flex; gap:1.5rem; margin-bottom:1.5rem; align-items:baseline;">
      ${car.price_tjs ? `<span class="price-tjs" style="font-size:1.6rem;">${formatNumber(car.price_tjs)} TJS</span>` : ''}
      ${car.price_usd ? `<span class="price-usd" style="font-size:1.1rem;">$${formatNumber(car.price_usd)} USD</span>` : ''}
    </div>

    ${car.phone_number ? `
      <div style="margin-bottom:1.25rem;">
        <strong style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase;">Contact Phone:</strong>
        <div style="margin-top:0.25rem; font-size:1.1rem; color:#fbbf24; font-weight:700;">${car.phone_number}</div>
      </div>
    ` : ''}

    <div style="margin-bottom:1.25rem;">
      <strong style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase;">Vehicle Specifications:</strong>
      <div class="specs-pills" style="margin-top:0.5rem;">
        ${car.year ? `<span class="spec-pill">Year: ${car.year}${car.month ? '.' + car.month : ''}</span>` : ''}
        ${car.mileage ? `<span class="spec-pill">Mileage: ${formatNumber(car.mileage)} km</span>` : ''}
        ${car.engine ? `<span class="spec-pill">Engine: ${car.engine} L</span>` : ''}
        ${car.transmission ? `<span class="spec-pill">Transmission: ${car.transmission}</span>` : ''}
        ${car.fuel ? `<span class="spec-pill">Fuel: ${car.fuel}</span>` : ''}
        ${car.condition ? `<span class="spec-pill">Condition: ${car.condition}</span>` : ''}
        ${car.production ? `<span class="spec-pill">Origin: ${car.production}</span>` : ''}
      </div>
    </div>

    <div style="margin-bottom:1rem;">
      <strong style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase;">Original Instagram Post / OCR Text:</strong>
      <div class="raw-text-box">${car.raw_text || '(No text stored)'}</div>
    </div>

    ${car.source_url ? `
      <div style="margin-top:1.5rem; text-align:right;">
        <a href="${car.source_url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
          <span>Open on Instagram ↗</span>
        </a>
      </div>
    ` : ''}
  `;

  dom.detailModal.style.display = 'flex';
};

function renderDailyChecksTable(checks) {
  if (checks.length === 0) {
    dom.dailyChecksTableWrapper.innerHTML = `<p style="padding:2rem; text-align:center; color:var(--text-muted);">No check logs recorded yet for today.</p>`;
    return;
  }

  let rows = checks.map(c => `
    <tr>
      <td><strong>@${c.seller_username}</strong></td>
      <td>${c.check_date}</td>
      <td>${c.stories_count} stories</td>
      <td><span style="color:#34d399; font-weight:700;">+${c.cars_found} cars</span></td>
      <td style="color:var(--text-dim); font-size:0.8rem;">${c.last_checked_at}</td>
    </tr>
  `).join('');

  dom.dailyChecksTableWrapper.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Seller</th>
          <th>Date</th>
          <th>Stories Checked</th>
          <th>Cars Found</th>
          <th>Last Inspected</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// =========================================================
// EVENT LISTENERS
// =========================================================

let searchTimeout = null;
dom.searchInput.addEventListener('input', () => {
  dom.btnClearSearch.style.display = dom.searchInput.value ? 'block' : 'none';
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    fetchCars();
  }, 300);
});

dom.btnClearSearch.addEventListener('click', () => {
  dom.searchInput.value = '';
  dom.btnClearSearch.style.display = 'none';
  fetchCars();
});

dom.sellerSelect.addEventListener('change', fetchCars);
dom.brandSelect.addEventListener('change', fetchCars);
dom.sortSelect.addEventListener('change', fetchCars);
dom.phoneOnlyCheck.addEventListener('change', fetchCars);

dom.minPriceInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(fetchCars, 400);
});

dom.maxPriceInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(fetchCars, 400);
});

function resetFilters() {
  dom.searchInput.value = '';
  dom.btnClearSearch.style.display = 'none';
  dom.sellerSelect.value = '';
  dom.brandSelect.value = '';
  dom.minPriceInput.value = '';
  dom.maxPriceInput.value = '';
  dom.phoneOnlyCheck.checked = false;
  dom.sortSelect.value = 'newest';
  fetchCars();
}

dom.btnResetFilters.addEventListener('click', resetFilters);
dom.btnEmptyReset.addEventListener('click', resetFilters);

dom.btnRefresh.addEventListener('click', () => {
  fetchStats();
  fetchFilterOptions();
  fetchCars();
});

dom.btnDailyChecks.addEventListener('click', fetchDailyChecks);

// Modal closes
dom.modalCloseBtn.addEventListener('click', () => dom.detailModal.style.display = 'none');
dom.detailModal.addEventListener('click', (e) => {
  if (e.target === dom.detailModal) dom.detailModal.style.display = 'none';
});

dom.dailyModalCloseBtn.addEventListener('click', () => dom.dailyModal.style.display = 'none');
dom.dailyModal.addEventListener('click', (e) => {
  if (e.target === dom.dailyModal) dom.dailyModal.style.display = 'none';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    dom.detailModal.style.display = 'none';
    dom.dailyModal.style.display = 'none';
  }
});

// =========================================================
// INIT
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  fetchStats();
  fetchFilterOptions();
  fetchCars();
});
