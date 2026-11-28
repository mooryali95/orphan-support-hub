import { defineCopy } from "@/lib/locale";

/** أسباب إعادة الملف وأسماء أقسامه بلغتين؛ المفاتيح تطابق REJECTION_CODES وProfileSection. */
export const REVIEW_LABELS_COPY = defineCopy("lib/review-labels", {
  ar: {
    rejection: {
      documents_missing: "مستندات ناقصة",
      documents_unclear: "مستندات غير واضحة",
      documents_inconsistent: "تعارض بين المستندات",
      identity_unverified: "الهوية غير مُتحقَّق منها",
      guardianship_unproven: "الوصاية غير مُثبَتة",
      needs_unjustified: "بنود الاحتياج غير مبرَّرة",
      duplicate_profile: "ملفّ مكرّر",
      photo_consent_missing: "لا إقرار بالموافقة على الصورة",
      other: "سبب آخر",
    } as Record<string, string>,
    sections: {
      education: "التعليم",
      health: "الصحّة",
      family: "الأسرة والسكن",
      social: "النفسي والاجتماعي",
      aspiration: "الطموح والميول",
      supervisor_note: "ملاحظة المشرف",
    } as Record<string, string>,
  },
  en: {
    rejection: {
      documents_missing: "Missing documents",
      documents_unclear: "Unclear documents",
      documents_inconsistent: "Documents contradict each other",
      identity_unverified: "Identity not verified",
      guardianship_unproven: "Guardianship not proven",
      needs_unjustified: "Need items not justified",
      duplicate_profile: "Duplicate file",
      photo_consent_missing: "No photo consent on record",
      other: "Other reason",
    },
    sections: {
      education: "Education",
      health: "Health",
      family: "Family and housing",
      social: "Psychological and social",
      aspiration: "Aspirations and interests",
      supervisor_note: "Supervisor note",
    },
  },
});
