# pmv2 — Express API Reference

Base URL: `http://localhost:3001/api` (dev) or production Render URL.

**Auth header:** `Authorization: Bearer <base64_token>`

All routes return JSON. Error responses follow `{ success: false, error: string }` or `{ error: string }`.

---

## Auth

### POST /api/auth/login

Authenticate with username and password.

```
POST /api/auth/login
Content-Type: application/json

{
  "username": "your.username",
  "password": "your-password"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "abc123",
    "username": "your.username",
    "email": "user@example.com",
    "role": "superadmin",
    "approved": 1,
    "full_name": "Example User",
    "designation": null,
    "created_at": 1700000000,
    "updated_at": 1700000000
  },
  "token": "base64encodedstring"
}
```

**Error response:**
```json
{ "success": false, "error": "Invalid credentials" }
```
```json
{ "success": false, "error": "Account pending approval. Contact an administrator." }
```

**Notes:**
- Password is base64-encoded and compared against `password_hash` in Firestore
- Token = `base64(userId:username:timestamp)`
- Token is **not** a JWT — it's a simple base64 compound string
- Users with `approved: 0` cannot log in (except superadmin)
- Approved check: `user.approved === 1 || user.approved === true`

---

### POST /api/auth/register

Create a new user account. Requires approval before login.

```
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "password123",
  "role": "user"
}
```

**Validation:**
- `username`: required
- `email`: required, must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- `password`: required, min 6 characters
- `role`: optional, defaults to `"user"`, must be `"user"` or `"viewer"` only

**Response (201):**
```json
{
  "success": true,
  "message": "Account created. You will be able to log in after an administrator approves your account.",
  "user": {
    "id": "def456",
    "username": "newuser",
    "email": "newuser@example.com",
    "role": "user",
    "approved": 0,
    "created_at": 1700000500
  }
}
```

**Error responses:**
```json
{ "success": false, "error": "Username or email already exists" }
{ "success": false, "error": "Username, email, and password are required" }
```

---

### GET /api/auth/me

Restore session by validating the stored token.

```
GET /api/auth/me
Authorization: Bearer <base64_token>
```

**Response (200):**
```json
{
  "success": true,
  "user": { /* same shape as login */ }
}
```

**Error response:**
```json
{ "success": false, "error": "Invalid token" }
```

---

### POST /api/auth/change-password

