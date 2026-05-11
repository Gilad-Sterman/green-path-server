# GreenPath — DB Migrations

## How to Run
Run each `001_` → `023_` file **in order** in the **Supabase SQL Editor**.
All files prefixed with `DEPRECATED_` must **NOT** be run — they are kept for reference only.

---

## Why the Old Files Were Replaced

The files prefixed `1777841539297xxx_` were carried over from the previous project (`greenpath_v2`) — a Vite + React + Supabase frontend-only SPA that was scrapped. They are fundamentally incompatible with the current architecture for the following reasons:

### 1. `organization_id` instead of `factory_id`
Every table used `organization_id` referencing an `organizations` table. The spec requires `factory_id` referencing `factories` as the core multi-tenancy key. The setup guide explicitly calls this out as a reason the old project was discarded.

### 2. RLS policies using `auth.uid()` — wrong for this architecture
All RLS policies used `auth.uid()` and a `user_organizations` junction table. Our architecture is **backend-only via service role key** — we use custom JWT auth through Express, not Supabase Auth. `auth.uid()` reads from Supabase Auth sessions, which we don't use. All those policies were dead/broken code.

**Correct RLS strategy:** Enable RLS on all tables with no client-facing policies. The Express server connects via the service role key, which bypasses RLS automatically. This prevents any direct client DB access while allowing full server-side control.

### 3. Wrong and missing table names
| Old (wrong) | New (correct per spec) |
|---|---|
| `organizations` | `factories` |
| `credits` | `credits_ledger` |
| `retroactive_certifications` | `retro_intakes` |
| `batch_inputs` | `batch_components` |
| `tg_definitions` | ❌ not in spec — removed |
| `retroactive_certification_documents` | ❌ not in spec — removed |

### 4. Tables entirely missing from old migrations
- `factories` — the core multi-tenancy table
- `products` — referenced by batches but never defined
- `shipment_items` — batch-to-shipment junction table
- `material_ledger_entries` — mass balance tracking
- `otp_codes` — custom OTP auth
- `refresh_tokens` — JWT refresh token store
- `support_tickets` — support module

### 5. Wrong/missing columns on nearly every table
Examples:
- `raw_material_intakes` was missing: `material_source`, `material_status`, `net_weight_kg`, `eligible_input_percent`, `eligible_weight_kg`, `delivery_note_number`, `data_entry_profile`, `location_status`
- `documents` was missing: `document_type`, `status`, `ocr_status`, `raw_ocr_payload`, `related_entity_type`, `related_entity_id`
- `flags` had wrong concept entirely (was a "flag definition" table, should be anomaly event records)
- `users` referenced `profiles` table (Supabase Auth pattern) instead of standalone `phone_number` auth

---

## New Migration Files (run in this order)

| File | Table | Notes |
|---|---|---|
| `001_create_shared_functions.sql` | — | `updated_at` trigger function |
| `002_create_factories.sql` | `factories` | Core multi-tenancy table |
| `003_create_users.sql` | `users` | Phone+OTP auth, role-based |
| `004_create_otp_codes.sql` | `otp_codes` | OTP code storage |
| `005_create_refresh_tokens.sql` | `refresh_tokens` | JWT refresh tokens |
| `006_create_suppliers.sql` | `suppliers` | |
| `007_create_customers.sql` | `customers` | |
| `008_create_products.sql` | `products` | Finished goods catalog |
| `009_create_documents.sql` | `documents` | With OCR fields |
| `010_create_raw_material_intakes.sql` | `raw_material_intakes` | |
| `011_create_batches.sql` | `batches` | |
| `012_create_batch_components.sql` | `batch_components` | Intake→Batch link |
| `013_create_shipments.sql` | `shipments` | |
| `014_create_shipment_items.sql` | `shipment_items` | Batch→Shipment link |
| `015_create_credits_ledger.sql` | `credits_ledger` | Append-only |
| `016_create_material_ledger_entries.sql` | `material_ledger_entries` | Mass balance tracking |
| `017_create_retro_intakes.sql` | `retro_intakes` | Retroactive intake |
| `018_create_flags.sql` | `flags` | Anomaly flags |
| `019_create_audit_log.sql` | `audit_log` | Append-only, no updates/deletes |
| `020_create_lab_tests.sql` | `lab_tests` | |
| `021_create_geofence_logs.sql` | `geofence_logs` | |
| `022_create_notifications.sql` | `notifications` | |
| `023_create_support_tickets.sql` | `support_tickets` | |
