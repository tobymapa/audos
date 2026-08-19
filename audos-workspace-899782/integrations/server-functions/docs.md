# Server Functions (Workspace Hooks) Integration

Define server-side handler functions that receive HTTP requests at unique URLs per workspace.

## Category
Backend / Server Logic

## Required API Keys
None

---

## Workspace ID Format

**Any of the following formats work interchangeably** in all Server Functions API endpoints. The platform resolves them to the same workspace automatically:

| Format | Example | Description |
|---|---|---|
| Numeric config ID | `665201` | Shortest — use this by default |
| `workspace-{configId}` | `workspace-665201` | Alternate prefix format |
| UUID | `8a8181a4-9eab-...` | Internal UUID — also accepted |

**Recommendation: use the numeric configId** (e.g. `665201`) for REST API fetch URLs. It is the most stable identifier and easiest to find — it appears in the workspace URL and in `get_workspace_email` tool responses. The `resolveWorkspace()` middleware automatically resolves configId to UUID. However, for direct workspace DB engine operations (e.g., `workspaceDbEngine.*()` calls), always use the workspace UUID — never pass configId directly.

```
GET /api/workspaces/665201/hooks       ✅ works
GET /api/workspaces/workspace-665201/hooks  ✅ works
GET /api/workspaces/8a8181a4-.../hooks ✅ works
```

Inside the hook sandbox, the `workspaceId` global is always the **resolved UUID** so it's safe to pass to internal platform API calls.

---

## Concepts

- **Hook** — A named server-side JavaScript function stored in the database and executed in a sandboxed environment. Each hook is scoped to a workspace and accessible via a unique URL.
- **Hook Execution** — When a hook URL is called, the platform runs the hook code in a secure sandbox with a **5-minute (300s) timeout**. The hook receives the HTTP request context and can return custom responses via `respond()`.
- **Hook Secret** — An optional shared secret for webhook authentication. When set, callers must include the secret in the `x-hook-secret` header or `?secret=` query parameter.

---

## API Endpoints

All endpoints accept any workspace ID format (numeric configId, `workspace-{configId}`, or UUID). See "Workspace ID Format" above.

### Create a Hook
```
POST /api/workspaces/:workspaceId/hooks
```

**Request:**
```json
{
  "name": "process-payment",
  "description": "Handle incoming Stripe webhooks",
  "code": "const event = request.body;\nconsole.log('Received event:', event.type);\nrespond(200, { received: true });",
  "language": "javascript",
  "enabled": true,
  "secret": "whsec_abc123"
}
```

- `name` — Required. Unique name within the workspace. Used in the execution URL.
- `description` — Optional. Human-readable description.
- `code` — Required. JavaScript code to execute. Runs in a sandboxed environment.
- `language` — Optional. Defaults to `javascript`.
- `enabled` — Optional. Defaults to `true`. Disabled hooks return 403 when called.
- `secret` — Optional. If set, callers must provide this secret to execute the hook.

**Response:**
```json
{
  "id": "uuid-abc-123",
  "workspaceId": "8a8181a4-9eab-4076-b996-14b133c6558f",
  "name": "process-payment",
  "description": "Handle incoming Stripe webhooks",
  "code": "...",
  "language": "javascript",
  "enabled": true,
  "secret": "whsec_abc123",
  "executionCount": 0,
  "lastExecutedAt": null,
  "lastError": null,
  "createdAt": "2024-01-14T12:00:00.000Z",
  "updatedAt": "2024-01-14T12:00:00.000Z"
}
```

Note: `workspaceId` in the response is always the resolved UUID, regardless of what format you used in the URL.

### List Hooks
```
GET /api/workspaces/:workspaceId/hooks
```

Returns an array of all hooks for the workspace. Returns `[]` if no hooks have been created yet.

### Get a Hook
```
GET /api/workspaces/:workspaceId/hooks/:hookId
```

### Update a Hook
```
PATCH /api/workspaces/:workspaceId/hooks/:hookId
```

Updatable fields: `name`, `description`, `code`, `language`, `enabled`, `secret`, `metadata`.

### Delete a Hook
```
DELETE /api/workspaces/:workspaceId/hooks/:hookId
```

Returns 204 No Content on success.

### Execute a Hook (Webhook Endpoint)

Two public execute URLs reach the same hook — both accept `POST` and `GET`:

```
POST /api/workspaces/:workspaceId/hooks/:hookName/execute
GET  /api/workspaces/:workspaceId/hooks/:hookName/execute

POST /api/hooks/execute/:workspaceRef/:hookName
GET  /api/hooks/execute/:workspaceRef/:hookName
```

Either is the URL you give to external services (Stripe, Mailgun, etc.) as a
webhook URL. Both `:workspaceId` and `:workspaceRef` accept any workspace id
format (numeric configId, `workspace-{configId}`, or UUID). Customer chat
tools registered in the `mcp-agent-tools` registry must point at the canonical
alias form `/api/hooks/execute/workspace-{configId}/{hookName}` — that is the
endpoint shape the tool registry accepts (see Customer Chat Tool Integration
below).

**Authentication:** A hook's `secret` is optional. If the hook has one,
callers must include it as:
- Header: `x-hook-secret: your-secret`
- Query: `?secret=your-secret`

If the hook has no secret, both execute URLs are open — anyone who knows the
URL can run the hook, so write secret-less hook code as handling untrusted
input. Hooks used as customer chat tools should stay secret-less or carry the
secret as a static `?secret=` query parameter in the registered endpoint.

