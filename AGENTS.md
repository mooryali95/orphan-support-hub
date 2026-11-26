<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Protected reads
- Sponsorship dashboard joins use only permitted child card columns; private photos and locations stay behind the existing child-access gate.
- Dispatch queue totals use a dynamically loaded privileged client only after an authenticated `is_admin` check; this counts all recipients without exposing their notification rows.

## Ownership
- Render the hall title's platform logo with the shared `KahataynMark`, not a copied image or partner mark, so logo updates propagate automatically.
- The platform is WAMY's own (الندوة العالمية للشباب الإسلامي); the owner's names and its one identifying line live only in `src/config/brand.json` (`owner`) and are read through `brandFor`, which states ownership without claiming accreditation, audit or live integration.

## Demonstration boundaries
- Keep showcase geography and fictional child cards in a shared browser-safe demo module, separate from payable child IDs; this prevents sample data from entering financial workflows.
- Demo office records use an explicit name prefix and remain inactive until replaced by reviewed source data; this avoids implying accreditation or a live integration.
- Trial mode (`/try`) is removable with one command (`npm run trial:remove -- --apply`, `docs/trial-mode.ar.md`): every trial file is listed in `trial.manifest.json`, and real code never imports one — it reaches trial data through `useDataFn`/`registerDemo`, trial UI through `src/lib/trial-slots.ts`, and `/try` links through `trialRoute` behind `TRIAL_ENABLED` (`src/lib/trial-gate.ts`), so launch deletes files without editing real screens (locked by `trial-manifest.test.ts` and the CI `trial-removal` job).
- In the live hall (`/hall`) only the WAMY network and the directory's country counts (`hallDirectory`) are real; every panel of regions, funding, payment or impact carries the sample chip from `src/lib/hall/live.ts` and says "simulated", so sample figures never pass as results.

## Support selections
- Preserve valid recipients and user-edited amounts across same-place map, catalog, and auth updates; only the existing place-keyed card starts a fresh support sheet, preventing silent pledge changes.

## Support destinations
- Training and in-kind support targets follow `countries.in_network` (WAMY office/field countries on the main map) or `active`; keep that flag in sync with `src/data/wamy-network.ts` so the map and support form show one country list.

## Supporter assistant
- Use the streaming AI SDK Responses boundary with request-local gateway correlation and authenticated, rate-limited access; this keeps credentials server-only and prevents unbounded AI spending.
- Ground answers in an anonymous `orphan_view` projected through an explicit public-card allowlist and published guidance, never caller-authorized details or privileged child reads; this preserves child privacy even for admin callers.
- Keep one session-only conversation and durable server-only access-denial state; this avoids storing donor questions and prevents automatic replay after provider or credit blocks.

## Golden record
- WAMY is the primary source and the office operating platform verifies; authority is per field in `field_authority`, mirrored by `FIELD_RULES` in `src/lib/golden-record.ts` (locked by its test), so neither source silently overrides the other.
- Each country's office platform moves `none` → `shadow` → `active` through `admin_country_source_set`, which re-evaluates stored observations; never write `orphan_field_state` or orphan identity columns around `golden_evaluate`, so critical fields keep human approval and the sponsorship lock.
- Unlinked records wait in `source_link_queue`; files are created only from WAMY records and only by an admin, so names never auto-merge children.
- Source comparison and link matching run on `golden_canon` text, and every observation passes the `golden_detect` trigger; keep new comparisons on canonical text so spelling variants never become conflicts and tampering always raises an alert.
- Sponsors see only `public_verification` (three levels and a month); alert reasons and field values stay admin-only, preserving child privacy.

## Core countries
- The real mode shows only `countries.live_focus` (Sri Lanka, Pakistan with Kashmir as a `country_regions` row, Thailand, Sudan, Senegal) via `public_focus_countries`; the trial keeps the whole network with sample data, so real and sample geography never mix.
- Country presence (code, name, presence) lives once, hand-edited, in `src/data/wamy-presence.ts`; need indicators and context live in `WAMY_NEED` in `src/data/wamy-network.ts`, which builds `WAMY_COUNTRIES` from both (checked by `wamy-presence.test.ts` and `node scripts/gen-wamy-presence.mjs`). Vision pages import presence only, so they stay within the 385KB page budget and the hall carries the data once.
- Sri Lanka and Pakistan entries in `src/data/wamy-network.ts` rest on WAMY management's statement (no public URL); replace `source`/`url` with the official source when supplied, keeping the `in_network` migration list in sync.
- Country teams (`country_staff`: supervisor, data_entry, viewer) reach the verification layer only through `country_can`, checked before an item's status so other countries learn nothing; critical changes and alerts are settled by someone other than their uploader (`received_by`, `raised_by`), so no single staff member can push and approve the same change. Admins are not exempt (`20261128100000`): an admin's own critical upload is settled by another admin or a country supervisor.
- New sponsorships pass `golden_accepts_new_support` (insert trigger, both suggestion functions, `public_verification.accepts`); keep it an indexed check that matches `golden_trust` (locked by `golden-gate-verification`), so flagged files never take new money and suggestions stay fast at 10,000 files.

## WAMY sign-in
- WAMY's platform launches users into Kahatayn with a short-lived signed token to `/api/sso/wamy` (`src/lib/sso/launch-token.ts`, `docs/wamy-sso.ar.md`): single-use `jti`, identities bound by WAMY `sub` in `sso_identities`, session handed over in the URL fragment, and no role granted by the token, so a stolen link or a reused email never yields access beyond the country team and admin roles.