Signed-in user sets their own password (superadmins can still set anyone's via `PATCH /api/users/:id`). On success every *other* session of the user is ended; the session making the call stays valid. Not available to phone-scanner sessions.

```
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{ "currentPassword": "…", "newPassword": "…" }
```

Rules: both fields required; new password at least 8 characters and different from the current one. A wrong current password counts against the login lockout (5 in 15 minutes).

**Response (200):**
```json
{ "success": true, "message": "Password changed. Your other devices have been signed out." }
```

**Error responses:** `400` with `error` (`Current password is incorrect`, length/sameness messages), `401` no session, `429` locked out (`Too many attempts. Try again in N minutes.`).

---

## Users

All user endpoints require `superadmin` role.

### GET /api/users

List all users sorted by `created_at` ascending.

```
GET /api/users
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "abc123",
      "username": "your.username",
      "email": "user@example.com",
      "full_name": "Example User",
      "designation": null,
      "role": "superadmin",
      "approved": 1,
      "created_at": 1700000000,
      "updated_at": 1700000000
    }
  ]
}
```

### GET /api/users/pending

List users with `approved: 0` sorted by `created_at` descending.

**Response:** same shape as above.

### PATCH /api/users/:id

Update user fields. Only send fields to change.

```
PATCH /api/users/abc123
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "RJR",
  "email": "josh.actech.inc@gmail.com",
  "full_name": "Updated Name",
  "designation": "Manager",
  "role": "admin",
  "approved": 1,
  "password": "optional-new-password"
}
```

**Allowed fields:** `username` (string), `email` (valid email), `full_name` (string|null), `designation` (string|null), `role` (superadmin|admin|user|viewer), `approved` (0|1), `password` (optional string, min 6 chars). Omit/blank `password` to keep the current password.

**Response:** `{ "success": true, "message": "User updated", "user": { ...updatedUser } }`

### POST /api/users/:id/approve

Shortcut to set `approved: 1`.

```
POST /api/users/abc123/approve
Authorization: Bearer <token>
```

**Response:** `{ "success": true, "message": "User approved" }`

### DELETE /api/users/:id

Delete a user. Cannot delete self or the last superadmin.

```
DELETE /api/users/abc123
Authorization: Bearer <token>
```

**Response:** `{ "success": true, "message": "User deleted" }`

**Errors:**
- `{ "success": false, "error": "Unauthorized" }` — no/invalid token
- `{ "success": false, "error": "Superadmin only" }` — non-superadmin
- `{ "success": false, "error": "You cannot delete your own account" }`
- `{ "success": false, "error": "Cannot delete the last superadmin" }`

---

## Projects

### GET /api/projects

List projects with optional filtering. **All filtering is done server-side in JS** after fetching all docs from Firestore.

```
GET /api/projects
GET /api/projects?status=OPEN
GET /api/projects?year=2026
GET /api/projects?search=PLDT
GET /api/projects?client=IOCT
GET /api/projects?category=Telecom
GET /api/projects?status=OPEN&year=2026&search=fiber
```

**Response (200):**
```json
[
  {
    "id": "proj001",
    "item_no": 1,
    "year": 2026,
    "am": "TJC",
    "ovp_number": "OVP-2026-001",
    "po_number": "PO-2026-001",
    "po_date": 1700000000,
    "client_status": "Active",
    "client_id": null,
    "account_name": "PLDT",
    "project_name": "CLARKTEL PAMPANGA",
    "project_category": "Telecom",
    "project_location": "Pampanga",
    "scope_of_work": "Installation",
    "qtn_no": "",
    "ovp_category": "",
    "contract_amount": 500000,
    "updated_contract_amount": 597582.68,
    "down_payment_percent": 0,
    "retention_percent": 10,
    "start_date": 1700000000,
    "duration_days": 120,
    "completion_date": 1720000000,
    "payment_schedule": "",
    "payment_terms": "",
    "bonds_requirement": "",
    "project_director": "TJC",
    "client_approver": "John Doe – Manager",
    "progress_billing_schedule": "",
    "mobilization_date": null,
    "updated_completion_date": null,
    "project_status": "OPEN",
    "actual_site_progress_percent": 65,
    "actual_progress": 65,
    "evaluated_progress_percent": 60,
    "evaluated_progress": 60,
    "for_rfb_percent": 0,
    "for_rfb_amount": 0,
    "rfb_date": null,
    "type_of_rfb": "",
    "work_in_progress_ap": 0,
    "work_in_progress_ep": 0,
    "updated_contract_balance_percent": 0,
    "total_contract_balance": 0,
    "updated_contract_balance_net_percent": 0,
    "updated_contract_balance_net": 0,
    "remarks": "",
    "contract_billed_gross_percent": 0,
    "contract_billed": 0,
    "contract_billed_net_percent": 0,
    "amount_contract_billed_net": 0,
    "for_retention_billing_percent": 0,
    "amount_for_retention_billing": 0,
    "retention_status": "",
    "unevaluated_progress": 0,
    "created_at": "2026-01-15T00:00:00.000Z",
    "updated_at": "2026-03-01T00:00:00.000Z"
  }
]
```

**Query params:**
| Param | Type | Description |
|---|---|---|
| `status` | string | Exact match on `project_status` |
| `year` | number | Exact match on `year` |
| `search` | string | Case-insensitive match on `project_name`, `account_name`, `ovp_number` |
| `client` | string | Exact match on `account_name` |
| `category` | string | Exact match on `project_category` |

---

### GET /api/projects/count

```
GET /api/projects/count
```

**Response:** `{ "count": 150 }`

### GET /api/projects/unique/statuses

**Response:** `["CANCELLED", "CLOSED", "FOR_CLOSEOUT", "OPEN", "PENDING"]`

### GET /api/projects/unique/years

**Response:** `[2026, 2025, 2024]`

### GET /api/projects/unique/categories

**Response:** `["Building", "Telecom", "Security"]`

### GET /api/projects/unique/clients

Returns client names from both `clients` collection (with `client_id`) and `projects` collection (without `client_id`).

**Response:** `["IOCT", "PLDT", "SMART"]`

### GET /api/projects/:id

**Response:** single project object (same shape as array item above).

### POST /api/projects

Create a new project. If `client_id` is provided, `account_name` and `client_approver` are auto-resolved from the client record.

```
POST /api/projects
Content-Type: application/json

{
  "project_name": "New Project",
  "account_name": "IOCT",
  "project_status": "OPEN",
  "contract_amount": 1000000
}
```

**Response (201):** `{ "id": "newproj123", "message": "Project created successfully" }`

### POST /api/projects/bulk

Batch create up to 500 projects per chunk.

```
POST /api/projects/bulk
Content-Type: application/json

{
  "projects": [ /* array of project objects */ ]
}
```

**Response (200):**
```json
{
  "success": true,
  "addedCount": 47,
  "errors": ["Row 5: field value error"]
}
```

### PUT /api/projects/:id

Update a project. Only send fields that changed. All fields in the `Project` interface are passed through — notably `billing_schedule` (array of `BillingMilestone`) and `executionFolderId` / `executionFolderUrl` (set by the client after auto-creating the OneDrive execution folder on PDF export).

```
PUT /api/projects/proj001
Content-Type: application/json

{
  "project_status": "CLOSED",
  "actual_site_progress_percent": 100,
  "billing_schedule": [],
  "executionFolderId": "abc123",
  "executionFolderUrl": "https://..."
}
```

**Response:** `{ "message": "Project updated successfully" }`

### DELETE /api/projects

Bulk delete projects.

```
DELETE /api/projects
Content-Type: application/json

{
  "ids": ["proj001", "proj002"]
}
```

**Response:** `{ "success": true, "deletedCount": 2 }`

---

## Stats

### GET /api/stats

Aggregate statistics computed server-side from all projects.

**Response:**
```json
{
  "totalProjects": [{ "count": 150 }],
  "projectsByStatus": [
    { "project_status": "OPEN", "count": 80 },
    { "project_status": "CLOSED", "count": 50 }
  ],
  "projectsByDirector": [
    { "project_director": "TJC", "count": 60 }
  ],
  "totalContractValue": [{ "total": 50000000 }],
  "totalBilled": [{ "total": 30000000 }]
}
```

---

## Clients

### GET /api/clients

List all clients ordered by `client_name`.

**Response:**
```json
[
  {
    "id": "cli001",
    "client_name": "PLDT Inc.",
    "address": "Makati City",
    "payment_terms": "Net 30",
    "contact_person": "John Doe",
    "designation": "Project Manager",
    "email_address": "john@pldt.com",
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
]
```

### GET /api/clients/:id

**Response:** single client object.

### POST /api/clients

```
POST /api/clients
Content-Type: application/json

{
  "client_name": "New Client",
  "address": "Address here",
  "payment_terms": "Net 30",
  "contact_person": "Contact Name",
  "designation": "Manager",
  "email_address": "contact@client.com"
}
```

**Validation:** `client_name` is required.

**Response (201):** `{ "id": "cli002", "message": "Client created successfully" }`

### PUT /api/clients/:id

Updates client AND cascades changes to all linked projects:
- `account_name` → updated on all projects with matching `client_id`
- `client_approver` → rebuilt as `"contact_person – designation"` on all linked projects

**Response:** `{ "message": "Client updated successfully" }`

### DELETE /api/clients/:id

**Response:** `{ "message": "Client deleted successfully" }`

---

## Cash Advances

### GET /api/cash-advances

- Admin/superadmin: sees all CAs
- Regular user: sees own CAs only
- Enriches response with `username`, `full_name` (from users), `project_name` (from projects)

**Response:**
```json
{
  "success": true,
  "cash_advances": [
    {
      "id": "ca001",
      "user_id": "user123",
      "amount": 50000,
      "balance_remaining": 25000,
      "status": "approved",
      "purpose": null,
      "breakdown": [
        { "category": "Transportation", "description": "Field trip", "amount": 25000 }
      ],
      "project_id": "proj001",
      "requested_at": 1700000000,
      "approved_at": 1700050000,
      "approved_by": "admin001",
      "created_at": 1700000000,
      "updated_at": 1700050000,
      "username": "jdoe",
      "full_name": "John Doe",
      "project_name": "CLARKTEL PAMPANGA"
    }
  ]
}
```

### POST /api/cash-advances

```
POST /api/cash-advances
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_id": "proj001",
  "amount": 50000,
  "breakdown": [
    { "category": "Transportation", "description": "Field trip", "amount": 25000 },
    { "category": "Materials", "description": "Cables", "amount": 25000 }
  ],
  "date_requested": "2026-01-15"
}
```

**Notes:**
- If `breakdown` is provided, `amount` is auto-summed from line items
- `date_requested` can be an ISO date string; defaults to current timestamp
- Default status: `"pending"`, `balance_remaining: amount`

**Response (201):** `{ "success": true, "id": "ca001", "message": "Cash advance requested" }`

### PATCH /api/cash-advances/:id

Admin only. Approve or reject.

```
PATCH /api/cash-advances/ca001
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "approved"
}
```

**Valid status values:** `"approved"` | `"rejected"`

**Response:** `{ "success": true, "message": "Cash advance approved" }`

**Errors:**
- `{ "success": false, "error": "Admin only" }` — non-admin
- `{ "success": false, "error": "Already processed" }` — CA not in `pending` status

### DELETE /api/cash-advances/:id

- Admin/superadmin: can delete any CA
- Regular user: can only delete own pending CAs
- On delete: unlinking liquidation `ca_id` references set to null

**Response:** `{ "success": true, "message": "Cash advance deleted" }`

---

## Liquidations

### GET /api/liquidations

- Admin/superadmin: all
- Regular user: own only
- Enriches with `username`, `full_name`

**Response:**
```json
{
  "success": true,
  "liquidations": [
    {
      "id": "liq001",
      "user_id": "user123",
      "form_no": "LQ-0001",
      "date_of_submission": "2026-01-20",
      "employee_name": "John Doe",
      "employee_number": "EMP-001",
      "rows_json": "[{\"description\":\"Logistics\",\"amount\":15000}]",
      "total_amount": 15000,
      "ca_id": "ca001",
      "status": "submitted",
      "created_at": 1700000000,
      "updated_at": 1700000000,
      "username": "jdoe",
      "full_name": "John Doe"
    }
  ]
}
```

### GET /api/liquidations/next-form-no

Returns the next available form number in `LQ-XXXX` format.

**Response:** `{ "success": true, "form_no": "LQ-0001" }`

### GET /api/liquidations/:id

**Response:** single liquidation object.

### POST /api/liquidations

```
POST /api/liquidations
Authorization: Bearer <token>
Content-Type: application/json

{
  "form_no": "LQ-0001",
  "date_of_submission": "2026-01-20",
  "employee_name": "John Doe",
  "employee_number": "EMP-001",
  "rows_json": "[{\"description\":\"Logistics\",\"amount\":15000}]",
  "total_amount": 15000,
  "status": "submitted",
  "ca_id": "ca001"
}
```

**Notes:**
- `rows_json`: JSON string or parsed array
- `status`: `"draft"` or `"submitted"`
- If `submitted` and `ca_id` provided: validates CA exists, approved, and owned by user; then decrements `ca.balance_remaining -= total_amount`

**Response (201):**
```json
{
  "success": true,
  "id": "liq001",
  "message": "Liquidation submitted"
}
```

### PUT /api/liquidations/:id

Update a draft liquidation only. Same shape as POST.

**Response:** `{ "success": true, "message": "Draft updated" }`

**Errors:**
- `{ "success": false, "error": "Cannot edit submitted liquidation" }`
- `{ "success": false, "error": "Forbidden" }` — not the owner

### DELETE /api/liquidations/:id

- Soft-deletes the liquidation
- If the liquidation was submitted and linked to a CA: `ca.balance_remaining += total_amount` (restores CA balance)

**Response:** `{ "success": true, "message": "Liquidation deleted" }`

---

## Suppliers

### GET /api/suppliers

Returns all suppliers with their nested products.

**Response:**
```json
[
  {
    "id": "sup001",
    "name": "ACME Supply",
    "contactName": "Jane Buyer",
    "email": "jane@acme.com",
    "phone": "09171234567",
    "address": "Manila",
    "paymentTerms": "Net 30",
    "products": [
      {
        "id": "prod001",
        "name": "Fiber Cable",
        "partNo": "FC-100",
        "description": "Single mode 1km",
        "brand": "Corning",
        "unit": "meter",
        "unitPrice": 150.00,
        "priceDate": "2026-01-01"
      }
    ],
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

### POST /api/suppliers

**Bulk replace operation.** The server:
1. Deletes ALL existing suppliers
2. Deletes ALL existing supplier_products
3. Inserts the entire new dataset

```
POST /api/suppliers
Authorization: Bearer <token>
Content-Type: application/json

[
  {
    "id": "sup001",
    "name": "ACME Supply",
    "contactName": "Jane Buyer",
    "products": [
      {
        "id": "prod001",
        "name": "Fiber Cable",
        "partNo": "FC-100",
        "unitPrice": 150
      }
    ]
  }
]
```

**Warning:** This is NOT incremental CRUD. You must send the complete dataset every time.

**Response:** `{ "saved": true, "count": 5 }`

### DELETE /api/suppliers/:id

Deletes supplier and all linked products.

**Response:** `{ "success": true, "message": "Supplier deleted" }`

---

## Attachments

### GET /api/projects/:id/attachments

**Response:**
```json
[
  {
    "id": "att001",
    "project_id": "proj001",
    "filename": "report.pdf",
    "onedrive_item_id": "item123",
    "onedrive_web_url": "https://onedrive.link/item123",
    "file_size": 1024000,
    "uploaded_by": "user123",
    "created_at": "2026-01-15T00:00:00.000Z"
  }
]
```

### POST /api/projects/:id/attachments

```
POST /api/projects/proj001/attachments
Content-Type: application/json

{
  "filename": "report.pdf",
  "onedrive_item_id": "item123",
  "onedrive_web_url": "https://onedrive.link/item123",
  "file_size": 1024000,
  "uploaded_by": "user123"
}
```

**Validation:** `filename` and `onedrive_item_id` are required.

**Response (201):** `{ "id": "att002", "message": "Attachment saved" }`

### DELETE /api/projects/:projectId/attachments/:attachmentId

**Response:** `{ "message": "Attachment deleted" }`

---

## Forecasting (Static/Mock Data)

All forecasting endpoints return hardcoded static data — no real computation.

### GET /api/forecasting/revenue

12-month revenue forecast array.

### GET /api/forecasting/cashflow

Quarterly cashflow projection with confidence intervals.

### GET /api/forecasting/projects

3-project completion forecast with risk levels.

### GET /api/forecasting/metrics

Aggregated forecasting KPIs.

---

## Expenses (Static)

### GET /api/expenses/categories
**Response:** `[]`

### GET /api/expenses
**Response:** `[]`

### POST /api/expenses

```
POST /api/expenses
Content-Type: application/json

{
  "projectId": "proj001",
  "category": "Transportation",
  "description": "Field trip",
  "amount": 5000,
  "date": "2026-01-15"
}
```

**Response:** creates an in-memory expense object (not persisted). Returns with a generated `id`.

---

## Invoices (Collections & AR)

### GET /api/invoices

Fetch all invoices. Optionally filter by project.

| Query param | Type | Description |
|---|---|---|
| `project_id` | string? | Filter to invoices for a specific project |

**Response:** Array of `ProjectInvoice` objects, ordered by `invoice_date` desc.

---

### POST /api/invoices

Create a new invoice. Requires active user session.

**Body:**
```json
{
  "project_id": "abc123",
  "project_name": "Batangas Plant Automation",
  "project_no": "IOCT2601001-LBI",
  "invoice_no": "SI-2026-001",
  "invoice_date": "2026-01-15",
  "amount": 150000,
  "payment_terms_days": 30,
  "due_date": "2026-02-14",
  "amount_collected": 0,
  "pb_number": "PB1",
  "notes": "Milestone 1 billing"
}
```

**Response:** The created invoice object with Firestore-generated `id`.

---

### PUT /api/invoices/:id

Update an invoice (any field). Requires active user session.
Commonly used to record a collection: send `{ amount_collected, collection_date }`.
To attach a scan: send `{ scan_file: { onedrive_item_id, onedrive_web_url, filename, uploaded_at } }`. Upload is handled client-side via `uploadFileToFolder()` before calling this endpoint.

**Response:** `{ message: "Invoice updated" }`

---

### DELETE /api/invoices/:id

Delete an invoice. Requires active user session.

**Response:** `{ success: true }`

---

## Project updates log

Per-project dated history ("sent shop drawings", "panel delivered"). Code: `server/projectUpdates.js`; UI: `ProjectUpdatesCard` on the project page.

### GET /api/projects/:id/updates
Any signed-in user (and agent keys). Returns `{ updates, types, statuses }`, newest first (by `date`, then `created_at`), max 100.

### POST /api/projects/:id/updates
superadmin/admin/user sessions and agent keys (not viewers, tax filers or phone scanners). Body: `{ note (required, max 2000), type? (Progress|Submittal|Site work|Delivery|Meeting|Client|Billing|Issue|Other, default Other), date? (YYYY-MM-DD, default today), status?, progress? (0-100), po_number? (max 80), po_date? (YYYY-MM-DD or Unix seconds), next_step?, next_date?, risk? (low|medium|high), link? (https only), source? }`. `status` must be NOT STARTED, IN PROGRESS, ON HOLD, SUSPENDED or COMPLETED (closing/cancelling stays a normal project edit). Only `project_status`, `actual_site_progress_percent`, `po_number` and `po_date` change on the project (a PO date also sets `start_date`, as the project edit dialog does); the entry keeps the previous values (`previous_po_number` / `previous_po_date` when those were sent), and `latest_update` on the project holds the newest entry. Calcsheet status sync runs as for a normal edit.

### DELETE /api/projects/:id/updates/:updateId
The poster or a superadmin (never an agent key). Does not roll back status/progress; `latest_update` moves to the next newest entry.

The project page opens Post update directly with `/projects/:id?update=1`.

## Agent API keys

For TJ's scheduled Claude agents. A key (`agk_` + 64 hex) is sent as `Authorization: Bearer agk_...`. Only its SHA-256 hash is stored (`agent_keys`). The /api gate limits a key to `AGENT_ROUTES`: `GET /api/agent/projects`, `GET /api/agent/projects/:id`, `GET /api/agent/projects/:id/schedule`, `GET /api/agent/projects/:id/invoices`, `POST /api/agent/projects/:id/billing`, `POST /api/agent/projects/:id/payments`, `GET /api/agent/clients`, `GET|POST /api/agent/calcsheet/projects`, `GET|PUT /api/agent/calcsheet/projects/:id`, `POST /api/agent/calcsheet/projects/:id/quotations`, `PUT /api/agent/calcsheet/quotations/:id`, `GET|POST /api/projects/:id/updates`; every other route answers 403. Code: `server/agentAccess.js`. Agent posts show `posted_via: 'agent'` and the key's name as `posted_by`.

### GET /api/agent/projects
Compact project list: `id, ovp_number, po_number, po_date, project_name, account_name, with_acti, project_status, actual_site_progress_percent, start_date, completion_date, updated_completion_date, updated_contract_amount, contract_billed, project_director, remarks, latest_update, updated_at`. `?active=1` drops closed projects, except completed ones that are not fully billed.

### GET /api/agent/projects/:id
One project in the same compact view.

### GET /api/agent/projects/:id/schedule
The project's schedule tasks (`calcsheet_schedule_tasks` where `projectId` = `:id`), sorted as `GET /api/schedule-tasks` sorts them.

### GET /api/agent/projects/:id/invoices
`{ success, invoices }`, newest first: `id, project_id, invoice_no, type, pb_number, invoice_date, due_date, amount, amount_collected, collection_date, status (paid|partial|overdue|unpaid, computed), notes`.

### POST /api/agent/projects/:id/billing
Records an invoice in `invoices` (what Collections & AR reads). Body: `{ invoice_no (required, max 60), type (required: down payment|progress|final|retention), amount (required, > 0), date? (YYYY-MM-DD, default today), payment_terms_days? (0-365, default 30), due_date? (default date + terms), pb_number?, notes? (max 500), amount_collected?, collection_date? }`. Posting an `invoice_no` that already exists on the project (case-insensitive) updates that invoice instead of adding another, so retries are safe. The project's `contract_billed` and `amount_contract_billed_net` move by the change in invoice amount (hand-entered billing is preserved), and the billed percents and balance fields follow. Returns 201 (`created: true`) or 200 (`created: false`) with `{ invoice, project: { contract_billed, amount_contract_billed_net, updated_contract_balance_net } }`. 400 for bad input, 404 for an unknown project.

### POST /api/agent/projects/:id/payments
Records a payment received. Body: `{ invoice_no (required, must already exist on the project), amount (required, > 0), date? (default today), payment_ref? (max 80) }`. Adds to `amount_collected`, sets `collection_date`, and appends to the invoice's `payments` list. Re-posting the same `payment_ref` is a no-op (`duplicate: true`). A payment above the unpaid balance is a 400. Returns 201 with the updated `invoice` (its `status` becomes `partial` or `paid`).

### Proposals and calcsheets (agent)
Code: `server/agentCalcsheet.js`. Agents work on proposals in `draft` or `for_review` only; sent/won/lost and awarding stay with people (409 otherwise). The OneDrive proposal folder is not created; open the proposal in the app to create or link it. Responses carry a `url` to the page in the app.

#### GET /api/agent/clients
`{ success, clients: [{ id, code, name }] }` — no contact details. Use `id` or the 3-letter `code` as `customerId`.

#### GET /api/agent/calcsheet/projects · GET /api/agent/calcsheet/projects/:id
List of proposals (`id, code, name, location, date, customerId, status, opportunityGrade, notes, mainProjectId, createdByName, createdAt, updatedAt, url`), newest first. The single view adds `quotations` (full documents plus a computed `grandTotal` and `url`).

#### POST /api/agent/calcsheet/projects
Creates a proposal. Body: `{ name (required, max 200), customerId (required: client id or code), date? (YYYY-MM-DD, default today), location?, notes? (max 4000), status? (draft|for_review, default draft), opportunityGrade? (A|B|C) }`. The PCS code (`PCS{YYMM}{SEQ}-{CLI}-00`) comes from the shared `calcsheet_meta/seq` counter, as the app's New project does. 201 `{ project }`.

#### PUT /api/agent/calcsheet/projects/:id
`{ name?, location?, notes?, status? (draft|for_review), opportunityGrade? }`.

#### POST /api/agent/calcsheet/projects/:id/quotations
Creates a quotation seeded with the app's new-quotation defaults (30% product markup, 100% labor markup, IOCT: 5% EWT and Non-VAT, starter General Requirements rows unless `scopeCategory` is `supply`), then applies the body:
- `kind?` (IOCT|ACTI, default IOCT), `scopeCategory?` (supply|services|both, default both), `recipientId?` (default the proposal's customer), `revision?` (default `00`)
- Settings: `productMarkupPct, laborMarkupPct, generalReqMarkupPct, productContingencyPct, globalContingencyPct, ewtPct, discountPct, vatPct, nonVat, deliveryTermsEnabled, deliveryFee, validityDays, warrantyMonths, paymentTerms, deliveryTerms, preparedBy, preparedByTitle, authorizedBy, notes, dateSent, expectedPurchaseDate`, `terms: { scopeOfWork, exclusions, basisOfProposal, deliveryLines, warrantyExclusion }`
- `generalReqts[]`: `{ description, unitPrice, qty, uom, markupPct? }` (replaces the starter rows)
- `components[]`: `{ description, brand?, partNo?, qty, uom?, unitCost, forex? (default 1), contingencyPct?, discountPct?, markupPct?, leadTimeDays?, group?, subheader?, internalNote?, optional?, isHeader?, isChildHeader? }`
- `services[]`: `{ description, qty?, uom?, unitPrice?, amount? (default qty × unitPrice; the final price of the line), group?, subheader?, internalNote?, isHeader? }`
- `manpower[]`: `{ role, group (engineering|labor), headcount, mandays, dailyRate, allowance }`. When manpower is given, Engineering Services price from manpower; otherwise from the service lines' amounts.

Line ids and codes (`A-0010`, `B-0010`, `C-0010` …) are assigned by the server; at most 500 lines per section. 201 `{ quotation }` with `grandTotal`.

#### PUT /api/agent/calcsheet/quotations/:id
Same settings and line arrays as above; a line array that is sent replaces that whole section. `remarks?` is the change note. The prior state is saved to `calcsheet_quotation_versions` as an editor save is. 409 when the quotation is awarded (price-locked) or its proposal is past `for_review`.

### POST /api/agent-keys · GET /api/agent-keys · DELETE /api/agent-keys/:id
Superadmin login session only (never an agent key). POST `{ name }` returns the plain key once, plus a 12-character `id`. GET lists keys without the key itself. DELETE `:id` (that 12-character id) revokes the key; it stops working at once.

## Authorization Matrix

| Role | Projects | Clients | CA | Liquidation | Users | Suppliers | Payroll |
|---|---|---|---|---|---|---|---|
| **superadmin** | CRUD | CRUD | All | All | CRUD | CRUD | If TJC/RJR |
| **admin** | CRUD | CRUD | All | All | — | CRUD | If TJC/RJR |
| **user** | CRUD | CRUD | Own | Own | — | CRUD | If TJC/RJR |
| **viewer** | Read | Read | — | — | — | — | — |

**Note:** Payroll access is gated by **username** (`TJC` or `RJR`), not role. Any role with one of these usernames can access payroll.
Current production `TJC` and `RJR` records are approved superadmins.

Settings user management uses the existing `/api/users` endpoints. `PATCH /api/users/:id` accepts `username`, `email`, `full_name`, `designation`, `role`, `approved`, and optional `password`; blank/omitted password leaves the password unchanged. The server validates unique username/email, password length when provided, and protects against removing access from the last superadmin.
