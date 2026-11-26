import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { MapPin, GraduationCap, Building2, ShieldCheck, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VerificationBadge } from "@/components/orphans/VerificationBadge";
import { usePublicVerification } from "@/components/orphans/public-verification";
import { SimilarReadyChildren } from "@/components/orphans/SimilarReadyChildren";
import { SIMILAR_READY_ID, useSimilarReady } from "@/components/orphans/similar-ready";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { getPlatformStats, getPublicOrphan } from "@/lib/orphans.functions";
import { getOrphanQualification } from "@/lib/qualification.functions";
import { QualificationPanel } from "@/components/qualification/QualificationPanel";
import {
  createSponsorship,
  getPayOptions,
  type SuggestedOrphan,
} from "@/lib/sponsorships.functions";
import { startCheckout } from "@/lib/payments.functions";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { SupporterModeGate } from "@/components/SupporterModeGate";
import { ExcessSuggestion } from "@/components/ExcessSuggestion";
import { SurplusBadge } from "@/components/brand/SurplusBadge";
import { getFundingState } from "@/lib/sponsorships.functions";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, fundingPercent, NEED_CATEGORY_LABELS, isolate } from "@/lib/format";
import { AGE_BAND_LABELS } from "@/integrations/supabase/types.extra";
import { AccessGate } from "@/components/protection/AccessGate";
import { getOrphanViewAuthed } from "@/lib/protection.functions";
import { OrphanProfilePanel } from "@/components/profile/OrphanProfilePanel";
import { OrphanUnavailable } from "@/components/orphan/OrphanUnavailable";
import { ScopedSections } from "@/components/orphan/ScopedSections";
import { TrustSignals } from "@/components/orphan/TrustSignals";
import { KIND_INFO, type SupportKind } from "@/lib/support.functions";
import { cn } from "@/lib/utils";
import { brandFor, pageTitle } from "@/config/brand";
import { CHILD_PAGE_ROBOTS } from "@/lib/security-headers";
import { copyOf, defineCopy, placeLabel, useCopy, useLocale } from "@/lib/locale";
import { useGivingCopy } from "@/config/giving-tracks";
import { clearDraft, loadDraft, saveDraft } from "@/lib/sponsor-draft";
import { trialSlots } from "@/lib/trial-slots";
import { resolveCountry } from "@/lib/countries";
import {
  amountAfterSwitch,
  canPayIn,
  needOnly,
  presetKeyOf,
  presetsIn,
  quoteFor,
} from "@/lib/pay-options";
import { FxNote, PayCurrencyChoice } from "@/components/sponsorship/PayCurrency";
import { Name } from "@/components/kit/Name";
import { usePrivateFile } from "@/hooks/usePrivateFile";
import { CHILD_PHOTO_BUCKET } from "@/lib/child-photo";
import { FollowButton } from "@/components/support/Follow";

/** من التجربة إن وُجدت (`@/lib/trial-slots`) */
const ProposalOffer = trialSlots?.ProposalOffer;

const SUPPORT_MODES: Array<"monthly" | SupportKind> = ["monthly", "qualification", "in_kind"];

