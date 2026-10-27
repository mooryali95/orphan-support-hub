import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
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
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { getPublicOrphan } from "@/lib/orphans.functions";
import { getOrphanQualification } from "@/lib/qualification.functions";
import { QualificationPanel } from "@/components/qualification/QualificationPanel";
import { createSponsorship, type SuggestedOrphan } from "@/lib/sponsorships.functions";
import { ExcessSuggestion } from "@/components/ExcessSuggestion";
import { SurplusBadge } from "@/components/brand/SurplusBadge";
import { getFundingState } from "@/lib/sponsorships.functions";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, fundingPercent, NEED_CATEGORY_LABELS } from "@/lib/format";
import { AGE_BAND_LABELS } from "@/integrations/supabase/types.extra";
import { AccessGate } from "@/components/protection/AccessGate";
import { getOrphanViewAuthed } from "@/lib/protection.functions";
import { OrphanProfilePanel } from "@/components/profile/OrphanProfilePanel";
import { KIND_INFO, type SupportKind } from "@/lib/support.functions";
import { cn } from "@/lib/utils";
import { BRAND, pageTitle } from "@/config/brand";

const SUPPORT_MODES: Array<["monthly" | SupportKind, string]> = [
  ["monthly", "كفالة شهرية"],
  ["qualification", "بناء أهلية"],
  ["in_kind", "دعم عيني"],
];

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
      return {
        meta: [{ title: pageTitle("ملف غير متاح") }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `كفالة ${loaderData.orphan.display_name} — ${BRAND.name} — ${BRAND.slogan}`;
    const description = BRAND.description;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
      scripts: [
        {
          type: "application/ld+json",
          // بيانات منظّمة كـ«خدمة» لا كـ«شخص»: الملف يعرض برنامج كفالة
          // له سعر ومزوّد، ولا يجوز أن يُفهرَس طفلٌ بوصفه كياناً.
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            name: `كفالة ${loaderData.orphan.display_name}`,
            description,
            serviceType: "كفالة شهرية لبرامج تعليمية وتأهيلية",
            // الاسم من main (IOCO ← كهاتين)، والمنطقة من الحاجب: المدينة
            // صارت تفصيلاً خلف الإذن فلا تُفهرَس ولا تُعرض للزائر.
            provider: { "@type": "Organization", name: `${BRAND.name}` },
            areaServed: loaderData.orphan.country ?? undefined,
            offers: {
              "@type": "Offer",
              price: String(loaderData.orphan.monthly_need),
              priceCurrency: loaderData.orphan.currency,
              availability:
                loaderData.orphan.status === "fully_sponsored"
                  ? "https://schema.org/SoldOut"
                  : "https://schema.org/InStock",
            },
          }),
        },
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

  // الصفحة تُرسَم أولاً بما يراه الزائر، ثم تُعاد قراءتها بجلسة المستخدم:
  // من مُنح الإذن، ودائرة الطفل، يرون ما يحقّ لهم. بدونها كان الكلّ زائراً.
  const fetchAuthed = useServerFn(getOrphanViewAuthed);
  const { data: authed } = useQuery({
    queryKey: ["orphan-authed", orphanId, user?.id],
    queryFn: () => fetchAuthed({ data: { orphanId } }),
    enabled: Boolean(user),
  });
  const orphan = authed?.orphan ?? data.orphan!;
  const submit = useServerFn(createSponsorship);

  const percent = fundingPercent(orphan.monthly_need, orphan.funded_monthly);
  const remaining = Math.max(0, Number(orphan.monthly_need) - Number(orphan.funded_monthly));
  const surplus = Math.max(0, Number(orphan.funded_monthly) - Number(orphan.monthly_need));

  // ما يفتحه الفائض يُقرأ من القاعدة: الكتالوج يتغيّر، وحسابه في الواجهة
  // يجعل العرض يتخلّف عنه.
  // بناء الأهلية: ما اشتُرِي وأين وصل. لا تُسقط الصفحة إن غاب.
  const fetchQualification = useServerFn(getOrphanQualification);
  const { data: qualification } = useQuery({
    queryKey: ["qualification", orphanId],
    queryFn: () => fetchQualification({ data: { orphanId } }),
  });

  const fetchFunding = useServerFn(getFundingState);
  const { data: funding } = useQuery({
    queryKey: ["funding-state", orphanId],
    queryFn: () => fetchFunding({ data: { orphanId } }),
    enabled: surplus > 0,
  });
  // التفاصيل موجودةٌ في المُعاد أو غائبة — والقاعدة هي من تقرّر، لا هذه الصفحة.
  const detail = orphan.detail ?? null;

  const [amount, setAmount] = useState(String(remaining > 0 ? Math.round(remaining) : 50));
  const [anonymous, setAnonymous] = useState(false);
  const [mode, setMode] = useState<"monthly" | SupportKind>("monthly");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  // اقتراح التجاوز يُملأ من ردّ الخادم حين يزيد المبلغ عن المتبقّي.
  const [excessOffer, setExcessOffer] = useState<{
    gap: number;
    excess: number;
    suggestions: SuggestedOrphan[];
  } | null>(null);

  async function onSponsor(confirmExcess = false) {
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
          confirmExcess,
        },
      });
      if (!res.ok) {
        // التجاوز ليس خطأً: يُعرض اقتراحاً لا رسالة حمراء.
        if ("needsExcessConfirmation" in res && res.needsExcessConfirmation) {
          setExcessOffer({
            gap: res.gap,
            excess: res.excess,
            suggestions: res.suggestions,
          });
          return;
        }
        toast.error(res.error ?? "تعذّر إنشاء الكفالة");
        return;
      }
      setExcessOffer(null);
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
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-10">
        <Link to="/orphans" className="text-sm text-primary hover:underline">
          → العودة إلى الدليل
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="overflow-hidden rounded-3xl border border-border bg-card">
              <MuralImage
                photoUrl={detail?.photo_url ?? null}
                displayName={orphan.display_name}
                register={registerFor(orphan.status, percent)}
                className="aspect-[16/9] bg-secondary"
                priority
              />
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-extrabold">{orphan.display_name}</h1>
                  {detail?.real_name && (
                    <span className="text-sm text-muted-foreground">({detail.real_name})</span>
                  )}
                  <Badge variant="secondary">ملف رقم {orphan.code}</Badge>
                  {orphan.status === "fully_sponsored" && <Badge>مكفول بالكامل</Badge>}
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <span>{orphan.gender === "female" ? "أنثى" : "ذكر"}</span>
                  {orphan.age_band !== "unknown" && (
                    <span>{AGE_BAND_LABELS[orphan.age_band]} سنة</span>
                  )}
                  {(orphan.country ?? orphan.region) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-4" />{" "}
                      {[orphan.country, orphan.region, detail?.city].filter(Boolean).join(" — ")}
                    </span>
                  )}
                  {orphan.education_stage && (
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="size-4" /> {orphan.education_stage}
                    </span>
                  )}
                </div>

                {detail?.story && (
                  <p className="mt-6 whitespace-pre-line text-base leading-8">{detail.story}</p>
                )}
              </div>
            </div>

            {/* الحاجب: يُعرض حين لا إذن، ويختفي حين يُؤذن. */}
            {!orphan.may_view_detail && (
              <AccessGate
                orphanId={orphanId}
                orphanName={orphan.display_name}
                access={orphan.access}
                signedIn={Boolean(user)}
              />
            )}

            {/* البروفايل — يُقرأ بحسب الصلة، والقاعدة هي من تقسم. */}
            {user && <OrphanProfilePanel orphanId={orphanId} orphanName={orphan.display_name} />}

            {(detail?.needs.length ?? 0) > 0 && (
              <div className="mt-6 rounded-3xl border border-border bg-card p-6">
                <h2 className="text-lg font-bold">تفاصيل الاحتياج الشهري</h2>
                <ul className="mt-4 divide-y divide-border">
                  {(detail?.needs ?? []).map((need) => (
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
                  {/* في حشدٍ صغير تدلّ مدينة الجهة على الطفل، فتُحجب. */}
                  {orphan.cohort_small
                    ? "الموقع التفصيلي محجوب حمايةً للطفل"
                    : [data.org.city, data.org.region].filter(Boolean).join(" — ")}
                </p>
                {data.org.about && (
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{data.org.about}</p>
                )}
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            {/* ثلاثة أبواب متساوية: الكفالة الشهرية، وبناء الأهلية، والعيني. */}
            <div
              role="tablist"
              aria-label="نوع الدعم"
              className="mb-3 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1"
            >
              {SUPPORT_MODES.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mode === key}
                  onClick={() => setMode(key)}
                  className={cn(
                    "rounded-xl px-2 py-2 text-xs font-medium transition-colors sm:text-sm",
                    mode === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "monthly" ? (
              <div
                id="sponsor-form"
                className="rounded-3xl border border-border bg-card p-6 shadow-sm"
              >
                <p className="text-sm text-muted-foreground">الاحتياج الشهري</p>
                <p className="mt-1 text-3xl font-extrabold text-primary">
                  {formatMoney(orphan.monthly_need, orphan.currency)}
                </p>
                <CrossingProgress percent={percent} className="mt-4" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {surplus > 0
                    ? `تم تغطية احتياجه بالكامل`
                    : `تم تغطية ${percent}% — المتبقي ${formatMoney(remaining, orphan.currency)}`}
                </p>

                {surplus > 0 && (
                  <SurplusBadge
                    surplus={surplus}
                    currency={orphan.currency}
                    unlocks={funding?.state?.surplus_unlocks ?? null}
                    className="mt-4"
                  />
                )}

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
                    <div className="mt-2 flex flex-wrap gap-2">
                      {remaining > 0 && (
                        <button
                          type="button"
                          onClick={() => setAmount(String(Math.round(remaining)))}
                          className="border-bridge text-bridge-ink rounded-md border px-3 py-1 text-xs font-medium hover:bg-bridge/10"
                        >
                          المتبقّي كاملاً
                        </button>
                      )}
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
                      placeholder="كلمة تشجيعية — تراجعها جهة الرعاية قبل أن تصل"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={anonymous}
                      onCheckedChange={(v) => setAnonymous(v === true)}
                    />
                    أرغب أن تكون كفالتي دون ذكر اسمي
                  </label>

                  {excessOffer && (
                    <ExcessSuggestion
                      gap={excessOffer.gap}
                      excess={excessOffer.excess}
                      currency={orphan.currency}
                      suggestions={excessOffer.suggestions}
                      pending={pending}
                      onUseGapOnly={() => {
                        setAmount(String(Math.round(excessOffer.gap)));
                        setExcessOffer(null);
                      }}
                      onConfirm={() => void onSponsor(true)}
                    />
                  )}

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => void onSponsor()}
                    disabled={pending}
                  >
                    {pending && <Loader2 className="size-4 animate-spin" />}
                    {user ? "ابدأ الكفالة" : "سجّل الدخول للكفالة"}
                  </Button>

                  <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-shore-thrive" />
                    الكفالة تُفعّل بعد إتمام الدفع، ويمكنك إيقافها في أي وقت من لوحتك.
                  </p>
                </div>
              </div>
            ) : (
              <div
                id="sponsor-form"
                className="rounded-3xl border border-border bg-card p-6 shadow-sm"
              >
                <p className="font-semibold">{KIND_INFO[mode].label}</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {KIND_INFO[mode].text}
                </p>
                <Button asChild className="mt-5 w-full" size="lg">
                  <Link
                    to="/support"
                    search={{ orphan: orphan.id, name: orphan.display_name, kind: mode }}
                  >
                    تابع — {KIND_INFO[mode].label} لـ{orphan.display_name}
                  </Link>
                </Button>
                <p className="mt-3 text-xs text-muted-foreground">
                  تتابعه من «بواباتي» بتقارير المكتب وصوره.
                </p>
              </div>
            )}
          </aside>
        </div>

        {qualification?.programs && qualification.programs.length > 0 && (
          <div className="mt-12 border-t border-border/70 pt-10">
            <QualificationPanel programs={qualification.programs} />
          </div>
        )}
      </main>
      {/* على الجوال يقع نموذج الكفالة أسفل الصفحة بأربع شاشات؛ هذا الشريط
          يُبقي الفعل حاضراً ويقفز إليه. يُخفى على الشاشات الكبيرة حيث
          النموذج مثبّت في العمود الجانبي أصلاً. */}
      <div className="border-border bg-background/95 sticky bottom-0 z-40 border-t p-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">المتبقّي شهرياً</p>
            <p className="text-bridge-ink text-base font-extrabold">
              {formatMoney(remaining, orphan.currency)}
            </p>
          </div>
          <Button asChild size="lg" className="flex-1">
            <a href="#sponsor-form">{user ? "ابدأ الكفالة" : "سجّل الدخول للكفالة"}</a>
          </Button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
