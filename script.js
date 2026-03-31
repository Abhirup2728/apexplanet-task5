/* script.js — Shoply (single-file for demo; in production split into modules) */
const Shoply = (function () {
  const API = 'https://fakestoreapi.com/products';
  const LS_CART = 'shoply_cart_v1';
  const LS_THEME = 'shoply_theme_v1';
  let products = [];
  let cart = {};
  let categories = [];
  let inited = false;

  /* Utility: fetch with timeout + error handling */
  async function fetchWithTimeout(url, ms = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) throw new Error('Network response not ok');
      return await res.json();
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  /* LocalStorage helpers */
  function loadCart() {
    try {
      const raw = localStorage.getItem(LS_CART);
      cart = raw ? JSON.parse(raw) : {};
    } catch {
      cart = {};
    }
  }
  function saveCart() {
    try { localStorage.setItem(LS_CART, JSON.stringify(cart)); } catch {}
    updateCartCountUI();
  }

  /* Theme */
  function applyTheme() {
    const t = localStorage.getItem(LS_THEME) || 'light';
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    localStorage.setItem(LS_THEME, isDark ? 'light' : 'dark');
    applyTheme();
  }

  /* Toast */
  let toastTimer = null;
  function showToast(msg, ms = 2200) {
    const el = document.getElementById('toast') || document.getElementById('toast2') || document.getElementById('toast3');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  /* Cart operations */
  function addToCart(productId, qty = 1) {
    cart[productId] = (cart[productId] || 0) + qty;
    saveCart();
    showToast('Added to cart');
  }
  function removeFromCart(productId) {
    delete cart[productId];
    saveCart();
    showToast('Removed from cart');
  }
  function updateQuantity(productId, qty) {
    if (qty <= 0) removeFromCart(productId);
    else cart[productId] = qty;
    saveCart();
  }
  function cartCount() {
    return Object.values(cart).reduce((s, n) => s + n, 0);
  }
  function updateCartCountUI() {
    const els = document.querySelectorAll('#cartCount, #cartCount2');
    els.forEach(e => e.textContent = cartCount());
  }

  /* Rendering helpers */
  function createProductCard(p) {
    const div = document.createElement('article');
    div.className = 'card';
    div.innerHTML = `
      <img loading="lazy" decoding="async" src="${p.image}" alt="${escapeHtml(p.title)}" />
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(truncate(p.title, 60))}</h3>
        <div class="small">${escapeHtml(p.category)}</div>
        <div class="card-meta">
          <div>
            <div class="price">₹${(p.price*80).toFixed(0)}</div>
            <div class="small">⭐ ${p.rating?.rate ?? '—'} (${p.rating?.count ?? 0})</div>
          </div>
          <div>
            <button class="btn btn-add" data-id="${p.id}">Add</button>
          </div>
        </div>
      </div>
    `;
    return div;
  }

  function renderGrid(selector, list) {
    const container = document.querySelector(selector);
    if (!container) return;
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    list.forEach(p => frag.appendChild(createProductCard(p)));
    container.appendChild(frag);
  }

  /* Featured: pick top-rated */
  function renderFeatured(selector, count = 4) {
    const top = [...products].sort((a,b)=> (b.rating?.rate||0)-(a.rating?.rate||0)).slice(0,count);
    renderGrid(selector, top);
  }

  /* Products page mount */
  function mountProductsPage(opts) {
    const grid = document.querySelector(opts.productsGrid);
    const searchInput = document.querySelector(opts.searchInput);
    const categoryFilter = document.querySelector(opts.categoryFilter);
    const sortSelect = document.querySelector(opts.sortSelect);
    const priceRange = document.querySelector(opts.priceRange);
    const priceValue = document.querySelector(opts.priceValue);

    // populate categories
    categories.forEach(cat => {
      const o = document.createElement('option'); o.value = cat; o.textContent = cat;
      categoryFilter.appendChild(o);
    });

    // set price range max from products
    const maxPrice = Math.ceil(Math.max(...products.map(p=>p.price))*80);
    priceRange.max = maxPrice;
    priceRange.value = maxPrice;
    priceValue.textContent = `₹${maxPrice}`;

    // filtering logic
    function getFiltered() {
      const q = (searchInput.value || '').trim().toLowerCase();
      const cat = categoryFilter.value;
      const maxP = Number(priceRange.value);
      let list = products.filter(p => (p.price*80) <= maxP);
      if (cat) list = list.filter(p => p.category === cat);
      if (q) list = list.filter(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
      // sorting
      const sort = sortSelect.value;
      if (sort === 'price-asc') list.sort((a,b)=> (a.price-b.price));
      else if (sort === 'price-desc') list.sort((a,b)=> (b.price-a.price));
      else if (sort === 'rating-desc') list.sort((a,b)=> (b.rating?.rate||0)-(a.rating?.rate||0));
      return list;
    }

    // debounce search
    const debouncedRender = debounce(() => {
      const list = getFiltered();
      renderGrid(opts.productsGrid, list);
    }, 250);

    // initial render
    renderGrid(opts.productsGrid, products);

    // events
    searchInput.addEventListener('input', debouncedRender);
    categoryFilter.addEventListener('change', debouncedRender);
    sortSelect.addEventListener('change', debouncedRender);
    priceRange.addEventListener('input', () => {
      priceValue.textContent = `₹${priceRange.value}`;
      debouncedRender();
    });

    // delegate add-to-cart
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-add');
      if (!btn) return;
      const id = btn.dataset.id;
      addToCart(id, 1);
    });

    // back-to-top
    const backTop = document.getElementById('backTop');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) backTop.style.display = 'block';
      else backTop.style.display = 'none';
    });
    backTop.addEventListener('click', () => window.scrollTo({top:0,behavior:'smooth'}));
  }

  /* Cart page mount */
  function mountCartPage(listSelector, summarySelector) {
    const listEl = document.querySelector(listSelector);
    const summaryEl = document.querySelector(summarySelector);

    function renderCart() {
      listEl.innerHTML = '';
      const frag = document.createDocumentFragment();
      const items = Object.keys(cart).map(id => {
        const p = products.find(x => String(x.id) === String(id));
        return { product: p, qty: cart[id] };
      });
      if (items.length === 0) {
        listEl.innerHTML = '<p>Your cart is empty. <a href="products.html">Shop now</a></p>';
        summaryEl.innerHTML = '';
        return;
      }
      items.forEach(({product, qty}) => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
          <img loading="lazy" src="${product.image}" alt="${escapeHtml(product.title)}" />
          <div style="flex:1">
            <h4 style="margin:0 0 0.25rem">${escapeHtml(truncate(product.title,60))}</h4>
            <div class="small">₹${(product.price*80).toFixed(0)} × ${qty}</div>
            <div class="qty" data-id="${product.id}">
              <button class="qty-dec">-</button>
              <input class="qty-input" type="number" min="1" value="${qty}" style="width:56px;padding:0.25rem;border-radius:6px;border:1px solid #ddd" />
              <button class="qty-inc">+</button>
              <button class="btn-ghost btn-remove" style="margin-left:8px">Remove</button>
            </div>
          </div>
        `;
        frag.appendChild(div);
      });
      listEl.appendChild(frag);

      // summary
      const subtotal = items.reduce((s,{product,qty}) => s + product.price*80*qty, 0);
      const shipping = subtotal > 2000 ? 0 : 99;
      const total = subtotal + shipping;
      summaryEl.innerHTML = `
        <div class="card" style="padding:1rem">
          <h3>Order Summary</h3>
          <p class="small">Subtotal: ₹${subtotal.toFixed(0)}</p>
          <p class="small">Shipping: ₹${shipping}</p>
          <p style="font-weight:700">Total: ₹${total.toFixed(0)}</p>
          <button id="checkoutBtn" class="btn" style="width:100%;margin-top:0.5rem">Checkout</button>
        </div>
      `;
    }

    // events
    listEl.addEventListener('click', (e) => {
      const dec = e.target.closest('.qty-dec');
      const inc = e.target.closest('.qty-inc');
      const rem = e.target.closest('.btn-remove');
      if (dec || inc || rem) {
        const parent = e.target.closest('.qty');
        const id = parent.dataset.id;
        const input = parent.querySelector('.qty-input');
        let val = Number(input.value) || 1;
        if (dec) val = Math.max(1, val - 1);
        if (inc) val = val + 1;
        if (rem) { removeFromCart(id); renderCart(); return; }
        input.value = val;
        updateQuantity(id, val);
        renderCart();
      }
    });

    // input change
    listEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('qty-input')) {
        const parent = e.target.closest('.qty');
        const id = parent.dataset.id;
        const val = Math.max(1, Number(e.target.value) || 1);
        updateQuantity(id, val);
        renderCart();
      }
    });

    // checkout stub
    summaryEl.addEventListener('click', (e) => {
      if (e.target.id === 'checkoutBtn') {
        showToast('Checkout is a demo. Integrate payment gateway for production.');
      }
    });

    renderCart();
  }

  /* Initialization: fetch products, categories, setup UI */
  async function init() {
    if (inited) return;
    loadCart();
    applyTheme();
    updateCartCountUI();

    // nav toggles and theme toggles
    document.querySelectorAll('.nav-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const ul = btn.nextElementSibling;
        ul.classList.toggle('show');
      });
    });
    document.querySelectorAll('#themeToggle, #themeToggle2').forEach(btn => {
      btn.addEventListener('click', () => { toggleTheme(); showToast('Theme updated'); });
    });

    // fetch products with skeleton fallback
    try {
      products = await fetchWithTimeout(API);
      // normalize categories
      categories = Array.from(new Set(products.map(p => p.category)));
    } catch (err) {
      console.warn('Fetch failed, using fallback data', err);
      products = [
        {
          id: 101,
          title: 'Fallback Shirt',
          price: 19.99,
          category: 'clothing',
          image: 'fallback.jpg',
          rating: { rate: 4.2, count: 12 },
          description: 'Fallback item'
        }
      ];
      categories = ['clothing'];
      showToast('Network error: showing limited products');
    }

    // event delegation for add-to-cart on whole document (works across pages)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-add');
      if (!btn) return;
      addToCart(btn.dataset.id, 1);
    });

    // update cart count UI
    updateCartCountUI();

    inited = true;
  }

  /* Helpers */
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function truncate(s, n){ return s.length>n ? s.slice(0,n-1)+'…' : s; }
  function debounce(fn, wait=200){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }

  /* Public API */
  return {
    init,
    renderFeatured,
    mountProductsPage,
    mountCartPage,
    addToCart,
    removeFromCart,
    updateQuantity
  };
})();