const COPY = defineCopy("routes/orphans.orphanId", {
  ar: {
    kinds: KIND_INFO as Record<SupportKind, { label: string; text: string }>,
    unavailable: "ملفّ غير متاح",
    sponsorOf: (n: string) => `كفالة ${n}`,
    shareTitle: "ملفّ كفالة موثّق",
    badAmount: "الرجاء إدخال مبلغ صحيح (5 فأكثر)",
    createFailed: "تعذّر إنشاء الكفالة",
    verifying:
      "هذا الملف قيد التحقق الآن، فلا يستقبل كفالةً جديدة حتى تكتمل مراجعته. يمكنك متابعته أو اختيار طفلٍ آخر.",
    created: "تم تسجيل طلب الكفالة، أكمل الدفع من لوحتك",
    unexpected: "حدث خطأ غير متوقع",
    back: "→ العودة إلى الدليل",
    fileNo: (c: string) => `ملفّ رقم ${c}`,
    full: "مكفول بالكامل",
    female: "أنثى",
    male: "ذكر",
    years: "سنة",
    ages: AGE_BAND_LABELS as Record<string, string>,
    needsH: "تفاصيل الاحتياج الشهري",
    needCats: NEED_CATEGORY_LABELS,
    org: "الجهة الميدانية",
    hiddenLoc: "الموقع التفصيلي محجوب حمايةً للطفل",
    kindLabel: "نوع الدعم",
    monthlyNeed: "الاحتياج الشهري",
    covered: "تم تغطية احتياجه بالكامل",
    coveredPct: (p: number, rest: string) => `تم تغطية ${p}% — المتبقي ${rest}`,
    amount: (c: string) => `مبلغ الكفالة الشهري (${c})`,
    fullRest: "المتبقّي كاملاً",
    message: "رسالة لليتيم (اختياري)",
    messagePh: "كلمة تشجيعية — تراجعها الجهة الميدانية قبل أن تصل",
    anonymous: "أرغب أن تكون كفالتي دون ذكر اسمي",
    start: "ابدأ الكفالة",
    startOnce: "ادعم الآن",
    proof: (n: number, total: number) =>
      `كُفل ${n} من ${total} طفلاً معتمداً عبر المنصّة حتى اليوم.`,
    signIn: "سجّل الدخول للكفالة",
    signInHint: "تبقى هنا؛ بعد الدخول تُسجَّل كفالتك بالمبلغ نفسه وتنتقل إلى الدفع.",
    toPayment: "تُسجَّل كفالتك وتنتقل إلى الدفع…",
    payLater: "سُجّلت كفالتك؛ أكمل الدفع من «أثري» متى شئت.",
    cadence: "نوع العطاء",
    monthly: "شهرياً",
    once: "مرّة واحدة",
    impactFull: (name: string) => `يُكمل حاجة ${name} الشهرية كاملةً`,
    impactPart: (pct: number, name: string) => `يغطّي ${pct}% من حاجة ${name} الشهرية`,
    impactOnce: (name: string) => `عطاءٌ لمرّة واحدة يصل ${name} بمستندٍ يثبت تسليمه`,
    restored: "استعدنا ما اخترته قبل الدخول: المبلغ ورسالتك.",
    activates:
      "الكفالة تبدأ بعد تأكيد الدفع، ويمكنك إنهاؤها متى شئت من لوحتك فتنتهي بعد آخر شهرٍ مدفوع.",
    continueTo: (k: string, n: string) => `تابع — ${k} لـ${n}`,
    follow: "تتابعه من «بواباتي» بتقارير المكتب وصوره.",
    remainingMonthly: "المتبقّي شهرياً",
    support: (n: string) => `ادعم ${n}`,
    barVerifying: "قيد التحقق — لا يقبل كفالةً جديدة الآن",
    barSimilar: "أطفالٌ جاهزون",
  },
  en: {
    kinds: {
      qualification: {
        label: "Capability building",
        text: "Fund the qualification journey: sessions, follow-up, and trait measurement before and after.",
      },
      in_kind: {
        label: "In-kind support",
        text: "School bags, clothing, food, devices… delivered and documented with photos and reports.",
      },
    } as Record<SupportKind, { label: string; text: string }>,
    unavailable: "File unavailable",
    sponsorOf: (n: string) => `Sponsor ${n}`,
    shareTitle: "A verified sponsorship file",
    badAmount: "Please enter a valid amount (5 or more)",
    createFailed: "The sponsorship could not be created",
    verifying:
      "This file is being verified, so it can't take a new sponsorship until its review is complete. You can follow it or choose another child.",
    created: "Your sponsorship request is registered — complete the payment from your dashboard",
    unexpected: "Something unexpected went wrong",
    back: "← Back to the directory",
    fileNo: (c: string) => `File no. ${c}`,
    full: "Fully sponsored",
    female: "Girl",
    male: "Boy",
    years: "years",
    ages: {
      under_6: "Under 6",
      age_6_11: "6–11",
      age_12_14: "12–14",
      age_15_17: "15–17",
      age_18_plus: "18+",
      unknown: "Unknown",
    } as Record<string, string>,
    needsH: "Monthly need in detail",
    needCats: {
      education: "Education",
      health: "Health",
      food: "Food",
      housing: "Housing",
      clothing: "Clothing",
      other: "Other",
    } as Record<string, string>,
    org: "Field organization",
    hiddenLoc: "The exact location is hidden to protect the child",
    kindLabel: "Type of support",
    monthlyNeed: "Monthly need",
    covered: "Their need is fully covered",
    coveredPct: (p: number, rest: string) => `${p}% covered — ${rest} still needed`,
    amount: (c: string) => `Monthly sponsorship amount (${c})`,
    fullRest: "The full remaining amount",
    message: "A message for the child (optional)",
    messagePh: "A word of encouragement — the field organization reviews it before it arrives",
    anonymous: "I'd like my sponsorship to stay anonymous",
    start: "Start sponsoring",
    startOnce: "Give now",
    proof: (n: number, total: number) =>
      `${n} of ${total} approved children have been fully sponsored through the platform so far.`,
    signIn: "Sign in to sponsor",
    signInHint:
      "You stay here; once signed in your sponsorship is recorded with the same amount and you go on to payment.",
    toPayment: "Recording your sponsorship and moving to payment…",
    payLater:
      "Your sponsorship is recorded; complete the payment from «My impact» whenever you like.",
    cadence: "Type of giving",
    monthly: "Monthly",
    once: "One time",
    impactFull: (name: string) => `Covers ${name}'s full monthly need`,
    impactPart: (pct: number, name: string) => `Covers ${pct}% of ${name}'s monthly need`,
    impactOnce: (name: string) => `A one-time gift that reaches ${name} with a delivery receipt`,
    restored: "We kept what you chose before signing in: the amount and your message.",
    activates:
      "The sponsorship starts once payment is confirmed, and you can end it from your dashboard at any time — it stops after the last paid month.",
    continueTo: (k: string, n: string) => `Continue — ${k} for ${n}`,
    follow: "You follow it from “My portals” through the office's reports and photos.",
    remainingMonthly: "Still needed monthly",
    support: (n: string) => `Support ${n}`,
    barVerifying: "Under verification — not taking new sponsorships yet",
    barSimilar: "Children ready now",
  },
});

