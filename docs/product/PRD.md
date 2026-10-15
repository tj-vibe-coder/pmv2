# Product Requirements Document

## Product Summary

pmv2 is a web-based operations platform for IOCT (IO Control Technologie OPC), an industrial automation startup. It centralizes project monitoring, expense management, procurement, reporting, utilities, and payroll into a single dashboard with role-based access.

## Operating Context: IOCT–ACTI Commercial Workflow

IOCT and ACTI must be treated as distinct commercial parties in the app, even when they work on the same opportunity or project. The current sales workflow can carry parallel IOCT and ACTI quotations for one opportunity; operational projects are created under IOCT once the work proceeds.

The documented working context is that ACTI may carry the customer-facing quotation while IOCT performs work and invoices ACTI for its subcontracted scope. Therefore, IOCT's internal revenue, receivables, statements of account, invoices, expenses, and project reporting must not automatically be equated with ACTI's customer-facing price or records.

Additionally, projects are frequently awarded to ACTI directly, and IOCT initiates or even completes execution before an IOCT quotation is finalized or an ACTI Purchase Order (PO) is received. Operational workflows (project creation, site execution, expense tracking, invoicing, and statements of account) must therefore support projects in flight or completed without treating upfront PO numbers or pre-existing quotations as hard blocking gates.

Future finance and invoicing work must preserve this distinction:

- Support statements of account from IOCT to ACTI for the relevant billed and collectible IOCT work.
- Support projects and billing workflows where work progresses or finishes prior to formal quotation submission or PO issuance by ACTI.
- Reconcile invoices and receivables that were issued, received, or otherwise tracked outside PMV2, without silently omitting them or double-counting them after later capture.
- Retain clear company attribution, source/evidence, and reconciliation status for cross-company financial records.
- Keep IOCT-to-ACTI commercial records separate from the end-customer relationship and from either company's own internal bookkeeping.

This is confirmed business context, not yet a finalized accounting workflow or data model. Do not infer legal ownership, tax treatment, payment terms, invoice direction for every case, or consolidation rules until the business process is documented further.

## Target Users

- **RJR / Reuel (Solutions Manager)** — superadmin, manages users, approvals, quotations, projects, reports, and payroll
- **TJC / TJ (General Manager)** — superadmin, manages users, operations, projects, and payroll
- **Renzel (Engineering Manager)** — project director, views and updates project progress
- **Nylle (Admin/Compliance)** — admin/compliance, manages EHS documents and utilities
- **External viewers** — read-only access to project dashboards

## Main Use Cases

- Monitor project financial health (contract value, billing, backlogs) from a single dashboard
- Build sales quotations in Calcsheet using managed pricelists and prior quotation pricing evidence
- Track cash advances and liquidations with balance management
- Manage the procurement pipeline (material requests → purchase orders → delivery receipts)
- Generate and print project reports (progress, service, completion certificates)
- Load, update, and delete saved progress/service reports without duplicating existing reports
- Compute payroll with Philippine Labor Code compliance (OT premiums, SSS/PhilHealth/Pag-IBIG, withholding tax)
- Generate printable payslips in CMR Philippines format
- Store project attachments in OneDrive with automatic folder management
- Generate company ID cards with barcodes
- Manage EHS documentation (safety certificates, manuals, OSH programs)

## Core Features

### Feature 1: Project Monitoring Dashboard

Description: Interactive dashboard with KPI cards (total projects, contract value, backlogs, outstanding balance), charts (financial performance S-curve, status distribution pie chart), sortable/filterable project table with 50+ fields, CSV/XLSX import/export, and bulk operations.

Acceptance Criteria:
- KPI cards update in real time when filters change
- Projects table supports multi-column sorting
- Search filters across project name, client, and reference numbers
- CSV export includes all 50+ project fields
- Bulk delete with confirmation dialog
- Import supports CSV and Excel from legacy data

### Feature 2: Expense Management (CA + Liquidation)

Description: Cash advance request/approval workflow with linked liquidation forms. Tracks balance remaining per CA, auto-adjusts when liquidations are submitted or deleted.

