import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { MyImpactHero } from "@/components/impact/MyImpactHero";
import { CelebrateOverlay } from "@/components/kit/Celebrate";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/format";
import { myImpact } from "@/lib/my-impact";
import {
  giftsAsSponsorships,
  loadGifts,
  TRY_CURRENCY,
  TRY_EVENT,
  tryChild,
  type TryGift,
} from "@/lib/try-demo";

export const Route = createFileRoute("/try/impact")({
  validateSearch: (raw: Record<string, unknown>): { done?: string } =>
    typeof raw["done"] === "string" ? { done: raw["done"] } : {},
  component: TryImpact,
});

/** «أثري» التجربة: الصورة الحقيقية نفسها، مبنيّةً من عطاءات الزائر المحاكاة في متصفّحه. */
function TryImpact() {
  const { done } = Route.useSearch();
  const navigate = useNavigate();
  const [gifts, setGifts] = useState<TryGift[] | null>(null);
  useEffect(() => {
    const read = () => setGifts(loadGifts());
    read();
    window.addEventListener(TRY_EVENT, read);
    return () => window.removeEventListener(TRY_EVENT, read);
  }, []);
  const doneChild = done ? tryChild(done) : undefined;
  const impact = myImpact(giftsAsSponsorships(gifts ?? []));

  return (
    <>
      {doneChild && (
        <CelebrateOverlay
          title={`بدأ عطاؤك لـ${doneChild.name}`}
          text="في المنصّة الحقيقية يتأكّد الدفع خلال دقائق، ثم ترى كل شهر متى حُوِّل المبلغ للجهة ومتى وصل الطفلَ بمستند. هذه صورتك الآن:"
          action="شاهد أثرك"
          onClose={() => void navigate({ to: "/try/impact", search: {}, replace: true })}
        />
      )}
      <h1 className="text-3xl font-bold">أثري</h1>
      <p className="mt-1 text-muted-foreground">
        أثر عطاءاتك في هذه التجربة، كما يراه الداعم في لوحته.
      </p>

      <MyImpactHero
        impact={impact}
        loading={gifts === null}
        anotherTo="/try"
        hallSearch={
          gifts?.[0] ? { try: 1, child: gifts[0].childId, cadence: gifts[0].cadence } : { try: 1 }
        }
      />

      <section aria-labelledby="try-gifts" className="mt-10">
        <h2 id="try-gifts" className="text-xl font-bold">
          عطاءاتك
        </h2>
        {gifts && gifts.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">لم تبدأ عطاءً بعد في التجربة.</p>
            <Button asChild className="mt-4">
              <Link to="/try">اختر طفلاً</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {(gifts ?? []).map((g) => {
              const c = tryChild(g.childId)!;
              return (
                <li
                  key={g.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card p-4 shadow-soft"
                >
                  <span className="font-bold">{c.name}</span>
                  <span className="text-sm text-muted-foreground">{c.country}</span>
                  <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary">
                    {g.cadence === "monthly" ? "شهرية" : "مرّة واحدة"}
                  </span>
                  <span className="ms-auto font-bold tabular-nums">
                    {formatMoney(g.amount, TRY_CURRENCY, "ar")}
                  </span>
                  <span className="w-full text-xs text-muted-foreground sm:w-auto">
                    {formatDate(g.at)} · الحالة: نشطة (محاكاة)
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
