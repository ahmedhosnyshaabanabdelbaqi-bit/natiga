# Findings from the preview screenshot run (commit de2276e)

For the integrator and the design director. Screenshots: `docs/screenshots/preview/`.

- [x] `backend/.gitignore` rule `storage/` also ignored `src/providers/storage/**` (source files were missing from git). Fixed: rule is now `/storage/`.
- [ ] `backend/src/modules/stations/services/station-admin.service.ts`: unused imports `PaginatedResponse`, `CreateStationDto` break `npm run typecheck`.
- [ ] `IMPLEMENTED_FEATURES` in `backend/src/modules/settings/settings.types.ts` is empty, so `/app-config` turns every feature flag off and the app shows only Home + Account. Add each feature as it becomes real (news, cars, compare, charging, tours, …) so the 5-tab layout appears.
- [ ] Arabic bidi: mixed LTR fragments render in the wrong order — app version shows "1+1.0.0", design-kit stats show "km 480", "80%–10", "kW DC 135". Wrap numbers/units/version strings in LTR isolation (`Directionality`/Unicode FSI…PDI or `⁦…⁩`) in the shared formatters/widgets.
- [ ] Settings: the theme segment label "حسب الجهاز" wraps to two lines at 390 px width.
- [ ] Web preview only: the "معاينة ويب" corner banner covers app-bar icons; `web/index.html` sets `dir="rtl"`, which misplaces Flutter's semantics overlay — leave `<html>` without dir and let Flutter handle direction.
