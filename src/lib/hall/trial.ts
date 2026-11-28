/**
 * قاعة الأثر في وضع التجربة — نموذجها كلّه من كتالوج التجربة الواحد، لا من أرقامٍ خاصّة بها:
 * الدول والمناطق وأعدادها والمجموعات من `try-places`، والأطفال وحاجتهم وعطاءاتهم من `try-demo`،
 * والتعهّدات وما يُقرأ منها من `try-support`، وأسماء الأنواع من `giving-tracks`، والعملات من
 * `currency`. موضع العمود على الخريطة (هندسة، لا رقم) يضيفه المشهد من `model` بمعرّف المنطقة؛ وهذا
 * الملفّ لا يستورد `model` كي لا تتغيّر حزم بقية الصفحات.
 *
 * ما يُسجَّل في القاعة يُكتب في المخزنين نفسيهما (`addPledge` و`addGift`)، فيظهر في «أثري»؛
 * وما سُجِّل في الصفحات يُقرأ هنا عند الدخول. يُحمَّل مع القاعة في وضع التجربة وحده.
 */
import { NETWORK_SITES } from "@/data/vision-network";
import { GIVING_TRACKS, givingCopy, type GivingTrack } from "@/config/giving-tracks";
import { countryName } from "@/lib/countries";
import { currencyName } from "@/lib/currency";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { copyOf, defineCopy, dirOf, pluralOf, type Locale } from "@/lib/locale";
import { defaultIndividualAmount, INDIVIDUAL_AMOUNTS } from "@/lib/support-amounts";
import {
  cohortSafe,
  deliveryTotals,
  IMPACT_COHORT_MIN,
  type TraitMovement,
} from "@/lib/support-impact";
import {
  addGift,
  coverageAfter,
  gapOf,
  loadGifts,
  localTryChild,
  TRY_CURRENCY,
  TRY_EVENT,
  tryChild,
  type TryGift,
} from "@/lib/try-demo";
import {
  TRY_PLACES,
  TRY_SESSIONS,
  tryChildIn,
  tryGroupName,
  tryPlace,
  tryRegionName,
  tryRegionOfChild,
} from "@/lib/try-places";
import { tryPledgeCurrencies, tryReachText } from "@/lib/try-reach";
import {
  addPledge,
  loadPledges,
  tryInKind,
  tryOrphanQualification,
  tryPlaceStates,
  tryQualification,
  tryThen,
  type TryPledge,
} from "@/lib/try-support";

/** the hall's three visual languages, by the kind of giving that drives each */
export const KIND_TRACK = {
  qualification: "qualify",
  monthly: "sponsor",
  in_kind: "kiswa",
} as const;

export type TrialKid = {
  id: string;
  name: string;
  code: string;
  covers: string;
  /** the child's monthly need and what is still open of it, in the file's currency */
  need: number;
  gap: number;
  currency: string;
  /** this visitor's gift to the child, if any */
  gift: TryGift["cadence"] | null;
  /** share of the monthly need covered, before and with this visitor's monthly gift, 0..100 */
  coverage: [number, number];
  /** the child's own journey once a qualification pledge reaches them */
  journey: { held: number; planned: number; before: boolean; after: boolean } | null;
};

export type TrialRegion = {
  /** the hall's region id (`TryRegion.hall`), the map's id, and the name in the interface language */
  id: string;
  mapId: string;
  ar: string;
  /** children with a file here; the column's height */
  need: number;
  /** children under a qualification pledge; the filled part of the column */
  qualified: number;
  /** trial children here this visitor sponsors monthly; the lanterns */
  sponsored: number;
  /** documented in-kind deliveries; the pearls */
  clothed: number;
  started: number;
  completed: number;
  sessionsPlanned: number;
  sessionsHeld: number;
  group: { id: string; name: string; children: number } | null;
  kids: TrialKid[];
};

export type TrialCountry = {
  co: string;
  name: string;
  children: number;
  enrolled: number;
  started: number;
  completed: number;
  sessionsPlanned: number;
  sessionsHeld: number;
  deliveries: number;
  sponsored: number;
  sessions: number;
  group: { id: string; name: string; children: number };
  /** the currencies a pledge here is recorded in: the trial's file currency first, as on the sheet */
  currencies: string[];
  regions: TrialRegion[];
};

export type TrialDetail =
  | {
      type: "area";
      enrolled: number | null;
      started: number | null;
      completed: number | null;
      sessionsHeld: number;
      sessionsPlanned: number;
      traits: TraitMovement[] | null;
    }
  | { type: "journey"; held: number; planned: number; before: boolean; after: boolean }
  | { type: "in_kind"; documented: number; preparing: number }
  | { type: "monthly"; cadence: TryGift["cadence"]; coverage: number };

/** one thing this visitor recorded in the trial, from the hall or from the pages */
export type TrialEntry = {
  id: string;
  kind: GivingTrack;
  kindName: string;
  /** the target as «أثري» names it, and the country it stands in */
  label: string;
  co: string;
  country: string;
  /** the hall region it stands in; null for a whole country */
  region: string | null;
  amount: number;
  currency: string;
  money: string;
  at: string;
  date: string;
  months: number;
  detail: TrialDetail;
};

export type TrialHall = {
  countries: Record<string, TrialCountry>;
  /** newest first */
  history: TrialEntry[];
};

export type TrialDraft =
  | {
      kind: "qualification" | "in_kind";
      co: string;
      region: string;
      amount: number;
      currency: string;
    }
  | { kind: "monthly"; childId: string };

const DRAFT_ID = "DEMO-PLG-DRAFT";

/** the pledge a draft would record: a region of the catalogue, at the amount as typed */
function pledgeOf(d: Extract<TrialDraft, { amount: number }>) {
  const r = tryPlace(d.co)?.regions.find((x) => x.hall === d.region);
  return r
    ? {
        kind: d.kind,
        scope: "region" as const,
        target: r.id,
        co: d.co,
        amount: d.amount,
        currency: d.currency,
      }
    : null;
}

