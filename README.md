# TechStore

TechStore is a small, accessible electronics shop built for browser-agent reliability research. It uses Express, vanilla JavaScript, and a deterministic local catalogue. It does not process payments or collect personal information.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open <http://localhost:3000>. Development mode is available with `npm run dev`.

## Test

```bash
npm test
```

The tests exercise combined catalogue filtering, server-owned cart totals, comparison validation, and safe product-description handling.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Searchable and filterable catalogue |
| `/products/:id` | Product details |
| `/compare` | Compare two or three products in one category |
| `/cart` | Session cart |
| `/checkout-review` | Non-transactional mock checkout review |
| `/api/products` | Product search/filter API |
| `/api/cart` | Cart operations |
| `/api/compare` | Comparison API |
| `/api/events` | Whitelisted research event intake |

Product data lives in [`data/products.json`](data/products.json). Descriptions are rendered with text-safe escaping in the browser; they are never interpreted as HTML or code.

## Research logging

Whitelisted interaction events are appended as JSON Lines to `logs/events.jsonl`. The log contains timestamps, event types, product IDs, and a generated session identifier only. The `logs/` directory is created automatically and its event file is ignored by Git.

Sessions are held in memory and use an HttpOnly cookie. Restarting the process clears carts, so this is not suitable for a multi-instance production deployment.

## Render deployment

Create a Node web service in Render, connect this repository, and use:

- Build command: `npm install`
- Start command: `npm start`

Render provides the `PORT` environment variable, which the server respects. Local JSON data and in-memory sessions keep the initial deployment simple; persistent carts and logs would require a database or durable storage in a later version.
