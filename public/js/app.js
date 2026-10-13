const app = document.querySelector('#app');
const cartCount = document.querySelector('#cart-count');
const toast = document.querySelector('#toast');
const money = (value) => `NZ$${Number(value).toFixed(2)}`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || 'Something went wrong.');
  return data;
}
function showToast(message) { toast.textContent = message; toast.classList.add('visible'); setTimeout(() => toast.classList.remove('visible'), 2600); }
function reportError(error) { app.innerHTML = `<div class="notice"><h1>We could not load this page</h1><p>${escapeHtml(error.message)}</p><a class="button" href="/">Return to products</a></div>`; }
function productCard(product, compare = false) {
  return `<article class="card">
    <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} product image" loading="lazy" onerror="this.onerror=null;this.src='/images/product-placeholder.svg'">
    <div class="card-body"><span class="badge ${product.availability === 'Low stock' ? 'low' : ''}">${escapeHtml(product.availability)}</span>
    <h3><a href="/products/${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a></h3><p class="muted">${escapeHtml(product.brand)} &middot; ${escapeHtml(product.category)}</p>
    <p class="price">${money(product.price)}</p><p>${escapeHtml(product.description)}</p>
    <div class="card-actions"><a class="button secondary" href="/products/${encodeURIComponent(product.id)}">View details</a>
    <button data-add="${escapeHtml(product.id)}">Add to cart</button></div></div></article>`;
}
async function refreshCartCount() { const cart = await request('/api/cart'); cartCount.textContent = cart.itemCount; cartCount.setAttribute('aria-label', `${cart.itemCount} items in cart`); }
async function addToCart(id, quantity = 1) { try { await request('/api/cart', { method: 'POST', body: JSON.stringify({ productId: id, quantity }) }); await refreshCartCount(); showToast('Product added to cart.'); } catch (error) { showToast(error.message); } }
function bindAddButtons() { document.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => addToCart(button.dataset.add))); }

