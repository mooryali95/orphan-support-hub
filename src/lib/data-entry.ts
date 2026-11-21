/**
 * بناء البيانات من لوحة الإدارة — المنطق الخالص (بلا شبكة ولا قاعدة).
 *
 * ما هنا يُفحص بالاختبار: قراءة CSV، وربط الأعمدة، ومطابقة الدولة ثم منطقتها،
 * وفحص الصفّ، وكشف التكرار داخل الدفعة، وفرق دول الشبكة، وتمييز «الكائن غير
 * موجود في القاعدة» (هجرةٌ لم تُطبَّق) عن الخطأ الحقيقي.
 *
 * القاعدة تعيد الفحص نفسه عند الكتابة (`data_entry_check_person`): هذا الملفّ
 * يُري المدير ما سيحدث قبل أن يرسل، ولا يحرس.
 */
import { normalize, resolveCountry } from "@/lib/countries";
import { toCsv } from "@/lib/csv";

/* ── الأنواع كما تعيدها دوالّ القاعدة ─────────────────────────────── */

export type CountryStatus = "planned" | "active" | "paused" | "emergency";

export type CountryRow = {
  code: string;
  name_ar: string;
  name_local: string | null;
  status: CountryStatus;
  in_network: boolean;
  currency: string | null;
  sort_order: number;
  /** الأعداد تغيب (`null`) حين تُقرأ الدول من الجدول مباشرةً قبل تحديث القاعدة. */
  regions: number | null;
  children: number | null;
  published: number | null;
  groups: number | null;
  offices: number | null;
  sources: Array<{ key: string; name: string; status: string | null }> | null;
};

export type RegionRow = {
  id: string;
  name_ar: string;
  name_local: string | null;
  geo_id: string | null;
  active: boolean;
  sort_order: number;
  children: number;
  groups: number;
};

export type GroupRow = {
  id: string;
  name: string;
  country_code: string;
  region: string | null;
  /** مصدر المجموعة: `null` = محلّية أنشأتها الإدارة هنا؛ وغيره منصّة تشغيل تملكها. */
  source: string | null;
  institution: string | null;
  supervisor: string | null;
  members: number;
};

export type PersonRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  country_code: string | null;
  region: string | null;
  group_name?: string | null;
  synced_source: string | null;
  locked: boolean;
};

export type DuplicateMatch = {
  id: string;
  code: string;
  name: string;
  status: string;
  region: string | null;
  source: string | null;
  reasons: string[];
};

/* ── هجرةٌ لم تُطبَّق ≠ خطأ ─────────────────────────────────────── */

/**
 * هل الخطأ «الكائن غير موجود في القاعدة»؟ دالّةٌ أو جدولٌ أو عمودٌ أضافته هجرةٌ
 * لم تُطبَّق بعد. الواجهة تعرض عندها «تحتاج تحديث القاعدة» بدل أن تنكسر.
 */
export function isMissingObject(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (["PGRST202", "PGRST204", "PGRST205", "42883", "42P01", "42703"].includes(code)) return true;
  return /could not find the (function|table|'[\w]+' column)|schema cache|does not exist/i.test(
    error.message ?? "",
  );
}

/* ── دول الشبكة: الفرق قبل التطبيق ──────────────────────────────── */

export type NetworkEntry = { code: string; nameAr: string };
export type NetworkDiff = {
  /** دولٌ في ملفّ الشبكة وليست في جدول الدول: تُضاف «مخطّطة» ومعلَّمة. */
  add: NetworkEntry[];
  /** دولٌ موجودة وغير معلَّمة: تُعلَّم. */
  enable: NetworkEntry[];
  /** دولٌ معلَّمة وليست في ملفّ الشبكة: يُرفع عنها التعليم. */
  disable: NetworkEntry[];
  unchanged: number;
};

