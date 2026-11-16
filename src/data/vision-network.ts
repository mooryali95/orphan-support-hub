/**
 * شبكة منصة الرؤية والتوجهات: كلّ دولةٍ فيها حضورٌ للندوة (مكتبٌ أو نشاطٌ
 * ميداني موثّق، من `wamy-network`) تظهر بلوحةٍ افتراضية — وتبقى افتراضية —
 * إلى أن تتّصل منصّة تشغيلها فعلاً، فتظهر أرقامها الحقيقية (vision-links).
 *
 * حدود العرض (AGENTS.md › Demonstration boundaries):
 *   - الحضور والمدينة والنشاط من البحث العامّ بمصادره؛
 *   - أرقام التشغيل الافتراضية (مجموعات، أيتام في التأهيل، تمويل، مشرفون)
 *     مشتقّةٌ ثابتةً من رمز الدولة، وتُوسم «افتراضي» دائماً، ولا معرّف فيها.
 */
import { type Bilingual, type PublicPresence, WAMY_COUNTRIES } from "@/data/wamy-network";

export type NetworkMode = "virtual" | "real";

export type NetworkOffice = {
  code: string;
  name: Bilingual;
  status: "office" | "field";
  hq: boolean;
  city: Bilingual | null;
  type: Bilingual;
  activity: Bilingual;
  year: number;
  source: string;
  url: string;
  /** أرقام التشغيل الافتراضية. */
  sim: {
    groups: number;
    inQualification: number;
    funded: number;
    supervisors: number;
    measured: number;
  };
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** أسماءٌ ثابتة حيث تختلف مكتبات ICU بين الخادم والمتصفّح (فيختلّ الترطيب). */
const EN_FIXED: Record<string, string> = { PS: "Palestine" };

const EN = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** أرقامٌ افتراضية متّسقة: المقرّ والمكاتب أكبر من النشاط الميداني. */
export function simFor(code: string, status: "office" | "field", hq = false) {
  const h = hash(code);
  const scale = hq ? 2.2 : status === "office" ? 1 : 0.45;
  const groups = Math.max(2, Math.round((4 + (h % 18)) * scale));
  const inQualification = groups * (7 + ((h >>> 6) % 4));
  const funded = 22 + ((h >>> 11) % 66);
  const supervisors = Math.max(2, Math.round(groups * (0.6 + ((h >>> 16) % 5) / 10)));
  const measured = Math.round((inQualification * ((h >>> 20) % 45)) / 100);
  return { groups, inQualification, funded, supervisors, measured };
}

export const NETWORK: NetworkOffice[] = WAMY_COUNTRIES.flatMap((c) => {
  if (c.presence.status === "unconfirmed") return [];
  const p = c.presence as PublicPresence;
  return [
    {
      code: c.code,
      name: { ar: c.nameAr, en: EN_FIXED[c.code] ?? EN?.of(c.code) ?? c.code },
      status: p.status,
      hq: !!p.hq,
      city: p.city,
      type: p.type,
      activity: p.activity,
      year: p.year,
      source: p.source,
      url: p.url,
      sim: simFor(c.code, p.status, !!p.hq),
    },
  ];
});

/** علم الدولة من رمزها (حرفان) — بلا صور. */
export function flagOf(code: string) {
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}
