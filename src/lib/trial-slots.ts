/**
 * فتحات التجربة — ما تعرضه الشاشات الحقيقية من قطع التجربة، بالاسم لا بالاستيراد.
 *
 * الشاشة الحقيقية لا تستورد وحدة تجربة (`trial.manifest.json`). تطلب هنا القطعة باسمها:
 * `trialSlots?.ProposalOffer`؛ فإن كانت التجربة موجودة جاءتها من مدخلها
 * (`src/lib/try-entry.ts`، وهو من ملفّاتها)، وإلا كانت `trialSlots` فارغة (`null`) فلم
 * يُعرض شيء. حذف التجربة إذن لا يمسّ سطراً هنا ولا في الشاشات. (docs/trial-mode.ar.md)
 *
 * العقود (أنواع الخصائص) حقيقيةٌ ومكتوبة هنا، ومدخل التجربة يلتزم بها (`satisfies TrialSlots`).
 */
import type { ComponentType } from "react";

import type { AnyRecord, RecordKind } from "@/lib/admin-console.functions";
import type { Locale } from "@/lib/locale";
import type { SupportKind } from "@/lib/support-impact";

/** مقترحٌ حمله الزائر من التجربة: بلدٌ ونوعٌ ومبلغ، لا طفلٌ ولا دفع. */
export type TrialProposalLike = {
  id: string;
  track: "sponsorship" | "qualification" | "in_kind";
  cadence: "monthly" | "one_time";
  co: string;
  amount: number;
  currency: string;
  at: string;
};

export type ProposalOfferProps = {
  tracks: readonly TrialProposalLike["track"][];
  co?: string | null | undefined;
  sameCountryOnly?: boolean;
  usable?: (p: TrialProposalLike) => boolean;
  onUse: (p: TrialProposalLike) => void;
  className?: string;
};

export interface TrialSlots {
  /** سطر «استعمل هذا المبلغ» داخل نموذج حقيقي (ملفّ الطفل، بطاقة المكان) */
  ProposalOffer: ComponentType<ProposalOfferProps>;
  /** بطاقة «ما اخترته في التجربة» في لوحة الداعم */
  ProposalCard: ComponentType<{ className?: string }>;
  /** تنبيه صفحة الدخول لمن جاء من التجربة */
  AuthNotice: ComponentType<{ className?: string }>;
  /** يُخفي المقترح بعد أن صار التزاماً حقيقياً */
  dismissProposal: (id: string) => void;
  /** صفحة الدعم في جلسة العرض */
  loadSupportMap: () => Promise<{
    default: ComponentType<{
      country?: string | undefined;
      region?: string | undefined;
      kind?: SupportKind | undefined;
    }>;
  }>;
  /** الدليل في جلسة العرض */
  loadDirectory: () => Promise<{ default: ComponentType }>;
  /** صفوف الزائر في لوحة الإدارة التجريبية */
  loadAdminOverlay: () => Promise<{
    OVERLAY_EVENTS: readonly string[];
    visitorRows: (kind: RecordKind) => AnyRecord[];
  }>;
  /** كتالوج قاعة التجربة */
  loadHall: () => Promise<{
    trialDemo: (o: {
      locale: Locale;
      child?: string | undefined;
      cadence?: "monthly" | "one_time" | undefined;
    }) => object;
  }>;
}

const found = import.meta.glob<TrialSlots>("./try-entry.ts", { eager: true, import: "slots" });

/** قطع التجربة إن وُجدت، وإلا `null`. */
export const trialSlots: TrialSlots | null = Object.values(found)[0] ?? null;
