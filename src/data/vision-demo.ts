/**
 * «منصة الرؤية والتوجهات» — بيانات العرض للمنصّتين الافتراضيتين
 * (التشغيل: الرواد، والقرار: الرؤية والتوجهات) ودورة اليتيم في قلب
 * المنظومة ورحلة المال.
 *
 * حدود العرض (AGENTS.md › Demonstration boundaries):
 *   - كلّ ما هنا توضيحيّ ويُعرض بشارة «تصوّر · بيانات توضيحية»؛
 *   - لا معرّف هنا يصلح لكفالةٍ أو دفعٍ أو صرف: المعرّفات نصوصٌ وصفية
 *     (`demo-…`) لا UUID، ولا شيء منها يُرسل إلى خادمٍ أو قاعدة؛
 *   - الأسماء مستعارة، ولا صورة ولا موقع لطفل.
 * الأرقام العامّة (25,000 و34) منشورةٌ في wamy.org، وما سواها مثالٌ يوضّح
 * الشكل الذي ستأخذه حين يتّصل التكامل الحقيقي.
 */

export type T = { ar: string; en: string };
const t = (ar: string, en: string): T => ({ ar, en });

/* ── الطبقات الثلاث ─────────────────────────────────────────────────── */

export type LayerKey = "operations" | "support" | "decision";

export const LAYERS: Array<{
  key: LayerKey;
  n: string;
  name: T;
  title: T;
  lead: T;
  status: T;
  sees: T;
  path: "/vision/operations" | "/support" | "/vision/decision";
}> = [
  {
    key: "operations",
    n: "01",
    name: t("التشغيل", "Operations"),
    title: t("أهلية الأيتام", "Orphan capability"),
    lead: t(
      "منصة الرواد: المشاريع، وما تمّ، وملف كل يتيم — حيث يعمل المشرف مع مجموعته.",
      "The Rowad platform: projects, progress and every orphan's file — where supervisors work with their groups.",
    ),
    status: t("تعمل اليوم · تكاملٌ قادم", "Live today · integration coming"),
    sees: t(
      "يرى المشرف: المجموعة، والجلسات، والقياس",
      "The supervisor sees: the group, the sessions, the measurement",
    ),
    path: "/vision/operations",
  },
  {
    key: "support",
    n: "02",
    name: t("الدعم", "Support"),
    title: t("دعمٌ يُرى أثره", "Support with visible impact"),
    lead: t(
      "رحلة الداعم: يختار أثره ومكانه، ويتابع ما يحدث في التشغيل — وهي هذه المنصّة.",
      "The supporter's journey: choose an impact and a place, then follow what happens in operations — this platform.",
    ),
    status: t("هذه المنصّة", "This platform"),
    sees: t("يرى الداعم: أسماء مستعارة، والتقدّم", "The supporter sees: pseudonyms and progress"),
    path: "/support",
  },
  {
    key: "decision",
    n: "03",
    name: t("القرار", "Decision"),
    title: t("الرؤية والتوجهات", "Vision and directions"),
    lead: t(
      "لوحة الندوة: أين نحن، وإلى أين يذهب الدعم القادم.",
      "WAMY's board: where we stand, and where the next support should go.",
    ),
    status: t("تصوّر", "Concept"),
    sees: t("يرى صاحب القرار: الأرقام المجمّعة فقط", "The decision-maker sees aggregates only"),
    path: "/vision/decision",
  },
];

/* ── القرار: أرقام المنظومة ─────────────────────────────────────────── */

export const SYSTEM = {
  sponsored: 25_000,
  sponsoredSource: "wamy.org/impact",
  measured: 326,
  offices: 34,
  officesWithData: 7,
  supervisors: 62,
  trustees: 23,
  trusteeRegions: 13,
};
export const measuredPct = () => +((SYSTEM.measured / SYSTEM.sponsored) * 100).toFixed(1);

export const REGIONS: Array<{ name: T; offices: number; sponsored: number; measured: number }> = [
  { name: t("أوروبا والبلقان", "Europe & Balkans"), offices: 5, sponsored: 2_100, measured: 326 },
  { name: t("شرق أفريقيا", "East Africa"), offices: 7, sponsored: 6_400, measured: 0 },
  { name: t("غرب أفريقيا", "West Africa"), offices: 8, sponsored: 7_300, measured: 0 },
  { name: t("آسيا", "Asia"), offices: 9, sponsored: 6_200, measured: 0 },
  { name: t("الشرق الأوسط", "Middle East"), offices: 5, sponsored: 3_000, measured: 0 },
];