const orphanQuery = (orphanId: string) =>
  queryOptions({
    queryKey: ["orphan", orphanId],
    queryFn: () => getPublicOrphan({ data: { id: orphanId } }),
  });

export const Route = createFileRoute("/orphans/$orphanId")({
  // ملفٌّ غير متاح يُرسم داخل الصفحة (OrphanUnavailable) بطريقٍ إلى الدليل، لا صفحة 404 عامّة.
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(orphanQuery(params.orphanId)),
  head: ({ loaderData, match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    const brand = brandFor(l);
    if (!loaderData?.orphan) {
      return {
        meta: [
          { title: pageTitle(c.unavailable, true, l) },
          { name: "description", content: c.unavailable },
          { property: "og:title", content: pageTitle(c.unavailable, true, l) },
          { property: "og:description", content: c.unavailable },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary" },
          { name: "robots", content: CHILD_PAGE_ROBOTS },
        ],
      };
    }
    const title = `${c.sponsorOf(isolate(loaderData.orphan.display_name))} — ${brand.name} — ${brand.slogan}`;
    // معاينة المشاركة تُخزَّن عند المنصّات بعد انتهاء الموافقة نفسها، فلا
    // تحمل اسم الطفل: عنوانٌ عامّ للملف، والاسم يبقى في الصفحة لمن يفتحها.
    const shareTitle = `${c.shareTitle} — ${brand.name} — ${brand.slogan}`;
    const description = brand.description;
    return {
      // صفحة الطفل ليست للفهرسة ولا لخزائن البحث (CP-13): لا `noindex` فقط بل
      // لا نسخة مخزّنة ولا مقتطف ولا صورة. والدليل `/orphans` هو المفهرَس.
      // ولا بيانات منظّمة هنا: كانت تصف الطفل «عرضاً» بسعرٍ و«متوفّر/نفد»،
      // وكانت تحمل اسمه خاماً داخل <script> فيكسره اسمٌ فيه `</script>`
      // (APP-01). وأيّ JSON-LD مستقبلاً يمرّ بـ`jsonLdScript` وحدها.
      meta: [
        { title },
        { name: "robots", content: CHILD_PAGE_ROBOTS },
        { name: "description", content: description },
        { property: "og:title", content: shareTitle },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: OrphanRoute,
});

function OrphanRoute() {
  const { orphanId } = Route.useParams();
  const { data } = useSuspenseQuery(orphanQuery(orphanId));
  return data.orphan ? <OrphanDetail /> : <OrphanUnavailable />;
}

function OrphanDetail() {
  const { orphanId } = Route.useParams();
  const { data } = useSuspenseQuery(orphanQuery(orphanId));
  const { user } = useAuth();
  const navigate = useNavigate();
  const locale = useLocale();
  const t = useCopy(COPY);
  // أسماء المسارات من مكانها الواحد، كما في «اختر أثرك» في الصفحة الأولى.
  const g = useGivingCopy();

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
  // شرط الثقة: ملفٌّ قيد التحقق لا يقبل كفالةً جديدة (الحارس في القاعدة؛ هنا يُشرح بدل أن يفشل).
  const { data: verification } = usePublicVerification(orphanId);
  const verifying = verification?.accepts === false;
  const pay = useServerFn(startCheckout);
  // إثباتٌ اجتماعي صادق: من أرقام المنصّة الحقيقية فقط، ويُخفى إن غابت.
  const fetchStats = useServerFn(getPlatformStats);
  const { data: stats } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: () => fetchStats(),
    staleTime: 10 * 60_000,
  });

  const percent = fundingPercent(orphan.monthly_need, orphan.funded_monthly);
  const remaining = Math.max(0, Number(orphan.monthly_need) - Number(orphan.funded_monthly));
  const surplus = Math.max(0, Number(orphan.funded_monthly) - Number(orphan.monthly_need));
  // بدائل جاهزة لملفٍّ قيد التحقق، بفجوته أو باحتياجه كلّه إن غُطّي.
  const similarAmount = Math.round(remaining > 0 ? remaining : Number(orphan.monthly_need));
  const { data: similar } = useSimilarReady(orphanId, similarAmount, verifying);
  const hasSimilar = (similar?.suggestions.length ?? 0) > 0;

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
  // الصورة الخاصّة تُنزَّل بجلسة القارئ عند كلّ عرض؛ لا رابط موقَّعاً يبقى بعد سحب الموافقة.
  const { url: privatePhoto } = usePrivateFile(CHILD_PHOTO_BUCKET, detail?.photo_path);

  const [amount, setAmount] = useState(String(remaining > 0 ? Math.round(remaining) : 50));
  // عملة الدفع: عملة الملفّ افتراضاً، ومعها عملة بلد الطفل والعملة الموحّدة حيث
  // لهما سعرٌ مخزَّن ويحصّل بهما المزوّد. تعذّر القراءة = عملة الملفّ وحدها كما كان.
  const fetchPayOptions = useServerFn(getPayOptions);
  const { data: payData } = useQuery({
    queryKey: ["pay-options", orphanId, orphan.currency],
    queryFn: () => fetchPayOptions({ data: { orphanId, currency: orphan.currency } }),
    staleTime: 5 * 60_000,
  });
  const payOptions = payData ?? needOnly(orphan.currency);
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  // ما اختاره الداعم يُحترم ما دام ممّا يُدفع به؛ وإلا عملة الملفّ.
  const payCurrency =
    chosenCurrency && canPayIn(payOptions, chosenCurrency) ? chosenCurrency : orphan.currency;
  const need = Number(orphan.monthly_need);
  const presets = presetsIn(payOptions, payCurrency, need, remaining);
  const quote = quoteFor(payOptions, Number(amount), payCurrency);
  /** ما يُقيَّد لحاجة الطفل من المبلغ المكتوب، بعملة الملفّ */
  const credited = quote?.credited.amount ?? 0;
  function switchCurrency(next: string) {
    if (next === payCurrency) return;
    // typed by hand: the number stays; picked from the suggestions: the same suggestion
    setAmount(
      amountAfterSwitch(
        presetKeyOf(presets, Number(amount)),
        amount,
        presetsIn(payOptions, next, need, remaining),
      ),
    );
    setChosenCurrency(next);
    setExcessOffer(null);
  }
  const [anonymous, setAnonymous] = useState(false);
  // الشهري هو الأصل، والعطاء لمرّة واحدة بابٌ أخفّ لأوّل خطوة (الخادم يقبل النوعين).
  const [cadence, setCadence] = useState<"monthly" | "one_time">("monthly");
  const [mode, setMode] = useState<"monthly" | SupportKind>("monthly");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  // العائد من الدخول يجد ما اختاره كما تركه (UX-09): المبلغ والرسالة والإخفاء.
  // يُقرأ بعد التركيب (sessionStorage في المتصفّح وحده) ثم يُمحى.
  const [restored, setRestored] = useState(false);
  /* مقترح الوضع التجريبي الذي ضغط الزائر «استعمله»: يُخفى حين تُنشأ الكفالة الحقيقية فعلاً */
  const usedProposal = useRef<string | null>(null);
  useEffect(() => {
    const draft = loadDraft(orphanId);
    if (!draft) return;
    clearDraft(orphanId);
    setAmount(draft.amount);
    // the amount was typed in this currency; it is honoured once the options confirm it is payable
    setChosenCurrency(draft.currency);
    setMessage(draft.message);
    setAnonymous(draft.anonymous);
    // one-time stays one-time: the type of gift is part of what the visitor chose
    setCadence(draft.cadence);
    setMode("monthly");
    setRestored(true);
    requestAnimationFrame(() =>
      document.getElementById("sponsor-form")?.scrollIntoView({ block: "center" }),
    );
  }, [orphanId]);
  // اقتراح التجاوز يُملأ من ردّ الخادم حين يزيد المبلغ عن المتبقّي.
  const [excessOffer, setExcessOffer] = useState<{
    gap: number;
    excess: number;
    suggestions: SuggestedOrphan[];
  } | null>(null);

  /** afterAuth: called from the in-page sign-in, before `user` has refreshed in this render */
  async function onSponsor(confirmExcess = false, afterAuth = false) {
    // the draft only bridges a full-page sign-in (OAuth); signed in here, it has served its purpose
    if (afterAuth) clearDraft(orphanId);
    if (!user && !afterAuth) {
      saveDraft({
        orphanId,
        name: orphan.display_name,
        amount,
        message,
        anonymous,
        currency: payCurrency,
        cadence,
      });
      navigate({ to: "/auth", search: { redirect: `/orphans/${orphanId}` } });
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 5) {
      toast.error(t.badAmount);
      return;
    }
    setPending(true);
    try {
      const res = await submit({
        data: {
          orphanId,
          amount: value,
          type: cadence,
          isAnonymous: anonymous,
          message: message.trim() || undefined,
          confirmExcess,
          ...(payCurrency !== orphan.currency ? { currency: payCurrency } : {}),
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
        toast.error(res.error ?? t.createFailed);
        return;
      }
      setExcessOffer(null);
      clearDraft(orphanId);
      if (usedProposal.current) trialSlots?.dismissProposal(usedProposal.current);
      // الدفع مباشرةً بعد «ابدأ»: لا يُترك الداعم يبحث عن «أكمل الدفع» في لوحته.
      toast.success(t.toPayment);
      try {
        const checkout = await pay({ data: { sponsorshipId: res.sponsorshipId } });
        if (checkout.ok) {
          window.location.href = checkout.checkoutUrl;
          return;
        }
      } catch {
        /* falls through to «أثري», where the payment waits at the top */
      }
      toast.message(t.payLater);
      navigate({ to: "/dashboard" });
    } catch {
      toast.error(t.unexpected);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-10">
        <Link
          to="/orphans"
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          {t.back}
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <MuralImage
                photoUrl={privatePhoto ?? detail?.photo_url ?? null}
                displayName={orphan.display_name}
                register={registerFor(orphan.status, percent)}
                className="aspect-[16/9] bg-secondary"
                priority
              />
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-[1.75rem] leading-tight font-extrabold md:text-[2rem]">
                    <Name>{orphan.display_name}</Name>
                  </h1>
                  <FollowButton
                    child={{ id: orphan.id, name: orphan.display_name }}
                    className="ms-auto"
                  />
                  {detail?.real_name && (
                    <span className="text-sm text-muted-foreground">
                      (<Name>{detail.real_name}</Name>)
                    </span>
                  )}
                  <Badge variant="secondary">{t.fileNo(orphan.code)}</Badge>
                  <VerificationBadge orphanId={orphan.id} />
                  {orphan.status === "fully_sponsored" && <Badge>{t.full}</Badge>}
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <span>{orphan.gender === "female" ? t.female : t.male}</span>
                  {orphan.age_band !== "unknown" && (
                    <span>
                      {t.ages[orphan.age_band]} {t.years}
                    </span>
                  )}
                  {(orphan.country ?? orphan.region) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-4" />{" "}
                      {[placeLabel(orphan.country, orphan.region, locale), detail?.city]
                        .filter(Boolean)
                        .join(" — ")}
                    </span>
                  )}
                  {orphan.education_stage && (
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="size-4" /> {orphan.education_stage}
                    </span>
                  )}
                </div>

                {/* كم نعرف عنه — قبل القصّة، لأنّ الثقة تسبق التعاطف. */}
                <TrustSignals
                  className="mt-4 rounded-xl bg-secondary/60 px-3 py-2"
                  profileSections={orphan.profile_sections}
                  consentDocumented={orphan.consent_documented}
                  building={orphan.building}
                  recentReport={orphan.recent_report}
                />

                {detail?.story && (
                  <p className="mt-6 whitespace-pre-line text-base leading-8">{detail.story}</p>
                )}
                <Button asChild variant="outline" className="mt-5">
                  <Link to="/ask" search={{ child: orphanId }}>
                    {locale === "ar" ? "اسأل عن هذا الملفّ" : "Ask about this profile"}
                  </Link>
                </Button>
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

            {/* ما تمنحه الإدارة يظهر هنا قسماً قسماً، وما لم يُمنح مقفلٌ يدلّ على طريقه. */}
            {user && (
              <ScopedSections
                orphanId={orphanId}
                onRequest={
                  orphan.may_view_detail
                    ? undefined
                    : () =>
                        document
                          .getElementById("gate-title")
                          ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              />
            )}

            {(detail?.needs.length ?? 0) > 0 && (
              <div className="mt-6 rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-bold">{t.needsH}</h2>
                <ul className="mt-4 divide-y divide-border">
                  {(detail?.needs ?? []).map((need) => (
                    <li key={need.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {need.title ?? t.needCats[need.category] ?? need.category}
                        </p>
                        {need.title && (
                          <p className="text-xs text-muted-foreground">
                            {t.needCats[need.category] ?? need.category}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-bold text-primary">
                        {formatMoney(need.monthly_amount, orphan.currency, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.org && (
              <div className="mt-6 rounded-2xl border border-border bg-card p-6">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Building2 className="size-5 text-shore-need" /> {t.org}
                </h2>
                <p className="mt-2 font-medium">{data.org.name}</p>
                <p className="text-sm text-muted-foreground">
                  {/* في حشدٍ صغير تدلّ مدينة الجهة على الطفل، فتُحجب. */}
                  {orphan.cohort_small
                    ? t.hiddenLoc
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
              aria-label={t.kindLabel}
              className="mb-3 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1"
            >
              {SUPPORT_MODES.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mode === key}
                  onClick={() => setMode(key)}
                  className={cn(
                    "min-h-11 rounded-xl px-2 py-2 text-sm font-medium transition-colors",
                    mode === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {g.tracks[key].name}
                </button>
              ))}
            </div>
            {mode === "monthly" ? (
              <div
                id="sponsor-form"
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <p className="text-sm text-muted-foreground">{t.monthlyNeed}</p>
                <p className="mt-1 text-3xl font-extrabold text-primary">
                  {formatMoney(orphan.monthly_need, orphan.currency, locale)}
                </p>
                <CrossingProgress percent={percent} className="mt-4" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {surplus > 0
                    ? t.covered
                    : t.coveredPct(percent, formatMoney(remaining, orphan.currency, locale))}
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
                  {verifying && (
                    <p
                      role="status"
                      className="rounded-xl border border-border bg-secondary/60 px-3 py-2 text-sm leading-7"
                    >
                      {t.verifying}
                    </p>
                  )}
                  {verifying && <SimilarReadyChildren orphanId={orphanId} amount={similarAmount} />}
                  {restored && (
                    <p
                      role="status"
                      className="rounded-xl bg-shore-thrive/10 px-3 py-2 text-sm leading-7 text-shore-thrive"
                    >
                      {t.restored}
                    </p>
                  )}
                  {/* من الوضع التجريبي: مقترحٌ لا يُطبَّق إلا بضغطة، ولا يُعرض بعملةٍ لا تُقبل هنا */}
                  {ProposalOffer && (
                    <ProposalOffer
                      tracks={["sponsorship"]}
                      co={resolveCountry(orphan.country)}
                      usable={(p) => canPayIn(payOptions, p.currency)}
                      onUse={(p) => {
                        setChosenCurrency(p.currency);
                        setAmount(String(p.amount));
                        setCadence(p.cadence);
                        setExcessOffer(null);
                        usedProposal.current = p.id;
                      }}
                    />
                  )}
                  <div
                    role="radiogroup"
                    aria-label={t.cadence}
                    className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
                  >
                    {(["monthly", "one_time"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={cadence === k}
                        onClick={() => setCadence(k)}
                        className={cn(
                          "min-h-11 rounded-lg text-sm font-bold transition-colors",
                          cadence === k
                            ? "bg-card text-foreground shadow-soft"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {k === "monthly" ? t.monthly : t.once}
                      </button>
                    ))}
                  </div>
                  <PayCurrencyChoice
                    options={payOptions.options}
                    value={payCurrency}
                    onChange={switchCurrency}
                  />
                  <div>
                    <Label htmlFor="amount">{t.amount(payCurrency)}</Label>
                    <Input
                      id="amount"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="mt-2"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {presets.gap !== null && (
                        <button
                          type="button"
                          onClick={() => setAmount(String(presets.gap))}
                          className="border-bridge text-bridge-ink inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium hover:bg-bridge/10"
                        >
                          {t.fullRest}
                        </button>
                      )}
                      {presets.amounts.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAmount(String(v))}
                          className="inline-flex min-h-11 min-w-14 items-center justify-center rounded-md border border-input px-4 text-sm tabular-nums hover:bg-secondary"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <FxNote quote={quote} childName={orphan.display_name} className="mt-3" />
                  </div>

                  <div>
                    <Label htmlFor="message">{t.message}</Label>
                    <Textarea
                      id="message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      className="mt-2"
                      placeholder={t.messagePh}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={anonymous}
                      onCheckedChange={(v) => setAnonymous(v === true)}
                    />
                    {t.anonymous}
                  </label>

                  <ImpactLine
                    text={
                      cadence === "one_time"
                        ? t.impactOnce(isolate(orphan.display_name))
                        : credited >= remaining && remaining > 0
                          ? t.impactFull(isolate(orphan.display_name))
                          : credited > 0 && need > 0
                            ? t.impactPart(
                                Math.min(100, Math.round((credited / need) * 100)),
                                isolate(orphan.display_name),
                              )
                            : null
                    }
                  />

                  {excessOffer && (
                    <ExcessSuggestion
                      gap={excessOffer.gap}
                      excess={excessOffer.excess}
                      currency={orphan.currency}
                      suggestions={excessOffer.suggestions}
                      pending={pending}
                      onUseGapOnly={() => {
                        // the remaining gap as it is written in the payment currency
                        setAmount(
                          String(
                            presetsIn(payOptions, payCurrency, need, excessOffer.gap).gap ??
                              Math.round(excessOffer.gap),
                          ),
                        );
                        setExcessOffer(null);
                      }}
                      onConfirm={() => void onSponsor(true)}
                    />
                  )}

                  <SupporterModeGate>
                    {user ? (
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={() => void onSponsor()}
                        disabled={pending || verifying}
                      >
                        {pending && <Loader2 className="size-4 animate-spin" />}
                        {cadence === "one_time" ? t.startOnce : t.start}
                      </Button>
                    ) : (
                      // الدخول في الصفحة نفسها، ثم تُسجَّل الكفالة وينتقل إلى الدفع دون نقرةٍ ثانية.
                      <AuthDialog
                        title={t.signIn}
                        hint={t.signInHint}
                        onDone={() => void onSponsor(false, true)}
                        trigger={(open) => (
                          <Button
                            className="w-full"
                            size="lg"
                            disabled={pending}
                            onClick={() => {
                              saveDraft({
                                orphanId,
                                name: orphan.display_name,
                                amount,
                                message,
                                anonymous,
                                currency: payCurrency,
                                cadence,
                              });
                              open();
                            }}
                          >
                            {pending && <Loader2 className="size-4 animate-spin" />}
                            {t.signIn}
                          </Button>
                        )}
                      />
                    )}
                  </SupporterModeGate>

                  {stats && stats.totalOrphans > 0 && stats.fullySponsored > 0 && (
                    <p className="text-center text-xs leading-6 text-muted-foreground">
                      {t.proof(stats.fullySponsored, stats.totalOrphans)}
                    </p>
                  )}
                  <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-shore-thrive" />
                    {t.activates}
                  </p>
                </div>
              </div>
            ) : (
              <div
                id="sponsor-form"
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <p className="font-semibold">{t.kinds[mode].label}</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.kinds[mode].text}</p>
                <Button asChild className="mt-5 w-full" size="lg">
                  <Link
                    to="/support"
                    search={{
                      orphan: orphan.id,
                      name: orphan.display_name,
                      kind: mode,
                      // المبلغ المقترح في «ادعم» يأتي من فجوة الطفل بعملته.
                      ...(remaining > 0 ? { gap: remaining, cur: orphan.currency } : {}),
                    }}
                  >
                    {t.continueTo(t.kinds[mode].label, isolate(orphan.display_name))}
                  </Link>
                </Button>
                <p className="mt-3 text-xs text-muted-foreground">{t.follow}</p>
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
      <div className="border-border bg-background/95 sticky bottom-0 z-40 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {verifying ? (
              <p className="flex items-center gap-1.5 text-sm leading-6 font-semibold">
                <Clock className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                {t.barVerifying}
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t.remainingMonthly}</p>
                <p className="text-bridge-ink text-base font-extrabold tabular-nums">
                  {formatMoney(remaining, orphan.currency, locale)}
                </p>
              </>
            )}
          </div>
          {verifying && hasSimilar ? (
            // الفعل المتاح فعلاً: لا زرّ كفالةٍ يُضغط فيفشل، بل الطريق إلى طفلٍ جاهز.
            <Button asChild size="lg" variant="outline" className="min-h-11 flex-1">
              <a href={`#${SIMILAR_READY_ID}`}>{t.barSimilar}</a>
            </Button>
          ) : verifying ? (
            <Button size="lg" className="min-h-11 flex-1" disabled>
              {t.support(isolate(orphan.display_name))}
            </Button>
          ) : (
            <Button asChild size="lg" className="min-h-11 min-w-0 flex-1">
              <a href="#sponsor-form" className="truncate">
                {t.support(isolate(orphan.display_name))}
              </a>
            </Button>
          )}
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

/** the impact of this amount, shown before paying */
function ImpactLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p
      aria-live="polite"
      className="flex items-center gap-2 rounded-xl bg-bridge/8 px-3 py-2 text-sm font-medium leading-7 text-bridge-ink"
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-bridge" />
      {text}
    </p>
  );
}
