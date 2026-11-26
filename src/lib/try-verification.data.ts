/**
 * بذرة «مصادر التحقق» و«مركز الثقة» في العرض التفاعلي: الدول الأساسية الخمس بملفّاتٍ
 * وأسماءٍ مستعارة واضحة («(نموذج)»)، ورموزٍ تبدأ بـDEMO-، ومعرّفاتٍ لا تقابل طفلاً حقيقياً
 * ولا تصل مساراً مالياً. منصّات المكاتب هنا بادئتها «نموذج ·» وليست تكاملاً حياً.
 * كل ما فيها يُولَّد في المتصفّح عند أوّل فتح، ثم تحمله الجلسة (`try-verification.ts`).
 */
import type {
  AlertSignal,
  ChildFileEvent,
  Conflict,
  CountryRole,
  DataAlert,
  FieldValue,
  LinkItem,
  OfficeMode,
  StaffMember,
  TrustState,
} from "@/lib/golden-record";
import type { Decision, WeekRow } from "@/lib/trust-center";

export type DemoCountry = {
  code: string;
  name_ar: string;
  name_local: string | null;
  office_mode: OfficeMode;
  office_source: string | null;
  stale_after_days: number;
  platforms: Array<{ key: string; name: string }>;
  /** ملفّاتٌ خارج العيّنة المفصّلة: تعطي الدولة حجمها، ولا تتغيّر */
  background: Record<TrustState, number>;
  last_wamy: string | null;
  last_office: string | null;
};

export type DemoFile = {
  id: string;
  code: string;
  name: string;
  country: string;
  region: string;
  sponsored: boolean;
  wamy_ref: string;
  office_ref: string | null;
  /** الحالة حين لا تعارض ولا تنبيه مفتوح */
  base: TrustState;
  values: Record<string, FieldValue>;
  office: Record<string, FieldValue>;
  history: ChildFileEvent[];
};

/** «mine»: رفعه الزائر نفسه — فلا يحسمه هو (العينان). */
export type DemoConflict = Conflict & { mine?: boolean; closed_at?: string };
export type DemoAlert = DataAlert & { mine?: boolean; closed_at?: string };
export type DemoLink = LinkItem & { closed_at?: string };
export type DemoStaff = StaffMember & { country: string };

export type VerificationState = {
  v: 1;
  seq: number;
  countries: DemoCountry[];
  files: DemoFile[];
  conflicts: DemoConflict[];
  alerts: DemoAlert[];
  links: DemoLink[];
  staff: DemoStaff[];
  decisions: Decision[];
  weeks: Record<string, WeekRow[]>;
};

/** معرّفٌ بصيغة uuid لا يقابل سجلّاً حقيقياً (البادئة صفرية). */
export const demoId = (kind: number, n: number) =>
  `00000000-0000-4000-8${String(kind).padStart(3, "0")}-${String(n).padStart(12, "0")}`;

const COUNTRIES: Array<{
  code: string;
  name_ar: string;
  name_local: string;
  mode: OfficeMode;
  regions: string[];
  background: [number, number, number, number, number];
}> = [
  {
    code: "LK",
    name_ar: "سريلانكا",
    name_local: "Sri Lanka",
    mode: "active",
    regions: ["كولومبو", "أمبارا"],
    background: [286, 41, 9, 2, 60],
  },
  {
    code: "PK",
    name_ar: "باكستان",
    name_local: "پاکستان",
    mode: "shadow",
    regions: ["البنجاب", "السند", "كشمير"],
    background: [412, 96, 14, 5, 120],
  },
  {
    code: "TH",
    name_ar: "تايلاند",
    name_local: "ประเทศไทย",
    mode: "shadow",
    regions: ["يالا", "ناراتيوات"],
    background: [118, 52, 4, 1, 30],
  },
  {
    code: "SD",
    name_ar: "السودان",
    name_local: "Sudan",
    mode: "none",
    regions: ["كسلا", "الخرطوم"],
    background: [0, 233, 0, 11, 95],
  },
  {
    code: "SN",
    name_ar: "السنغال",
    name_local: "Sénégal",
    mode: "active",
    regions: ["داكار", "تياس"],
    background: [174, 28, 6, 3, 40],
  },
];

const GIRLS = ["أمينة", "مريم", "فاطمة", "خديجة", "زينب", "عائشة", "سلمى", "هاجر"];
const BOYS = ["يوسف", "عمر", "إبراهيم", "بلال", "حمزة", "سليمان", "إدريس", "أنس"];
const STAGES = ["الابتدائية", "المتوسطة", "الثانوية"];
const HOMES = ["مع الأم", "مع الجدّة", "مع العمّ", "دار رعاية"];
const GUARDIANS = ["الأم", "الجدّة", "العمّ", "الخال"];