Acceptance Criteria:
- Users can request cash advances with itemized breakdown
- Users can edit their own pending CA requests (project/purpose, request date, and breakdown). Superadmins can also edit approved requests; amount changes preserve already-liquidated funds by adjusting the remaining balance by the amount difference. Closed CA amounts remain fixed to preserve settlements.
- Admins can approve or reject CAs
- Liquidations can link to an approved CA
- Submitting a liquidation deducts from the CA balance
- Deleting a liquidation restores the CA balance
- Liquidations can be saved as drafts and submitted later
- Submitted liquidations expose **Receipts reviewed**, **Reviewed by** and **Review date** for a manual receipt-by-receipt check against original/scanned receipts. RJ records authenticated identity and actual review date after physical handover, with optional notes and explicit possession/check confirmation; prior paper reviews can be recorded with their actual date.
- Receipt review is separate from payment/approval status. Saved form or receipt-link changes require a new review while preserving previous reviewer/date/history. Draft/pending edits block new attestations. Review withdrawal requires a reason.
- Liquidation row controls align at the top beside multiline Particulars.
- Receipt photos selected for scanning, batch capture or row attachment receive an automatic Gemini crop suggestion before confirmation. Employees can adjust corners or retain the full photo. Unavailable/invalid AI suggestions fall back to local detection/full photo; PDFs bypass image cropping. Crop suggestions never approve expenses or alter accounting.
- Liquidation rows may default to oldest-to-newest, but every physical item has a fixed reference keyed to its permanent row ID. Dates, amount sorting, edits, screen/PDF/XLSX order, receipt captions and reimbursement views must never renumber physical items. Legacy references use the verified current chronological print order frozen before correction, not stored array positions; new items receive unique non-reused numbers. New receipt names include stable item reference where allocated, form/date/details and a unique suffix. See ADR-0005; initialize legacy forms individually with saved-content/mapping guards.
- Auto-generated form numbers (LQ-XXXX)

### Feature 3: Procurement Suite

Description: Material request forms, order tracking, delivery receipts, supplier/product management, purchase orders, and cost estimates. Full procure-to-pay flow.

Acceptance Criteria:
- Suppliers can be managed with nested products
- Purchase orders link to projects and suppliers
- Delivery receipts track received items
- Material requests support status tracking
- Estimates support bill of materials (BOM)

### Feature 4: Payroll Module

Description: Employee master data, payroll run wizard (4-step: period setup → DTR entry → preview → approve), payslip generation, government contribution computation, and PH holiday management.

Acceptance Criteria:
- Two employee types: FIELD (daily rate) and OFFICE (monthly rate)
- OT computation follows PH Labor Code (regular 125%, rest day 130%×130%, regular holiday 200%×130%)
- Auto-computes SSS, PhilHealth, Pag-IBIG, and TRAIN Law withholding tax
- Payslip matches CMR Philippines format
- Payslip is printable with clean layout (no nav, no sidebars)
- Payroll access restricted to TJC and RJR only
- Payroll nav item hidden from unauthorized users

### Feature 5: Reports & PDF Generation

Description: Progress reports, service reports, certificates of completion, and OneDrive attachment management. All PDFs use the IOCT branding and icon logo.

Acceptance Criteria:
- Progress report PDF with project data
- Service report PDF with table of activities/findings and remarks
- Completion certificate PDF
- OneDrive file attachments per project
- PDFs auto-upload to OneDrive project folder when configured
- Saved service reports update in place after loading; saved service/progress reports can be deleted
- Prepared-by names/designations in reports follow the current logged-in user account when applicable

### Feature 6: Settings & User Management

Description: Superadmin-only settings area for managing application users, approvals, account identity, company position, access role, email, and password resets.

Acceptance Criteria:
- User Management is available under Settings for superadmins
- Superadmins can update username, email, name, company position, access role, approval status, and password
- Password reset leaves the existing password unchanged when the field is blank
- The app protects against removing access from the last superadmin

### Feature 7: Sales Calcsheet & Historical Product Pricing

Description: Sales users create IOCT/ACTI quotations, price component lines, and reuse product information from either the managed Pricelists catalog or a separate read-only Quotation History catalog built from current quotation records.

Acceptance Criteria:

