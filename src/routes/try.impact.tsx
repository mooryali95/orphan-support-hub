import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ChildStanding } from "@/components/impact/ChildStanding";
import { ImpactMoment } from "@/components/impact/ImpactMoment";
import { MyChildrenNow } from "@/components/impact/MyChildrenNow";
import { MyImpactHero } from "@/components/impact/MyImpactHero";
import { ActionStrip } from "@/components/sponsorship/ActionStrip";
import { ChildCards, NoSponsorships } from "@/components/sponsorship/ChildCard";
import { CelebrateOverlay } from "@/components/kit/Celebrate";
import { TryKindPanel, TryKindSwitch, TrySupportImpact } from "@/components/try/TryImpactKinds";
import { TryFollowUpStrip, TryGiftFollowUp } from "@/components/try/TryGiftFollowUp";
import { TryJourneyAhead } from "@/components/try/TryJourneyAhead";
import { TryRealInvite, TryVirtualNote } from "@/components/try/TryRealInvite";
import { TryShareCard } from "@/components/try/TryShareCard";
import { SampleBadge } from "@/components/impact/SupportImpactParts";
import { Button } from "@/components/ui/button";
import { pageTitle } from "@/config/brand";
import type { GivingTrack } from "@/config/giving-tracks";
import { impactMoments } from "@/lib/impact-evidence";
import { myImpact } from "@/lib/my-impact";
import { copyOf, defineCopy, dirOf, useCopy, useLocale } from "@/lib/locale";
import { trialRoute } from "@/lib/trial-gate";
import {
  giftsAsSponsorships,
  loadGifts,
  localTryChild,
  TRY_EVENT,
  tryChild,
  type TryGift,
} from "@/lib/try-demo";
import { tryEvidence } from "@/lib/try-evidence";
import { trySponsorships } from "@/lib/try-sponsor-center";
import { loadPledges, tryInKind, tryQualification, type TryPledge } from "@/lib/try-support";

/**
 * the kinds in the order the impact page shows them. Spelled here, not imported: the search
 * validation runs in the entry bundle, and must not pull the giving copy into it.
 */
const KINDS: readonly GivingTrack[] = ["monthly", "qualification", "in_kind"];

export const Route = createFileRoute("/try/impact")({
  validateSearch: (raw: Record<string, unknown>): { done?: string; kind?: GivingTrack } => ({
    ...(typeof raw["done"] === "string" ? { done: raw["done"] } : {}),
    ...(KINDS.includes(raw["kind"] as GivingTrack) ? { kind: raw["kind"] as GivingTrack } : {}),
  }),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return { meta: [{ title: pageTitle(copyOf(COPY, l).pageTitle, false, l) }] };
  },
  component: TryImpact,
});

const COPY = defineCopy("routes/try.impact", {
  ar: {
    pageTitle: "أثري · جرّب المنصّة",
    celebrateTitle: (name: string) => `من اليوم، انتهى انتظار ${name}`,
    celebrateDedication: (name: string) => `صدقةٌ جارية عن ${name}، تقبّلها الله.`,
    celebrateText: "بدأ عطاؤك. كل شهرٍ ترى متى حُوِّل ومتى وصل بمستند، وهذه صورة أثرك الآن.",
    see: "شاهد أثرك",
    title: "أثري",
    lead: "أثر عطاءاتك في هذه التجربة، كما يراه الداعم في لوحته.",
    gifts: "عطاءاتك",
    statement: "سجلّ التبرّعات (محاكاة)",
    payDemo: "الدفع في التجربة محاكاة، فلا يُفتح بابٌ للدفع ولا يُحصَّل شيء.",
    dedication: (name: string) => `صدقةٌ جارية عن ${name}`,
  },
  en: {
    pageTitle: "My impact · Try the platform",
    celebrateTitle: (name: string) => `From today, ${name} no longer waits alone`,
    celebrateDedication: (name: string) =>
      `Ongoing charity on behalf of ${name}. May God accept it.`,
    celebrateText:
      "Your giving has begun. Each month you will see when it was transferred and when it was delivered, with a receipt. This is your impact today.",
    see: "See your impact",
    title: "My impact",
    lead: "The impact of your gifts in this trial, as a supporter sees it on their dashboard.",
    gifts: "Your gifts",
    statement: "Record of donations (simulated)",
    payDemo: "Payment in the trial is simulated, so no checkout opens and nothing is charged.",
    dedication: (name: string) => `Ongoing charity on behalf of ${name}`,
  },
});

