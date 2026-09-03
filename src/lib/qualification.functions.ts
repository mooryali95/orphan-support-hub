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