This `secret` is the supported way to authenticate an inbound caller, because
the platform checks it at the edge before the sandbox starts — the hook never
needs to know the expected value. Do **not** invent a custom header (e.g.
`x-webhook-secret`) and compare it against a stored workspace secret: hook code
cannot read a workspace secret's value. See [Secrets](#secrets-workspace-api-keys).

**Response:**
```json
{
  "received": true,
  "_meta": {
    "success": true,
    "durationMs": 45,
    "logs": ["Received event: payment_intent.succeeded"],
    "error": null
  }
}
```

The response body comes from whatever the hook code passes to `respond()`.
For these JSON responses the `_meta` field (success, durationMs, logs, error)
is always appended with execution details. A hook that answers with
`respondRaw()` intentionally omits this wrapper: the body is returned verbatim
(plain text or base64-decoded bytes) with no `_meta`, which is what external
services that require an exact echo (e.g. Meta webhook verification) expect.

---

## Sandbox Environment

Hook code runs in a sandboxed JavaScript environment with:

### Available Globals
- `request` — The incoming HTTP request: `{ method, path, query, body, headers }`
- `workspaceId` — The workspace UUID string (always resolved to UUID regardless of URL format used)
- `hookName` — The hook's name
- `respond(statusCode, body)` — Set the response status and body. **Call this to return data to the caller.** If never called, the response defaults to `{ ok: true }` with status 200.
- `fetch(url, options)` — Make HTTP requests (max **50 calls** per execution, **90s default timeout** each). Hook code has no page origin, so use the platform's full `https://...` address by default; only the workspace-authenticated payment and subscriber endpoints listed below accept a path-only URL.
- `platform` — Helper object for common platform actions (see Platform Helpers below)
- `db` — Direct access to the workspace's database tables (see Database Access below)
- `console.log/error/warn/info` — Logging (captured in `_meta.logs`)
- `JSON`, `Date`, `Math`, `parseInt`, `parseFloat`, `Array`, `Object`, `String`, `Number`, `Boolean`, `Map`, `Set`, `Promise`, `RegExp`, `Error`
- `encodeURIComponent`, `decodeURIComponent`, `encodeURI`, `decodeURI`
- `setTimeout` (capped at 5 minutes)

