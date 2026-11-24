/**
 * تكامل العرض التفاعلي: ما فعله الزائر في جلسته يظهر في واجهات الأدوار الأخرى.
 *
 * كفالة الزائر تظهر في «الكفالات» و«المدفوعات» عند الإدارة، وتعهّده في «التعهّدات»،
 * وملفّ «الدورة الكاملة» في «الأيتام» و«المستندات»، وفتحه ملفَّ طفلٍ في «سجلّ الاطّلاع».
 * كلّه يُقرأ من الجلسة (`try-store`) ولا يصل خادماً، ويُمحى بـ«ابدأ من جديد».
 */
import type {
  AccessRecord,
  AnyRecord,
  DocumentRecord,
  OrphanRecord,
  PaymentRecord,
  PledgeRecord,
  RecordKind,
  SponsorshipRecord,
} from "@/lib/admin-console.functions";
import { CYCLE_CHILD_ID, CYCLE_DOCS, loadCycle, trialChild } from "@/lib/try-cycle";
import { loadGifts, TRY_CURRENCY } from "@/lib/try-demo";
import { tryStore } from "@/lib/try-store";
import { loadPledges, targetLabel } from "@/lib/try-support";

/** الزائر كما يظهر في جداول الإدارة: لا بريد حقيقيّ، بل وسمٌ واضح. */
export const VISITOR = "أنت — زائر العرض";

export const ACCESS_KEY = "try-access:v1";
export const ACCESS_EVENT = "try-access-change";

type Seen = { childId: string; at: string };

export function loadAccess(): Seen[] {
  try {
    const raw = tryStore()?.getItem(ACCESS_KEY);
    const v = raw ? (JSON.parse(raw) as Seen[]) : [];
    return Array.isArray(v) ? v.filter((s) => s && typeof s.childId === "string") : [];
  } catch {
    return [];
  }
}

/** يسجّل اطّلاع الزائر على ملفّ طفل — كما يسجّل `orphan_view` في المنصّة الحقيقية. */
export function recordAccess(childId: string, now = new Date()) {
  const list = loadAccess();
  // فتحٌ متكرّر للملفّ نفسه في دقيقةٍ واحدة سطرٌ واحد
  if (list[0]?.childId === childId && now.getTime() - Date.parse(list[0].at) < 60_000) return;
  try {
    tryStore()?.setItem(
      ACCESS_KEY,
      JSON.stringify([{ childId, at: now.toISOString() }, ...list].slice(0, 40)),
    );
  } catch {
    /* محجوب */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACCESS_EVENT));
}

/** أحداث الجلسة التي تغيّر ما يُعرض في الأدوار الأخرى */
export const OVERLAY_EVENTS = [
  "try-demo-change",
  "try-support-change",
  "try-cycle-change",
  ACCESS_EVENT,
] as const;

const id = (kind: string, key: string) => `visitor-${kind}-${key}`;

function cycleOrphan(): OrphanRecord | null {
  const c = loadCycle();
  if (!c.child.name.trim()) return null;
  const docs = CYCLE_DOCS.map((d) => c.docs[d]);
  const ok = (d: (typeof CYCLE_DOCS)[number]) => c.docs[d].verified;
  return {
    id: CYCLE_CHILD_ID,
    code: `DEMO-NEW-${c.child.co}`,
    name: c.child.name.trim(),
    city: null,
    country: c.child.co,
    status: c.stage === "published" ? "approved" : c.stage === "submitted" ? "submitted" : "draft",
    org: "جهتك في العرض",
    need: c.child.need,
    funded: 0,
    currency: TRY_CURRENCY,
    created_at: c.log.at(-1)?.at ?? new Date().toISOString(),
    sponsors: loadGifts().filter((g) => g.childId === CYCLE_CHILD_ID).length,
    verification: {
      death: ok("death_certificate"),
      identity: ok("birth_certificate"),
      guardianship: ok("guardianship_proof"),
      consent: ok("photo_consent"),
      followup: !!c.reportSent,
      documents: docs.filter((d) => d.uploaded).length,
      verified_documents: docs.filter((d) => d.verified).length,
    },
  };
}

/** صفوف الزائر لنوعٍ واحد، الأحدث أوّلاً — تُعرض فوق البيانات النموذجية. */
export function visitorRows(kind: RecordKind): AnyRecord[] {
  if (typeof window === "undefined") return [];
  const gifts = loadGifts();
  switch (kind) {
    case "orphans": {
      const o = cycleOrphan();
      return o ? [o] : [];
    }
    case "documents": {
      const c = loadCycle();
      const o = cycleOrphan();
      if (!o) return [];
      return CYCLE_DOCS.filter((d) => c.docs[d].uploaded).map((d): DocumentRecord => ({
        id: id("doc", d),
        doc_type: d,
        file_name: `${d}.pdf`,
        path: `sample/visitor-${d}.pdf`,
        status: c.docs[d].verified ? "verified" : "unverified",
        verified_at: c.docs[d].verified ? o.created_at : null,
        orphan_id: o.id,
        code: o.code,
        name: o.name,
        created_at: o.created_at,
      }));
    }
    case "sponsorships":
      return gifts.flatMap((g): SponsorshipRecord[] => {
        const k = trialChild(g.childId);
        if (!k) return [];
        return [
          {
            id: id("sp", g.id),
            status: "active",
            type: g.cadence,
            amount: g.amount,
            currency: TRY_CURRENCY,
            created_at: g.at,
            started_at: g.at,
            orphan_id: g.childId,
            code: k.code,
            name: k.name,
            sponsor: VISITOR,
          },
        ];
      });
    case "payments":
      return gifts.flatMap((g): PaymentRecord[] => {
        const k = trialChild(g.childId);
        if (!k) return [];
        return [
          {
            id: id("pay", g.id),
            status: "paid",
            amount: g.paid?.amount ?? g.amount,
            currency: g.paid?.currency ?? TRY_CURRENCY,
            provider: "gateway",
            ref: `DEMO-${g.id.slice(0, 8).toUpperCase()}`,
            paid_at: g.at,
            period_start: g.at,
            period_end: g.at,
            sponsor: VISITOR,
            name: k.name,
            code: k.code,
            sponsorship_id: id("sp", g.id),
            created_at: g.at,
          },
        ];
      });
    case "pledges":
      return loadPledges().map((p): PledgeRecord => ({
        id: id("pl", p.id),
        status: "pending",
        kind: p.kind,
        target_type: p.scope,
        target: targetLabel(p, "ar").label,
        amount: p.amount,
        currency: p.currency,
        country: p.co,
        created_at: p.at,
        supporter: VISITOR,
      }));
    case "access_log":
      return loadAccess().flatMap((s, i): AccessRecord[] => {
        const k = trialChild(s.childId);
        if (!k) return [];
        return [
          {
            id: id("acc", `${i}-${s.at}`),
            status: "other",
            viewer: VISITOR,
            scopes: ["story"],
            orphan_id: s.childId,
            code: k.code,
            name: k.name,
            created_at: s.at,
          },
        ];
      });
    default:
      return [];
  }
}

/** هل الصفّ من فعل الزائر في هذه الجلسة؟ */
export const isVisitorRow = (r: { id: string }) =>
  r.id.startsWith("visitor-") || r.id === CYCLE_CHILD_ID;
