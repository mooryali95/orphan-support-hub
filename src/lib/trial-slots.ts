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
import { createElement, lazy, Suspense, type ComponentType } from "react";

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

// كسول عمداً: لا يدخل شيءٌ من التجربة حزمة صفحةٍ حقيقية (ميزانية حجم الصفحات في CI)، ويُحمَّل
// مدخلها في قطعته حين تُعرض قطعةٌ منه فعلاً.
const found = import.meta.glob<TrialSlots>("./try-entry.ts", { import: "slots" });
const loadEntry = Object.values(found)[0];

/** مكوّنٌ من مدخل التجربة يُحمَّل عند أوّل عرض. */
function lazySlot<P extends object>(pick: (s: TrialSlots) => ComponentType<P>): ComponentType<P> {
  const Lazy = lazy(() => loadEntry!().then((s) => ({ default: pick(s) })));
  return function TrialSlot(props: P) {
    return createElement(Suspense, { fallback: null }, createElement(Lazy, props));
  };
}

/** قطع التجربة إن وُجدت، وإلا `null`. */
export const trialSlots: TrialSlots | null = loadEntry
  ? {
      ProposalOffer: lazySlot((s) => s.ProposalOffer),
      ProposalCard: lazySlot((s) => s.ProposalCard),
      AuthNotice: lazySlot((s) => s.AuthNotice),
      dismissProposal: (id) => void loadEntry().then((s) => s.dismissProposal(id)),
      loadSupportMap: () => loadEntry().then((s) => s.loadSupportMap()),
      loadDirectory: () => loadEntry().then((s) => s.loadDirectory()),
      loadAdminOverlay: () => loadEntry().then((s) => s.loadAdminOverlay()),
      loadHall: () => loadEntry().then((s) => s.loadHall()),
    }
  : null;