### NOT Available (Security)
- `require` / `import` — No module loading
- `process` — No access to Node.js process. In particular there is **no `process.env`**: `process` is undefined, so `process.env.MY_KEY` throws a `ReferenceError` rather than returning `undefined`. For API keys and shared secrets read [Secrets](#secrets-workspace-api-keys) below.
- `fs` — No filesystem access
- `eval` — No nested evaluation

### Timeout
Hooks have a **5-minute (300-second)** default execution timeout. If exceeded, the hook returns a 500 error.

**Configurable per-hook timeout:** Set `metadata.timeout` (in milliseconds) to override both the fetch timeout and the VM execution ceiling for that specific hook:

```
PATCH /api/workspaces/{workspaceId}/hooks/{hookId}
{ "metadata": { "timeout": 300000 } }
```

- **Default fetch timeout:** 90s (applies when no `metadata.timeout` is set)
- **Default VM ceiling:** 300s
- **With `metadata.timeout`:** both fetch timeout and VM ceiling use that value
- **Maximum:** 600000ms (10 minutes) — requests above this are capped

Use this for hooks that call slow external APIs (video analysis, AI processing, long-running scrapers).

---

## Database Access

Hooks have direct read/write access to the workspace's database tables via the `db` global. This is the same database that the workspace's App Studio apps and the AI agent's `db_query` tool operate on.

All `db` methods are async and automatically scoped to the current workspace — no need to pass `workspaceId`.

### Visitor ownership is conditional in hooks

A forwarded `X-Session-Id` does **not** make every hook database operation
visitor-scoped. The platform first resolves that id to a real session row in
this workspace. Only when it resolves do `db.insert`, `db.bulkInsert`, and
`db.update` add that validated `session.id` as `session_id`, and only when the
hook payload did not set `session_id` itself. Use the sandbox's validated
`session.id`; never copy the caller-supplied request header into a row yourself.

Legacy hooks still run when the header is absent, invalid, belongs to another
workspace, or the session lookup fails. In those cases `session` is `null` and
a write without an explicit `session_id` keeps an empty owner
(`session_id = NULL`). That is a **shared row**: any visitor can read it through
a shared read. The workspace DB token also ships in the published space, so
treat an ownerless row as world-readable and world-writable by anyone holding
that token. A shared row must never contain secrets, private customer data, or
anything else sensitive.

Hook reads and deletes are **never** filtered by the forwarded visitor. An
unfiltered `db.query()` reads matching rows across every visitor, and
`db.delete()` deletes exactly the rows matched by the filters you pass. For a
per-visitor list, count, quota, update, or delete, require the validated
`session` and filter explicitly:

```javascript
if (!session) {
  respond(401, { error: 'A valid workspace session is required' });
  return;
}

const mine = await db.query('app_items', {
  where: { session_id: session.id },
});

await db.delete('app_items', {
  id: request.body.id,
  session_id: session.id,
});
```

An explicit owner in the hook payload always wins. To deliberately create or
keep a shared row from a session-carrying hook, set `session_id: null`:

```javascript
await db.insert('app_catalog', {
  title: request.body.title,
  session_id: null,
});

await db.update(
  'app_catalog',
  { id: request.body.id, session_id: null },
  { title: request.body.title, session_id: null },
);
```

The explicit `session_id: null` on that update matters. With a valid visitor
session, an update patch that omits `session_id` inherits the automatic stamp
and can silently convert an existing shared row into that visitor's private
row.

### db.query(tableName, opts?)

Read rows from a table.

```javascript
// Get all rows
const result = await db.query('subscribers');
console.log(result.rows);        // Array of row objects
console.log(result.rowCount);    // Number of rows returned

// With filtering and options
const result = await db.query('subscribers', {
  select: ['id', 'email', 'status'],
  where: { status: 'active' },
  orderBy: [{ column: 'created_at', direction: 'desc' }],
  limit: 50,
  offset: 0,
});
```

**Options:**
- `select` — Array of column names to return. Omit to return all columns.
- `where` — Either a plain object `{ column: value }` for simple equality filters, or an array of filter objects `[{ column, operator, value }]` for complex queries. Supported operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `ILIKE`, `IN`, `IS NULL`, `IS NOT NULL`.
- `orderBy` — Array of `{ column, direction }` objects. Direction defaults to `'asc'`.
- `limit` — Max rows to return (default: 50).
- `offset` — Row offset for pagination.

### db.insert(tableName, data)

Insert one or more rows. Pass a single object or an array of objects.

```javascript
// Insert one row
const result = await db.insert('subscribers', {
  email: 'jane@example.com',
  status: 'active',
  created_at: new Date().toISOString(),
});
console.log(result.insertedRows);  // Array of inserted rows (with auto-generated IDs)
console.log(result.count);         // Number of rows inserted

// Insert multiple rows
const result = await db.insert('orders', [
  { product_id: 1, quantity: 2, status: 'pending' },
  { product_id: 3, quantity: 1, status: 'pending' },
]);
```

### db.update(tableName, where, data)

Update matching rows. Returns the updated rows.

```javascript
// Update by simple equality
const result = await db.update('subscribers', { email: 'jane@example.com' }, {
  status: 'unsubscribed',
  updated_at: new Date().toISOString(),
});
console.log(result.count);        // Number of rows updated
console.log(result.updatedRows);  // Updated row objects

// Update with complex filter (array syntax)
const result = await db.update('orders',
  [{ column: 'status', operator: '=', value: 'pending' },
   { column: 'created_at', operator: '<', value: '2024-01-01' }],
  { status: 'expired' }
);
```

### db.delete(tableName, where)

Delete matching rows.

```javascript
const result = await db.delete('subscribers', { status: 'bounced' });
console.log(result.deletedCount);  // Number of rows deleted
```

### db.rawQuery(sql, params?)

Run a raw SQL SELECT query against the workspace database. Use `$1`, `$2`, etc. for parameterized values.

```javascript
const result = await db.rawQuery(
  'SELECT email, COUNT(*) as order_count FROM orders GROUP BY email ORDER BY order_count DESC LIMIT 10',
);
console.log(result.rows);

// With parameters
const result = await db.rawQuery(
  'SELECT * FROM subscribers WHERE created_at > $1 AND status = $2',
  ['2024-01-01', 'active']
);
```

### db.listTables()

List all tables in the workspace database.

```javascript
const tables = await db.listTables();
tables.forEach(t => console.log(t.tableName, t.rowCount));
```

### Complete Example: Sync webhook data to DB

```javascript
const event = request.body;

if (event.type === 'checkout.session.completed') {
  const session = event.data.object;

  // Check if order already exists
  const existing = await db.query('orders', {
    where: { stripe_session_id: session.id },
    limit: 1,
  });

  if (existing.rowCount === 0) {
    await db.insert('orders', {
      stripe_session_id: session.id,
      customer_email: session.customer_details?.email,
      amount_total: session.amount_total,
      currency: session.currency,
      status: 'paid',
      created_at: new Date().toISOString(),
    });

    await platform.postAgentMessage({
      message: `New order received! ${session.customer_details?.email} paid $${(session.amount_total / 100).toFixed(2)}`,
    });
  }
}

respond(200, { received: true });
```

---

## fetch (HTTP Requests)

Hooks can make outbound HTTP requests using the standard `fetch` API:

```javascript
const response = await fetch('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
});
const data = await response.json();
console.log('API response:', data);
respond(200, { result: data });
```

**Limits:**
- Maximum **50 fetch calls** per hook execution
- Each fetch has a **90-second default timeout** (override with `metadata.timeout` — see Timeout section)
- External services and ordinary platform endpoints require a full `https://...` address. Hook code has no page origin, so relative URLs (including path-relative, root path-only, and protocol-relative forms) fail before any request is sent, and broad `try/catch` code may reduce that to an "unknown error".
- Deliberate root path-only exceptions: `/api/payments/capture`, `/api/payments/cancel-hold`, `/api/payments/refund` (including their legacy `/api/sdk/payments/...` aliases), and `/api/crm/subscribers/...`. The platform resolves and authenticates those endpoints for the workspace.

---

## Platform Helpers

The `platform` object provides convenience methods for common workspace actions. These are pre-scoped to the current workspace — no need to pass `workspaceId`. The subsections below cover the complete helper set: `Object.keys(platform)` inside a hook returns exactly these twelve names.

### platform.postAgentMessage({ message, contextType?, contextId?, sessionId? })

Post a message into the workspace's agent chat. The message is **persisted to the chat history** (saved to the database) and **delivered in real-time** via WebSocket broadcast — so it appears immediately in the UI and remains visible in the conversation history when the user returns later. This is the key method for scheduled automations that need to communicate with the entrepreneur or individual customers.

```javascript
await platform.postAgentMessage({
  message: "Good morning! Here's your daily summary: 5 new contacts, 2 pending tasks.",
});
respond(200, { sent: true });
```

**Targeting a specific user's session:**
```javascript
await platform.postAgentMessage({
  message: "Hello! Just checking in...",
  contextType: 'space',
  contextId: 'workspace-709124',
  sessionId: 'space-nicholas.y.thorne@gmail.com-d915c389-2314-447f-bd96-f6acfcc6fb92'
});
```

- `message` — Required. The text message to post.
- `contextType` — Optional. Defaults to `'workspace'`. Can be `'workspace'`, `'space'`, or `'landing_page'`.
- `contextId` — Optional. Defaults to the current `workspaceId`.
- `sessionId` — Optional. The session UUID to post into. When provided, the message goes directly into that specific user's chat session. When omitted, defaults to the workspace owner's session. Use this to send messages to individual customers (e.g., daily check-ins for premium subscribers).

### platform.getChatHistory({ sessionId, limit?, excludeSystem? })

Retrieve chat messages from a specific user's session. Returns messages in chronological order. By default, system messages (like `[SYSTEM:...]` prefixed messages and JSON blobs) are filtered out so you get only human-readable conversation content.

```javascript
const history = await platform.getChatHistory({
  sessionId: 'space-nicholas.y.thorne@gmail.com-d915c389-2314-447f-bd96-f6acfcc6fb92',
  limit: 30,
});
// Returns: { messages: [{ role: 'user'|'assistant', content: '...', createdAt: '...' }] }

const lastUserMessage = history.messages.filter(m => m.role === 'user').pop();
console.log('Last thing the user said:', lastUserMessage?.content);
```

- `sessionId` — Required. The session UUID to read messages from.
- `limit` — Optional. Maximum number of messages to return. Defaults to 50.
- `excludeSystem` — Optional. Defaults to `true`. When true, filters out `[SYSTEM:...]` messages and raw JSON blobs, returning only readable conversation content.

### platform.getLatestSession({ contactId, limit?, workspaceId? })

Look up the workspace session linked to a CRM contact and return its recent readable chat messages. This is the contact-centric companion to `getChatHistory`: pass a contact id (the `id` field of an entry from `platform.getContacts`) instead of a session UUID, and the platform resolves the contact's linked `workspaceSessionId` for you. Use it instead of re-deriving a visitor's session by hand.

```javascript
const crm = await platform.getContacts({ limit: 1 });
const contact = crm.contacts?.[0];

const session = await platform.getLatestSession({ contactId: contact.id, limit: 10 });
if (!session) {
  respond(404, { error: 'Contact has no linked chat session' });
} else {
  const lastUserMessage = session.messages.filter(m => m.role === 'user').pop();
  respond(200, { sessionId: session.sessionId, lastSaid: lastUserMessage?.content });
}
```

- `contactId` — Required. A CRM contact id (from `platform.getContacts`).
- `limit` — Optional. Maximum number of messages to return. Defaults to 50.
- `workspaceId` — Optional. Defaults to the current workspace.

**Returns** `{ sessionId, messages: [{ role, content, createdAt }] }`, with `[SYSTEM:...]` messages and raw JSON blobs filtered out (the same filtering `getChatHistory` applies). It **never throws** — it returns `null` when the contact does not exist, has no linked workspace session, or the lookup fails — so always null-check the result. The returned `sessionId` is valid input for `platform.postAgentMessage`, `platform.getChatHistory`, and `platform.createSignInLink`.

### platform.generateText({ userPrompt, systemPrompt?, model? })

Call an AI model to generate text from within the hook.

```javascript
const result = await platform.generateText({
  userPrompt: 'Summarize this in 2 sentences: ' + longText,
  model: 'gpt-4o-mini',
});
console.log('Summary:', result.text);
respond(200, { summary: result.text });
```

### platform.sendEmail({ to, subject, text?, html? })

Send an email immediately using the workspace's email system.

```javascript
await platform.sendEmail({
  to: 'user@example.com',
  subject: 'Your daily report',
  text: 'Here is your report...',
  html: '<h1>Daily Report</h1><p>Here is your report...</p>',
});
respond(200, { emailSent: true });
```

### platform.getContacts({ limit?, offset?, tag? })

Retrieve contacts from the workspace CRM.

```javascript
const result = await platform.getContacts({ limit: 10, tag: 'vip' });
console.log(`Found ${result.contacts?.length} VIP contacts`);
respond(200, { contacts: result.contacts });
```

### platform.createContact({ email, name?, phone?, tags? })

Add a new contact to the workspace CRM.

```javascript
await platform.createContact({
  email: 'newuser@example.com',
  name: 'Jane Doe',
  tags: ['lead', 'website'],
});
respond(200, { created: true });
```

### platform.createSignInLink({ email?, to?, sessionId? })

Mint a one-time sign-in (magic-link) URL for an **existing customer** of this workspace, so a hook can send a customer a working way back into the space. This is the supported way to produce a sign-in URL — do not hand-roll magic-link URLs in hook code.

```javascript
const minted = await platform.createSignInLink({ email: 'customer@example.com' });
if (!minted) {
  respond(404, { error: 'Not an existing customer of this workspace' });
} else {
  await platform.sendEmail({
    to: minted.email,
    subject: 'Your sign-in link',
    html: `<p><a href="${minted.link}">Click here to sign in</a> — the link expires ${minted.expiresAt}.</p>`,
  });
  respond(200, { sent: true });
}
```

- `email` — The customer's email address (`to` is accepted as an alias).
- `sessionId` — A known workspace session UUID (e.g. from `platform.getLatestSession`). Either `email` or `sessionId` is sufficient on its own; when only `sessionId` is given, the returned `email` is resolved from that session.

**Returns** `{ link, email, expiresAt }` on success — the link is minted on the workspace's branded host when one is configured, and `expiresAt` is roughly 24 hours out. Returns **`null`** (with a console warning, no throw) when the recipient is not already a known customer — it never creates accounts, so calling it with an unknown email is a safe existence check. Minting does **not** deliver anything: pair it with `platform.sendEmail` or `platform.postAgentMessage`. Treat the minted link as a credential — it signs the recipient in — so never log it or write it to a shared (ownerless) database row.

### platform.secretsProxy(request)

Call a third-party API with one of the founder's stored API keys, without the
key ever appearing in hook code. Put a `{{secrets.NAME}}` placeholder where the
credential belongs and the platform substitutes the real value at the edge, on
the way out. This is the only helper that touches workspace secrets — see
[Secrets](#secrets-workspace-api-keys) below for the full request/response
contract, the failure codes, and what to do about INBOUND secrets.

```javascript
const res = await platform.secretsProxy({
  method: 'POST',
  url: 'https://api.provider.com/v1/things',
  headers: { Authorization: 'Bearer {{secrets.PROVIDER_API_KEY}}' },
  json: { prompt: request.body.prompt },
});

if (!res.ok) {
  // The proxy refused to send the request — inspect res.code, not res.body.
  console.error('secretsProxy failed:', res.code, res.error);
  respond(502, { error: 'Provider call could not be made' });
} else if (res.status >= 400) {
  // The call went out; the provider itself returned an error.
  respond(502, { error: 'Provider returned ' + res.status });
} else {
  respond(200, { data: res.body });
}
```

### platform.fetch(url, options)

Same as the global `fetch` — an alias for the scoped fetch function.

### platform.externalFetch(url, options?)

A raw outbound HTTP client for **external** targets. The signature and return value are standard fetch — it resolves to a normal `Response` object — but it deliberately bypasses the global `fetch`'s bookkeeping and conveniences. Verified differences from the global `fetch`:

- **The 50-calls-per-execution cap does NOT apply.** 55 consecutive `externalFetch` calls completed inside one execution, and they do not count against the global `fetch` counter either.
- **The same per-request timeout DOES apply** — 90s by default, or the hook's `metadata.timeout` when set (see Timeout section).
- **No URL rewriting and no platform auth.** The global `fetch` rewrites retired platform domains and attaches workspace context headers to self-targeted platform URLs; `externalFetch` sends exactly the request you give it. Platform endpoints that need workspace authentication will not work through it — keep using the global `fetch` for platform APIs.
- **Absolute URLs only.** A relative URL throws (`external-fetch: upstream /api/... unreachable: Failed to parse URL ...`). Plain `http://` targets are allowed.
- **Network-level failures throw** an `Error` shaped like `external-fetch: upstream <host> unreachable: <cause>` instead of returning a response — wrap calls in try/catch.

Use it for high-volume external polling where the 50-call cap would otherwise bite. For calls that need a stored founder API key, still use `platform.secretsProxy`.

```javascript
const results = [];
for (const id of idsToCheck) { // may be well over 50 items
  try {
    const res = await platform.externalFetch(`https://api.example.com/items/${id}`);
    results.push(await res.json());
  } catch (e) {
    console.warn(`item ${id} unreachable: ${e.message}`);
  }
}
respond(200, { results });
```

### platform.integrations — internal registry accessor, do not use

`platform.integrations` is an **object** (not a function) with two members, `isAvailable(name)` and `proxy(name, path, options)`. It is an internal accessor for the platform's server-side integration registry, and it is **not a supported way to call integrations from hook code**:

- The `name` values are internal registry ids — currently `openai`, `stripe`, `twilio`, `heygen` — **not** the catalog integration ids used everywhere else in these docs (`isAvailable('stripe-payments')` is always `false`).
- `isAvailable(name)` may return a plain boolean or a Promise depending on the integration — always `await` it. Unknown names return `false`.
- `proxy(name, path, options)` throws for unknown ids (`does not have proxy support`) and for known-but-unconfigured ones (`not configured. Missing keys: ...`). For configured ids it forwards to an internal platform proxy route whose upstream path contract is not documented or discoverable from hook code — in live verification, `proxy('openai', 'v1/models')` returned HTTP 200 containing the platform's HTML app shell rather than an OpenAI API response.

Use the supported alternatives instead: `platform.generateText` for AI text, `platform.secretsProxy` for third-party APIs keyed by a founder secret, and the documented catalog integration endpoints (called with the global `fetch`) for everything else. This entry exists so the runtime helper list contains no undocumented names.

---

## Secrets (workspace API keys)

Hooks routinely need a credential: an API key for an outbound call, or a shared
secret to verify an inbound webhook. Two facts decide how that code is written.

**1. There is no `process.env`.** `process` is not defined in the sandbox at all
(see NOT Available above), so `process.env.MY_KEY` throws a `ReferenceError`
instead of returning `undefined`.

**2. A workspace secret's value is never readable by hook code.** Named secrets
— the BYOK keys a founder stores under an uppercase NAME such as
`FASHN_API_KEY` — are substituted into an **outbound** request by
`platform.secretsProxy` and nowhere else. The sandbox exposes no way to load one
into a variable: there is no `platform.getSecret()`, no `platform.secrets` map,
no `platform.env`, and no endpoint that returns a stored value. Across the whole
platform only a secret's NAME, label, allow-listed hosts, last 4 characters,
enabled flag, and last-used time are readable; the plaintext is deliberately
never returned to app code, hook code, the model, or the logs.

So a secret can **make** an authenticated call outward, but cannot be used to
**check** an incoming request — see Inbound below for what to do instead.

### Outbound: platform.secretsProxy

`platform.secretsProxy(request)` forwards one HTTPS request to a third party and
replaces every `{{secrets.NAME}}` placeholder with the decrypted value
server-side. Hooks must use this helper rather than fetching the HTTP endpoint
`POST /api/workspaces/:workspaceId/secrets/proxy` directly: a hook carries no
workspace token, so that endpoint always answers
`401 {"error":"Valid workspace-scoped token required"}`.

The request schema is **strict** — an unknown field is rejected outright.

| Field | Required | Notes |
|---|---|---|
| `method` | yes | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. |
| `url` | yes | **HTTPS only.** The host must be on the allow-list of every secret referenced in the request. |
| `query` | no | Object of query parameters. |
| `headers` | no | Object of request headers — the usual home of a placeholder. |
| `json` | no | Any JSON value. The proxy stringifies it and sets `Content-Type: application/json`; do not pre-stringify. |
| `form` | no | Object of string keys and values, URL-encoded (`formEncoding: "multipart"` for text-only multipart fields). |
| `body` | no | Raw string, sent as `text/plain; charset=utf-8`. |
| `contentType` | no | Overrides the automatic Content-Type. An explicit Content-Type in `headers` wins over both. |
| `responseType` | no | `"json"`, `"text"`, or `"binary"`. Omitted means: parse JSON when the upstream is JSON, otherwise text, with automatic base64 for bytes that are not valid UTF-8. |

Only one of `json`, `form`, or `body` may be supplied, and `GET`/`HEAD` requests
may not carry any of them.

Placeholders work in `url`, `query`, `headers`, `json`, `form`, and `body`.
Substitution is **verbatim** — there is no base64 step — so an API that only
accepts HTTP Basic auth needs the pre-encoded `base64("user:key")` stored as the
secret's value.

**Response — check `ok` first, then `status`:**

```javascript
// proxy sent the request
{ ok: true,  status: 200, headers: { ... }, body: <parsed JSON | text | base64 string>, encoding?: 'base64' }

