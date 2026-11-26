import { createLazyFileRoute } from "@tanstack/react-router";

import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { TryCountryTeam } from "@/components/try/TryVerification";
import { defineCopy, useCopy } from "@/lib/locale";

export const Route = createLazyFileRoute("/try/country")({ component: TryCountry });

const COPY = defineCopy("routes/try.country", {
  ar: {
    role: "فريق الدولة",
    title: "التحقق في دولتك",
    lead: "فريق كلّ دولةٍ يرى ملفّات دولته وحدها: ما وصل من الندوة ومن منصّة المكتب، وما اختلفا عليه، وما نبّهت إليه المنصّة. بدّل الدور لترى ما يحقّ لكلٍّ منهم.",
    real: "كلّ عضوٍ يدخل بحسابه ودوره، ولا يحسم أحدٌ تغييراً رفعه بنفسه",
  },
  en: {
    role: "Country team",
    title: "Verification in your country",
    lead: "Each country's team sees only its own files: what arrived from WAMY and from the office platform, where they disagree, and what the platform flagged. Switch roles to see what each one may do.",
    real: "each member signs in with their own account and role, and nobody settles a change they uploaded",
  },
});

/** فريق الدولة في العرض: مشرفٌ أو مدخل بياناتٍ أو مطّلع، على اللوحة الحقيقية نفسها. */
function TryCountry() {
  const t = useCopy(COPY);
  return (
    <div>
      <TryRoleHeader role={t.role} title={t.title} lead={t.lead} real={t.real} />
      <div className="mt-8">
        <TryCountryTeam />
      </div>
    </div>
  );
}