async function renderHome() {
  app.innerHTML = `<section class="hero"><p class="eyebrow">Thoughtful technology</p><h1>Find the right tools for your setup.</h1><p class="muted">Browse dependable electronics with clear specifications and straightforward pricing.</p></section>
  <form id="filters" class="filters" aria-label="Filter products">
    <label>Search products<input name="search" type="search" placeholder="Name, brand, category..." autocomplete="off"></label>
    <label>Category<select name="category"><option value="">All categories</option></select></label>
    <label>Min price<input name="minPrice" type="number" min="0" step="1" placeholder="NZ$0"></label>
    <label>Max price<input name="maxPrice" type="number" min="0" step="1" placeholder="No limit"></label>
    <label>Sort by<select name="sort"><option value="name">Name</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="availability">Availability</option></select></label>
    <div class="filter-actions"><button type="submit">Apply</button><button type="reset" class="secondary">Clear</button></div>
  </form><div id="results-status" class="muted" aria-live="polite"></div><section id="product-grid" class="product-grid" aria-label="Product catalogue"></section>`;
  const form = document.querySelector('#filters');
  const categorySelect = form.category;
  (await request('/api/categories')).forEach((category) => { categorySelect.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`); });
  async function loadProducts() {
    const params = new URLSearchParams(new FormData(form));
    const data = await request(`/api/products?${params}`);
    document.querySelector('#results-status').textContent = `${data.total} product${data.total === 1 ? '' : 's'} found`;
    document.querySelector('#product-grid').innerHTML = data.products.length ? data.products.map(productCard).join('') : '<div class="empty"><h2>No products found</h2><p>Try clearing a filter or searching for another term.</p></div>';
    bindAddButtons();
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); loadProducts().catch(reportError); });
  form.addEventListener('reset', () => setTimeout(() => loadProducts().catch(reportError)));
  await loadProducts();
}
async function renderProduct(id) {
  const product = await request(`/api/products/${encodeURIComponent(id)}`);
  request('/api/events', { method: 'POST', body: JSON.stringify({ eventType: 'product_viewed', productId: product.id }) }).catch(() => {});
  app.innerHTML = `<p><a href="/">&larr; Back to products</a></p><article class="detail"><div><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} product image" onerror="this.onerror=null;this.src='/images/product-placeholder.svg'"></div><div><span class="badge ${product.availability === 'Low stock' ? 'low' : ''}">${escapeHtml(product.availability)}</span><p class="eyebrow">${escapeHtml(product.brand)} &middot; ${escapeHtml(product.category)}</p><h1>${escapeHtml(product.name)}</h1><p class="price">${money(product.price)}</p><p>${escapeHtml(product.description)}</p><table class="specs"><caption class="sr-only">Technical specifications</caption><tbody>${Object.entries(product.specifications).map(([key, value]) => `<tr><th scope="row">${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table><div class="quantity"><label for="quantity">Quantity<input id="quantity" type="number" min="1" max="99" value="1"></label><button id="add-detail">Add to cart</button></div></div></article>`;
  document.querySelector('#add-detail').addEventListener('click', () => addToCart(product.id, Number(document.querySelector('#quantity').value)));
}
async function renderCart(checkout = false) {
  const cart = await request('/api/cart');
  if (checkout) request('/api/events', { method: 'POST', body: JSON.stringify({ eventType: 'checkout_review_opened' }) }).catch(() => {});
  app.innerHTML = `<p><a href="/">&larr; Continue shopping</a></p><h1>${checkout ? 'Checkout review' : 'Your cart'}</h1>${checkout ? '<p class="notice">This is a mock review only. No payment or order will be processed.</p>' : ''}<div id="cart-content"></div>`;
  const content = document.querySelector('#cart-content');
  if (!cart.items.length) { content.innerHTML = '<div class="empty"><h2>Your cart is empty</h2><p>Add a product to get started.</p></div>'; return; }
  content.innerHTML = `<div class="cart-list">${cart.items.map((item) => `<article class="cart-item"><div><h3><a href="/products/${item.product.id}">${escapeHtml(item.product.name)}</a></h3><p class="muted">${money(item.product.price)} each</p></div><label>Quantity<input type="number" min="1" max="99" value="${item.quantity}" data-quantity="${item.product.id}"></label><strong class="line-total">${money(item.subtotal)}</strong><button class="danger" data-remove="${item.product.id}">Remove</button></article>`).join('')}</div><aside class="summary"><div class="summary-row"><span>Items</span><span>${cart.itemCount}</span></div><div class="summary-row summary-total"><span>Subtotal</span><span>${money(cart.subtotal)}</span></div>${checkout ? '<button disabled>Confirm (disabled in demo)</button>' : '<a class="button" href="/checkout-review">Review mock checkout</a>'}</aside>`;
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', async () => { await request(`/api/cart/${button.dataset.remove}`, { method: 'DELETE' }); await refreshCartCount(); renderCart(checkout); }));
  document.querySelectorAll('[data-quantity]').forEach((input) => input.addEventListener('change', async () => { try { await request(`/api/cart/${input.dataset.quantity}`, { method: 'PATCH', body: JSON.stringify({ quantity: Number(input.value) }) }); await refreshCartCount(); renderCart(checkout); } catch (error) { showToast(error.message); } }));
}
async function renderCompare() {
  const products = (await request('/api/products')).products;
  const categories = [...new Set(products.map((product) => product.category))];
  app.innerHTML = `<p><a href="/">&larr; Back to products</a></p><h1>Compare products</h1><p class="muted">Choose two or three products from the same category.</p><div class="compare-controls"><label>Category<select id="compare-category">${categories.map((category) => `<option>${escapeHtml(category)}</option>`).join('')}</select></label><label>Product one<select id="compare-one"></select></label><label>Product two<select id="compare-two"></select></label><label>Product three (optional)<select id="compare-three"><option value="">None</option></select></label><button id="compare-button">Compare</button></div><div id="compare-results" aria-live="polite"></div>`;
  const category = document.querySelector('#compare-category'); const selects = [document.querySelector('#compare-one'), document.querySelector('#compare-two'), document.querySelector('#compare-three')];
  function updateOptions() { const choices = products.filter((product) => product.category === category.value); selects.forEach((select, index) => { const previous = select.value; select.innerHTML = index === 2 ? '<option value="">None</option>' : ''; choices.forEach((product) => select.insertAdjacentHTML('beforeend', `<option value="${product.id}">${escapeHtml(product.name)}</option>`)); if (choices.some((product) => product.id === previous)) select.value = previous; }); if (!selects[1].value && choices[1]) selects[1].value = choices[1].id; }
  updateOptions(); category.addEventListener('change', updateOptions);
  document.querySelector('#compare-button').addEventListener('click', async () => { const ids = selects.map((select) => select.value).filter(Boolean); if (ids.length < 2) return showToast('Choose at least two products.'); try { const result = await request(`/api/compare?ids=${ids.join(',')}`); const keys = [...new Set(result.products.flatMap((product) => Object.keys(product.specifications)))]; document.querySelector('#compare-results').innerHTML = `<table class="compare-table"><caption>Product comparison</caption><thead><tr><th scope="col">Attribute</th>${result.products.map((product) => `<th scope="col">${escapeHtml(product.name)}</th>`).join('')}</tr></thead><tbody><tr><th scope="row">Price</th>${result.products.map((product) => `<td>${money(product.price)}</td>`).join('')}</tr><tr><th scope="row">Brand</th>${result.products.map((product) => `<td>${escapeHtml(product.brand)}</td>`).join('')}</tr>${keys.map((key) => `<tr><th scope="row">${escapeHtml(key)}</th>${result.products.map((product) => `<td>${escapeHtml(product.specifications[key] || '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`; } catch (error) { showToast(error.message); } });
}
async function route() {
  await refreshCartCount();
  const path = window.location.pathname;
  if (path === '/compare') return renderCompare();
  if (path === '/cart') return renderCart();
  if (path === '/checkout-review') return renderCart(true);
  if (path.startsWith('/products/')) return renderProduct(decodeURIComponent(path.split('/')[2]));
  return renderHome();
}
route().catch(reportError);
