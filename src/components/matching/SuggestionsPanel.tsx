import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, Hammer, Loader2, MapPin, Settings2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import {
  getSuggestions,
  getSponsorPreferences,
  saveSponsorPreferences,
} from "@/lib/matching.functions";
import type { SuggestedOrphan } from "@/integrations/supabase/types.extra";
import { formatMoney, fundingPercent } from "@/lib/format";
import { Name } from "@/components/kit/Name";
import { defineCopy, pluralOf, useCopy, useLocale, type Locale } from "@/lib/locale";

const COPY = defineCopy("components/matching/SuggestionsPanel", {
  ar: {
    saveFailed: "تعذّر الحفظ",
    saved: "حُفظت تفضيلاتك",
    loading: "جارٍ اختيار من نرشّحه لك…",
    title: "مرشَّحون لك",
    prefs: "تفضيلاتي",
    orderLabel: "الترتيب:",
    orderLead: "البناءُ القائم أولاً",
    orderRest:
      "— ملفٌّ له مشرفٌ معتمَد وإذنٌ موثَّق يتحرّك برنامجه فعلاً — ثم ما يُكمله اشتراكك، ثم منطقتك المفضّلة، ثم الأقدمُ انتظاراً. ولا يُرتَّب بأكبر ثغرةٍ أولاً: ذاك يدفن صغار الثغرات مهما طال انتظارهم.",
    budget: "ميزانيتي الشهرية",
    optional: "اختياري",
    region: "المنطقة المفضّلة",
    allRegions: "كل المناطق",
    save: "حفظ",
    cancel: "إلغاء",
    prefsNote:
      "المنطقة ترجيحٌ لا تصفية: تصفيةٌ بها تُخفي محتاجاً خارجها. والميزانية لا تُقصي أحداً، الكفالة الجزئية مقبولة، بل تُقدّم من يُكمله اشتراكك.",
    empty: "لا مرشَّحين الآن: إمّا أنّك تكفل كلّ الملفات المفتوحة، أو لا ملفّ منشوراً فيه ثغرة.",
    placeSep: "، ",
    remaining: (amount: string) => `— يتبقّى ${amount}`,
    building: "بناؤه قائم",
    stalled: "برنامجه واقف",
    completes: "اشتراكك يُكمله",
    inRegion: "منطقتك",
    waiting: pluralOf(
      {
        zero: "ينتظر منذ شهر",
        one: "ينتظر منذ شهر",
        two: "ينتظر منذ شهرين",
        few: "ينتظر منذ {0} أشهر",
        many: "ينتظر منذ {0} شهراً",
        other: "ينتظر منذ {0} شهر",
      },
      0,
      "ar",
    ),
    stalledNote:
      "برنامجه ينتظر مشرفاً معتمَداً أو إذناً موثَّقاً من جهته، وكفالتك تبقى نافعة، لكنّ البناء لا يتقدّم حتى يكتملا.",
    file: "الملفّ",
  },
  en: {
    saveFailed: "Couldn't save",
    saved: "Your preferences are saved",
    loading: "Choosing who to suggest to you…",
    title: "Suggested for you",
    prefs: "My preferences",
    orderLabel: "Order:",
    orderLead: "active building first",
    orderRest:
      "— a file with a certified supervisor and documented consent, whose program is actually moving — then those your contribution would complete, then your preferred region, then those waiting longest. It is never ordered by the largest gap first: that buries small gaps however long they wait.",
    budget: "My monthly budget",
    optional: "Optional",
    region: "Preferred region",
    allRegions: "All regions",
    save: "Save",
    cancel: "Cancel",
    prefsNote:
      "The region raises a file's rank; it doesn't filter: filtering would hide a child in need outside it. The budget excludes no one, partial sponsorship is welcome, it puts first those your contribution would complete.",
    empty:
      "No suggestions right now: either you sponsor every open file, or no published file has a gap.",
    placeSep: ", ",
    remaining: (amount: string) => `— ${amount} still needed`,
    building: "Building under way",
    stalled: "Program on hold",
    completes: "Your contribution completes it",
    inRegion: "Your region",
    waiting: pluralOf({ one: "Waiting for {0} month", other: "Waiting for {0} months" }),
    stalledNote:
      "The program is waiting for a certified supervisor or documented consent from the field organization; your sponsorship still helps, but building can't move forward until both are in place.",
    file: "File",
  },
});
type Copy = (typeof COPY)["ar"];

/**
 * مرشَّحون لك.
 *
 * والترتيب من القاعدة: **البناءُ القائم أولاً، ثم ما يُكمله اشتراكك، ثم
 * تفضيلك، ثم الأقدمُ انتظاراً.** لا «أكبر ثغرة أولاً» — ذاك منطق
 * الرعاية الذي انتقلت المنصّة عنه، وهو يدفن صغار الثغرات أبداً.
 *
 * وكل ترشيحٍ يحمل سببه ظاهراً: ترشيحٌ بلا سببٍ نُخزةٌ لا توصية.
 */