// proxy refused to send it
{ ok: false, status: 400, code: 'unknown_secret', error: '...' }
```

`ok` describes the **proxy**, not the third party. A call that reached the
provider and came back 404 or 401 is still `ok: true`, with the upstream status
in `status` and its payload in `body`. `ok: false` means the request never went
out, and then `code` says why (`body` and `headers` are absent). The helper
**resolves** in both cases — it does not throw — so a bare `try`/`catch` around
the call will not notice a refusal.

Common `code` values: `invalid_request` (bad shape, unknown field, or a body on
GET), `unknown_secret` (no such secret, or it is disabled), `no_allowed_hosts`
and `host_not_allowed` (the key's host allow-list), `https_required`,
`blocked_host` (SSRF policy), `rate_limited` and `concurrency_limited`
(transient — retry with backoff), and `upstream_error` (transient transport
failure). The full table, with permanent-vs-transient guidance, is in the
`custom-api-keys` integration docs.

Binary replies arrive base64-encoded with `encoding: 'base64'` — decode before
using the bytes. A request that references no secret at all is relayed normally
(no allow-list applies), so the helper doubles as an egress proxy when its SSRF
and size limits are what you want.

### Inbound: verifying a webhook's shared secret

Because a hook cannot read a stored secret, **do not** design a webhook that
compares an incoming custom header (e.g. `x-webhook-secret`) against a workspace
secret — there is no supported way to load the expected value for that
comparison. Use the hook's own `secret` field instead; the platform checks it
before the sandbox starts, so the code needs no knowledge of the value.

```
PATCH /api/workspaces/:workspaceId/hooks/:hookId
{ "secret": "a-long-random-string" }
```

The caller then sends `x-hook-secret: a-long-random-string` (or
`?secret=a-long-random-string`) and an unauthenticated request never reaches
your code. Rotating the secret is one `PATCH`, with no code change.

If the external service cannot send that header or query parameter, the
remaining options are to keep the hook secret-less, treat `request.body` as
untrusted, and validate on something the payload itself proves (a provider
signature verifiable against a public key, or a record that must already exist
in your tables) — or to hold the expected value as a constant in the hook
source, which stays server-side but becomes a literal the founder cannot rotate
without a code edit. Prefer the hook's own `secret`.

### Setting a workspace secret (founder)

Secrets are owner-only and are never set from app or hook code. The founder
either asks Otto in chat ("store my Fashn API key") — Otto has
`set_custom_api_key`, `list_custom_api_keys`, `check_custom_api_key`,
`set_custom_api_key_enabled`, and `delete_custom_api_key` — or uses the
Integrations panel. Each key needs three things:

- a **NAME** matching `^[A-Za-z][A-Za-z0-9_]{0,127}$`, stored upper-cased (reference the upper-cased form in placeholders);
- the **value**; and
- an **allowed-hosts** list (e.g. `api.fashn.ai`). A key with an empty list is refused with `no_allowed_hosts`, and it is never sent to a host outside its list.

Never build an app UI that collects a raw key into your own tables — route the
founder to Otto or the Integrations panel instead. The `custom-api-keys`
integration docs cover the whole BYOK model.

---

## Scheduler Integration

Hooks can be triggered on a schedule using the Task Scheduler with `actionType: "hook"`:

```
POST /api/workspaces/:workspaceId/schedules
```

```json
{
  "name": "Nightly Cleanup",
  "frequency": "daily",
  "time": "02:00",
  "timezone": "UTC",
  "actionType": "hook",
  "actionPayload": {
    "hookName": "nightly-cleanup",
    "payload": { "dryRun": false }
  }
}
```

The scheduler will call the named hook with the provided payload in `request.body`.

---

## Reacting to Workspace Events (Scheduled Polling)

**There is no declarative event→hook subscription on the platform.** A hook is
invoked in exactly two ways: direct HTTP execution (the public execute URLs
above) and the Task Scheduler (`actionType: "hook"`). There is no API to
subscribe a hook to workspace analytics events — routes such as
`/api/workspaces/:id/event-listeners`, `.../event-hooks`, `.../event-triggers`,
`.../event-bindings`, and `.../webhooks` do **not** exist (they return 404),
and hook `metadata` has no event-subscription field. Do not probe for one.

The supported pattern is **scheduler + polling**: a scheduled hook reads recent
events from the CRM events endpoint and a durable WorkspaceDB ledger records
what has already been handled.

### Reading recent events

```
GET /api/crm/events?workspaceId=:workspaceId&eventType=purchase&days=1&limit=100
```

Hook code has no page origin, so this `fetch` must use the platform's full
`https://...` address as shown — a bare `/api/crm/events` path fails before any
request is sent. This read needs no additional caller secret: pass the hook's
canonical `workspaceId` global in the query as shown.