/**
 * قراءة دولة: ألبانيا. الحاجة من منصّة التشغيل (من في رحلة التأهيل)،
 * والتمويل من منصّة الدعم — على خريطةٍ واحدة.
 * ألبانيا تُرسم من حدود مقاطعاتها (public/geo/admin1/AL.json)، ويُطابَق
 * كلٌّ منها باسمه اللاتيني.
 */
export type City = {
  id: string;
  name: T;
  need: number;
  funded: number;
  groups: number;
};
export const ALBANIA: City[] = [
  { id: "shkoder", name: t("إشقودرة", "Shkodër"), need: 40, funded: 80, groups: 2 },
  { id: "kukes", name: t("كوكس", "Kukës"), need: 22, funded: 70, groups: 1 },
  { id: "durres", name: t("دوريس", "Durrës"), need: 34, funded: 62, groups: 2 },
  { id: "tirana", name: t("تيرانا", "Tirana"), need: 88, funded: 34, groups: 4 },
  { id: "elbasan", name: t("إيلبصان", "Elbasan"), need: 30, funded: 125, groups: 2 },
  { id: "fier", name: t("فيير", "Fier"), need: 32, funded: 64, groups: 2 },
  { id: "berat", name: t("بيرات", "Berat"), need: 20, funded: 58, groups: 1 },
  { id: "korce", name: t("كورتشي", "Korçë"), need: 36, funded: 72, groups: 2 },
  { id: "vlore", name: t("فلوره", "Vlorë"), need: 24, funded: 66, groups: 3 },
];
/** تاريخ التقرير في العرض: ثابتٌ فلا يختلف ما يرسمه الخادم عمّا يرسمه المتصفّح. */
export const REPORT_DATE = "2026-11-05";
export const ALBANIA_GROUPS = { funded: 14, total: 19 };

/** أين نستثمر: الفجوة = الحاجة × (1 − التمويل)، وما تجاوز التمويلُ فيه الحاجةَ لا فجوة له. */
export function investmentRank(cities = ALBANIA) {
  return cities
    .map((c) => ({ ...c, gap: Math.max(0, Math.round(c.need * (1 - c.funded / 100))) }))
    .sort((a, b) => b.gap - a.gap);
}

/* ── التشغيل: مركز القيادة وملف اليتيم والتقرير الحي ──────────────── */

export const TRAITS: Array<{ key: string; name: T; before: number; after: number }> = [
  { key: "rushd", name: t("الرشد", "Maturity"), before: 17.4, after: 19.4 },
  { key: "ukhuwwa", name: t("الأخوّة الإيمانية", "Faith brotherhood"), before: 15.9, after: 17.6 },
  { key: "sumud", name: t("الصمود", "Resilience"), before: 14.2, after: 16.1 },
  { key: "kifayat", name: t("الكفايات", "Competencies"), before: 13.8, after: 15.0 },
  { key: "dirayah", name: t("الدراية", "Awareness"), before: 16.1, after: 17.3 },
  { key: "himmah", name: t("الهمّة", "Drive"), before: 15.0, after: 16.8 },
];

