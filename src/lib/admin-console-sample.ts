/**
 * بيانات نموذجية للوحة البيانات — لتجربة الإدارة كاملةً قبل وجود بياناتٍ حقيقية.
 *
 * تُولَّد في المتصفّح بأسماء مستعارة ثابتة (لا عشوائية)، ولا تصل خادماً، ولا
 * تكتب شيئاً: الإجراءات عليها محاكاةٌ في الصفحة وحدها. وتظهر في وضع التجربة
 * وحده (`?sample=1`) بشارةٍ واضحة، كعيّنة «النظرة الشاملة».
 */
import type {
  AccessRecord,
  AnyRecord,
  DocumentRecord,
  OfficeRecord,
  OrgRecord,
  OrphanRecord,
  PaymentRecord,
  PledgeRecord,
  RecordKind,
  RecordsPage,
  SponsorshipRecord,
  SupervisorRecord,
} from "@/lib/admin-console.functions";

const N = 48;
const seed = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const pick = <T>(key: string, from: readonly T[]): T => from[seed(key) % from.length]!;
const num = (key: string, a: number, b: number) => a + (seed(key) % (b - a + 1));
const hex = (key: string, len: number) =>
  (seed(key) >>> 0).toString(16).padStart(8, "0").slice(0, len);
// معرّفٌ بصيغة UUID يبدأ بأرقامٍ مميّزة: رقم المرجع (أوّل ثمانية) يختلف بين الصفوف.
const uuid = (kind: string, i: number) =>
  `${hex(`${kind}:${i}:a`, 8)}-${hex(`${kind}:${i}:b`, 4)}-4000-8000-${hex(`${kind}:${i}:c`, 8)}${hex(`${kind}:${i}:d`, 4)}`;
const day = (i: number) => new Date(Date.UTC(2026, 10, 22) - i * 86_400_000 * 3).toISOString();

const NAMES = [
  "أمينة",
  "عمر",
  "سارة",
  "يوسف",
  "مريم",
  "أحمد",
  "ليلى",
  "حمزة",
  "نور",
  "إدريس",
  "زينب",
  "آدم",
];
const COUNTRIES = ["AL", "SN", "EG", "KE", "BA", "ID", "SO", "BD"];
const CITIES = ["تيرانا", "داكار", "القاهرة", "نيروبي", "سراييفو", "جاكرتا", "مقديشو", "دكا"];
const ORGS = [
  "جهة الأمل",
  "دار البركة",
  "مؤسسة النور",
  "جمعية الوفاء",
  "بيت الرحمة",
  "رعاية الفجر",
];
const EMAILS = ["donor", "giver", "sponsor", "family", "friend", "teacher"];
const DOCS = [
  "death_certificate",
  "birth_certificate",
  "guardianship_proof",
  "orphan_id",
  "school_record",
  "medical_report",
];

const orphan = (i: number): OrphanRecord => {
  const k = `o:${i}`;
  const need = 10 * num(`${k}:need`, 8, 16);
  const level = seed(`${k}:v`) % 3; // 0 موثّق، 1 جزئي، 2 غير موثّق
  const v = (key: string) => level === 0 || (level === 1 && seed(`${k}:${key}`) % 2 === 0);
  const co = pick(`${k}:co`, COUNTRIES);
  return {
    id: uuid("orphan", i),
    code: `${co}-${String(100 + i).padStart(4, "0")}`,
    name: pick(`${k}:n`, NAMES),
    city: CITIES[COUNTRIES.indexOf(co)] ?? null,
    country: co,
    status: pick(`${k}:s`, [
      "approved",
      "approved",
      "approved",
      "fully_sponsored",
      "submitted",
      "draft",
    ]),
    org: pick(`${k}:org`, ORGS),
    need,
    funded: Math.min(need, 5 * num(`${k}:f`, 0, need / 5)),
    currency: "EUR",
    created_at: day(i),
    sponsors: num(`${k}:sp`, 0, 3),
    verification: {
      death: v("death"),
      identity: v("identity"),
      guardianship: v("guard"),
      consent: v("consent"),
      followup: v("follow"),
      documents: 6 - level * 2,
      verified_documents: level === 0 ? 6 : level === 1 ? 3 : 0,
    },
  };
};

const sponsor = (k: string) => `${pick(k, EMAILS)}${num(`${k}:n`, 1, 99)}@example.test`;

