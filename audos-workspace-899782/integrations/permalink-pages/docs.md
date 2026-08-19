# Permalink Pages Integration

Generate standalone, publicly accessible pages at unique URLs — static HTML or compiled React/TSX apps.

## Category
Content / Publishing

## Required API Keys
None

## Concepts

- **Permalink Page** — A standalone page stored in the database, accessible at a public URL. Each page is scoped to a workspace and identified by a unique slug.
- **Page Types** — Pages can be `static` (raw HTML) or `tsx` (compiled React/TypeScript apps). TSX pages are compiled server-side using ESBuild and served as fully interactive React apps.
- **Slug** — A URL-safe identifier for the page (e.g., `invoice-2024-001`, `receipt-abc`). Must be unique within a workspace.
- **Access Control** — Pages can be public (anyone with the URL) or protected with an access token. When `isPublic` is true, any `?token=` query parameter is ignored rather than validated (see "View a Permalink Page" below), so flipping a gated page public does not break previously-shared token links.
- **User-Key Scoping** — Pages are tagged with `sessionId`, `contactId`, or `userId` to prevent cross-customer data leakage. Apps must provide a user-key to list or fetch pages.

---

## User-Key Requirement

When an app (space) calls the list or get endpoints, it **must** provide at least one user-key to scope the results to the current customer:

| Key | Header | Query Param |
|-----|--------|-------------|
| sessionId | `x-session-id` | `?sessionId=...` |
| contactId | `x-contact-id` | `?contactId=...` |
| userId | `x-user-id` | `?userId=...` |

Without a user-key, the create, list, and get-by-id endpoints return `400 Missing user-key`.

**Otto / entrepreneur access**: Use the internal `call_internal_api` tool which hits internal routes that don't require user-key scoping.

---

## API Endpoints

All endpoints are scoped to a workspace via the URL path.

### Create a Permalink Page

```
POST /api/workspaces/:workspaceId/permalink-pages
```

**Requires user-key.** The page is automatically tagged with the caller's user-key (from headers or query params).

#### Static HTML Page

```json
{
  "slug": "invoice-2024-001",
  "title": "Invoice #2024-001",
  "htmlContent": "<div style='font-family: sans-serif;'><h1>Invoice</h1><p>Amount: $500</p></div>",
  "metadata": { "type": "invoice" },
  "isPublic": true
}
```

#### Compiled TSX Page (React App)

Send `tsxSource` instead of `htmlContent`. The server compiles it with ESBuild and serves it as a full React app with CDN-loaded React 18, Lucide icons, and Tailwind CSS.

```json
{
  "slug": "pricing-calculator",
  "title": "Pricing Calculator",
  "tsxSource": "import { useState } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { Calculator } from 'lucide-react';\n\nfunction App() {\n  const [qty, setQty] = useState(1);\n  return (\n    <div className=\"min-h-screen flex items-center justify-center bg-gray-50 p-8\">\n      <div className=\"bg-white rounded-2xl shadow-xl p-8 max-w-md w-full\">\n        <div className=\"flex items-center gap-3 mb-6\">\n          <Calculator className=\"w-6 h-6 text-purple-600\" />\n          <h1 className=\"text-2xl font-bold\">Pricing</h1>\n        </div>\n        <input type=\"number\" value={qty} onChange={e => setQty(Number(e.target.value))} min={1} className=\"w-full border rounded-lg px-4 py-2 mb-4\" />\n        <p className=\"text-3xl font-bold text-purple-600\">${(qty * 29.99).toFixed(2)}</p>\n      </div>\n    </div>\n  );\n}\n\ncreateRoot(document.getElementById('root')!).render(<App />);",
  "isPublic": true
}
```

**Headers (auto-tagging):**
```
x-session-id: session-abc-123
```

**Fields:**
- `slug` — Required. URL-safe unique identifier within the workspace.
- `title` — Required. Page title (used in browser tab).
- `htmlContent` — Required for static pages. Full HTML content.
- `tsxSource` — Required for TSX pages. Single-file React/TypeScript source code. Must include `createRoot` mount. When provided, `htmlContent` is generated automatically from compilation.
- `metadata` — Optional. JSON metadata for tracking and querying.
- `isPublic` — Optional. Defaults to `true`.
- `accessToken` — Optional. Required to view the page if `isPublic` is false.
- `expiresAt` — Optional. ISO datetime after which the page returns 404.

**Response:**
```json
{
  "id": "uuid-abc-123",
  "workspaceId": "workspace-123",
  "slug": "pricing-calculator",
  "title": "Pricing Calculator",
  "pageType": "tsx",
  "sessionId": "session-abc-123",
  "publicUrl": "https://www.mybusiness.com/p/workspace-123/pricing-calculator",
  "createdAt": "2024-01-14T12:00:00.000Z"
}
```

