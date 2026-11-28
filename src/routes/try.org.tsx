import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { OrgInbox } from "@/components/org/OrgInbox";
import { OrgPledges } from "@/components/org/OrgPledges";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { Badge } from "@/components/ui/badge";
import { pageTitle } from "@/config/brand";
import { useDemo } from "@/lib/demo-mode";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { registerOrgDemos, TRY_ORG_ID } from "@/lib/try-org";

const COPY = defineCopy("routes/try.org", {
  ar: {
    pageTitle: "الجهة الميدانية: عرض تفاعلي",
    role: "جهة ميدانية",
    title: "جهة ميدانية نموذجية",
    lead: "ما ينتظر الجهة: رسائل كفلاء تراجعها قبل أن تصل الطفل، وتبرّعات التأهيل والعيني الموجّهة إليها.",
    real: "لا ترفع الجهة ملفّ طفل قبل أن تعتمدها الإدارة، ولا يظهر لها اسم الكافل ولا هويّة المتبرّع",
    sample: "بيانات نموذجية",
    approved: "اعتمدتها الإدارة",
    simulated:
      "الرسائل والتبرّعات هنا محاكاة، والأطفال خياليون. اعتمد رسالةً أو ارفضها لترى الصندوق يتغيّر.",
  },
  en: {
    pageTitle: "Field organization: interactive demo",
    role: "Field organization",
    title: "A sample field organization",
    lead: "What waits for the organization: sponsor messages it reviews before they reach a child, and capability and in-kind giving directed to it.",
    real: "an organization uploads no child file before the admin team approves it, and never sees the sponsor's name or the donor's identity",
    sample: "Sample data",
    approved: "Approved by the admin team",
    simulated:
      "The messages and giving here are simulated, and the children are fictional. Approve or reject a message to see the inbox change.",
  },
});

export const Route = createFileRoute("/try/org")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryOrg,
});

function TryOrg() {
  // النسخ التجريبية تُسجَّل صراحةً قبل الرسم (sideEffects: false).
  const locale = useLocale();
  useState(() => registerOrgDemos(locale));
  const t = useCopy(COPY);
  const demo = useDemo();
  if (!demo)
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-secondary" />;
  return (
    <div>
      <TryRoleHeader role={t.role} title={t.title} lead={t.lead} real={t.real}>
        <span className="inline-flex items-center rounded-full bg-bridge-bright/15 px-3 py-1 text-xs font-semibold text-bridge-ink">
          {t.sample}
        </span>
      </TryRoleHeader>
      <p className="mt-4 text-sm text-muted-foreground">{t.simulated}</p>
      <div className="mt-6">
        <Badge className="mb-6">{t.approved}</Badge>
        <OrgInbox />
        <OrgPledges orgId={TRY_ORG_ID} />
      </div>
    </div>
  );
}