const iso = (now: number, hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();

export function seedVerification(now: number = Date.now()): VerificationState {
  const files: DemoFile[] = [];
  const conflicts: DemoConflict[] = [];
  const alerts: DemoAlert[] = [];
  const links: DemoLink[] = [];
  const staff: DemoStaff[] = [];
  const decisions: Decision[] = [];
  const weeks: Record<string, WeekRow[]> = {};
  let fileN = 0;
  let conflictN = 0;
  let alertN = 0;
  let linkN = 0;
  let decisionN = 0;

  const countries: DemoCountry[] = COUNTRIES.map((c) => ({
    code: c.code,
    name_ar: c.name_ar,
    name_local: c.name_local,
    office_mode: c.mode,
    office_source: c.mode === "none" ? null : `${c.code.toLowerCase()}-office-demo`,
    stale_after_days: 180,
    platforms:
      c.code === "SD"
        ? [{ key: "sd-office-demo", name: `نموذج · منصّة مكتب ${c.name_ar}` }]
        : [{ key: `${c.code.toLowerCase()}-office-demo`, name: `نموذج · منصّة مكتب ${c.name_ar}` }],
    background: {
      verified: c.background[0],
      single_source: c.background[1],
      conflict: 0,
      stale: c.background[3],
      legacy: c.background[4],
      flagged: 0,
    },
    last_wamy: iso(now, 30 + c.background[2]),
    last_office: c.mode === "none" ? null : iso(now, 52 + c.background[2] * 3),
  }));

  COUNTRIES.forEach((c, ci) => {
    const local: DemoFile[] = [];
    for (let i = 0; i < 7; i++) {
      fileN++;
      const girl = (i + ci) % 2 === 0;
      const first = (girl ? GIRLS : BOYS)[(i + ci * 3) % 8]!;
      const year = 2010 + ((i * 3 + ci) % 9);
      const birth = `${year}-${String(((i + 2 * ci) % 12) + 1).padStart(2, "0")}-${String(((i * 7 + ci) % 27) + 1).padStart(2, "0")}`;
      const region = c.regions[i % c.regions.length]!;
      const values: Record<string, FieldValue> = {
        display_name: `${first} (نموذج)`,
        birth_date: birth,
        gender: girl ? "female" : "male",
        country: c.code,
        program_status: "active",
        sponsorship_eligible: true,
        region,
        city: region,
        education_stage: STAGES[i % 3]!,
        guardian: GUARDIANS[(i + ci) % 4]!,
        living_situation: HOMES[(i + ci) % 4]!,
        health_status: "جيدة",
        progress_report: "يواظب على الدراسة، والتقرير الفصلي مستلم.",
        qualification_track: i % 3 === 0 ? "حفظ القرآن" : "دعم مدرسي",
      };
      const hasOffice = c.mode !== "none";
      const file: DemoFile = {
        id: demoId(1, fileN),
        code: `DEMO-${c.code}-${String(100 + i + 1)}`,
        name: String(values["display_name"]),
        country: c.code,
        region,
        sponsored: i % 3 === 1,
        wamy_ref: `WM-${c.code}-${1000 + i + 1}`,
        office_ref: hasOffice ? `${c.code}-OF-${String(i + 1).padStart(4, "0")}` : null,
        base: hasOffice ? (i === 6 ? "single_source" : "verified") : "single_source",
        values,
        office: hasOffice ? { ...values } : {},
        history: [
          {
            field: "display_name",
            role: "wamy",
            source: "wamy",
            value: values["display_name"] ?? null,
            was: null,
            changed: true,
            observed_at: iso(now, 24 * 200),
            received_at: iso(now, 24 * 200),
          },
          {
            field: "education_stage",
            role: hasOffice ? "office" : "wamy",
            source: hasOffice ? `${c.code.toLowerCase()}-office-demo` : "wamy",
            value: values["education_stage"] ?? null,
            was: STAGES[Math.max(0, (i % 3) - 1)]!,
            changed: true,
            observed_at: iso(now, 24 * 40),
            received_at: iso(now, 24 * 40),
          },
        ],
      };
      local.push(file);
      files.push(file);
    }

    const office = countries[ci]!.office_source ?? "wamy";
    const conflict = (
      f: DemoFile,
      field: string,
      group: Conflict["field_group"],
      kind: Conflict["kind"],
      risk: Conflict["risk"],
      wamy: FieldValue,
      off: FieldValue,
      hoursAgo: number,
      mine = false,
    ) => {
      conflictN++;
      if (off !== null) f.office[field] = off;
      conflicts.push({
        id: demoId(2, conflictN),
        orphan_id: f.id,
        code: f.code,
        name: f.name,
        country: c.code,
        field,
        field_group: group,
        kind,
        risk,
        current: f.values[field] ?? null,
        proposed: kind === "disagreement" ? off : wamy,
        wamy,
        office: off,
        created_at: iso(now, hoursAgo),
        mine,
      });
    };
    const f = (i: number) => local[i]!;
    // فروقٌ غير حرجة تُحسم جماعياً، وتغييراتٌ حرجة تُحسم واحداً واحداً.
    if (c.mode !== "none") {
      conflict(
        f(0),
        "education_stage",
        "current",
        "disagreement",
        "low",
        f(0).values["education_stage"]!,
        "الثانوية",
        6 + ci,
      );
      conflict(
        f(2),
        "city",
        "current",
        "disagreement",
        "low",
        f(2).values["city"]!,
        `${f(2).region} الشرقية`,
        30 + ci * 4,
      );
      conflict(
        f(3),
        "guardian",
        "current",
        "disagreement",
        "medium",
        f(3).values["guardian"]!,
        "الخالة",
        80 + ci * 9,
        ci % 2 === 0,
      );
      conflict(
        f(4),
        "living_situation",
        "current",
        "disagreement",
        "medium",
        f(4).values["living_situation"]!,
        "مع الأخ الأكبر",
        200 + ci * 11,
      );
    }
    conflict(
      f(5),
      "birth_date",
      "identity",
      "critical_change",
      "critical",
      `${String(f(5).values["birth_date"]).slice(0, 4) === "2018" ? "2017" : "2009"}${String(f(5).values["birth_date"]).slice(4)}`,
      null,
      20 + ci * 3,
      true,
    );
    if (ci % 2 === 0)
      conflict(
        f(1),
        "gender",
        "identity",
        "held_locked",
        "critical",
        f(1).values["gender"] === "male" ? "female" : "male",
        null,
        60 + ci * 5,
      );
    if (ci === 1 || ci === 3)
      conflict(
        f(6),
        "program_status",
        "eligibility",
        "critical_change",
        "critical",
        "suspended",
        null,
        120 + ci,
      );

    const alert = (
      file: DemoFile | null,
      field: string,
      signal: AlertSignal,
      severity: DataAlert["severity"],
      detail: DataAlert["detail"],
      hoursAgo: number,
      mine = false,
      hits = 1,
    ) => {
      alertN++;
      alerts.push({
        id: demoId(3, alertN),
        orphan_id: file?.id ?? null,
        code: file?.code ?? null,
        name: file?.name ?? null,
        country: c.code,
        field,
        signal,
        severity,
        role: c.mode === "none" ? "wamy" : "office",
        source: office,
        detail,
        hits,
        created_at: iso(now, hoursAgo),
        updated_at: iso(now, Math.max(1, hoursAgo - 2)),
        mine,
      });
    };
    const sets: Array<() => void> = [
      () =>
        alert(
          f(0),
          "display_name",
          "hidden_characters",
          "warning",
          { from: f(0).name, to: `${f(0).name}\u200b` },
          4 + ci,
        ),
      () =>
        alert(
          f(2),
          "display_name",
          "mixed_script",
          "warning",
          { from: f(2).name, to: `${f(2).name.replace("ا", "a")}` },
          40 + ci,
        ),
      () =>
        alert(
          f(3),
          "display_name",
          "subtle_edit",
          "warning",
          { from: f(3).name, to: `${f(3).name.slice(0, -8)}ة (نموذج)`, distance: 1 },
          12 + ci,
          ci === 2,
        ),
      () =>
        alert(
          f(5),
          "birth_date",
          "age_shift",
          "critical",
          {
            from: String(f(5).values["birth_date"]),
            to: "2007-03-01",
            days: -3650,
            crosses_adulthood: true,
          },
          18 + ci,
          true,
        ),
      () =>
        alert(
          f(4),
          "guardian",
          "flip_flop",
          "info",
          { from: "الخالة", back_to: String(f(4).values["guardian"]) },
          90 + ci,
          false,
          3,
        ),
      () =>
        alert(
          f(1),
          "gender",
          "change_after_sponsorship",
          "critical",
          { from: String(f(1).values["gender"]), to: "?" },
          55 + ci,
        ),
      () =>
        alert(
          f(6),
          "display_name",
          "possible_duplicate",
          "warning",
          { other_code: f(2).code, other_name: f(2).name },
          150 + ci,
        ),
      () => alert(null, "region", "bulk_change", "critical", { files: 38, population: 52 }, 9 + ci),
      () =>
        alert(
          f(2),
          "display_name",
          "cosmetic_change",
          "info",
          { from: f(2).name, to: f(2).name.replace("أ", "ا") },
          70 + ci,
        ),
    ];
    // كل دولةٍ بأربع إشارات، والإشارات التسع كلّها حاضرةٌ في الدول الخمس.
    for (let k = 0; k < 4; k++) sets[(ci * 2 + k) % sets.length]!();

    // طابور الربط: سجلّ للندوة بلا مرشّح (يُنشأ منه ملف)، وسجلّ للمكتب بمرشّحَين.
    linkN++;
    links.push({
      id: demoId(4, linkN),
      role: "wamy",
      source: "wamy",
      external_ref: `WM-${c.code}-${1100 + ci}`,
      country: c.code,
      name: `${GIRLS[(ci + 5) % 8]} (نموذج)`,
      birth_date: `201${ci}-05-1${ci}`,
      gender: "female",
      created_at: iso(now, 14 + ci),
      candidates: [],
    });
    if (c.mode !== "none") {
      linkN++;
      links.push({
        id: demoId(4, linkN),
        role: "office",
        source: office,
        external_ref: `${c.code}-OF-${String(90 + ci).padStart(4, "0")}`,
        country: c.code,
        name: f(6).name.replace(" (نموذج)", "ـا (نموذج)"),
        birth_date: String(f(6).values["birth_date"]),
        gender: String(f(6).values["gender"]),
        created_at: iso(now, 50 + ci * 7),
        candidates: [f(6), f(2)].map((x) => ({
          id: x.id,
          code: x.code,
          name: x.name,
          birth_date: String(x.values["birth_date"]),
          region: x.region,
        })),
      });
      // سجلّ المكتب يُربط بملفّه، فلا يبقى `office_ref` لملفٍّ في الطابور.
      f(6).office_ref = null;
      f(6).office = {};
    }

    // الفريق: مشرف، ومدخل، ومطّلع، ودعوةٌ لم تُقبل في دولتين، ودولةٌ بمشرفٍ واحد.
    const member = (email: string, role: CountryRole, daysAgo: number, pending = false) =>
      staff.push({
        user_id: demoId(5, staff.length + 1),
        email,
        role,
        ...(pending ? { pending: true } : {}),
        created_at: iso(now, daysAgo * 24),
        country: c.code,
      });
    const lc = c.code.toLowerCase();
    member(`supervisor.${lc}@example.org`, "supervisor", 120);
    if (ci !== 2) member(`supervisor2.${lc}@example.org`, "supervisor", 60, ci === 3);
    member(`entry.${lc}@example.org`, "data_entry", 45);
    if (ci % 2 === 0) member(`viewer.${lc}@example.org`, "viewer", 20);
    if (ci === 0 || ci === 4) member(`new.${lc}@example.org`, "data_entry", 2, true);

    // أسابيع ثمانية: ما فُتح وما حُسم، والأخير يكمله ما يفعله الزائر.
    const rows: WeekRow[] = [];
    let open = 6 + ci * 2;
    for (let w = 7; w >= 0; w--) {
      const start = new Date(now - w * 7 * 86_400_000);
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      const opened = w === 0 ? 0 : 3 + ((w * 5 + ci) % 7);
      const settled = w === 0 ? 0 : Math.min(open + opened, 2 + ((w * 3 + ci * 2) % 8));
      open = open + opened - settled;
      rows.push({
        week: start.toISOString().slice(0, 10),
        opened,
        opened_critical: Math.floor(opened / 3),
        settled,
        open_at_end: open,
        files_observed: w === 0 ? 0 : 20 + ((w * 11 + ci * 7) % 40),
      });
    }
    weeks[c.code] = rows;

    // سجلّ قراراتٍ سابق بأسماءٍ عامة من example.org.
    const decide = (
      action: Decision["action"],
      hoursAgo: number,
      detail: Decision["detail"],
      file: string | null = null,
    ) => {
      decisionN++;
      decisions.push({
        id: demoId(6, decisionN),
        action,
        created_at: iso(now, hoursAgo),
        actor_email: `supervisor.${lc}@example.org`,
        country: c.code,
        file_code: file,
        detail,
      });
    };
    decide("golden_ingest", 30 + ci, { records: 40 + ci * 9 });
    decide("golden_conflict_resolve", 34 + ci, { field: "city", choice: "use_office" }, f(1).code);
    decide(
      "golden_alert_resolve",
      48 + ci * 2,
      { signal: "cosmetic_change", status: "reviewed" },
      f(4).code,
    );
    decide("country_staff_set", 24 * 45, { from: "", to: "data_entry" });
    if (c.mode !== "none")
      decide("country_source_mode", 24 * 90, {
        from: "none",
        to: c.mode === "active" ? "shadow" : "shadow",
      });
    if (c.mode === "active")
      decide("country_source_mode", 24 * 30, { from: "shadow", to: "active" });
  });

  decisions.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    v: 1,
    seq: 1000,
    countries,
    files,
    conflicts,
    alerts,
    links,
    staff,
    decisions,
    weeks,
  };
}
