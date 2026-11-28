import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DonorBoard } from "@/components/donor/DonorBoard";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { pageTitle } from "@/config/brand";
import { useDemo } from "@/lib/demo-mode";
import { registerDonorDemos } from "@/lib/try-workspaces";
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
  // نسخ لوحة الجهة التجريبية تُسجَّل صراحةً في المتصفّح قبل الرسم (sideEffects: false).
  useState(registerDonorDemos);
  // the trial session starts in the shell's effect, after this screen mounts: until it does,
  // nothing is fetched, so no call ever reaches the real server from the trial.
  const t = useCopy(COPY);
  const { entityId } = Route.useParams();
  const demo = useDemo();
  if (!demo)
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-secondary" />;
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
