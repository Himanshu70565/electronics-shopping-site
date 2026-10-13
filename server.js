const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const dataDir = path.join(__dirname, 'data');
const products = JSON.parse(fs.readFileSync(path.join(dataDir, 'products.json'), 'utf8'));
const productById = new Map(products.map((product) => [product.id, product]));
const sessions = new Map();
const logPath = path.join(__dirname, 'logs', 'events.jsonl');
fs.mkdirSync(path.dirname(logPath), { recursive: true });

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getSession(req, res) {
  const match = req.headers.cookie?.match(/(?:^|;\s*)techstore_sid=([^;]+)/);
  let id = match?.[1];
  if (!id || !sessions.has(id)) {
    id = crypto.randomUUID();
    sessions.set(id, new Map());
    res.setHeader('Set-Cookie', `techstore_sid=${id}; Path=/; HttpOnly; SameSite=Lax`);
  }
  return sessions.get(id);
}

function toProduct(product) {
  return { ...product, url: `/products/${product.id}` };
}

function cartSummary(session) {
  const items = [...session.entries()].map(([productId, quantity]) => {
    const product = productById.get(productId);
    return { product: toProduct(product), quantity, subtotal: product.price * quantity };
  });
  return { items, subtotal: items.reduce((sum, item) => sum + item.subtotal, 0), itemCount: items.reduce((sum, item) => sum + item.quantity, 0) };
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 && value <= 99;
}

function recordEvent(req, type, metadata = {}) {
  const event = { timestamp: new Date().toISOString(), eventType: type, sessionId: req.headers.cookie?.match(/techstore_sid=([^;]+)/)?.[1] || null, ...metadata };
  fs.appendFile(logPath, `${JSON.stringify(event)}\n`, (error) => {
    if (error) console.error('Unable to write research event:', error.message);
  });
}

app.get('/api/products', (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim();
  const minPrice = req.query.minPrice === undefined || req.query.minPrice === '' ? 0 : Number(req.query.minPrice);
  const maxPrice = req.query.maxPrice === undefined || req.query.maxPrice === '' ? Infinity : Number(req.query.maxPrice);
  if (!Number.isFinite(minPrice) || (maxPrice !== Infinity && !Number.isFinite(maxPrice)) || minPrice < 0 || maxPrice < 0 || minPrice > maxPrice) return res.status(400).json({ error: 'Price filters must be valid non-negative numbers, with the minimum no greater than the maximum.' });
  let result = products.filter((product) => {
    const searchable = `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
    return (!search || searchable.includes(search)) && (!category || product.category === category) && product.price >= minPrice && product.price <= maxPrice;
  });
  const sort = String(req.query.sort || 'name');
  if (sort === 'price-asc') result.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') result.sort((a, b) => b.price - a.price);
  else if (sort === 'availability') result.sort((a, b) => a.availability.localeCompare(b.availability) || a.name.localeCompare(b.name));
  else result.sort((a, b) => a.name.localeCompare(b.name));
  if (search) recordEvent(req, 'product_searched', { search, resultCount: result.length });
  if (category) recordEvent(req, 'category_filtered', { category, resultCount: result.length });
  res.json({ products: result.map(toProduct), total: result.length });
});

app.get('/api/categories', (_req, res) => res.json([...new Set(products.map((product) => product.category))]));

app.get('/api/products/:id', (req, res) => {
  const product = productById.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json(toProduct(product));
});

app.get('/api/cart', (req, res) => res.json(cartSummary(getSession(req, res))));

app.post('/api/cart', (req, res) => {
  const { productId, quantity = 1 } = req.body || {};
  const product = productById.get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (!positiveInteger(quantity)) return res.status(400).json({ error: 'Quantity must be an integer from 1 to 99.' });
  const session = getSession(req, res);
  const nextQuantity = (session.get(productId) || 0) + quantity;
  if (nextQuantity > 99) return res.status(400).json({ error: 'A product quantity cannot exceed 99.' });
  session.set(productId, nextQuantity);
  recordEvent(req, 'product_added_to_cart', { productId, quantity });
  res.status(201).json(cartSummary(session));
});

app.patch('/api/cart/:id', (req, res) => {
  const product = productById.get(req.params.id);
  const quantity = req.body?.quantity;
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (!positiveInteger(quantity)) return res.status(400).json({ error: 'Quantity must be an integer from 1 to 99.' });
  const session = getSession(req, res);
  if (!session.has(product.id)) return res.status(404).json({ error: 'Product is not in the cart.' });
  session.set(product.id, quantity);
  recordEvent(req, 'cart_quantity_changed', { productId: product.id, quantity });
  res.json(cartSummary(session));
});

app.delete('/api/cart/:id', (req, res) => {
  const session = getSession(req, res);
  if (!productById.has(req.params.id)) return res.status(404).json({ error: 'Product not found.' });
  session.delete(req.params.id);
  recordEvent(req, 'product_removed_from_cart', { productId: req.params.id });
  res.json(cartSummary(session));
});

app.get('/api/compare', (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean);
  if (ids.length < 2 || ids.length > 3 || ids.some((id) => !productById.has(id))) return res.status(400).json({ error: 'Choose two or three valid products to compare.' });
  const selected = ids.map((id) => productById.get(id));
  if (new Set(selected.map((product) => product.category)).size !== 1) return res.status(400).json({ error: 'Products must be in the same category.' });
  recordEvent(req, 'product_comparison_opened', { productIds: ids });
  res.json({ products: selected.map(toProduct) });
});

app.post('/api/events', (req, res) => {
  const allowed = new Set(['product_viewed', 'checkout_review_opened']);
  if (!allowed.has(req.body?.eventType)) return res.status(400).json({ error: 'Unsupported event type.' });
  recordEvent(req, req.body.eventType, { productId: typeof req.body.productId === 'string' ? req.body.productId : undefined });
  res.status(204).end();
});

app.get(['/products/:id', '/compare', '/cart', '/checkout-review'], (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) app.listen(PORT, () => console.log(`TechStore running at http://localhost:${PORT}`));

module.exports = { app, products, productById, sessions };