- Add Product presents separate **Pricelists** and **Quotation History** tabs; historical quotation rows are never merged into the managed catalog
- Quotation History is searchable and filterable and identifies the source project, quotation reference, project status, quotation date, normalized cost, and quoted selling price
- Historical observations come from current `calcsheet_quotations` only; version snapshots are excluded
- Selecting a historical product preserves an immutable source snapshot on the new component line
- Quotation-level and component-level expected purchase dates are valid calendar dates on or after Date Sent
- The system suggests contingency from validated comparable price history, preferring quarterly evidence and using annualized growth only when quarterly evidence is insufficient
- Unrelated, blank-identity, invalid-date, future-date, non-positive-price, incompatible-UOM, and robust outlier observations do not influence the suggestion
- A user must explicitly apply a ready suggestion; insufficient history is reported honestly and does not invent a percentage
- Changing the target purchase date or confirmed candidate evidence immediately invalidates any previous suggestion
- Historical source snapshots remain internal Calcsheet evidence and are not serialized into customer PDF/XLSX exports

## User Roles

| Role | Description | Permissions |
|---|---|---|
| **superadmin** | Full system access | All modules, settings/user management, approvals, payroll (if TJC/RJR) |
| **admin** | Operational access | Projects, expenses, procurement, reports, utilities, payroll (if TJC/RJR) |
| **user** | Standard access | Projects, own expenses, procurement, reports, payroll (if TJC/RJR) |
| **viewer** | Read-only | Dashboard view only |

**Note:** Payroll access is username-based (`TJC` or `RJR`), not role-based.
Current production records for `TJC` and `RJR` are approved superadmins.

## Out of Scope

- Project cost allocation to payroll (future)
- Real-time notifications (email/SMS)
- Mobile native app
- Customer-facing portal
- Multi-tenancy (multiple company accounts)
- Automated billing/invoicing (manual process)
- Time tracking / clock-in system (DTR is manually entered)

## Future Ideas

- Firebase Auth migration (replace custom auth)
- Automated payroll bank file generation
- Client portal for project status viewing
- Mobile-responsive DTR entry (field workers)
- Integration with accounting software
- Forecasting with real data (currently static/mock)
- Email notifications for CA approval/rejection

## Open Questions

- Should the custom auth system be replaced with Firebase Auth?
- Should supplier management move to incremental CRUD instead of bulk-replace?
- Is there a need for project cost allocation to track profitability per project?
- Should payroll be expanded to include 13th month and annualization?
- What is the complete IOCT-to-ACTI statement-of-account and invoice-reconciliation workflow, including the source evidence, approval, matching, and exception handling for invoices not originally captured in PMV2?


### Invoice supporting documents and 2307 evidence (first release)

Collections and the Sales EWT register expose multiple typed invoice documents: Service Invoice, IOCT Collection Receipt, customer Counter Receipt, BIR2307, payment proof, deposit slip and supporting pack. Existing scans/packs remain available. One stored file may be linked to several invoices, with source/reference/date, revision checks and reasoned link history. Evidence attachments never record cash or recognize WHT.

2307 review records printed base, withholding, period, ATC/description, observed calculation, flags and evidence allocations independently from actual booked WHT. Received/expected history and direct standalone-document availability are shown separately. Review supports unreviewed/matched/discrepancy/resolved; resolved requires a retained note. Admins/superadmins manage invoice evidence; tax filers manage 2307 evidence only; ordinary users/viewers have read-only evidence access. See ADR-0002 and FINANCE_SUPPORT_PLAN for scope and rollout.

First-release implementation is local; production release checks remain pending. Incoming-payment accounting/dates, outgoing/payroll evidence and missing-support review follow as separate releases.


### Physical liquidation receipts, RJ review and closure

Staff can record handover of the printed form and physical receipt copies to RJ. RJ confirms receipt while reviewing the current saved form version. Liquidation/reimbursement closure requires current physical submission and RJ review, plus paid reimbursement where due. Returned copies, changed forms, withdrawn reviews or pending edits keep the workflow open and preserve previous history.

Normal reimbursement payment requires review. An approved admin can record an urgently needed earlier payout with an explicit reason; payment remains separate from documentary closure. Paid claims awaiting physical/RJ follow-up remain visible, show zero remaining cash due and cannot be selected for payment again. Existing financial history and CA settlement are preserved. Only the approved RJR admin/superadmin account performs RJ review.