**Query parameters:**
- `workspaceId` — Required. Any id format (configId, `workspace-{configId}`, UUID).
- `eventType` — Optional. Filter to one event type (e.g. `purchase`); omit or pass `all` for every type.
- `excludeType` — Optional. Comma-separated event types to exclude.
- `spaceId` / `appId` — Optional. Narrow to one space or app.
- `days` — Optional look-back window in days (default 30). `startDate`/`endDate` (YYYY-MM-DD, inclusive) take precedence when both are given.
- `limit` — Optional. Max events returned (default 100), newest first.
- `aggregation` — Optional. `by_type`, `by_space`, `by_app`, or `summary` return counts instead of raw events (as `{ success, aggregation, data }`).

**Response shape (raw events)** — the array is under `data`, not at the top level:

```json
{
  "success": true,
  "data": [
    { "id": "...", "eventType": "purchase", "spaceId": "...", "sessionId": "...", "visitorId": "...", "eventData": { }, "createdAt": "..." }
  ],
  "count": 1
}
```

The stable contract is the `{ success, data, count }` envelope; inspect a live
response before relying on per-event fields.

### Ledger table for deduplication

Create a WorkspaceDB table (e.g. `processed_events` with a unique `event_id`
text column) **before** deploying the hook, using the WorkspaceDB tooling.
Hooks cannot create tables — `db.rawQuery` is SELECT-only.