/** the gift a draft would record: the child's open need, monthly, in the file's currency */
function giftOf(d: Extract<TrialDraft, { childId: string }>) {
  const k = tryChild(d.childId);
  return k && gapOf(k) > 0
    ? { childId: k.id, amount: gapOf(k), cadence: "monthly" as const }
    : null;
}

/**
 * the hall's trial model as of `now`: every figure is the catalogue's or is read from the
 * visitor's own pledges and gifts by the functions «أثري» reads them with.
 */
export function trialHall(input: {
  pledges: TryPledge[];
  gifts: TryGift[];
  now: Date;
  locale: Locale;
  /** the countries to build (the ones the hall draws); every country of the catalogue when absent */
  only?: ReadonlySet<string> | null;
}): TrialHall {
  const { now, locale } = input;
  const made = (at: string) => Date.parse(at) <= now.getTime();
  const pledges = input.pledges.filter((p) => made(p.at));
  const gifts = input.gifts.filter((g) => made(g.at));
  const giving = givingCopy(locale).tracks;
  const states = tryPlaceStates(pledges, gifts, now);

  const countries: Record<string, TrialCountry> = {};
  for (const place of TRY_PLACES) {
    if (input.only && !input.only.has(place.co)) continue;
    const state = states.find((s) => s.co === place.co)!;
    const group = {
      id: place.group.id,
      name: tryGroupName(place.group.id, locale),
      children: place.group.children,
    };
    const regions = place.regions.map((r, i): TrialRegion => {
      const s = state.regions.find((x) => x.id === r.id)!;
      const journey = s.lead < 0 ? null : tryOrphanQualification(s.lead, locale);
      return {
        id: r.hall,
        mapId: r.id,
        ar: tryRegionName(r.id, locale),
        need: r.children,
        qualified: s.enrolled,
        sponsored: s.sponsored,
        clothed: s.deliveries,
        started: s.started,
        completed: s.completed,
        sessionsPlanned: s.sessionsPlanned,
        sessionsHeld: s.sessionsHeld,
        group: i === 0 ? group : null,
        kids: [tryChildIn(place.co, r.hall)].flatMap((raw): TrialKid[] => {
          if (!raw) return [];
          const k = localTryChild(raw, locale);
          const mine = gifts.filter((g) => g.childId === k.id);
          const monthly = mine.find((g) => g.cadence === "monthly");
          return [
            {
              id: k.id,
              name: k.name,
              code: k.code,
              covers: k.covers,
              need: k.need,
              gap: gapOf(k),
              currency: TRY_CURRENCY,
              gift: monthly ? "monthly" : mine.length ? "one_time" : null,
              coverage: [
                coverageAfter(k, 0, "monthly"),
                coverageAfter(k, monthly ? monthly.amount : gapOf(k), "monthly"),
              ],
              journey: journey && {
                held: journey.units_accepted,
                planned: journey.units_total,
                before: journey.measured_before,
                after: journey.measured_after,
              },
            },
          ];
        }),
      };
    });
    const sum = (f: (r: TrialRegion) => number) => regions.reduce((a, r) => a + f(r), 0);
    countries[place.co] = {
      co: place.co,
      name: countryName(place.co, locale),
      children: state.children,
      enrolled: sum((r) => r.qualified),
      started: sum((r) => r.started),
      completed: sum((r) => r.completed),
      sessionsPlanned: sum((r) => r.sessionsPlanned),
      sessionsHeld: sum((r) => r.sessionsHeld),
      deliveries: state.deliveries,
      sponsored: sum((r) => r.sponsored),
      sessions: TRY_SESSIONS,
      group,
      currencies: tryPledgeCurrencies(place.co).map((o) => o.currency),
      regions,
    };
  }

  const regionOf = (p: TryPledge): string | null => {
    const place = tryPlace(p.co);
    if (!place || p.scope === "country") return null;
    if (p.scope === "region") return place.regions.find((r) => r.id === p.target)?.hall ?? null;
    if (p.scope === "group") return place.regions[0].hall;
    return tryChild(p.target)?.region ?? null;
  };
  const byId = new Map(pledges.map((p) => [p.id, p]));
  const entry = (
    card: {
      id: string;
      label: string;
      amount: number;
      currency: string;
      at: string;
      months: number;
    },
    kind: GivingTrack,
    co: string,
    region: string | null,
    detail: TrialDetail,
  ): TrialEntry => ({
    id: card.id,
    kind,
    kindName: giving[kind].name,
    label: card.label,
    co,
    country: countryName(co, locale),
    region,
    amount: card.amount,
    currency: card.currency,
    money: formatMoney(card.amount, card.currency, locale),
    at: card.at,
    date: formatDate(card.at, locale),
    months: card.months,
    detail,
  });
  const history: TrialEntry[] = [
    ...tryQualification(pledges, now, locale).flatMap((q) => {
      const p = byId.get(q.id);
      if (!p) return [];
      const detail: TrialDetail = q.journey
        ? {
            type: "journey",
            held: q.journey.sessionsHeld,
            planned: q.journey.sessionsPlanned,
            before: q.journey.measuredBefore,
            after: q.journey.measuredAfter,
          }
        : { type: "area", ...q.area };
      return [entry(q, "qualification", p.co, regionOf(p), detail)];
    }),
    ...tryInKind(pledges, now, locale).flatMap((k) => {
      const p = byId.get(k.id);
      if (!p) return [];
      const t = deliveryTotals(k.deliveries);
      return [
        entry(k, "in_kind", p.co, regionOf(p), {
          type: "in_kind",
          documented: t.documented,
          preparing: t.preparing,
        }),
      ];
    }),
    ...gifts.flatMap((g) => {
      const raw = tryChild(g.childId);
      if (!raw) return [];
      const k = localTryChild(raw, locale);
      return [
        entry(
          {
            id: g.id,
            label: k.name,
            amount: g.amount,
            currency: TRY_CURRENCY,
            at: g.at,
            months: 0,
          },
          "monthly",
          k.co,
          tryRegionOfChild(k)?.hall ?? null,
          { type: "monthly", cadence: g.cadence, coverage: coverageAfter(k, g.amount, g.cadence) },
        ),
      ];
    }),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return { countries, history };
}

/** every string the hall shows only in the trial; the scene never writes one of its own */
export const TRIAL_COPY = defineCopy("lib/hall/trial", {
  ar: {
    sample: "بيانات نموذجية",
    children: pluralOf(
      { one: "طفلٌ واحد", two: "طفلان", few: "{0} أطفال", many: "{0} طفلاً", other: "{0} طفل" },
      0,
      "ar",
    ),
    today: "اليوم",
    after: pluralOf(
      {
        one: "بعد شهر",
        two: "بعد شهرين",
        few: "بعد {0} أشهر",
        many: "بعد {0} شهراً",
        other: "بعد {0} شهراً",
      },
      0,
      "ar",
    ),
    before: pluralOf(
      {
        one: "قبل شهر",
        two: "قبل شهرين",
        few: "قبل {0} أشهر",
        many: "قبل {0} شهراً",
        other: "قبل {0} شهراً",
      },
      0,
      "ar",
    ),
    simulated: "محاكاة",
    enrolled: "في صناديق تأهيلٍ انضممت إليها",
    started: "بدأوا الرحلة",
    completed: "أتمّوا الرحلة",
    held: "جلساتٌ قُبلت",
    planned: (n: string) => `من ${n} مقرّرة`,
    deliveries: "تسليماتٌ موثّقة",
    preparing: "قيد التجهيز",
    sponsored: "في كفالتك",
    withFile: "يتيماً بملفٍّ موثّق",
    fewer: (n: string) => `أقل من ${n}`,
    was: "قبل",
    now: "الآن",
    move: (a: string, b: string) => `${a} ← ${b}`,
    world: {
      sect: "دول التجربة",
      /* the sentence above the list counts the list itself: confirmed presence apart from the
         countries the trial alone opens */
      count: (total: string, sites: string, trialOnly: string) =>
        `تفتح التجربة كلّ الدول المرسومة هنا، وعددها ${total}: مقرّ الندوة في الرياض، و${sites}، و${trialOnly}.`,
      sites: pluralOf(
        {
          one: "موقعٌ واحد مؤكَّد الحضور",
          two: "موقعان مؤكَّدا الحضور",
          few: "{0} مواقع مؤكَّدة الحضور",
          many: "{0} موقعاً مؤكَّد الحضور",
          other: "{0} موقع مؤكَّد الحضور",
        },
        0,
        "ar",
      ),
      trialOnly: pluralOf(
        {
          zero: "لا دولة بلا حضورٍ مؤكَّد",
          one: "دولةٌ واحدة بلا حضورٍ مؤكَّد للندوة، فُتحت للتجربة وحدها",
          two: "دولتان بلا حضورٍ مؤكَّد للندوة، فُتحتا للتجربة وحدها",
          few: "{0} دول بلا حضورٍ مؤكَّد للندوة، فُتحت للتجربة وحدها",
          many: "{0} دولةً بلا حضورٍ مؤكَّد للندوة، فُتحت للتجربة وحدها",
          other: "{0} دولة بلا حضورٍ مؤكَّد للندوة، فُتحت للتجربة وحدها",
        },
        0,
        "ar",
      ),
      unconfirmedMark: "بلا حضورٍ مؤكَّد · للتجربة وحدها",
      sub: "كلّ دولةٍ هنا تُدخَل وتُدعَم في التجربة، للندوة فيها مكتبٌ أو نشاطٌ أو لا شيء. لكلٍّ منها منطقتان ومجموعةٌ وطفل بأعدادٍ نموذجية، هي نفسها في خريطة الدعم وفي «أثري».",
      lead: "ادخلها وادعم طفلاً أو مجموعةً أو منطقةً أو الدولة كلّها، بأنواع الدعم الثلاثة، ثم شاهد الأثر.",
      regions: "مناطق التجربة",
      kid: "طفل التجربة",
      kidLine: (name: string, code: string) => `${name} · ${code}`,
      org: {
        hq: "للندوة هنا مقرّها الرئيسي",
        office: "للندوة هنا مكتبٌ وطني",
        field: "للندوة هنا نشاطٌ ميداني",
        unconfirmed: "لا مكتب مؤكَّداً للندوة هنا، والتجربة تشمل كلّ الدول",
      },
      more: "بقية دول العالم تدخلها من خريطة الدعم",
      group: "مجموعة التجربة",
      note: "أعدادٌ نموذجية، هي نفسها في خريطة الدعم وفي «أثري».",
      enter: (name: string) => `ادخل ${name}`,
      back: "عودة إلى القاعة",
    },
    country: {
      title: (name: string, when: string) => `${name} · ${when}`,
      sub: "ارتفاع كلّ عمود عدد أطفال المنطقة، والمملوء منه أطفال صندوق تأهيلٍ انضمّ إليه تعهّدك. الأعداد نموذجية، وهي نفسها في خريطة الدعم.",
      regions: "منطقتا التجربة",
      kid: (region: string) => `طفل التجربة في ${region}`,
      gap: (money: string) => `يتبقّى ${money} شهرياً`,
      sponsor: (name: string) => `اكفل ${name}`,
      mine: "في كفالتك · تصله كلّ شهرٍ بمستند",
      once: "قدّمت له عطاءً مرّةً واحدة",
      impact: "أثري",
      journey: (held: string, planned: string) => `رحلة تأهيله: ${held} من ${planned} جلسة`,
      elsewhere: "طفل التجربة ومجموعتها في",
      support: (region: string) => `ادعم ${region}`,
      other: "دولة أخرى",
      hint: "اسحب لتدور حول الدولة · المس عموداً لتختار منطقته",
      label: (region: string, n: string) => `${region} · ${n}`,
    },
    legend: { enrolled: "في التأهيل", sponsored: "في كفالتك", deliveries: "تسليماتٌ موثّقة" },
    support: {
      title: (region: string) => `ادعم ${region}`,
      sub: "اختر نوع الدعم ومقداره. يُسجَّل كما يُسجَّل من خريطة الدعم، ويظهر في «أثري».",
      kind: "نوع الدعم",
      pledge: "تعهّدٌ شهري",
      amount: "المبلغ الشهري",
      other: "مبلغ آخر",
      currency: "العملة",
      dest: "الوجهة",
      destOption: (region: string, n: string) => `${region}: ${n}`,
      confirm: (money: string) => `سجّل دعمي (محاكاة): ${money}`,
      sponsor: (name: string, money: string) => `اكفل ${name} (محاكاة): ${money} شهرياً`,
      back: "رجوع",
      note: "محاكاة: يُحفظ في متصفّحك وحده، ولا يُرسل شيء ولا يُخصم.",
      need: (name: string, need: string, gap: string) =>
        `حاجة ${name} الشهرية ${need}، ويتبقّى منها ${gap}. تُقيَّد بعملة ملفّه بلا تحويل.`,
      noChild: "طفل التجربة في هذه الدولة يقف في",
      already: (name: string) => `${name} في كفالتك. ترى ما يصله في «أثري».`,
    },
    preview: {
      eyebrow: "شاشة الأثر · قبل التسجيل",
      qTitle: (money: string, region: string) =>
        `لو تعهّدت بـ ${money} شهرياً تأهيلاً في ${region}`,
      qSessions: (n: string) => `جلسات الصندوق المقرّرة: ${n}`,
      qSessionsSub: (n: string) => `${n} جلسات لكلّ طفل، وقياسٌ للسمات الستّ قبلها وبعدها`,
      qStart: "لا أحد يبدأ يوم التعهّد",
      qStartSub: "في «أثري» ترى التأهيل يتقدّم شهراً بشهر: الجلسات، والقياس قبلها وبعدها.",
      kTitle: (money: string, region: string) => `لو تعهّدت بـ ${money} شهرياً عيناً في ${region}`,
      kCount: "يُعدّ التسليم الموثّق وحده",
      kCountSub: "عدد المستفيدين لا يُقيَّد، فلا يُدَّعى هنا",
      kNow: (region: string, n: string) => `تسليمات ${region} الموثّقة الآن: ${n}`,
      kNowSub: "في «أثري» ترى تعهّدك يُجهَّز ثم يُسلَّم بمستنده.",
      mTitle: (name: string, money: string) => `لو كفلت ${name} بـ ${money} شهرياً`,
      mCover: (a: string, b: string) => `تغطية حاجته الشهرية: ${a}% ← ${b}%`,
      mCoverSub: "حاجته بعملة ملفّه، بلا تحويل",
      mMonthly: "تصله كلّ شهرٍ بمستند",
      mIn: (region: string) => `يقف في ${region}`,
      mInSub: "فانوسٌ ينضمّ إلى مدار عمودها",
    },
    say: {
      qualification: (region: string) =>
        `انظر إلى العمود: امتلأ بأطفال صندوق ${region} الذي انضمّ إليه تعهّدك`,
      monthly: (name: string) => `انظر حول العمود: فانوس كفالتك لـ${name} انضمّ إلى المدار`,
      in_kind: "سُجّل تعهّدك العيني. يظهر هنا حين يوثَّق أوّل تسليم",
      once: (name: string, region: string) =>
        `عطاؤك لـ${name} مسجَّل في ${region}، وتراه في «أثري»`,
    },
    impact: {
      eyebrow: "شاشة الأثر · سُجّل دعمك",
      filmEyebrow: "شاشة الأثر · عرضٌ فقط، لم يُسجَّل شيء",
      title: (kind: string, target: string) => `${kind} · ${target}`,
      tabs: ["ما سُجّل", "الأثر بالمستويات", "ما التالي"],
      lead: "سُجّل دعمك في متصفّحك كما يُسجَّل من خريطة الدعم، وهو الآن في «أثري».",
      kind: "النوع",
      target: "الوجهة",
      amount: "المبلغ الشهري",
      date: "التاريخ",
      status: "الحالة",
      active: "نشط (محاكاة)",
      ref: "المرجع",
      levelsLead: "دعمك نفسه مقروءاً على مستوياته: الدولة، ثم المنطقة، ثم المجموعة، ثم الطفل.",
      level: { country: "الدولة", region: "المنطقة", group: "المجموعة", child: "الطفل" },
      qCountry: (region: string) =>
        `صندوق ${region} الذي انضممت إليه يحمل هؤلاء الأطفال من أطفال الدولة.`,
      qRegion:
        "الصندوق يُلحق أطفال المنطقة جميعاً برحلة التأهيل، وتعهّدك حصّةٌ منه. لم يبدأ أحدٌ يوم التعهّد.",
      qGroup: (n: string) => `المجموعة أوّل أطفال المنطقة، ولها ${n} جلسةً مقرّرة.`,
      qChild: (code: string) => `اسمٌ مستعار ورمزه ${code}. رحلته رحلة أوّل أطفال المنطقة.`,
      kCountry: "يُعدّ هنا ما وُثِّق تسليمه في الدولة، لا عدد الأطفال.",
      kRegion: "لم يوثَّق تسليمٌ بعد. يجهّزه المكتب المحلي أوّلاً، ثم يسلّمه بمستند.",
      mCountry: "كفالةٌ شهرية جديدة تصل بمستند كلّ شهر.",
      mRegion: "أطفال التجربة في المنطقة ممّن تكفلهم أنت.",
      mChild: (code: string) => `اسمٌ مستعار ورمزه ${code}. حاجته بعملة ملفّه.`,
      coverage: "تغطية حاجته الشهرية",
      sessions: "جلسات الرحلة",
      next: {
        qualification: "في «أثري» ترى التأهيل يتقدّم شهراً بشهر: الجلسات، والقياس قبلها وبعدها.",
        monthly: "في «أثري» ترى كلّ شهرٍ متى حُوِّل عطاؤك ومتى وصل بمستند.",
        in_kind: "في «أثري» ترى تعهّدك يُجهَّز ثم يُسلَّم بمستنده.",
      },
      slider: "وهنا في القاعة: عُد إلى الدولة وحرّك شريط الزمن لترى الأعداد نفسها تتقدّم.",
      see: "شاهد أثره",
      done: "سُجّل دعمك",
      doneSub: "اقرأ أثره: ما سُجّل، ثم أثره بالمستويات، ثم ما التالي.",
      perMonth: "كل شهر",
      summary: "خلاصة أثرك",
      again: "دعمٌ آخر",
    },
    big: {
      title: "أثر دعمك",
      sub: (target: string, country: string) =>
        `دعمك مسجَّل لـ${target} في ${country}. هذا ما تغيّر به، قبله وبعده.`,
      sect: (country: string) => `ما حرّكه دعمك في ${country}`,
      warm: "وراء كلّ رقمٍ هنا طفلٌ اقترب ممّا ينتظره، بفضل الله ثم بعطائك. جزاك الله خيراً.",
      note: "أعدادٌ نموذجية، وما سجّلته محفوظٌ في متصفّحك وحده.",
      hall: "عودة إلى القاعة",
      mine: "إلى أثري",
    },
    log: {
      title: "سجلّ أثرك",
      sub: "كلّ ما سجّلته في التجربة، من القاعة أو من الصفحات، كما في «أثري».",
      empty: "لم تسجّل دعماً بعد في التجربة. اختر أيّ دولةٍ وادعمها، فيُكتب هنا وفي «أثري».",
      world: "اختر دولة",
      close: "إغلاق",
      line: (money: string, country: string, date: string) =>
        `${money} كل شهر · ${country} · منذ ${date}`,
      gift: (money: string, country: string, date: string) => `${money} · ${country} · ${date}`,
      traits: "حركة السمات · من 100",
      traitsHidden: (n: string) =>
        `تظهر المتوسّطات حين يكون لـ${n} أطفال أو أكثر قياسٌ قبلي، حمايةً لهم من أن يُعرَفوا.`,
      measuredBefore: "قياسٌ قبلي",
      measuredAfter: "قياسٌ بعدي",
      yes: "وقع",
      no: "لم يقع بعد",
      cadence: { monthly: "شهرية", one_time: "مرّة واحدة" },
    },
    screen: {
      map: (name: string) => `${name}: بيانات نموذجية`,
      mapLine: (a: string, b: string, c: string) =>
        `${a} يتيماً بملفٍّ موثّق · في التأهيل: ${b} · تسليماتٌ موثّقة: ${c}`,
      regions: "منطقتا التجربة",
      enter: (name: string) => `المس الشاشة لتدخل ${name}`,
      tracksSub: {
        qualification: "جلساتٌ بمشرف، وقياسٌ للسمات قبلها وبعدها",
        monthly: "مبلغٌ شهري لطفلٍ بعينه يصله بمستند",
        in_kind: "يجهّزه المكتب ويسلّمه ويوثّقه",
      },
      tracksHow: {
        qualification: "تعهّدٌ شهري حرّ",
        monthly: "بعملة ملفّ الطفل",
        in_kind: "تعهّدٌ شهري حرّ",
      },
      impact: "أثرك حتى الآن",
      none: "لم تسجّل دعماً بعد.",
      noneSub: ["اختر أيّ دولةٍ وادعمها،", "فيُكتب هنا وفي «أثري»."],
      open: "المس الشاشة لتفتح سجلّ أثرك",
    },
    tracks: {
      sub: "ثلاثة أنواع، ولكلٍّ أثره في «أثري». الأسماء والوعود هي نفسها في المنصّة.",
      go: "اختر دولةً وادعم",
    },
    film: [
      "قاعة الأثر: هنا يرى الداعم أين يذهب دعمه، وماذا يغيّر",
      "شبكة الندوة: المقرّ في الرياض و{sites} موقعاً مؤكَّد الحضور",
      "نختار ألبانيا، وكلّ دولةٍ هنا تُدخَل، بمنطقتيها ومجموعتها وطفلها",
      "ندخلها: لكلّ منطقةٍ عمودٌ بعدد أطفالها، والمملوء منه من يشملهم تعهّد تأهيل",
      "نتعهّد لتيرانا تأهيلاً شهرياً، فتظهر حصّة التعهّد من صندوقها قبل تسجيله",
      "يتدفّق الدعم، ويمتلئ عمود تيرانا بأطفال الصندوق الذي انضمّ إليه التعهّد",
      "ثم الأثر بمستوياته: الدولة، والمنطقة، والمجموعة، والطفل",
      "وأخيراً أثرك أنت: ما تغيّر بدعمك، قبله وبعده",
    ],
  },
  en: {
    sample: "Sample data",
    children: pluralOf({ one: "{0} child", other: "{0} children" }),
    today: "Today",
    after: pluralOf({ one: "In {0} month", other: "In {0} months" }),
    before: pluralOf({ one: "{0} month ago", other: "{0} months ago" }),
    simulated: "Simulated",
    enrolled: "In qualification funds you joined",
    started: "Journeys begun",
    completed: "Journeys completed",
    held: "Sessions accepted",
    planned: (n: string) => `of ${n} planned`,
    deliveries: "Documented deliveries",
    preparing: "In preparation",
    sponsored: "Sponsored by you",
    withFile: "children with a verified file",
    fewer: (n: string) => `Fewer than ${n}`,
    was: "Before",
    now: "Now",
    move: (a: string, b: string) => `${a} → ${b}`,
    world: {
      sect: "Trial countries",
      count: (total: string, sites: string, trialOnly: string) =>
        `The trial opens all ${total} countries drawn here: WAMY's headquarters in Riyadh, ${sites}, and ${trialOnly}.`,
      sites: pluralOf({
        one: "{0} site of confirmed presence",
        other: "{0} sites of confirmed presence",
      }),
      trialOnly: pluralOf({
        one: "{0} country with no confirmed WAMY presence, opened for the trial only",
        other: "{0} countries with no confirmed WAMY presence, opened for the trial only",
      }),
      unconfirmedMark: "No confirmed presence · trial only",
      sub: "Every country here can be entered and supported in the trial, whether WAMY has an office there, field activity, or neither. Each has two regions, a group and a child with sample figures, the same ones as on the support map and in “My impact”.",
      lead: "Enter it and support a child, a group, a region or the whole country, in any of the three kinds of support, then see the impact.",
      regions: "Trial regions",
      kid: "Trial child",
      kidLine: (name: string, code: string) => `${name} · ${code}`,
      org: {
        hq: "WAMY's headquarters are here",
        office: "WAMY has a country office here",
        field: "WAMY has field activity here",
        unconfirmed: "No confirmed WAMY office here; the trial covers every country",
      },
      more: "Enter every other country from the support map",
      group: "Trial group",
      note: "Sample figures, the same ones as on the support map and in “My impact”.",
      enter: (name: string) => `Enter ${name}`,
      back: "Back to the hall",
    },
    country: {
      title: (name: string, when: string) => `${name} · ${when}`,
      sub: "Each column is as tall as its region's children, and the filled part is the children of a qualification fund your pledge joined. The figures are sample data, the same as on the support map.",
      regions: "The two trial regions",
      kid: (region: string) => `The trial child in ${region}`,
      gap: (money: string) => `${money} a month still open`,
      sponsor: (name: string) => `Sponsor ${name}`,
      mine: "Sponsored by you · delivered each month with a receipt",
      once: "You gave them a one-time gift",
      impact: "My impact",
      journey: (held: string, planned: string) =>
        `Qualification journey: ${held} of ${planned} sessions`,
      elsewhere: "The trial child and group are in",
      support: (region: string) => `Support ${region}`,
      other: "Another country",
      hint: "Drag to orbit the country · tap a column to choose its region",
      label: (region: string, n: string) => `${region} · ${n}`,
    },
    legend: {
      enrolled: "In qualification",
      sponsored: "Sponsored by you",
      deliveries: "Documented deliveries",
    },
    support: {
      title: (region: string) => `Support ${region}`,
      sub: "Choose the kind of support and its amount. It is recorded as it is from the support map, and shows in “My impact”.",
      kind: "Kind of support",
      pledge: "Monthly pledge",
      amount: "Monthly amount",
      other: "Other amount",
      currency: "Currency",
      dest: "For",
      destOption: (region: string, n: string) => `${region}: ${n}`,
      confirm: (money: string) => `Record my support (simulated): ${money}`,
      sponsor: (name: string, money: string) => `Sponsor ${name} (simulated): ${money} a month`,
      back: "Back",
      note: "Simulated: kept in your browser only. Nothing is sent and nothing is charged.",
      need: (name: string, need: string, gap: string) =>
        `${name} needs ${need} a month, and ${gap} of it is still open. It is recorded in the file's currency, with no conversion.`,
      noChild: "This country's trial child stands in",
      already: (name: string) => `You sponsor ${name}. “My impact” shows what reaches them.`,
    },
    preview: {
      eyebrow: "Impact screen · before recording",
      qTitle: (money: string, region: string) =>
        `If you pledged ${money} a month for qualification in ${region}`,
      qSessions: (n: string) => `Sessions planned in the fund: ${n}`,
      qSessionsSub: (n: string) =>
        `${n} sessions per child, with the six traits measured before and after`,
      qStart: "No one starts on the day of the pledge",
      qStartSub:
        "“My impact” shows the qualification advancing month by month: the sessions, and the measurement before and after.",
      kTitle: (money: string, region: string) =>
        `If you pledged ${money} a month in kind in ${region}`,
      kCount: "Only a documented delivery is counted",
      kCountSub: "The number of beneficiaries is not recorded, so it is not claimed here",
      kNow: (region: string, n: string) => `Documented deliveries in ${region} now: ${n}`,
      kNowSub: "“My impact” shows your pledge being prepared, then delivered with its document.",
      mTitle: (name: string, money: string) => `If you sponsored ${name} with ${money} a month`,
      mCover: (a: string, b: string) => `Monthly need covered: ${a}% → ${b}%`,
      mCoverSub: "The need is in the file's currency, with no conversion",
      mMonthly: "Delivered each month with a receipt",
      mIn: (region: string) => `Stands in ${region}`,
      mInSub: "A lantern joins the orbit of its column",
    },
    say: {
      qualification: (region: string) =>
        `The column filled with the children of the ${region} fund your pledge joined`,
      monthly: (name: string) => `A lantern for your sponsorship of ${name} joined the orbit`,
      in_kind: "In-kind pledge recorded. It shows here once a delivery is documented",
      once: (name: string, region: string) =>
        `Your gift to ${name} is recorded in ${region}, and “My impact” shows it`,
    },
    impact: {
      eyebrow: "Impact screen · your support is recorded",
      filmEyebrow: "Impact screen · a showing only, nothing was recorded",
      title: (kind: string, target: string) => `${kind} · ${target}`,
      tabs: ["What was recorded", "Impact by level", "What comes next"],
      lead: "Your support is recorded in your browser as it is from the support map, and it is now in “My impact”.",
      kind: "Kind",
      target: "For",
      amount: "Monthly amount",
      date: "Date",
      status: "Status",
      active: "Active (simulated)",
      ref: "Reference",
      levelsLead:
        "The same support read level by level: the country, then the region, then the group, then the child.",
      level: { country: "Country", region: "Region", group: "Group", child: "Child" },
      qCountry: (region: string) =>
        `The ${region} fund you joined carries these children, out of the country's children.`,
      qRegion:
        "The fund enrols all the region's children in the qualification journey, and your pledge is a share of it. No one starts on the day of the pledge.",
      qGroup: (n: string) =>
        `The group is the region's first children, and it has ${n} sessions planned.`,
      qChild: (code: string) =>
        `A pseudonym, with the code ${code}. Their journey is that of the region's first child.`,
      kCountry: "What is counted here is deliveries documented in the country, not children.",
      kRegion:
        "No delivery is documented yet. The local office prepares it first, then delivers it with a document.",
      mCountry: "A new monthly sponsorship, delivered with a receipt each month.",
      mRegion: "The region's trial children that you sponsor.",
      mChild: (code: string) =>
        `A pseudonym, with the code ${code}. The need is in the file's currency.`,
      coverage: "Monthly need covered",
      sessions: "Sessions in the journey",
      next: {
        qualification:
          "“My impact” shows the qualification advancing month by month: the sessions, and the measurement before and after.",
        monthly:
          "“My impact” shows, each month, when your gift was transferred and when it was delivered with a receipt.",
        in_kind: "“My impact” shows your pledge being prepared, then delivered with its document.",
      },
      slider:
        "And here in the hall: go back to the country and move the time bar to see the same figures advance.",
      see: "See its impact",
      done: "Your support is recorded",
      doneSub:
        "Read its impact: what was recorded, then its impact by level, then what comes next.",
      perMonth: "a month",
      summary: "Your impact in brief",
      again: "Support again",
    },
    big: {
      title: "The impact of your support",
      sub: (target: string, country: string) =>
        `Your support is recorded for ${target} in ${country}. This is what it changed, before and after.`,
      sect: (country: string) => `What your support moved in ${country}`,
      warm: "Behind every figure here is a child who came closer to what they were waiting for, by the grace of God and then by your giving. May God reward you.",
      note: "Sample figures. What you recorded is kept in your browser only.",
      hall: "Back to the hall",
      mine: "To my impact",
    },
    log: {
      title: "Your impact record",
      sub: "Everything you recorded in the trial, from the hall or from the pages, as in “My impact”.",
      empty:
        "You have not recorded any support in the trial yet. Choose any country and support it, and it is written here and in “My impact”.",
      world: "Choose a country",
      close: "Close",
      line: (money: string, country: string, date: string) =>
        `${money} a month · ${country} · since ${date}`,
      gift: (money: string, country: string, date: string) => `${money} · ${country} · ${date}`,
      traits: "Trait movement · out of 100",
      traitsHidden: (n: string) =>
        `Averages appear once ${n} or more children have a baseline measurement, so that no child can be identified.`,
      measuredBefore: "Baseline measurement",
      measuredAfter: "Final measurement",
      yes: "Taken",
      no: "Not yet",
      cadence: { monthly: "Monthly", one_time: "One-time" },
    },
    screen: {
      map: (name: string) => `${name}: sample data`,
      mapLine: (a: string, b: string, c: string) =>
        `${a} children with a verified file · in qualification: ${b} · documented deliveries: ${c}`,
      regions: "The two trial regions",
      enter: (name: string) => `Tap the screen to enter ${name}`,
      tracksSub: {
        qualification: "Supervised sessions, traits measured before and after",
        monthly: "A monthly amount for one child, with a receipt",
        in_kind: "Prepared, delivered and documented by the office",
      },
      tracksHow: {
        qualification: "A free monthly pledge",
        monthly: "In the child's file currency",
        in_kind: "A free monthly pledge",
      },
      impact: "Your impact so far",
      none: "You have not recorded any support yet.",
      noneSub: ["Choose any country and support it,", "and it is written here and in “My impact”."],
      open: "Tap the screen to open your impact record",
    },
    tracks: {
      sub: "Three kinds, each with its own impact in “My impact”. The names and promises are the platform's own.",
      go: "Choose a country and support",
    },
    film: [
      "The impact hall: where a supporter sees where their support goes, and what it changes",
      "The WAMY network: headquarters in Riyadh and {sites} sites of confirmed presence",
      "We choose Albania (every country here can be entered), with its two regions, its group and its child",
      "We enter it: each region has a column as tall as its children, filled by those under a qualification pledge",
      "We pledge monthly for qualification in Tirana, and its share of Tirana's fund shows before it is recorded",
      "The support flows, and Tirana's column fills with the children of the fund the pledge joined",
      "Then the impact level by level: the country, the region, the group, the child",
      "And last, your own impact: what your support changed, before and after",
    ],
  },
});

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const safe = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

/** remembers which simulated gift the hall has already replayed (this browser only) */
const REPLAYED_KEY = "hall-replayed:v1";

/**
 * the arrival is replayed once per gift: the link back from «أثري» always carries the latest
 * gift's child, and replaying it on every entry took the visitor out of the hall they had opened.
 */
function firstReplay(token: string, store: Store | null): boolean {
  try {
    if (!store) return true;
    if (store.getItem(REPLAYED_KEY) === token) return false;
    store.setItem(REPLAYED_KEY, token);
    return true;
  } catch {
    return true; // storage blocked: the replay still plays, and any touch cancels it
  }
}

export type TrialDemo = ReturnType<typeof trialDemo>;

/**
 * what the hall's scene is handed in the trial: the model read fresh from the two stores, the
 * two writes (through `addPledge` and `addGift`), the copy, and the gift to replay on arrival.
 */
export function trialDemo(o: {
  locale: Locale;
  child?: string | undefined;
  cadence?: TryGift["cadence"] | undefined;
  store?: Store | null;
  clock?: () => Date;
}) {
  const store = o.store === undefined ? safe() : o.store;
  const clock = o.clock ?? (() => new Date());
  const locale = o.locale;
  const giving = givingCopy(locale);

  /* the countries the hall draws: the scene names them once, and the model is built for them alone */
  let only: ReadonlySet<string> | null = null;
  const model = (ahead = 0, draft?: TrialDraft | null): TrialHall => {
    const at = clock();
    const pledges = loadPledges(store);
    const gifts = loadGifts(store);
    if (draft) {
      if (draft.kind === "monthly") {
        const g = giftOf(draft);
        if (g) gifts.unshift({ ...g, id: DRAFT_ID, at: at.toISOString() });
      } else {
        const p = pledgeOf(draft);
        if (p) pledges.unshift({ ...p, id: DRAFT_ID, at: at.toISOString() });
      }
    }
    return trialHall({ pledges, gifts, now: tryThen(ahead, at), locale, only });
  };

  const gifts = loadGifts(store);
  const gift = o.child ? gifts.find((g) => g.childId === o.child) : undefined;
  // only a gift this visitor really made is replayed, and only the first time they arrive with it
  const raw = gift && firstReplay(gift.id, store) ? tryChild(gift.childId) : undefined;
  const child = raw ? localTryChild(raw, locale) : undefined;

  // the film's network caption counts the sites from the one source the gate and the world panel
  // read (`NETWORK_SITES`), never from a number typed into the copy
  const text = copyOf(TRIAL_COPY, locale);
  const copy = {
    ...text,
    film: text.film.map((line) => line.replace("{sites}", formatCount(NETWORK_SITES, locale))),
  };

  return {
    locale,
    dir: dirOf(locale),
    copy,
    /** the three kinds of giving, in the platform's order and by the platform's names */
    kinds: [...GIVING_TRACKS],
    giving: { heading: giving.heading, tracks: giving.tracks },
    /**
     * the trial's countries the hall enters: every country it draws that the catalogue holds
     * (all of them), in the order the scene gives. The catalogue's other countries are entered
     * from the support map.
     */
    codes: [] as string[],
    /** the scene tells the trial which countries it draws; returns the ones it can enter */
    use(drawn: readonly string[]): string[] {
      this.codes = drawn.filter((co) => !!tryPlace(co));
      only = new Set(this.codes);
      return this.codes;
    },
    /** where the visitor enters the countries the hall does not draw */
    mapHref: "/try/support",
    /** the support map opened on one country, as the map's own `?c=` */
    mapHrefFor: (co: string, kind?: string) =>
      `/try/support?c=${encodeURIComponent(co)}${kind === "qualification" || kind === "in_kind" ? `&kind=${kind}` : ""}`,
    countryName: (co: string) => countryName(co, locale),
    /** the fixed amounts an individual is offered and starts on, as on the support sheet */
    amounts: {
      presets: [...INDIVIDUAL_AMOUNTS],
      initial: defaultIndividualAmount(null),
      min: 1,
      max: 100_000,
    },
    cohortMin: IMPACT_COHORT_MIN,
    /** a count as «أثري» publishes it: itself at or above the cohort minimum, otherwise null */
    cohortSafe: (n: number) => cohortSafe(n),
    draftId: DRAFT_ID,
    track: KIND_TRACK,
    money: (amount: number, currency: string) => formatMoney(amount, currency, locale),
    /** a currency by its name in the interface language, never its raw code */
    currencyName: (currency: string) => currencyName(currency, locale),
    /**
     * what a pooled pledge's amount stands for (its share of the region's fund), in the words
     * and figures the support sheet shows for the same input (`@/lib/try-reach`)
     */
    reach: (d: { co: string; region: string; amount: number; currency: string }) => {
      const r = tryPlace(d.co)?.regions.find((x) => x.hall === d.region);
      return r
        ? tryReachText({ scope: "region", target: r.id, co: d.co }, d.amount, d.currency, locale)
        : null;
    },
    model,
    /** records a pledge for a hall region through the pages' own store; the entry's id, or null */
    pledge: (d: Extract<TrialDraft, { amount: number }>): string | null => {
      const p = pledgeOf(d);
      return (p && addPledge(p, store, clock())?.id) ?? null;
    },
    /** records the monthly sponsorship of a trial child through the pages' gift store */
    sponsor: (childId: string): string | null => {
      if (loadGifts(store).some((g) => g.childId === childId && g.cadence === "monthly")) {
        return null;
      }
      const g = giftOf({ kind: "monthly", childId });
      return g ? addGift(g, store, clock()).id : null;
    },
    /** tells the hall when a pledge or gift changes, here or in another tab */
    subscribe: (fn: () => void) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener(TRY_EVENT, fn);
      window.addEventListener("storage", fn);
      return () => {
        window.removeEventListener(TRY_EVENT, fn);
        window.removeEventListener("storage", fn);
      };
    },
    impactHref: (kind: GivingTrack) => `/try/impact?kind=${kind}`,
    childHref: (id: string) => `/try/${id}`,
    focus: child
      ? {
          co: child.co,
          region: child.region,
          name: child.name,
          cadence: o.cadence ?? ("monthly" as const),
        }
      : null,
  };
}
