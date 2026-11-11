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

## Demonstration boundaries
- Keep showcase geography and fictional child cards in a shared browser-safe demo module, separate from payable child IDs; this prevents sample data from entering financial workflows.
- Demo office records use an explicit name prefix and remain inactive until replaced by reviewed source data; this avoids implying accreditation or a live integration.

## Support selections
- Preserve valid recipients and user-edited amounts across same-place map, catalog, and auth updates; only the existing place-keyed card starts a fresh support sheet, preventing silent pledge changes.

## Support destinations
- Training and in-kind support targets follow `countries.in_network` (WAMY office/field countries on the main map) or `active`; keep that flag in sync with `src/data/wamy-network.ts` so the map and support form show one country list.