export const GROUPS: Array<{
  id: string;
  name: T;
  city: string;
  supervisor: T;
  members: number;
  sessionsDone: number;
  sessionsTotal: number;
  concept: T;
  funded: boolean;
}> = [
  {
    id: "demo-g-tirana-1",
    name: t("مجموعة تيرانا 1", "Tirana group 1"),
    city: "tirana",
    supervisor: t("المشرف «أ. ر.»", "Supervisor “A. R.”"),
    members: 9,
    sessionsDone: 6,
    sessionsTotal: 6,
    concept: t("النيّة المثمرة", "Fruitful intention"),
    funded: true,
  },
  {
    id: "demo-g-tirana-2",
    name: t("مجموعة تيرانا 2", "Tirana group 2"),
    city: "tirana",
    supervisor: t("المشرف «م. ك.»", "Supervisor “M. K.”"),
    members: 8,
    sessionsDone: 3,
    sessionsTotal: 6,
    concept: t("الصحبة الصالحة", "Good company"),
    funded: false,
  },
  {
    id: "demo-g-shkoder-1",
    name: t("مجموعة إشقودرة", "Shkodër group"),
    city: "shkoder",
    supervisor: t("المشرف «ي. ح.»", "Supervisor “Y. H.”"),
    members: 10,
    sessionsDone: 5,
    sessionsTotal: 6,
    concept: t("النيّة المثمرة", "Fruitful intention"),
    funded: true,
  },
  {
    id: "demo-g-elbasan-1",
    name: t("مجموعة إيلبصان", "Elbasan group"),
    city: "elbasan",
    supervisor: t("المشرف «س. ب.»", "Supervisor “S. B.”"),
    members: 7,
    sessionsDone: 6,
    sessionsTotal: 6,
    concept: t("الأمانة", "Trustworthiness"),
    funded: true,
  },
];

/** ملف يتيمٍ مثاليّ — اسمٌ مستعار، ولا صورة ولا موقع. */
export const ORPHAN_FILE = {
  pseudonym: t("«ب. ن.» — 12 سنة", "“B. N.” — 12 years"),
  code: "DEMO-AL-0007",
  group: "demo-g-tirana-1",
  stage: t("المرحلة الثانية · التطبيق", "Stage two · practice"),
  since: "2026-03",
  circle: [
    {
      role: t("المشرف", "Supervisor"),
      note: t("يقود المجموعة ويقيس", "Leads the group and measures"),
    },
    { role: t("الوليّ", "Guardian"), note: t("يوافق ويتابع", "Consents and follows") },
    {
      role: t("المرجع الشرعي", "Religious mentor"),
      note: t("يراجع المفاهيم", "Reviews the concepts"),
    },
    {
      role: t("الكافل", "Sponsor"),
      note: t("يرى التقدّم باسمٍ مستعار", "Sees progress under a pseudonym"),
    },
  ],
  milestones: [
    { done: true, name: t("القياس القبلي", "Baseline measurement") },
    {
      done: true,
      name: t("مفهوم «النيّة المثمرة» — 6 جلسات", "“Fruitful intention” — 6 sessions"),
    },
    { done: true, name: t("مشروع المجموعة", "Group project") },
    { done: false, name: t("القياس البعدي", "Follow-up measurement") },
    { done: false, name: t("التخرّج من المرحلة", "Stage graduation") },
  ],
};

/* ── الدورة: تبرّعٌ واحد يمرّ بالطبقات ويعود قراراً ───────────────── */

export type CycleStep = {
  key: string;
  ring: LayerKey | "center";
  title: T;
  /** `{amount}` is filled by the page with the step's amount, in the engine's currency */
  text: T;
  /** حال اللوحات الثلاث بعد هذه الخطوة. */
  support: { amount: number; lines: number };
  ops: { sessions: number; trait: number };
  decision: { funding: number; groups: number; campaign: boolean };
};

const S0 = { amount: 0, lines: 0 };
const O0 = { sessions: 0, trait: 16.9 };
const D0 = { funding: 34, groups: 14, campaign: false };

