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
        toast.error(res.error ?? "تعذّر الحفظ");
        return;
      }
      toast.success("حُفظت تفضيلاتك");
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
        جارٍ اختيار من نرشّحه لك…
      </div>
    );
  }

  return (
    <section aria-labelledby="suggestions-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="suggestions-heading" className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="size-4 text-shore-need" aria-hidden="true" />
          مرشَّحون لك
        </h2>
        <Button size="sm" variant="outline" onClick={openEditor} aria-expanded={editing}>
          <Settings2 className="size-3.5" aria-hidden="true" />
          تفضيلاتي
        </Button>
      </div>

      <p className="mt-2 max-w-2xl text-xs leading-6 text-muted-foreground">
        الترتيب: <strong className="text-foreground">البناءُ القائم أولاً</strong> — ملفٌّ له مشرفٌ
        معتمَد وإذنٌ موثَّق يتحرّك برنامجه فعلاً — ثم ما يُكمله اشتراكك، ثم منطقتك المفضّلة، ثم
        الأقدمُ انتظاراً. ولا يُرتَّب بأكبر ثغرةٍ أولاً: ذاك يدفن صغار الثغرات مهما طال انتظارهم.
      </p>

      {editing && (
        <form
          onSubmit={onSave}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4"
        >
          <div className="w-40">
            <Label htmlFor="pref-budget" className="text-xs">
              ميزانيتي الشهرية
            </Label>
            <Input
              id="pref-budget"
              type="number"
              min={0}
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="اختياري"
              className="mt-1 h-9"
            />
          </div>
          <div className="min-w-48">
            <Label htmlFor="pref-region" className="text-xs">
              المنطقة المفضّلة
            </Label>
            <select
              id="pref-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">كل المناطق</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            حفظ
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            إلغاء
          </Button>
          <p className="w-full text-xs leading-6 text-muted-foreground">
            المنطقة ترجيحٌ لا تصفية: تصفيةٌ بها تُخفي محتاجاً خارجها. والميزانية لا تُقصي أحداً —
            الكفالة الجزئية مقبولة — بل تُقدّم من يُكمله اشتراكك.
          </p>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          لا مرشَّحين الآن — إمّا أنّك تكفل كلّ الملفات المفتوحة، أو لا ملفّ منشوراً فيه ثغرة.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <SuggestionCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** جمع «شهر» عربيّاً: ٣–١٠ «أشهر»، وما فوقها تمييزٌ مفرد منصوب. */
function monthsLabel(n: number): string {
  if (n <= 1) return "شهر";
  if (n === 2) return "شهرين";
  if (n <= 10) return `${n} أشهر`;
  return `${n} شهراً`;
}

function SuggestionCard({ row }: { row: SuggestedOrphan }) {
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
          <h3 className="truncate font-bold">{row.display_name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[row.city, row.region].filter(Boolean).join("، ") || "—"} — يتبقّى{" "}
            {formatMoney(row.gap, row.currency)}
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
              بناؤه قائم
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <Hammer className="size-3" aria-hidden="true" />
              برنامجه واقف
            </Badge>
          )}
        </li>
        {row.completes && (
          <li>
            <Badge variant="secondary">اشتراكك يُكمله</Badge>
          </li>
        )}
        {row.in_region && (
          <li>
            <Badge variant="secondary" className="gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              منطقتك
            </Badge>
          </li>
        )}
        {row.waiting_days >= 90 && (
          <li>
            <Badge variant="secondary" className="gap-1">
              <Clock className="size-3" aria-hidden="true" />
              ينتظر منذ {monthsLabel(Math.floor(row.waiting_days / 30))}
            </Badge>
          </li>
        )}
      </ul>

      {!row.building && (
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          برنامجه ينتظر مشرفاً معتمَداً أو إذناً موثَّقاً من جهته — وكفالتك تبقى نافعة، لكنّ البناء
          لا يتقدّم حتى يكتملا.
        </p>
      )}

      <Button asChild size="sm" variant="outline" className="mt-3 w-full">
        <Link to="/orphans/$orphanId" params={{ orphanId: row.id }}>
          الملف
        </Link>
      </Button>
    </li>
  );
}