> **`publicUrl` and custom domains:** The `publicUrl` field returns a full URL. When the workspace has a verified custom domain, it uses that domain (e.g., `https://www.mybusiness.com/p/workspace-123/pricing-calculator`). Otherwise, it falls back to the platform domain (e.g., `https://audos.com/p/workspace-123/pricing-calculator`). Always use the `publicUrl` from the API response when sharing links — do not construct URLs manually.

**Compilation errors** return `422`:
```json
{
  "error": "TSX compilation failed",
  "details": "Unexpected token (line 15, col 4)\n  > return <div>..."
}
```

### List Permalink Pages
```
GET /api/workspaces/:workspaceId/permalink-pages
```

**Requires user-key** (header or query param). Returns only pages belonging to the current user, sorted by creation date.

### Get a Permalink Page
```
GET /api/workspaces/:workspaceId/permalink-pages/:pageId
```

**Requires user-key.** Returns 404 if the page doesn't belong to the caller.

### Update a Permalink Page
```
PATCH /api/workspaces/:workspaceId/permalink-pages/:pageId
```

**User-key scoping does NOT apply here.** Unlike the get-by-id endpoint, PATCH is not scoped to the caller's user-key — any `x-session-id` (or other user-key) is accepted and the update applies to the page identified by `:pageId`. A consequence worth knowing: you cannot use GET-by-id to read back a page you did not create (it returns 404 for a non-matching user-key), so the natural verify-then-change flow (GET current state, then PATCH) silently fails at the GET step. Instead, use the PATCH response body — it returns the full updated page record — to confirm state.

Updatable fields: `slug`, `title`, `htmlContent`, `tsxSource`, `metadata`, `isPublic`, `accessToken`, `expiresAt`, `sessionId`, `contactId`, `userId`.

When `tsxSource` is updated, the page is recompiled automatically. If compilation fails, the update is rejected with `422`.

### Recompile a TSX Page
```
POST /api/workspaces/:workspaceId/permalink-pages/:pageId/recompile
```

Forces recompilation of an existing TSX page from its stored source. Useful if the compilation pipeline is updated.

### Delete a Permalink Page
```
DELETE /api/workspaces/:workspaceId/permalink-pages/:pageId
```

### View a Permalink Page (Public URL)

On the platform default host, the page is served at:
```
GET /p/:workspaceId/:slug
GET /p/:workspaceId/:slug?token=access-token-here
```

On a workspace-owned custom host (Task #1235), the workspace UUID is
omitted because the Host header identifies the workspace:
```
GET /p/:slug                    (on https://billing.myapp.com)
GET /p/:slug?token=...
```

Static pages render raw HTML. TSX pages render as full React apps with importmaps and CDN dependencies. Both URL shapes go through the same `servePermalinkPage` renderer — `expiresAt`, `isPublic`/`accessToken` gating, and view accounting behave identically.

**Token handling on public pages:** When `isPublic` is true, any `?token=` query parameter is ignored rather than validated. A stale, wrong, or entirely bogus token does not cause a 401/403 — the page serves normally (HTTP 200, identical content) with or without a token. Previously-shared review links containing an old token therefore continue to resolve after a page is flipped public, so going public does not break links you already sent out. Conversely, re-gating a page (`isPublic: false` + a new `accessToken`) immediately invalidates every link that lacks the new token.

---

## TSX Page Details

### What's Available in TSX Pages

TSX pages are compiled using the same ESBuild pipeline as spaces. The following are available via importmap:

| Package | Version |
|---------|---------|
| `react` | 18.3.1 |
| `react-dom` | 18.3.1 |
| `react-dom/client` | 18.3.1 |
| `lucide-react` | 0.462.0 |

Tailwind CSS 3.4.1 is loaded via CDN stylesheet.

### TSX Page Rules

1. Must be a single file — all components in one file
2. Must call `createRoot(document.getElementById('root')!).render(...)` to mount
3. Can import from `react`, `react-dom/client`, and `lucide-react`
4. Can use Tailwind CSS classes
5. Can use `useState`, `useEffect`, `useRef`, and all React hooks
6. Can fetch data from APIs using `fetch()` at runtime
7. Can access `window.__PERMALINK_WORKSPACE_ID__` and `window.__PERMALINK_SLUG__`

### Example: Interactive Dashboard Page

```tsx
import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, TrendingUp, Users } from 'lucide-react';

function Dashboard() {
  const [data, setData] = useState<any>(null);
  const workspaceId = (window as any).__PERMALINK_WORKSPACE_ID__;

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/analytics`)
      .then(r => r.json())
      .then(setData);
  }, []);

  if (!data) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin h-8 w-8 border-2 border-purple-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-8">Analytics Dashboard</h1>
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <Users className="w-5 h-5 text-blue-500 mb-2" />
          <p className="text-2xl font-bold">{data.totalUsers}</p>
          <p className="text-sm text-gray-500">Total Users</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <BarChart3 className="w-5 h-5 text-green-500 mb-2" />
          <p className="text-2xl font-bold">{data.pageViews}</p>
          <p className="text-sm text-gray-500">Page Views</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <TrendingUp className="w-5 h-5 text-purple-500 mb-2" />
          <p className="text-2xl font-bold">{data.conversion}%</p>
          <p className="text-sm text-gray-500">Conversion</p>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Dashboard />);