### Example: process new `purchase` events hourly

**Step 1 — the hook** (name: `process-purchase-events`):

```javascript
const res = await fetch(
  `https://audos.com/api/crm/events?workspaceId=${workspaceId}&eventType=purchase&days=1&limit=100`
);
const json = await res.json();
const events = json.data || [];

let processed = 0;
for (const event of events) {
  const seen = await db.query('processed_events', {
    where: { event_id: String(event.id) },
    limit: 1,
  });
  if (seen.rowCount > 0) continue; // already handled on a previous run

  // React to the purchase — keep this step IDEMPOTENT (safe to repeat).
  await platform.postAgentMessage({
    message: `New purchase event processed (id ${event.id}).`,
  });

  await db.insert('processed_events', {
    event_id: String(event.id),
    event_type: 'purchase',
    processed_at: new Date().toISOString(),
  });
  processed++;
}

respond(200, { checked: events.length, processed });
```

**Step 2 — schedule it hourly:**

```
POST /api/workspaces/:workspaceId/schedules
{
  "name": "Process purchase events",
  "frequency": "hourly",
  "timezone": "UTC",
  "actionType": "hook",
  "actionPayload": { "hookName": "process-purchase-events" }
}
```

### Delivery semantics (at-least-once)

Make the look-back window **overlap** the polling interval (hourly polling with
`days=1` is a safe overlap) so a late, skipped, or failed run never leaves a
gap — overlapping windows re-read events the ledger already covers, and the
ledger skips them.

This pattern is **at-least-once**, and the side effect must be idempotent:
if a run crashes between the side effect and the ledger insert, the next run
repeats the side effect for that event. It is **not** exactly-once delivery —
no polling recipe can promise that. Design the reaction so a repeat is harmless
(e.g. upsert by `event_id`, or make the message/action safe to duplicate)
rather than assuming each event is seen exactly once.

---

## Use Cases

1. **Webhook Receivers** — Give Stripe, Mailgun, or any external service a URL to send events to
2. **Scheduled Automations** — Run daily/weekly tasks that send emails, post agent messages, or sync data (via Task Scheduler + hook action type + platform helpers)
3. **API Endpoints** — Create lightweight server-side endpoints for your space's frontend to call
4. **Data Processing** — Process form submissions, calculate analytics, transform data
5. **Email Handlers** — Process inbound emails forwarded by Mailgun
6. **AI Phone Agent Tools** — Provide live data to AI phone agents mid-call (see Phone Agent Integration below)
7. **Daily Agent Notifications** — Schedule a hook to post daily updates into the agent chat using `platform.postAgentMessage()`
8. **External API Integration** — Call third-party APIs (weather, stock prices, news) and deliver results to the workspace
9. **Event-Driven Automations (via polling)** — React to workspace analytics events such as purchases with a scheduled hook that polls `/api/crm/events` (see Reacting to Workspace Events above — there is no direct event→hook trigger)

---

## Common Patterns

### Webhook Receiver
```javascript
const event = request.body;
console.log('Event type:', event.type);

