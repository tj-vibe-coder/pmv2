# Product Requirements Document

## Product Summary

pmv2 is a web-based operations platform for IOCT (IO Control Technologie OPC), an industrial automation startup. It centralizes project monitoring, expense management, procurement, reporting, utilities, and payroll into a single dashboard with role-based access.

## Target Users

- **RJR / Reuel (Solutions Manager)** — superadmin, manages users, approvals, quotations, projects, reports, and payroll
- **TJC / TJ (General Manager)** — superadmin, manages users, operations, projects, and payroll
- **Renzel (Engineering Manager)** — project director, views and updates project progress
- **Nylle (Admin/Compliance)** — admin/compliance, manages EHS documents and utilities
- **External viewers** — read-only access to project dashboards

## Main Use Cases

- Monitor project financial health (contract value, billing, backlogs) from a single dashboard
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
- Admins can approve or reject CAs
- Liquidations can link to an approved CA
- Submitting a liquidation deducts from the CA balance
- Deleting a liquidation restores the CA balance
- Liquidations can be saved as drafts and submitted later
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
