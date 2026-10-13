const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../server');

let server;
let baseUrl;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  return { response, body: response.status === 204 ? null : await response.json() };
}

test('catalogue supports combined search and price filters', async () => {
  const { response, body } = await api('/api/products?search=bluetooth&maxPrice=150&sort=price-asc');
  assert.equal(response.status, 200);
  assert.ok(body.products.length > 0);
  assert.ok(body.products.every((product) => product.price <= 150 && JSON.stringify(product).toLowerCase().includes('bluetooth')));
});

test('catalogue accepts empty optional price filters', async () => {
  const { response, body } = await api('/api/products?search=&category=&minPrice=&maxPrice=&sort=name');
  assert.equal(response.status, 200);
  assert.equal(body.total, 12);
});

test('cart calculates subtotal from the catalogue and rejects client prices', async () => {
  const add = await api('/api/cart', { method: 'POST', body: JSON.stringify({ productId: 'keyboard-001', quantity: 2, price: 0 }) });
  assert.equal(add.response.status, 201);
  assert.equal(add.body.subtotal, 258);
  assert.equal(add.body.items[0].product.price, 129);
  const invalid = await api('/api/cart', { method: 'POST', body: JSON.stringify({ productId: 'missing', quantity: 1 }) });
  assert.equal(invalid.response.status, 404);
});

test('comparison requires products from one category', async () => {
  const valid = await api('/api/compare?ids=keyboard-001,keyboard-002');
  assert.equal(valid.response.status, 200);
  assert.equal(valid.body.products.length, 2);
  const invalid = await api('/api/compare?ids=keyboard-001,mouse-001');
  assert.equal(invalid.response.status, 400);
});

test('product descriptions are served as JSON text', async () => {
  const { response, body } = await api('/api/products/headphones-001');
  assert.equal(response.status, 200);
  assert.equal(typeof body.description, 'string');
  assert.equal(body.description.includes('<script>'), false);
});
