# W2-10 · Surveys & polls with targeting

Owned paths: `app/Modules/Surveys/**`, `database/migrations/2026_01_22_0006*_surveys_*.php`, `database/factories/Surveys/**`, `lang/{ar,en}/surveys.php`, `resources/js/pages/{admin,member}/surveys/**`, `resources/js/features/surveys/**`, `tests/{Feature,Unit}/Surveys/**`, `docs/modules/surveys.md`. Test DB: `ev_test_10`. Spec §111–112, 176.

## Data (day 22)
surveys (public_id, kind survey/poll, title/description translations `survey_translations`, status draft/active/closed/archived, starts_at, ends_at, is_anonymous, allow_multiple_responses false, show_results_to_members bool, created_by) · survey_questions (survey_id, sort, type single_choice/multiple_choice/rating/text/yes_no, prompt translations `survey_question_translations`, is_required, settings jsonb (rating scale, max choices)) · survey_options (question_id, sort, label translations `survey_option_translations`, value) · survey_targets (survey_id, audience_type all_members/vehicle_make/vehicle_model/group_buy_participants/event_participants/specific_members/segment, params jsonb) · survey_responses (survey_id, user_id nullable when anonymous (store a hash for uniqueness), submitted_at, locale) unique (survey, user) unless multiple allowed · survey_answers (response_id, question_id, option_id?, value_text?, value_number?).

## Rules
- Targeting reuses `AnnouncementAudiences` resolvers (all members, make, model, specific members + pluggable ones) so the audience logic lives in one place; a member sees a survey only if in the audience and the survey is active; anonymous surveys never store user_id (store sha256(user_id + survey_id + app key) to prevent duplicates).
- Polls are for organisation (e.g. choosing an event date, interest in a part); results are shown as counts/percentages and explicitly labelled "not a purchase commitment" (translation key); optional public results to members.
- Validation per question type; required questions enforced server-side; closing date enforced; responses immutable after submission (edit allowed until closed? no — one submission).
- Announce a survey to its audience via Notify (dedup per survey); results export (CSV) and admin analytics (per question distribution, response rate = responses / audience size).

## Pages
- Member: `/account/surveys` (available & completed), `/account/surveys/{survey}` (form; poll results view when allowed).
- Admin: `/admin/surveys` (DataTable), builder (questions/options editor bilingual, targeting with estimated audience count, schedule), results page (charts via Recharts using the dataviz palette conventions, per-question tables), export, close/archive. KPI `surveys_active`.

## Permissions
surveys.view (operations-manager, content-manager, support-agent), surveys.manage (operations-manager, content-manager), surveys.export (operations-manager).

## Tests
audience gating (non-target member gets 403/404), required validation, duplicate submission blocked (incl. anonymous hash), closed survey rejects, results math (percentages), export permission, poll disclaimer key present in both locales.
