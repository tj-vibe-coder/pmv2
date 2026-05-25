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

Update a project. Only send fields that changed.

```
PUT /api/projects/proj001
Content-Type: application/json

{
  "project_status": "CLOSED",
  "actual_site_progress_percent": 100
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
