# Manual QA checklists (run before every release; record results in docs/qa/results/<date>.md)

## Accessibility (WCAG 2.1 AA, critical pages: home, store list/product, cart/checkout, login/register, member dashboard, My Garage, payments, membership card, admin lists/forms, partner bookings)
- [ ] Every interactive element reachable and operable by keyboard; visible focus ring; logical focus order in both directions (RTL/LTR)
- [ ] Dialogs/drawers trap focus, close with Esc, return focus to the trigger
- [ ] Every input has a programmatic label; errors are announced and associated (`aria-describedby`)
- [ ] Text contrast ≥ 4.5:1 (check brand accent on white, badges, muted text); non-text contrast ≥ 3:1
- [ ] Skip-to-content link works; landmarks (header/nav/main/footer) present; page `<title>` set per page
- [ ] Status badges/icons convey meaning with text, not colour alone; charts have data tables or summaries
- [ ] Zoom 200 % and 320 px reflow without loss; no horizontal scroll on critical pages
- [ ] Screen reader pass (NVDA/VoiceOver) on login, checkout, membership card, payment submission

## RTL / Arabic
- [ ] Sidebar on the right, breadcrumbs/pagination/steppers mirrored, chevrons rotated, tables aligned start
- [ ] Mixed Arabic/English text renders correctly; SKU, VIN, part numbers, phone numbers, tracking numbers, amounts stay LTR (`<Code>`, `.code`)
- [ ] Forms: labels/placeholders/errors in Arabic; date pickers and selects usable; number inputs accept Latin digits
- [ ] Modals, tooltips, dropdowns, toasts positioned correctly; charts legends readable
- [ ] Emails and PDFs (receipt, statement, order summary, service report) render Arabic with Cairo, correct shaping, page breaks, long product names
- [ ] No raw translation keys anywhere (search for `.` separated lowercase tokens in the UI); English UI complete as well

## Browser & device matrix (latest 2 versions)
| Platform | Chrome | Safari | Edge | Firefox |
|---|---|---|---|---|
| Windows desktop/laptop | ☐ | – | ☐ | ☐ |
| macOS | ☐ | ☐ | – | ☐ |
| iPhone (Safari iOS) — camera QR, uploads, forms, RTL | – | ☐ | – | – |
| Android (Chrome) — camera QR, uploads, forms | ☐ | – | – | – |
| Tablet (iPad/Android) — admin & partner portals usable | ☐ | ☐ | – | – |

Widths to test: 360 px, 390/393 px, 768 px, 1024 px, 1366 px, 1920 px. Fail criteria on critical pages: unintended horizontal overflow, unclickable controls (< 44 px touch targets), hidden primary actions, forms leaving the viewport.

## QR & scanning
- [ ] Membership QR scans in bright outdoor light, normal indoor light, from a phone screen at 3 sizes and from a printed card
- [ ] Invalid QR → no action; expired token → rejected with message; single-use token used twice → rejected; rotated card invalidates the old QR
- [ ] Duplicate scan from two devices at pickup → second device sees "already delivered" state
- [ ] Camera permission denied → manual code entry works

## Security spot checks
- [ ] Change ids in URLs (order, payment, receipt, vehicle, ticket, document, booking, delivery) → 403/404
- [ ] Private document URLs cannot be guessed (ULIDs) and require login + ownership
- [ ] Rate limits: login (5/min), password reset, support ticket creation, station reports, uploads, search
- [ ] Response headers: CSP, HSTS (prod), nosniff, frame-ancestors none, referrer policy

## Localization parity (automated in CI, verify manually once per release)
- [ ] `lang/ar` and `lang/en` key sets identical; validation messages localized; enum labels localized
