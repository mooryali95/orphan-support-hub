import type { ComponentType } from "react";

import { NotificationEmail } from "./notification";

export interface TemplateEntry {
  component: ComponentType<Record<string, unknown>>;
  subject: string | ((data: Record<string, unknown>) => string);
  displayName?: string;
  previewData?: Record<string, unknown>;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
/**
 * تعريف قالبٍ بأنواعه محفوظة، ثم محوُها مرّةً واحدة هنا.
 *
 * السجلّ يخزّن قوالب مختلفة الخصائص في خريطة واحدة، فنوع القيمة فيه
 * ممحوّ بالضرورة. والمحو المتفرّق يضيّع فحصاً حقيقياً: أن تطابق
 * `previewData` خصائص المكوّن فعلاً.
 *
 * فيُفحص التطابق هنا عند التعريف — حيث النوع `P` معروف — ثم يُمحى في
 * سطر واحد موثَّق بدل أن يكون `any` منثوراً.
 */
export function defineTemplate<P extends Record<string, unknown>>(entry: {
  component: ComponentType<P>;
  subject: string | ((data: P) => string);
  displayName?: string;
  previewData?: P;
  to?: string;
}): TemplateEntry {
  return entry as unknown as TemplateEntry;
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  /**
   * قالبٌ واحد لكل أنواع الإشعارات.
   *
   * العنوان والنصّ يأتيان جاهزين من `notifications`، كتبتهما الدالة التي
   * أنشأت الإشعار وهي أعلم بسياقها. والموضوع هو العنوان نفسه: عنوانٌ
   * كُتب ليُقرأ في جرس الإشعارات يصلح سطرَ موضوع بلا صياغة ثانية.
   */
  notification: defineTemplate({
    component: NotificationEmail,
    displayName: "إشعار المنصّة",
    subject: (data) => data.title,
    previewData: {
      siteName: "IOCO",
      siteUrl: "https://ioco.sunkvalue.com",
      kind: "report_published",
      title: "نُشر تقرير أثر جديد عن محمد",
      body: "تقرير شهر 2026-08 يشمل التحصيل الدراسي والمتابعة الصحّية.",
      link: "/dashboard",
      unsubscribeUrl:
        "https://ioco.sunkvalue.com/unsubscribe?token=00000000-0000-4000-8000-000000000000",
    },
  }),
};