if (event.type === 'payment_intent.succeeded') {
  console.log('Payment received:', event.data.object.amount);
  respond(200, { received: true, processed: 'payment' });
} else {
  respond(200, { received: true, processed: 'ignored' });
}
```

### Form Handler
```javascript
const { name, email, message } = request.body;

if (!name || !email) {
  respond(400, { error: 'Name and email are required' });
} else {
  console.log(`Contact form from ${name} (${email}): ${message}`);
  respond(200, { success: true, message: 'Thanks for reaching out!' });
}
```

### Scheduled Task Handler
```javascript
const { dryRun } = request.body;
const trigger = request.headers['x-trigger'];

console.log(`Running cleanup, trigger: ${trigger}, dryRun: ${dryRun}`);

if (!dryRun) {
  // Perform cleanup logic
  console.log('Cleanup completed');
}

respond(200, { cleaned: true, dryRun });
```

### Daily Agent Message (Scheduled + Platform)
Post a daily update into the agent chat. Combine with the Task Scheduler to run automatically:

**Step 1: Create the hook:**
```javascript
// Hook name: "daily-summary"
const contacts = await platform.getContacts({ limit: 100 });
const totalContacts = contacts.contacts?.length || 0;

const message = `Daily Summary (${new Date().toLocaleDateString()}):\n` +
  `Total contacts: ${totalContacts}\n` +
  `Check your dashboard for details!`;

