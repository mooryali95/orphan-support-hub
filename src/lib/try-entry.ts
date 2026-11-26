/**
 * مدخل التجربة إلى الشاشات الحقيقية — من ملفّات التجربة (`trial.manifest.json`).
 *
 * الكود الحقيقي لا يستورد هذا الملفّ: `src/lib/trial-slots.ts` و`src/lib/trial-gate.ts`
 * يسألان عنه بـ`import.meta.glob`، فإن حُذف (`npm run trial:remove`) خلت الفتحات ولم
 * ينكسر شيء. القطع الخفيفة هنا مباشرةً كما كانت تُستورد؛ والثقيلة تُحمَّل عند الطلب في
 * قطعها الخاصّة. (docs/trial-mode.ar.md)
 */
import {
  TrialAuthNotice,
  TrialProposalCard,
  TrialProposalOffer,
} from "@/components/try/TrialProposal";
import { dismissProposal } from "@/lib/try-handoff";
import type { TrialSlots } from "@/lib/trial-slots";

export const slots = {
  ProposalOffer: TrialProposalOffer,
  ProposalCard: TrialProposalCard,
  AuthNotice: TrialAuthNotice,
  dismissProposal: (id: string) => dismissProposal(id),
  // كتالوج التجربة يُحمَّل قبل أيّ قراءة، كما تفعل مسارات «جرّب» نفسها (routes/try.tsx)
  loadSupportMap: () =>
    Promise.all([
      import("@/lib/try-places"),
      import("@/lib/try-cycle"),
      import("@/components/try/TrySupportMap"),
    ]).then(([, , m]) => ({ default: m.TrySupportMap })),
  loadDirectory: () =>
    Promise.all([
      import("@/lib/try-places"),
      import("@/lib/try-cycle"),
      import("@/components/try/TryDirectory"),
    ]).then(([, , m]) => ({ default: m.TryDirectory })),
  loadAdminOverlay: () => import("@/lib/try-admin-overlay"),
  loadHall: () => import("@/lib/hall/trial"),
} satisfies TrialSlots;