/** فرق `countries.in_network` عن قائمة الحضور العلني في ملفّ الشبكة. لا يمسّ حالة الدولة. */
export function networkDiff(
  current: ReadonlyArray<Pick<CountryRow, "code" | "name_ar" | "in_network">>,
  network: ReadonlyArray<NetworkEntry>,
): NetworkDiff {
  const byCode = new Map(current.map((c) => [c.code, c]));
  const wanted = new Set(network.map((n) => n.code));
  const diff: NetworkDiff = { add: [], enable: [], disable: [], unchanged: 0 };
  for (const n of network) {
    const row = byCode.get(n.code);
    if (!row) diff.add.push(n);
    else if (!row.in_network) diff.enable.push({ code: n.code, nameAr: row.name_ar });
    else diff.unchanged += 1;
  }
  for (const c of current) {
    if (c.in_network && !wanted.has(c.code)) diff.disable.push({ code: c.code, nameAr: c.name_ar });
  }
  const byName = (a: NetworkEntry, b: NetworkEntry) => a.nameAr.localeCompare(b.nameAr, "ar");
  diff.add.sort(byName);
  diff.enable.sort(byName);
  diff.disable.sort(byName);
  return diff;
}

export const networkDiffSize = (d: NetworkDiff) =>
  d.add.length + d.enable.length + d.disable.length;

/* ── الدولة ثم منطقتها ──────────────────────────────────────────── */

type CountryRef = Pick<CountryRow, "code" | "name_ar" | "name_local">;
type RegionRef = Pick<RegionRow, "name_ar" | "name_local" | "active">;

/**
 * نصّ الدولة (رمزٌ أو اسمٌ بأيّ لغة) ← رمز دولةٍ **من سجلّ المنصّة**. دولةٌ يعرفها
 * العالم ولا يعرفها السجلّ تعود `null`: تُضاف من تبويب الدول أوّلاً.
 */
export function matchCountry(
  text: string | null | undefined,
  countries: ReadonlyArray<CountryRef>,
): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const key = normalize(raw);
  for (const c of countries) {
    if (c.code === raw.toUpperCase()) return c.code;
    if (normalize(c.name_ar) === key || (c.name_local && normalize(c.name_local) === key))
      return c.code;
  }
  const code = resolveCountry(raw);
  return code && countries.some((c) => c.code === code) ? code : null;
}

/** نصّ المنطقة ← اسمها المعتمد في سجلّ مناطق الدولة (المفعّلة وحدها)، أو `null`. */
export function matchRegion(
  text: string | null | undefined,
  regions: ReadonlyArray<RegionRef>,
): string | null {
  const key = normalize(text ?? "");
  if (!key) return null;
  const hit = regions.find(
    (r) =>
      r.active &&
      (normalize(r.name_ar) === key || (r.name_local ? normalize(r.name_local) === key : false)),
  );
  return hit?.name_ar ?? null;
}

/* ── حقول الصفّ ─────────────────────────────────────────────────── */

export const PERSON_FIELDS = [
  "display_name",
  "gender",
  "country",
  "region",
  "birth_date",
  "education_stage",
  "monthly_need",
  "group",
  "full_name",
  "guardian_name",
  "guardian_phone",
  "external_ref",
] as const;
export type PersonField = (typeof PERSON_FIELDS)[number];
export type RawPerson = Partial<Record<PersonField, string>>;

/** ما يُرسل إلى القاعدة: الدولة رمزاً، والمنطقة بالاسم المعتمد، والمجموعة بمعرّفها. */
export type PersonPayload = {
  display_name: string;
  gender: string;
  country: string;
  region?: string;
  birth_date?: string;
  education_stage?: string;
  monthly_need?: string;
  group_id?: string;
  org_id?: string;
  full_name?: string;
  guardian_name?: string;
  guardian_phone?: string;
  external_ref?: string;
  confirm_duplicate?: boolean;
};

export type RowIssue =
  | "name_required"
  | "gender_invalid"
  | "country_required"
  | "country_unknown"
  | "region_unknown"
  | "birth_date_invalid"
  | "need_invalid"
  | "group_unknown"
  | "group_synced"
  | "group_country_mismatch"
  | "org_unknown"
  | "demo_reference"
  | "reference_invalid"
  | "write_failed";
