import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { GuardianChildCard } from "@/components/guardian/GuardianChildCard";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { getGuardianChildren } from "@/lib/guardian.functions";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { defineCopy, useCopy } from "@/lib/locale";
import { registerGuardianDemos } from "@/lib/try-guardian";

// تسجيلٌ صريح: الحزمة تعلن `sideEffects: false` فلا يكفي الاستيراد.
registerGuardianDemos();

export const Route = createLazyFileRoute("/try/guardian")({ component: TryGuardian });

const COPY = defineCopy("routes/try.guardian", {
  ar: {
    role: "الوليّ",
    title: "أطفالي",
    lead: "الوليّ يرى أين وصل كلّ طفل، ويوافق على الالتحاق وعلى نشر الصور أو يسحب موافقته. البطاقات هنا خيالية.",
    real: "وليٌّ موثّق يرى أطفاله وحدهم، وموافقته تُحفظ بنصّها",
    loading: "نحمّل بطاقات الأطفال",
  },
  en: {
    role: "Guardian",
    title: "My children",
    lead: "The guardian sees where each child stands, consents to enrollment and to photos, or withdraws consent. These cards are fictional.",
    real: "a verified guardian who sees only their own children, with each consent stored word for word",
    loading: "Loading the children's cards",
  },
});

/** واجهة الوليّ في العرض: البطاقة الحقيقية نفسها ببياناتٍ خيالية عبر منفذ البيانات. */
function TryGuardian() {
  const t = useCopy(COPY);
  const fetchChildren = useDataFn("guardian.children", getGuardianChildren);
  const key = useDataKey(["guardian-children"]);
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => fetchChildren() });
  return (
    <div>
      <TryRoleHeader role={t.role} title={t.title} lead={t.lead} real={t.real} />
      {isLoading ? (
        <p role="status" className="mt-8 text-sm text-muted-foreground">
          {t.loading}
        </p>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {(data ?? []).map((c) => (
            <GuardianChildCard key={c.id} child={c} lang="ar" />
          ))}
        </div>
      )}
    </div>
  );
}
