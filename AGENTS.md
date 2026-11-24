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
- In the live hall (`/hall`) only the WAMY network and the directory's country counts (`hallDirectory`) are real; every panel of regions, funding, payment or impact carries the sample chip from `src/lib/hall/live.ts` and says "simulated", so sample figures never pass as results.

## Support selections
- Preserve valid recipients and user-edited amounts across same-place map, catalog, and auth updates; only the existing place-keyed card starts a fresh support sheet, preventing silent pledge changes.

## Support destinations
- Training and in-kind support targets follow `countries.in_network` (WAMY office/field countries on the main map) or `active`; keep that flag in sync with `src/data/wamy-network.ts` so the map and support form show one country list.

## Supporter assistant
- Use the streaming AI SDK Responses boundary with request-local gateway correlation and authenticated, rate-limited access; this keeps credentials server-only and prevents unbounded AI spending.
- Ground answers in an anonymous `orphan_view` projected through an explicit public-card allowlist and published guidance, never caller-authorized details or privileged child reads; this preserves child privacy even for admin callers.
- Keep one session-only conversation and durable server-only access-denial state; this avoids storing donor questions and prevents automatic replay after provider or credit blocks.
