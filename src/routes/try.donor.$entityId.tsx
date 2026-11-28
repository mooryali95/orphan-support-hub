import { createFileRoute } from "@tanstack/react-router";

import { DonorBoard } from "@/components/donor/DonorBoard";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("routes/try.donor", {
  ar: {
    pageTitle: "الجهة المانحة: عرض تفاعلي",
    role: "جهة مانحة",
    lead: "جهةٌ نموذجية تدعم باسمها: مجاميع تعهّداتها بعملاتها، وتوزيعها على الأهداف، وما سُلّم منها موثّقاً.",
    real: "يطّلع على الجهة أعضاؤها الذين قبلوا دعوة مالكها، وتُعتمد الجهة قبل أن تدعم",
    sample: "بيانات نموذجية",
    simulated: "الأرقام هنا محاكاة، وليست نتائج جهةٍ حقيقية.",
  },
  en: {
    pageTitle: "Donor entity: interactive demo",
    role: "Donor entity",
    lead: "A sample entity giving in its own name: its pledge totals by currency, how they spread across targets, and what was delivered and documented.",
    real: "only members who accepted the owner's invitation see the entity, and it is approved before it gives",
    sample: "Sample data",
    simulated: "The figures here are simulated, not a real entity's results.",
  },
});

export const Route = createFileRoute("/try/donor/$entityId")({
  // نسخ لوحة الجهة التجريبية تُسجَّل صراحةً قبل الرسم (sideEffects: false).
  beforeLoad: () => import("@/lib/try-workspaces").then((m) => m.registerDonorDemos()),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryDonor,
});

function TryDonor() {
  const t = useCopy(COPY);
  const { entityId } = Route.useParams();
  return (
    <DonorBoard
      entityId={entityId}
      shell={({ title, description, children }) => (
        <div>
          <TryRoleHeader role={t.role} title={title} lead={description ?? t.lead} real={t.real}>
            <span className="inline-flex items-center rounded-full bg-bridge-bright/15 px-3 py-1 text-xs font-semibold text-bridge-ink">
              {t.sample}
            </span>
          </TryRoleHeader>
          <p className="mt-4 text-sm text-muted-foreground">{t.simulated}</p>
          <div className="mt-6">{children}</div>
        </div>
      )}
    />
  );
}
