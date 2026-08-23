import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MapPin, GraduationCap, Building2, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { getPublicOrphan } from "@/lib/orphans.functions";
import { createSponsorship } from "@/lib/sponsorships.functions";
import { useAuth } from "@/hooks/useAuth";
import { ageFromBirthDate, formatMoney, fundingPercent, NEED_CATEGORY_LABELS } from "@/lib/format";

const orphanQuery = (orphanId: string) =>
  queryOptions({
    queryKey: ["orphan", orphanId],
    queryFn: () => getPublicOrphan({ data: { id: orphanId } }),
  });

export const Route = createFileRoute("/orphans/$orphanId")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(orphanQuery(params.orphanId));
    if (!data.orphan) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData?.orphan) {
      return { meta: [{ title: "ملف غير متاح — كافل" }, { name: "robots", content: "noindex" }] };
    }
    const title = `كفالة ${loaderData.orphan.display_name} — كافل`;
    const description = `ملف موثّق لكفالة ${loaderData.orphan.display_name}${
      loaderData.orphan.city ? ` من ${loaderData.orphan.city}` : ""
    }. احتياج شهري ${formatMoney(loaderData.orphan.monthly_need, loaderData.orphan.currency)}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: OrphanDetail,
});

function OrphanDetail() {
  const { orphanId } = Route.useParams();
  const { data } = useSuspenseQuery(orphanQuery(orphanId));
  const { user } = useAuth();
  const navigate = useNavigate();
  const submit = useServerFn(createSponsorship);

  const orphan = data.orphan!;
  const percent = fundingPercent(orphan.monthly_need, orphan.funded_monthly);
  const remaining = Math.max(0, Number(orphan.monthly_need) - Number(orphan.funded_monthly));
  const age = ageFromBirthDate(orphan.birth_date);

  const [amount, setAmount] = useState(String(remaining > 0 ? Math.round(remaining) : 50));
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSponsor() {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/orphans/${orphanId}` } });
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 5) {
      toast.error("الرجاء إدخال مبلغ صحيح (5 فأكثر)");
      return;
    }
    setPending(true);
    try {
      const res = await submit({
        data: {
          orphanId,
          amount: value,
          type: "monthly",
          isAnonymous: anonymous,
          message: message.trim() || undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر إنشاء الكفالة");
        return;
      }
      toast.success("تم تسجيل طلب الكفالة، أكمل الدفع من لوحتك");
      navigate({ to: "/dashboard" });
    } catch {
      toast.error("حدث خطأ غير متوقع");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <Link to="/orphans" className="text-sm text-primary hover:underline">
          → العودة إلى الدليل
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="overflow-hidden rounded-3xl border border-border bg-card">
              <div className="aspect-[16/9] bg-secondary">
                {orphan.photo_url ? (
                  <img
                    src={orphan.photo_url}
                    alt={`صورة ملف ${orphan.display_name}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="surface-crossing flex size-full items-center justify-center text-6xl font-extrabold text-shore-need/35">
                    {orphan.display_name.slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-extrabold">{orphan.display_name}</h1>
                  <Badge variant="secondary">ملف رقم {orphan.code}</Badge>
                  {orphan.status === "fully_sponsored" && <Badge>مكفول بالكامل</Badge>}
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <span>{orphan.gender === "female" ? "أنثى" : "ذكر"}</span>
                  {age !== null && <span>{age} سنة</span>}
                  {orphan.city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-4" /> {orphan.city}
                      {orphan.region ? ` — ${orphan.region}` : ""}
                    </span>
                  )}
                  {orphan.education_stage && (
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="size-4" /> {orphan.education_stage}
                    </span>
                  )}
                </div>

                {orphan.story && (
                  <p className="mt-6 whitespace-pre-line text-base leading-8">{orphan.story}</p>
                )}
              </div>
            </div>

            {data.needs.length > 0 && (
              <div className="mt-6 rounded-3xl border border-border bg-card p-6">
                <h2 className="text-lg font-bold">تفاصيل الاحتياج الشهري</h2>
                <ul className="mt-4 divide-y divide-border">
                  {data.needs.map((need) => (
                    <li key={need.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{need.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {NEED_CATEGORY_LABELS[need.category] ?? need.category}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-primary">
                        {formatMoney(need.monthly_amount, orphan.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.org && (
              <div className="mt-6 rounded-3xl border border-border bg-card p-6">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Building2 className="size-5 text-shore-need" /> جهة الرعاية
                </h2>
                <p className="mt-2 font-medium">{data.org.name}</p>
                <p className="text-sm text-muted-foreground">
                  {[data.org.city, data.org.region].filter(Boolean).join(" — ")}
                </p>
                {data.org.about && (
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{data.org.about}</p>
                )}
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">الاحتياج الشهري</p>
              <p className="mt-1 text-3xl font-extrabold text-primary">
                {formatMoney(orphan.monthly_need, orphan.currency)}
              </p>
              <CrossingProgress percent={percent} className="mt-4" />
              <p className="mt-2 text-xs text-muted-foreground">
                تم تغطية {percent}% — المتبقي {formatMoney(remaining, orphan.currency)}
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="amount">مبلغ الكفالة الشهري ({orphan.currency})</Label>
                  <Input
                    id="amount"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-2"
                  />
                  <div className="mt-2 flex gap-2">
                    {[25, 50, 100].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAmount(String(v))}
                        className="rounded-md border border-input px-3 py-1 text-xs hover:bg-secondary"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="message">رسالة لليتيم (اختياري)</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="mt-2"
                    placeholder="كلمة تشجيعية تصل عبر جهة الرعاية"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={anonymous} onCheckedChange={(v) => setAnonymous(v === true)} />
                  أرغب أن تكون كفالتي دون ذكر اسمي
                </label>

                <Button className="w-full" size="lg" onClick={onSponsor} disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {user ? "ابدأ الكفالة" : "سجّل الدخول للكفالة"}
                </Button>

                <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-shore-thrive" />
                  الكفالة تُفعّل بعد إتمام الدفع، ويمكنك إيقافها في أي وقت من لوحتك.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
