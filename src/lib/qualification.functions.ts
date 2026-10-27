import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  withQualification,
  type PublicQualification,
  type QualificationStage,
} from "@/integrations/supabase/types.extra";

/**
 * بناء الأهلية — منهجية «الرواد».
 *
 * الكفالة هنا ليست شراء خدمةٍ لطفل بل اشتراكاً في بناء أهليّته:
 * **الأهلية = القدرة على تفهّم الخطاب + اكتساب الفعل.**
 *
 * وما تُرجعه هذه الطبقة هو ما يجوز عرضه: البرنامج ومفهومه وسمته
 * المستهدفة ومدخلاته وعملياته ومخرجاته، والمرحلة التي بلغها. أمّا
 * خريطة سمات الطفل فحكمٌ عليه لا أثرٌ يُعرض — ولها بابها المحروس.
 */

/** رحلة التشغيل الست، بترتيبها الذي لا يُقفز فيه. */
export const QUALIFICATION_JOURNEY: Array<{
  stage: QualificationStage;
  label: string;
  question: string;
}> = [
  { stage: "concept", label: "المفهوم", question: "ما المعنى الحاكم الذي نبدأ منه؟" },
  { stage: "trait", label: "السمة", question: "أيّ بنيةٍ داخلية نريد أن نبنيها؟" },
  { stage: "system", label: "النظام", question: "كيف نُشغّل المفهوم ليبني السمة؟" },
  { stage: "actions", label: "الأفعال", question: "ما الأفعال التي صارت تصدر عنه؟" },
  { stage: "measurement", label: "القياس", question: "كيف نقيس التحوّل؟" },
  { stage: "qualified", label: "الأهلية", question: "ما القابلية التي استقرّت؟" },
];

const STAGE_ORDER: Record<QualificationStage, number> = {
  concept: 1,
  trait: 2,
  system: 3,
  actions: 4,
  measurement: 5,
  qualified: 6,
};

/** هل بلغت الرحلة هذه المحطّة أو تجاوزتها؟ */
export function stageReached(current: QualificationStage, target: QualificationStage): boolean {
  return STAGE_ORDER[current] >= STAGE_ORDER[target];
}

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getOrphanQualification = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const db = withQualification(publicClient());
    const { data: rows, error } = await db.rpc("orphan_qualification", {
      _orphan: data.orphanId,
    });

    // البرنامج زينة الملفّ لا شرط عرضه: خطأٌ فيه يُخفي القسم ولا يُسقط الصفحة.
    if (error) return { programs: [] as PublicQualification[], error: error.message };
    return {
      programs: (rows ?? []) as PublicQualification[],
      error: null as string | null,
    };
  });

/* ── مقياس ما قبل البرنامج وبعده ────────────────────────────────────── */

/**
 * المقارنة بين قياسين.
 *
 * وفيها فخٌّ يسهل الوقوع فيه: **الخريطة نسبية مجموعها مئة**، فانخفاض
 * سمةٍ قد يكون إعادةَ توزيعٍ لا تراجعاً — نمت غيرُها فأخذت من نصيبها.
 * فجدولٌ بأسهمٍ خضراء وحمراء يقرأ الأداة قراءةً خاطئة، ويحكم على طفلٍ
 * بما لا تقوله أرقامه.
 *
 * والدالّ فعلاً هو **استقرار البناء حول سمة قائدة**: أن تبلغ الأعلى
 * عتبةَ الخمسين. وذلك ما تُبرزه هذه المقارنة، والفروق تُعرض عدداً
 * محايداً لا حكماً.
 */
export const CORE_TRAIT_THRESHOLD = 50;

export type TraitDelta = {
  slug: string;
  before: number;
  after: number;
  /** الفرق عدداً — إعادةُ توزيعٍ لا حكم. */
  shift: number;
};

export type AssessmentComparison = {
  before: { phase: string; at: string; core: string | null; below: boolean };
  after: { phase: string; at: string; core: string | null; below: boolean };
  deltas: TraitDelta[];
  /** أعلى نصيبٍ في كلٍّ من الخريطتين — تركّز البناء لا ترتيب السمات. */
  topBefore: number;
  topAfter: number;
  /** استقرّ البناء حول سمة قائدة بعد أن لم يكن مستقرّاً. */
  settled: boolean;
  /** وكان مستقرّاً فلم يعد — يُعرض ولا يُخفى. */
  unsettled: boolean;
  /** تحوّلت السمة القائدة من واحدةٍ إلى أخرى. */
  coreChanged: boolean;
};

type ComparableAssessment = {
  phase: "baseline" | "progress" | "final";
  scores: Record<string, number>;
  core_trait: string | null;
  below_threshold: boolean;
  assessed_at: string;
};

/**
 * يختار طرفي المقارنة: الأوّليَّ أساساً، وآخرَ قياسٍ بعده طرفاً ثانياً.
 * وبلا أساسٍ أو بلا قياسٍ ثانٍ لا مقارنة — و`null` هنا أصدق من جدولٍ
 * نصفه فارغ.
 */
export function compareAssessments(
  assessments: ComparableAssessment[],
): AssessmentComparison | null {
  const sorted = [...assessments].sort((a, b) => a.assessed_at.localeCompare(b.assessed_at));
  const base = sorted.find((a) => a.phase === "baseline");
  if (!base) return null;

  const rest = sorted.filter((a) => a !== base && a.assessed_at >= base.assessed_at);
  // الختامي أولى بالمقارنة من مرحليٍّ بعده، فهو حصيلة البرنامج.
  const last = rest.filter((a) => a.phase === "final").at(-1) ?? rest.at(-1);
  if (!last) return null;

  const slugs = Array.from(new Set([...Object.keys(base.scores), ...Object.keys(last.scores)]));
  const deltas = slugs.map((slug) => {
    const before = base.scores[slug] ?? 0;
    const after = last.scores[slug] ?? 0;
    return { slug, before, after, shift: after - before };
  });
  deltas.sort((a, b) => b.after - a.after || b.before - a.before);

  const topBefore = Math.max(0, ...deltas.map((d) => d.before));
  const topAfter = Math.max(0, ...deltas.map((d) => d.after));

  return {
    before: {
      phase: base.phase,
      at: base.assessed_at,
      core: base.core_trait,
      below: base.below_threshold,
    },
    after: {
      phase: last.phase,
      at: last.assessed_at,
      core: last.core_trait,
      below: last.below_threshold,
    },
    deltas,
    topBefore,
    topAfter,
    settled: base.below_threshold && !last.below_threshold,
    unsettled: !base.below_threshold && last.below_threshold,
    coreChanged:
      !base.below_threshold &&
      !last.below_threshold &&
      base.core_trait !== null &&
      last.core_trait !== null &&
      base.core_trait !== last.core_trait,
  };
}
