# W2-04 · Events, pickup slots, registrations, waiting list, QR check-in

Owned paths: `app/Modules/Events/**`, `database/migrations/2026_01_12_*_events_*.php`, `database/factories/Events/**`, `lang/{ar,en}/events.php`, `resources/js/pages/{admin,member,public}/events/**`, `resources/js/features/events/**`, `tests/{Feature,Unit}/Events/**`, `docs/modules/events.md`. Test DB: `ev_test_4`. Spec §48–50, 108–110, 162, 279, 349.

## Data (day 12)
events (public_id, number EVT-…, type order_pickup/maintenance_day/community_meetup/technical_session/partner_event/other, status draft/published/ongoing/completed/cancelled, location_name, address, governorate_id, latitude/longitude, starts_at, ends_at, capacity, registration_opens_at/closes_at, allow_waitlist, requires_membership, partner_id?/service_center_id?, cover attachment, created_by) + event_translations (title, description, instructions) · event_slots (event_id, starts_at, ends_at, capacity, booked_count (read model), status open/full/closed) · event_registrations (public_id, event_id, slot_id?, user_id, membership_id, status registered/waitlisted/checked_in/checked_out/no_show/cancelled, order_ids jsonb? (pickup: link to orders selected), qr_token (opaque via QrService purpose 'event-checkin', or stored ulid), registered_at, cancelled_at, source) unique (event_id, user_id) active · event_waitlists (event_id, slot_id?, user_id, position, notified_at, expires_at, status waiting/offered/accepted/expired) · event_checkins (registration_id, checked_in_at, checked_in_by, checked_out_at, method qr/manual, notes).

## Rules
- Slot booking: `DB::transaction` + `lockForUpdate` on the slot; `booked_count < capacity` else waitlist (position) — 100 concurrent requests on capacity 50 → exactly 50 registered (test with sequential transactions + a unit test of the atomic update `UPDATE event_slots SET booked_count = booked_count + 1 WHERE id = ? AND booked_count < capacity`).
- Cancellation frees the slot and offers it to the first waiting member (notification, offer expires after `events.waitlist_offer_hours`); reschedule = cancel + book atomically; no-show marked by staff after the slot end.
- Event QR check-in token never contains personal data; verification via QrService or MembershipQr; duplicate check-in is idempotent.
- Pickup events: registration can select orders that are `ready`; the Deliveries module reads `EventRegistration::pickupOrders()` (public method) — keep the coupling to `orders` table optional (`Schema::hasTable`).
- Ops dashboard (live counters computed by queries): expected, checked-in, waiting, delivered / partial (from deliveries table if present), no-show, blocked due to payment (from orders outstanding if present), problem orders (flag column on registrations).

## Pages
- Public: `/{locale}/events` (upcoming list, filters by type/governorate), `/{locale}/events/{event}` (details, map via MapView, register CTA → login).
- Member: `/account/events` (my registrations, QR display for check-in, cancel/reschedule, waitlist status), register flow with slot picker (capacity remaining shown as available/full, never member lists).
- Admin: `/admin/events` (DataTable), create/edit (bilingual, slots generator: from/to, duration, capacity per slot e.g. 50 per 30 min), registrations tab (search member, status filters, mark no-show, manual check-in, export), `/admin/events/{event}/operations` (live ops dashboard with auto-refresh every 15 s via `usePoll`, counters + queue of expected members per slot), `/admin/events/{event}/check-in` (QrScanner page). Announcement audience `event_participants` registered with AnnouncementAudiences; KPI `events_upcoming`; reminders job (24h before) via Notify with dedup keys; exporter for registrations.

## Permissions
events.view (operations-manager, delivery-officer, support-agent, warehouse-officer), events.manage (operations-manager, content-manager), events.checkin (delivery-officer, warehouse-officer, operations-manager), events.export (operations-manager).

## Tests
capacity race (50 of 100), waitlist promotion on cancel, duplicate registration rejected, check-in idempotent + invalid/expired token rejected, IDOR on registrations (member A cannot cancel B's), permission checks, reminder dedup.