/** «أثري» التجربة: الصورة الحقيقية نفسها، مبنيّةً من عطاءات الزائر المحاكاة في متصفّحه. */
function TryImpact() {
  const { done, kind } = Route.useSearch();
  const locale = useLocale();
  const c = useCopy(COPY);
  const local = (id: string) => {
    const k = tryChild(id);
    return k ? localTryChild(k, locale) : undefined;
  };
  const navigate = useNavigate();
  const [gifts, setGifts] = useState<TryGift[] | null>(null);
  useEffect(() => {
    const read = () => setGifts(loadGifts());
    read();
    window.addEventListener(TRY_EVENT, read);
    return () => window.removeEventListener(TRY_EVENT, read);
  }, []);
  const [pledges, setPledges] = useState<TryPledge[] | null>(null);
  useEffect(() => {
    const read = () => setPledges(loadPledges());
    read();
    window.addEventListener(TRY_EVENT, read);
    return () => window.removeEventListener(TRY_EVENT, read);
  }, []);
  /* the kind on show: the link's, else the financial one, else the first kind the visitor has */
  const [picked, setPicked] = useState<GivingTrack | null>(kind ?? null);
  useEffect(() => {
    if (kind) setPicked(kind);
  }, [kind]);
  const doneGift = done ? gifts?.find((g) => g.childId === done) : undefined;
  /* the celebration answers a gift that exists: a shared or stale `?done=` link celebrates nothing */
  const doneChild = doneGift ? local(doneGift.childId) : undefined;
  /* «قدّم شهراً»: the same gifts read as they will stand `ahead` months from now (not stored) */
  const [ahead, setAhead] = useState(0);
  /* whole months as «أثري» counts them (30.44 days), plus an hour so the n-th month has fully
     passed: the hero, the milestones and the record then all say the same number */
  const then = new Date(Date.now() + ahead * 30.44 * 86_400_000 + 3_600_000);
  const impact = myImpact(giftsAsSponsorships(gifts ?? [], locale), then);
  const rows = tryEvidence(gifts ?? [], ahead, locale);
  /* the gifts as sponsorships, with what the visitor changed in «إدارة الكفالة» (re-read on every
     TRY_EVENT through `gifts`); the cards then read each ledger through the data port */
  const list = gifts ? trySponsorships(locale) : [];
  const ready = gifts !== null;
  // no payment in the trial: «ادفع الآن» says it is simulated and opens nothing
  const onPay = () => void toast.message(c.payDemo);
  const waited = Object.fromEntries(
    (gifts ?? []).map((x) => [x.id, tryChild(x.childId)?.waitingDays ?? 0]),
  );
  const qualification = tryQualification(pledges ?? [], then, locale);
  const inKind = tryInKind(pledges ?? [], then, locale);
  const counts: Record<GivingTrack, number> = {
    monthly: gifts?.length ?? 0,
    qualification: qualification.length,
    in_kind: inKind.length,
  };
  const tab: GivingTrack =
    picked ??
    (gifts === null || pledges === null
      ? "monthly"
      : (KINDS.find((k) => counts[k] > 0) ?? "monthly"));

  return (
    <>
      {doneChild && (
        <CelebrateOverlay
          grand
          title={c.celebrateTitle(doneChild.name)}
          text={
            <>
              {doneGift?.dedication && (
                <span className="mb-2 block font-bold text-bridge-ink">
                  {c.celebrateDedication(doneGift.dedication)}
                </span>
              )}
              {c.celebrateText}
              <TryVirtualNote className="mt-3 block text-sm text-muted-foreground" />
            </>
          }
          action={c.see}
          onClose={() => void navigate({ to: "/try/impact", search: {}, replace: true })}
        />
      )}
      <h1 className="text-4xl leading-[1.3] font-bold md:text-5xl">{c.title}</h1>
      <p className="mt-3 text-base leading-8 text-muted-foreground">{c.lead}</p>

      {/* the child is the hero: who you care for, how their month stands, what changed */}
      {list.length > 0 && <MyChildrenNow list={list} sample className="mt-8" />}

      <TryKindSwitch kinds={KINDS} value={tab} onChange={setPicked} counts={counts} />

      {tab === "monthly" ? (
        <TryKindPanel kind="monthly">
          {/* the dashboard's order: what needs you, your children, the impact, the evidence, the journey */}
          {ready && (
            <div className="mt-6 empty:hidden">
              <ActionStrip list={list} onPay={onPay} paying={null} />
            </div>
          )}

          {gifts && gifts.length > 0 && (
            <SamplePanel>
              <TryFollowUpStrip>
                {gifts.map((g) => ({ id: g.childId, name: local(g.childId)?.name ?? "" }))}
              </TryFollowUpStrip>
            </SamplePanel>
          )}

          <section aria-labelledby="try-gifts" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <h2 id="try-gifts" className="flex flex-wrap items-center gap-2 text-xl font-bold">
                {c.gifts}
                <SampleBadge />
              </h2>
              {gifts && gifts.length > 0 && (
                <Link
                  to={trialRoute(`/try/statements/${new Date().getUTCFullYear()}`)}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
                >
                  {c.statement}
                </Link>
              )}
            </div>
            <div id="sponsorship-cards" className="mt-4 scroll-mt-24">
              {!ready ? null : list.length === 0 ? (
                <NoSponsorships browseTo="/try" />
              ) : (
                <ChildCards list={list} />
              )}
            </div>
            {(gifts ?? []).some((g) => g.dedication) && (
              <ul className="mt-4 space-y-2">
                {(gifts ?? [])
                  .filter((g) => g.dedication)
                  .map((g) => (
                    <li key={g.id} className="rounded-xl bg-card px-4 py-3 text-sm">
                      <span className="font-bold">{local(g.childId)?.name}</span>
                      <span className="block text-xs font-bold text-bridge-ink">
                        {c.dedication(g.dedication!)}
                      </span>
                      <TryGiftFollowUp childId={g.childId} />
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <SamplePanel>
            <MyImpactHero
              impact={impact}
              loading={gifts === null}
              anotherTo="/try"
              hallSearch={
                gifts?.[0]
                  ? { try: 1, child: gifts[0].childId, cadence: gifts[0].cadence }
                  : { try: 1 }
              }
            />
          </SamplePanel>

          {gifts && gifts.length > 0 && !doneChild && (
            <SamplePanel>
              <ImpactMoment moments={impactMoments(impact, rows)} />
            </SamplePanel>
          )}

          {gifts && gifts.length > 0 && (
            <>
              <SamplePanel>
                <ChildStanding impact={impact} waited={waited} sample />
              </SamplePanel>
              <SamplePanel>
                <TryJourneyAhead
                  gifts={gifts}
                  impact={impact}
                  rows={rows}
                  ahead={ahead}
                  onAhead={setAhead}
                />
              </SamplePanel>
              <SamplePanel>
                <TryShareCard
                  {...(gifts[0]?.dedication ? { dedication: gifts[0].dedication } : {})}
                />
              </SamplePanel>
            </>
          )}
        </TryKindPanel>
      ) : (
        <TrySupportImpact
          kind={tab}
          qualification={qualification}
          inKind={inKind}
          pledges={pledges ?? []}
          ahead={ahead}
          onAhead={setAhead}
        />
      )}

      {/* the natural end of the trial: what was virtual, what was chosen, and the door to the real one */}
      <TryRealInvite className="mt-14" />
    </>
  );
}

/** every trial panel carries the sample chip above it, so no invented figure passes as a result */
function SamplePanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <SampleBadge className="mb-2 inline-block" />
      {children}
    </div>
  );
}