const BUILDERS: { [K in RecordKind]: (i: number) => AnyRecord } = {
  orphans: orphan,
  sponsorships: (i): SponsorshipRecord => {
    const o = orphan(i);
    return {
      id: uuid("sp", i),
      status: pick(`sp:${i}`, [
        "active",
        "active",
        "active",
        "paused",
        "pending_payment",
        "cancelled",
      ]),
      type: i % 5 === 0 ? "one_time" : "monthly",
      amount: 5 * num(`sp:${i}:a`, 4, 20),
      currency: "EUR",
      created_at: day(i),
      started_at: day(i + 1),
      orphan_id: o.id,
      code: o.code,
      name: o.name,
      sponsor: sponsor(`sp:${i}`),
    };
  },
  pledges: (i): PledgeRecord => ({
    id: uuid("pl", i),
    status: pick(`pl:${i}`, ["pending", "pending", "active", "fulfilled", "cancelled"]),
    kind: i % 3 === 0 ? "in_kind" : "qualification",
    target_type: pick(`pl:${i}:t`, ["country", "region", "group", "orphan"]),
    target: pick(`pl:${i}:g`, [...CITIES, ...NAMES]),
    amount: 5 * num(`pl:${i}:a`, 5, 40),
    currency: "EUR",
    country: pick(`pl:${i}:co`, COUNTRIES),
    created_at: day(i),
    supporter: sponsor(`pl:${i}`),
  }),
  orgs: (i): OrgRecord => ({
    id: uuid("org", i),
    name: `${pick(`org:${i}`, ORGS)} ${i + 1}`,
    status: pick(`org:${i}:s`, ["approved", "approved", "pending", "suspended", "rejected"]),
    city: pick(`org:${i}:c`, CITIES),
    region: null,
    license: `LIC-${1000 + i}`,
    email: `org${i + 1}@example.test`,
    children: num(`org:${i}:n`, 0, 60),
    created_at: day(i),
  }),
  offices: (i): OfficeRecord => ({
    id: uuid("off", i),
    name: `مكتب ${pick(`off:${i}`, CITIES)} ${i + 1}`,
    country: pick(`off:${i}:co`, COUNTRIES),
    region: i % 3 === 0 ? null : pick(`off:${i}:r`, CITIES),
    status: i % 7 === 0 ? "inactive" : "active",
    members: num(`off:${i}:m`, 1, 12),
    parent: i % 4 === 0 ? null : "المكتب الإقليمي",
    created_at: day(i),
  }),
  supervisors: (i): SupervisorRecord => ({
    id: uuid("sup", i),
    email: `supervisor${i + 1}@example.test`,
    name: `${pick(`sup:${i}`, NAMES)} المشرف`,
    status: pick(`sup:${i}:s`, ["certified", "certified", "pending", "inactive"]),
    independence: num(`sup:${i}:x`, 40, 100),
    certified_at: i % 4 === 2 ? null : day(i),
    note: null,
    created_at: day(i + 2),
  }),
  documents: (i): DocumentRecord => {
    const o = orphan(Math.floor(i / 2));
    const status = seed(`doc:${i}`) % 3 === 0 ? "unverified" : "verified";
    return {
      id: uuid("doc", i),
      doc_type: pick(`doc:${i}:t`, DOCS),
      file_name: `document-${i + 1}.pdf`,
      path: `sample/${i}.pdf`,
      status,
      verified_at: status === "verified" ? day(i) : null,
      orphan_id: o.id,
      code: o.code,
      name: o.name,
      created_at: day(i + 1),
    };
  },
  payments: (i): PaymentRecord => {
    const o = orphan(i);
    return {
      id: uuid("pay", i),
      status: pick(`pay:${i}`, ["paid", "paid", "paid", "pending", "failed", "refunded"]),
      amount: 5 * num(`pay:${i}:a`, 4, 20),
      currency: "EUR",
      provider: i % 3 === 0 ? "bank_transfer" : "gateway",
      ref: `REF-${(seed(`pay:${i}:r`) % 1e8).toString().padStart(8, "0")}`,
      paid_at: day(i),
      period_start: day(i + 10),
      period_end: day(i),
      sponsor: sponsor(`pay:${i}`),
      name: o.name,
      code: o.code,
      sponsorship_id: uuid("sp", i),
      created_at: day(i),
    };
  },
  access_log: (i): AccessRecord => {
    const o = orphan(i % 20);
    return {
      id: uuid("acc", i),
      status: i % 3 === 0 ? "other" : "admin",
      viewer: i % 3 === 0 ? `office${num(`acc:${i}`, 1, 5)}@example.test` : "admin@example.test",
      scopes: pick(`acc:${i}:s`, [
        ["identity"],
        ["story"],
        ["location", "story"],
        ["identity", "location"],
      ]),
      orphan_id: o.id,
      code: o.code,
      name: o.name,
      created_at: new Date(Date.UTC(2026, 10, 22, 18) - i * 3_600_000 * 5).toISOString(),
    };
  },
};

/** صفوف النوع كاملةً — تُبنى مرّةً لكلّ نوع. */
const cache = new Map<RecordKind, AnyRecord[]>();
export function sampleRows(kind: RecordKind): AnyRecord[] {
  let rows = cache.get(kind);
  if (!rows) {
    rows = Array.from({ length: N }, (_, i) => BUILDERS[kind](i));
    cache.set(kind, rows);
  }
  return rows;
}

/** صفحةٌ بالشكل نفسه الذي تعيده `admin_records`: بحثٌ وحالةٌ وصفحات، على الصفوف المعدَّلة محلّياً. */
export function samplePage(
  rows: AnyRecord[],
  opts: { q?: string; status?: string; page: number; pageSize: number },
): RecordsPage<AnyRecord> {
  const needle = opts.q?.trim().toLowerCase() ?? "";
  const matched = needle
    ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(needle))
    : rows;
  const counts: Record<string, number> = {};
  for (const r of matched) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const filtered = opts.status ? matched.filter((r) => r.status === opts.status) : matched;
  return {
    total: filtered.length,
    counts,
    rows: filtered.slice(opts.page * opts.pageSize, opts.page * opts.pageSize + opts.pageSize),
  };
}