```

---

## Use Cases

1. **Invoices** — Generate unique invoice pages (static HTML or interactive TSX)
2. **Receipts** — Create shareable payment confirmation pages
3. **Proposals** — Share business proposals with interactive pricing calculators
4. **Certificates** — Issue completion certificates or awards
5. **Event Tickets** — Generate ticket pages with QR codes
6. **Reports** — Share analytics dashboards at unique links
7. **Contracts** — Host agreement pages for review and signature
8. **Interactive Tools** — Calculators, configurators, quizzes at unique URLs
9. **Client Portals** — Personalized pages that fetch live data for each customer

---

## Common Patterns

### Static Invoice Page from Hook

```javascript
const { customerName, amount, items, dueDate } = request.body;
const slug = `invoice-${Date.now()}`;

const html = `
<div style="font-family: sans-serif; max-width: 700px; margin: 40px auto; padding: 40px; border: 1px solid #e5e7eb;">
  <h1 style="color: #111;">Invoice</h1>
  <p><strong>To:</strong> ${customerName}</p>
  <p><strong>Due:</strong> ${dueDate}</p>
  <hr/>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left; padding: 8px;">Item</th><th style="text-align: right; padding: 8px;">Amount</th></tr>
    ${items.map(i => `<tr><td style="padding: 8px;">${i.name}</td><td style="text-align: right; padding: 8px;">$${i.amount}</td></tr>`).join('')}
  </table>
  <hr/>
  <p style="text-align: right; font-size: 1.2em;"><strong>Total: $${amount}</strong></p>
</div>
`;

// `publicUrl` is what the create-page response returns; on a custom host
// it is `https://<host>/p/<slug>`, on the platform default it is
// `/p/<workspaceId>/<slug>`.
respond(200, { slug, html });
```

### TSX Interactive Calculator from Hook

```javascript
const { productName, basePrice } = request.body;
const slug = `calc-${productName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

const tsxSource = `
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

function Calculator() {
  const [qty, setQty] = useState(1);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full">
        <h2 className="text-xl font-bold mb-4">${productName}</h2>
        <label className="block text-sm text-gray-600 mb-1">Quantity</label>
        <input type="number" value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} min={1} className="w-full border rounded px-3 py-2 mb-4" />
        <p className="text-3xl font-bold text-purple-600">\${(qty * ${basePrice}).toFixed(2)}</p>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Calculator />);
`;

respond(200, { slug, tsxSource });
```

### Share with Expiration
```json
{
  "slug": "proposal-q1-2024",
  "title": "Q1 2024 Proposal",
  "htmlContent": "...",
  "isPublic": true,
  "expiresAt": "2024-03-31T23:59:59Z"
}
```

### Protected Page with Token
```json
{
  "slug": "contract-nda-smith",
  "title": "NDA - Smith Industries",
  "htmlContent": "...",
  "isPublic": false,
  "accessToken": "secure-random-token-here"
}
```

Accessible at the `publicUrl` returned by the API (e.g., `https://www.mybusiness.com/p/contract-nda-smith?token=secure-random-token-here` on a custom host, or `/p/<workspaceId>/contract-nda-smith?token=…` on the platform default host)

---

## Task #1235: Custom-host hosting

Permalink pages can be served on any host the workspace owns. The eligible
host set is the union of:

1. The workspace's primary `custom_domain` (and its `www` variant), implicit.
2. Rows in `workspace_permalink_hosts`, explicit. Add additional hosts via
   `POST /api/workspaces/:workspaceId/permalink-hosts` — the request is
   ownership-checked against `purchased_domains` before being persisted.

### Selecting a host on create / update

```http
POST /api/workspaces/:workspaceId/permalink-pages
{
  "slug": "invoice-2024-001",
  "html": "<h1>Invoice</h1>",
  "host": "billing.myapp.com"   // optional, must be in the eligible set
}
```

The response now includes both `publicUrl` and `host`:

```json
{ "id": "...", "slug": "invoice-2024-001", "host": "billing.myapp.com",
  "publicUrl": "https://billing.myapp.com/p/invoice-2024-001" }
```

If the workspace has no custom hosts, the response falls back to the
platform default URL and `host: null`.

### Host-registry endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/workspaces/:workspaceId/permalink-hosts` | Eligible host union |
| `POST` | `/api/workspaces/:workspaceId/permalink-hosts` | Add a secondary host |
| `POST` | `/api/workspaces/:workspaceId/permalink-hosts/check-ownership` | Pre-flight |
| `DELETE` | `/api/workspaces/:workspaceId/permalink-hosts/:host` | Remove a secondary host |

Hosts that are not owned by the workspace return `403`. Hosts already in
the registry return `409`.