export const CYCLE: CycleStep[] = [
  {
    key: "center",
    ring: "center",
    title: t("ثلاث طبقاتٍ حول يتيمٍ واحد", "Three layers around one orphan"),
    text: t(
      "التشغيل أقربها إليه، ثم الدعم، ثم القرار. كلّ طبقةٍ ترى ما يحقّ لها أن تراه.",
      "Operations is closest, then support, then decision. Each layer sees only what it is entitled to.",
    ),
    support: S0,
    ops: O0,
    decision: D0,
  },
  {
    key: "donate",
    ring: "support",
    title: t("تبرّعٌ لمجموعة تيرانا", "A donation to the Tirana group"),
    text: t(
      "داعمٌ يختار «تبرّع تأهيل» لمجموعة تيرانا: {amount}. يُحصَّل ويُقيَّد بفاتورته.",
      "A supporter chooses a qualification donation for the Tirana group: {amount} — collected and invoiced.",
    ),
    support: { amount: 5000, lines: 0 },
    ops: O0,
    decision: D0,
  },
  {
    key: "reach",
    ring: "operations",
    title: t("يصل إلى المجموعة", "It reaches the group"),
    text: t(
      "يُخصَّص المبلغ لمجموعة تيرانا 1 في منصّة التشغيل، ويرى الداعم: «وصل دعمك إلى المجموعة».",
      "The amount is allocated to Tirana group 1 in operations; the supporter sees “your support reached the group”.",
    ),
    support: { amount: 5000, lines: 1 },
    ops: { sessions: 2, trait: 16.9 },
    decision: D0,
  },
  {
    key: "sessions",
    ring: "operations",
    title: t("الجلسات تكتمل", "The sessions complete"),
    text: t(
      "يقود المشرف جلسات مفهوم «النيّة المثمرة» الستّ، ويُسجَّل كلّ حضورٍ في التشغيل.",
      "The supervisor runs all six “fruitful intention” sessions; attendance is recorded in operations.",
    ),
    support: { amount: 5000, lines: 2 },
    ops: { sessions: 6, trait: 17.4 },
    decision: D0,
  },
  {
    key: "measure",
    ring: "operations",
    title: t("القياس يعود من حول اليتيم", "The measurement returns from around the orphan"),
    text: t(
      "القياس البعدي: سمة الرشد ترتفع من 17.4 إلى 19.4. يصل الداعمَ «نمت سمة الرشد بين القياسين».",
      "Follow-up measurement: maturity rises from 17.4 to 19.4. The supporter is told the trait grew.",
    ),
    support: { amount: 5000, lines: 3 },
    ops: { sessions: 6, trait: 19.4 },
    decision: D0,
  },
  {
    key: "number",
    ring: "decision",
    title: t("الرقم يتحرّك", "The number moves"),
    text: t(
      "لوحة القرار ترى المجموع وحده: تمويل التأهيل في تيرانا من 34٪ إلى 41٪، والمجموعات المموّلة 15 من 19.",
      "The decision board sees aggregates only: Tirana qualification funding 34% → 41%, funded groups 15 of 19.",
    ),
    support: { amount: 5000, lines: 3 },
    ops: { sessions: 6, trait: 19.4 },
    decision: { funding: 41, groups: 15, campaign: false },
  },
  {
    key: "decide",
    ring: "decision",
    title: t("والقرار يعود إلى الميدان", "And the decision returns to the field"),
    text: t(
      "تضيق الفجوة، فيُقرَّر: حملةٌ لتيرانا ومجموعةٌ جديدة — تظهر في الدعم بابًا، وفي التشغيل مجموعة.",
      "The gap narrows; the decision: a Tirana campaign and a new group — a door in support, a group in operations.",
    ),
    support: { amount: 5000, lines: 3 },
    ops: { sessions: 6, trait: 19.4 },
    decision: { funding: 41, groups: 15, campaign: true },
  },
];

/* ── رحلة المال: أين يصل وكيف ─────────────────────────────────────── */

export type MoneyStage = {
  key: string;
  who: T;
  title: T;
  text: T;
  /** ما يُكتب عند هذه المحطة في السجلّ — كما في القاعدة اليوم. */
  record: T;
  /** الحال اليوم: يعمل، أو بانتظار، أو تكاملٌ قادم. */
  state: "live" | "waiting" | "next";
};