await platform.postAgentMessage({ message });
respond(200, { sent: true, contactCount: totalContacts });
```

**Step 2: Schedule it to run daily:**
```
POST /api/workspaces/:workspaceId/schedules
{
  "name": "Daily Summary to Agent",
  "frequency": "daily",
  "time": "09:00",
  "timezone": "America/New_York",
  "actionType": "hook",
  "actionPayload": {
    "hookName": "daily-summary"
  }
}
```

### External API Call
Fetch data from a third-party API and return it:
```javascript
const response = await fetch('https://api.weather.gov/gridpoints/TOP/31,80/forecast');
const data = await response.json();
const forecast = data.properties?.periods?.[0];

if (forecast) {
  respond(200, {
    temperature: forecast.temperature,
    description: forecast.shortForecast,
  });
} else {
  respond(200, { error: 'Could not fetch forecast' });
}
```

### Email Contacts with a Tag
Send a message to all contacts with a specific tag:
```javascript
const result = await platform.getContacts({ tag: 'newsletter' });
const contacts = result.contacts || [];

for (const contact of contacts) {
  await platform.sendEmail({
    to: contact.email,
    subject: 'Weekly Newsletter',
    html: '<h1>This week in our community</h1><p>Here are the highlights...</p>',
  });
}

respond(200, { sent: contacts.length });
```

### AI Phone Agent Tool
When used as a phone agent tool, `request.body` contains `args` (from the conversation) and `call` (call metadata):
```javascript
const { args, call } = request.body;
const productName = args.product || 'unknown';

const products = {
  'basic': { price: '$9/mo', features: 'Email support, 1 user' },
  'pro': { price: '$29/mo', features: 'Priority support, 5 users, API access' },
  'enterprise': { price: 'Custom', features: 'Dedicated support, unlimited users' }
};

const product = products[productName.toLowerCase()];
if (product) {
  respond(200, { result: `The ${productName} plan is ${product.price} and includes: ${product.features}.` });
} else {
  respond(200, { result: `We offer Basic ($9/mo), Pro ($29/mo), and Enterprise (custom pricing) plans.` });
}
```

To connect this hook to a phone agent, create the agent with a tool referencing this hook's name. See the AI Phone Calls integration docs for full details.

---

## Phone Agent Integration

Server Functions can be used as **mid-call tools** for AI phone agents. This allows phone agents to look up live data during conversations instead of hallucinating answers.

### How It Works

1. Create a Server Function (hook) that returns the data you need
2. When creating a phone agent via `POST /api/workspaces/:workspaceId/phone/agents`, include a `tools` array where each tool's `hookName` matches your hook's name
3. During a call, when the agent decides to use the tool, the platform executes the hook and feeds the result back to the agent to speak

### What the Hook Receives

When called by a phone agent mid-conversation, the hook's `request.body` has this structure:

```json
{
  "args": {
    "query": "value extracted from conversation by the agent"
  },
  "call": {
    "call_id": "call_abc123",
    "agent_id": "agent_xyz",
    "from_number": "+14155551234",
    "to_number": "+15551234567"
  }
}
```

- `request.body.args` — The arguments the agent extracted from the conversation, based on the tool's `parameters` schema
- `request.body.call` — Metadata about the current phone call

### Best Practices

- Return clear, speakable text in `respond(200, { result: "..." })` — the agent will read this to the caller
- Keep responses concise — long responses sound unnatural when spoken
- Handle missing/invalid args gracefully — return helpful fallback text
- Use `console.log()` for debugging — logs are captured but not spoken