export type RowWarning =
  "region_from_group" | "group_region_differs" | "duplicate_in_file" | "regions_not_loaded";

const INDIC_DIGIT = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** أرقامٌ عربية هندية وفارسية ← لاتينية (تُكتب بأرقامها الموحّدة لا بحروفها). */
export function latinDigits(text: string): string {
  return text.replace(INDIC_DIGIT, (d) =>
    String(d.charCodeAt(0) - (d.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660)),
  );
}

const MALE = new Set(["male", "m", "boy", "ذكر", "ولد", "صبي"].map(normalize));
const FEMALE = new Set(["female", "f", "girl", "انثى", "أنثى", "بنت", "فتاة"].map(normalize));
export function parseGender(text: string | null | undefined): "male" | "female" | null {
  const key = normalize(text ?? "");
  if (MALE.has(key)) return "male";
  if (FEMALE.has(key)) return "female";
  return null;
}

/** تاريخٌ بصيغة ISO، أو يوم/شهر/سنة — يعود ISO، أو `null` إن لم يكن تاريخاً حقيقياً. */
export function parseDate(text: string | null | undefined): string | null {
  const raw = latinDigits((text ?? "").trim());
  if (!raw) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [y, m, d] = [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** مرجعٌ أو اسمٌ من العرض التجريبي: لا يدخل بياناتٍ حقيقية. */
export function isDemoReference(text: string | null | undefined): boolean {
  return /^(try-|demo-)/i.test((text ?? "").trim());
}

export type ValidationContext = {
  countries: ReadonlyArray<CountryRef>;
  /** مناطق كل دولةٍ محمَّلة. دولةٌ غائبة عن الخريطة = مناطقها لم تُحمَّل بعد. */
  regionsByCountry: ReadonlyMap<string, ReadonlyArray<RegionRef>>;
  groups: ReadonlyArray<Pick<GroupRow, "id" | "name" | "country_code" | "region" | "source">>;
  /** اليوم بصيغة ISO — يُمرَّر كي يبقى الفحص خالصاً. */
  today: string;
};

export type CheckedRow = {
  payload: PersonPayload | null;
  errors: RowIssue[];
  warnings: RowWarning[];
  /** ما اشتُقّ ليُعرض في المعاينة. */
  countryCode: string | null;
  region: string | null;
  groupName: string | null;
};

/** فحص صفٍّ واحد وتحويله إلى حمولة: الدولة أوّلاً، ثم منطقتها من مناطق تلك الدولة. */
export function checkPerson(raw: RawPerson, ctx: ValidationContext): CheckedRow {
  const errors: RowIssue[] = [];
  const warnings: RowWarning[] = [];
  const text = (k: PersonField) => (raw[k] ?? "").trim();

  const name = text("display_name");
  if (name.length < 2 || name.length > 80) errors.push("name_required");
  const gender = parseGender(text("gender"));
  if (!gender) errors.push("gender_invalid");

  let countryCode: string | null = null;
  if (!text("country")) errors.push("country_required");
  else {
    countryCode = matchCountry(text("country"), ctx.countries);
    if (!countryCode) errors.push("country_unknown");
  }

  let groupId: string | null = null;
  let groupName: string | null = null;
  let groupRegion: string | null = null;
  if (text("group")) {
    const key = normalize(text("group"));
    const candidates = ctx.groups.filter(
      (g) => g.id === text("group") || normalize(g.name) === key,
    );
    // الاسم نفسه قد يتكرّر في دولتين: يُفضَّل ما في دولة الصفّ.
    const group = candidates.find((g) => g.country_code === countryCode) ?? candidates[0];
    if (!group) errors.push("group_unknown");
    else if (group.source) errors.push("group_synced");
    else if (countryCode && group.country_code !== countryCode)
      errors.push("group_country_mismatch");
    else {
      groupId = group.id;
      groupName = group.name;
      groupRegion = group.region;
    }
  }

  let region: string | null = null;
  if (countryCode) {
    const regions = ctx.regionsByCountry.get(countryCode);
    if (text("region")) {
      if (!regions) warnings.push("regions_not_loaded");
      else {
        region = matchRegion(text("region"), regions);
        if (!region) errors.push("region_unknown");
      }
    }
    if (groupId && groupRegion) {
      if (!text("region")) {
        region = groupRegion;
        warnings.push("region_from_group");
      } else if (region && region !== groupRegion) warnings.push("group_region_differs");
    }
  }

  let birth: string | null = null;
  if (text("birth_date")) {
    birth = parseDate(text("birth_date"));
    const oldest = `${Number(ctx.today.slice(0, 4)) - 30}${ctx.today.slice(4)}`;
    if (!birth || birth > ctx.today || birth < oldest) errors.push("birth_date_invalid");
  }

  const need = latinDigits(text("monthly_need")).replace(",", ".");
  if (need && !/^\d{1,6}(\.\d{1,2})?$/.test(need)) errors.push("need_invalid");

  const ref = text("external_ref");
  if (isDemoReference(ref) || /^(try-\d+|demo-)/i.test(name)) errors.push("demo_reference");
  if (ref.length > 80) errors.push("reference_invalid");

  if (errors.length > 0 || !gender || !countryCode)
    return { payload: null, errors, warnings, countryCode, region, groupName };

  const payload: PersonPayload = { display_name: name, gender, country: countryCode };
  // منطقةٌ لم تُحمَّل قائمتها تُرسل كما كُتبت؛ والقاعدة تطابقها أو ترفضها.
  const regionOut = region ?? (warnings.includes("regions_not_loaded") ? text("region") : "");
  if (regionOut) payload.region = regionOut;
  if (birth) payload.birth_date = birth;
  if (text("education_stage")) payload.education_stage = text("education_stage").slice(0, 80);
  if (need) payload.monthly_need = need;
  if (groupId) payload.group_id = groupId;
  if (text("full_name")) payload.full_name = text("full_name").slice(0, 140);
  if (text("guardian_name")) payload.guardian_name = text("guardian_name").slice(0, 140);
  if (text("guardian_phone")) payload.guardian_phone = text("guardian_phone").slice(0, 40);
  if (ref) payload.external_ref = ref;
  return { payload, errors, warnings, countryCode, region: regionOut || null, groupName };
}

/**
 * التكرار داخل الملفّ نفسه (المرجع نفسه، أو الاسم نفسه في الدولة نفسها): يعود
 * لكل صفٍّ مكرَّرٍ رقمُ الصفّ الأوّل الذي يطابقه. تجربة القاعدة لا تكتب، فلا ترى
 * هذا النوع — يُكشف هنا.
 */
export function duplicatesInFile(
  rows: ReadonlyArray<Pick<CheckedRow, "payload">>,
): Map<number, number> {
  const seen = new Map<string, number>();
  const out = new Map<number, number>();
  rows.forEach((row, i) => {
    const p = row.payload;
    if (!p) return;
    const keys = [`n:${p.country}:${normalize(p.display_name)}`];
    if (p.external_ref) keys.push(`r:${p.external_ref}`);
    const first = keys.map((k) => seen.get(k)).find((v) => v !== undefined);
    if (first !== undefined) out.set(i, first);
    for (const k of keys) if (!seen.has(k)) seen.set(k, i);
  });
  return out;
}

/* ── CSV ────────────────────────────────────────────────────────── */

/** أسماء الأعمدة المقبولة لكل حقل، بالعربية والإنجليزية. */
const HEADER_ALIASES: Record<PersonField, string[]> = {
  display_name: ["display_name", "name", "pseudonym", "الاسم المستعار", "اسم العرض", "الاسم"],
  gender: ["gender", "sex", "الجنس", "النوع"],
  country: ["country", "country_code", "الدولة", "البلد", "رمز الدولة"],
  region: ["region", "governorate", "province", "المنطقة", "المحافظة"],
  birth_date: ["birth_date", "birthdate", "dob", "تاريخ الميلاد", "الميلاد"],
  education_stage: ["education_stage", "stage", "grade", "المرحلة الدراسية", "المرحلة", "الصف"],
  monthly_need: ["monthly_need", "need", "الاحتياج الشهري", "الاحتياج"],
  group: ["group", "group_name", "المجموعة", "الحلقة"],
  full_name: ["full_name", "real_name", "الاسم الكامل", "الاسم الحقيقي"],
  guardian_name: ["guardian_name", "guardian", "اسم ولي الأمر", "ولي الأمر"],
  guardian_phone: ["guardian_phone", "phone", "جوال ولي الأمر", "الجوال", "الهاتف"],
  external_ref: ["external_ref", "ref", "reference", "id", "المرجع", "رقم المرجع"],
};

const HEADER_INDEX = new Map<string, PersonField>();
for (const field of PERSON_FIELDS)
  for (const alias of HEADER_ALIASES[field]) HEADER_INDEX.set(normalize(alias), field);

/** عمود الملفّ ← حقل، أو `null` لعمودٍ لا يُعرف (يُتجاهل ويُذكر). */
export function mapHeader(header: string): PersonField | null {
  return HEADER_INDEX.get(normalize(header)) ?? null;
}

/**
 * قراءة CSV: BOM، وفاصلٌ يُستنتج من سطر العناوين (فاصلة أو فاصلة منقوطة أو
 * جدولة)، وخلايا بين علامتي تنصيص فيها فواصل وأسطر وعلامات مضاعفة. والخلية
 * التي سبقها التصدير بفاصلةٍ عليا لمنع الصيغ تعود كما كانت.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const head = text.slice(0, text.search(/\r?\n|$/));
  const count = (ch: string) => head.split(ch).length - 1;
  const delimiter =
    count("\t") > count(",") && count("\t") >= count(";")
      ? "\t"
      : count(";") > count(",")
        ? ";"
        : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows
    .map((r) => r.map((c) => c.trim().replace(/^'(?=[=+\-@])/, "")))
    .filter((r) => r.some((c) => c !== ""));
}

export type ParsedSheet = {
  rows: RawPerson[];
  /** أعمدة الملفّ التي لم تُعرف فتُجوهلت. */
  ignored: string[];
  /** حقولٌ إلزامية لا عمود لها في الملفّ. */
  missing: PersonField[];
};

export const REQUIRED_FIELDS: readonly PersonField[] = ["display_name", "gender", "country"];
export const MAX_IMPORT_ROWS = 500;

/** نصّ CSV ← صفوفٌ بحقولها. السطر الأوّل عناوين. */
export function readSheet(input: string): ParsedSheet {
  const [header, ...body] = parseCsv(input);
  if (!header) return { rows: [], ignored: [], missing: [...REQUIRED_FIELDS] };
  const fields = header.map(mapHeader);
  const ignored = header.filter((h, i) => !fields[i] && h !== "");
  const missing = REQUIRED_FIELDS.filter((f) => !fields.includes(f));
  const rows = body.map((cells) => {
    const row: RawPerson = {};
    fields.forEach((f, i) => {
      // العمود المكرَّر: الأوّل يغلب، فلا يُستبدل ما قُرئ.
      if (f && row[f] === undefined && cells[i]) row[f] = cells[i];
    });
    return row;
  });
  return { rows, ignored, missing };
}

/** قالب الرفع: العناوين بالعربية وصفٌّ توضيحيّ واحد يُحذف قبل الرفع. */
export function templateCsv(sample: {
  name: string;
  gender: string;
  country: string;
  region: string;
}): string {
  return toCsv([
    {
      "الاسم المستعار": sample.name,
      الجنس: sample.gender,
      الدولة: sample.country,
      المنطقة: sample.region,
      "تاريخ الميلاد": "2015-03-02",
      "المرحلة الدراسية": "",
      "الاحتياج الشهري": "",
      المجموعة: "",
      "الاسم الكامل": "",
      "ولي الأمر": "",
      "جوال ولي الأمر": "",
      المرجع: "",
    },
  ]);
}