export function SuggestionsPanel() {
  const queryClient = useQueryClient();
  const fetchSuggestions = useServerFn(getSuggestions);
  const fetchPrefs = useServerFn(getSponsorPreferences);
  const savePrefs = useServerFn(saveSponsorPreferences);
  const c = useCopy(COPY);
  const locale = useLocale();

  const { data, isPending } = useQuery({
    queryKey: ["suggestions"],
    queryFn: () => fetchSuggestions({ data: {} }),
  });
  const { data: prefsRes } = useQuery({
    queryKey: ["sponsor-prefs"],
    queryFn: () => fetchPrefs(),
  });

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState("");
  const [region, setRegion] = useState("");

  const prefs = prefsRes?.preferences ?? null;
  const regions = prefsRes?.regions ?? [];
  const rows = data?.suggestions ?? [];

  function openEditor() {
    setBudget(prefs?.monthly_budget != null ? String(prefs.monthly_budget) : "");
    setRegion(prefs?.preferred_region ?? "");
    setEditing(true);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const n = budget.trim() === "" ? null : Number(budget);
      const res = await savePrefs({
        data: {
          monthlyBudget: n != null && Number.isFinite(n) ? n : null,
          preferredRegion: region.trim() === "" ? null : region.trim(),
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? c.saveFailed);
        return;
      }
      toast.success(c.saved);
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["sponsor-prefs"] });
      void queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    } finally {
      setBusy(false);
    }
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {c.loading}
      </div>
    );
  }

  return (
    <section aria-labelledby="suggestions-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="suggestions-heading" className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="size-4 text-shore-need" aria-hidden="true" />
          {c.title}
        </h2>
        <Button size="sm" variant="outline" onClick={openEditor} aria-expanded={editing}>
          <Settings2 className="size-3.5" aria-hidden="true" />
          {c.prefs}
        </Button>
      </div>

      <p className="mt-2 max-w-2xl text-xs leading-6 text-muted-foreground">
        {c.orderLabel} <strong className="text-foreground">{c.orderLead}</strong> {c.orderRest}
      </p>

      {editing && (
        <form
          onSubmit={onSave}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4"
        >
          <div className="w-40">
            <Label htmlFor="pref-budget" className="text-xs">
              {c.budget}
            </Label>
            <Input
              id="pref-budget"
              type="number"
              min={0}
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder={c.optional}
              className="mt-1 h-9"
            />
          </div>
          <div className="min-w-48">
            <Label htmlFor="pref-region" className="text-xs">
              {c.region}
            </Label>
            <select
              id="pref-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{c.allRegions}</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {c.save}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {c.cancel}
          </Button>
          <p className="w-full text-xs leading-6 text-muted-foreground">{c.prefsNote}</p>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {c.empty}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <SuggestionCard key={row.id} row={row} c={c} locale={locale} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SuggestionCard({ row, c, locale }: { row: SuggestedOrphan; c: Copy; locale: Locale }) {
  // `fundingPercent(need, funded)` — عكسُ الوسيطين يقلب كل شريط.
  const percent = fundingPercent(row.monthly_need, row.funded_monthly);

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <MuralImage
          photoUrl={row.photo_url}
          displayName={row.display_name}
          register={registerFor(row.status, percent)}
          className="size-14 shrink-0 rounded-xl bg-secondary"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold">
            <Name>{row.display_name}</Name>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <bdi>{[row.city, row.region].filter(Boolean).join(c.placeSep) || "—"}</bdi>{" "}
            {c.remaining(formatMoney(row.gap, row.currency, locale))}
          </p>
          <CrossingProgress percent={percent} className="mt-2" />
        </div>
      </div>

      {/* سببُ الترشيح — لا صندوقٌ أسود */}
      <ul className="mt-3 flex flex-wrap gap-1.5">
        <li>
          {row.building ? (
            <Badge className="gap-1">
              <Hammer className="size-3" aria-hidden="true" />
              {c.building}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <Hammer className="size-3" aria-hidden="true" />
              {c.stalled}
            </Badge>
          )}
        </li>
        {row.completes && (
          <li>
            <Badge variant="secondary">{c.completes}</Badge>
          </li>
        )}
        {row.in_region && (
          <li>
            <Badge variant="secondary" className="gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              {c.inRegion}
            </Badge>
          </li>
        )}
        {row.waiting_days >= 90 && (
          <li>
            <Badge variant="secondary" className="gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {c.waiting(Math.floor(row.waiting_days / 30))}
            </Badge>
          </li>
        )}
      </ul>

      {!row.building && (
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{c.stalledNote}</p>
      )}

      <Button asChild size="sm" variant="outline" className="mt-3 w-full">
        <Link to="/orphans/$orphanId" params={{ orphanId: row.id }}>
          {c.file}
        </Link>
      </Button>
    </li>
  );
}