export const MONEY: MoneyStage[] = [
  {
    key: "choose",
    who: t("الداعم", "Supporter"),
    title: t("يختار أثره ومكانه", "Chooses impact and place"),
    text: t(
      "تأهيل، أو كفالة، أو تبرّع عيني — لمجموعةٍ أو طفلٍ أو مدينة، بالعملة المحلية للمكان.",
      "Qualification, sponsorship or in-kind — for a group, a child or a city, in the place's currency.",
    ),
    record: t(
      "تعهّد أو كفالة «بانتظار الدفع» بمفتاح تكرار",
      "A pledge or sponsorship “awaiting payment” with an idempotency key",
    ),
    state: "live",
  },
  {
    key: "collect",
    who: t("مزوّد الدفع", "Payment provider"),
    title: t("التحصيل", "Collection"),
    text: t(
      "بطاقةٌ عبر Creem (بائعٌ مسجَّل يتحمّل الضريبة والامتثال)، أو تحويلٌ بنكي بمرجعٍ فريد يطابقه المسؤول.",
      "A card through Creem (merchant of record handling tax and compliance), or a bank transfer with a unique reference reconciled by an officer.",
    ),
    record: t(
      "حدثٌ موقَّع يُقيَّد ذرّياً: لا تكرار، والعملة المخالفة تُرفض إلى «بنود المال»",
      "A signed event recorded atomically: no duplicates; a wrong currency goes to “money issues”",
    ),
    state: "waiting",
  },
  {
    key: "settle",
    who: t("حساب الندوة", "WAMY account"),
    title: t("أين يصل المال", "Where the money lands"),
    text: t(
      "في الحساب البنكي للندوة وحده — لا في حساب المنصّة ولا الجهة. Creem يحوّل صافي التحصيلات دوريًا، والتحويل البنكي يصل مباشرةً.",
      "In WAMY's bank account only — never the platform's or a partner's. Creem pays out net collections periodically; transfers arrive directly.",
    ),
    record: t(
      "فاتورة INV-السنة-الرقم بلا ثغرات، والرسوم والصافي",
      "Invoice INV-year-number without gaps, with fee and net",
    ),
    state: "live",
  },
  {
    key: "allocate",
    who: t("الإدارة", "Administration"),
    title: t("التخصيص", "Allocation"),
    text: t(
      "يُنسب كلّ مبلغٍ إلى غرضه: مجموعة تيرانا 1، أو طفلٌ بعينه، أو مدينة — ويظهر في سجلّ الكفالة شهرًا بشهر.",
      "Every amount is bound to its purpose — Tirana group 1, a named child, or a city — and shows month by month in the ledger.",
    ),
    record: t(
      "سجلّ الكفالة: المستحقّ والمدفوع لكلّ شهر",
      "Sponsorship ledger: due and paid for each month",
    ),
    state: "live",
  },
  {
    key: "disburse",
    who: t("مكتب ألبانيا", "Albania office"),
    title: t("الصرف إلى الميدان", "Disbursement to the field"),
    text: t(
      "تحويلٌ شهري من حساب الندوة إلى مكتب ألبانيا باليورو، لفترةٍ محدّدة — ويصل الآن عبر سجلّ الصرف، ولاحقًا يتسلّمه التشغيل آليًا.",
      "A monthly transfer from WAMY to the Albania office in EUR for a set period — through the disbursement record today, received by operations automatically later.",
    ),
    record: t(
      "صرفٌ بفترته ومبلغه وعملته، وكلّ تعديلٍ عليه في الأثر",
      "A disbursement with period, amount and currency; every change audited",
    ),
    state: "live",
  },
  {
    key: "deliver",
    who: t("المشرف والمجموعة", "Supervisor & group"),
    title: t("التسليم بإثبات", "Delivery with proof"),
    text: t(
      "يُصرف على الجلسات والمستلزمات، ويُرفع مستند الوصول إلى الخزنة الخاصة فيُجمَّد ببصمته — لا يُستبدل ولا يُحذف.",
      "Spent on sessions and supplies; the delivery document goes to the private vault and is frozen by its fingerprint — never replaced or deleted.",
    ),
    record: t(
      "تأكيد الوصول مع بصمة الملف (eTag)",
      "Delivery confirmation with the file fingerprint (eTag)",
    ),
    state: "live",
  },
  {
    key: "return",
    who: t("الداعم والقرار", "Supporter & decision"),
    title: t("الأثر يعود", "The impact returns"),
    text: t(
      "إيصالٌ شهري ببصمةٍ يمكن التحقّق منها، وأثرٌ من التشغيل (الجلسات والقياس) — ومجموعٌ يصل لوحة القرار.",
      "A monthly receipt with a verifiable fingerprint, impact from operations (sessions and measurement), and an aggregate on the decision board.",
    ),
    record: t(
      "إيصال الشهر ببصمته، ومزامنة التشغيل الموقَّعة",
      "Monthly receipt with its fingerprint, and signed operations sync",
    ),
    state: "next",
  },
];

/** حساب الرسوم والصافي كما تفعل القاعدة (نسبة المنصّة من الإعدادات). */
export function feeSplit(amount: number, feePercent: number) {
  const fee = Math.round(amount * feePercent) / 100;
  return { fee, net: +(amount - fee).toFixed(2) };
}
