import { defineCopy } from "@/lib/locale";

export const DECISIONS_COPY = defineCopy("components/admin/decisions", {
  ar: {
    title: "سجلّ القرارات",
    childTitle: "قرارات هذا الملفّ",
    lead: "من حسم ماذا ومتى، جملاً مقروءة من سجلّ التدقيق وسجلّ السلامة. للإدارة وحدها؛ وأحداث الأمن في مرشّحها.",
    filter: "نوع الحدث",
    filters: { all: "الكلّ", decisions: "القرارات", security: "الأمن" },
    empty: "لا قرارات مسجَّلة بعد.",
    emptySecurity: "لا أحداث أمنية مسجَّلة.",
    securityTag: "حدث أمني",
    sample: "عيّنة",
    sentences: {
      someone: "النظام",
      empty: "—",
      approved: (who: string, field: string, to: string, from: string) =>
        `${who} اعتمد ${field} ${to} بدل ${from}`,
      approvedNew: (who: string, field: string, to: string) => `${who} اعتمد ${field} ${to}`,
      kept: (who: string, field: string, from: string, to: string) =>
        `${who} أبقى ${field} على ${from} ورفض ${to}`,
      alert: (who: string, signal: string, status: string) =>
        `${who} حسم تنبيه «${signal}»: ${status}`,
      updateApproved: (who: string) => `${who} اعتمد تحديثاً للكافل`,
      updateRejected: (who: string) => `${who} رفض تحديثاً للكافل`,
      staff: (who: string, from: string, to: string) =>
        `${who} غيّر دوراً في فريق الدولة: ${from} ← ${to}`,
      mode: (who: string, from: string, to: string) =>
        `${who} نقل منصّة المكتب من «${from}» إلى «${to}»`,
      ingest: (who: string, n: number) => `${who} رفع ${n} سجلّاً`,
      security: (what: string, who: string) => `${what} · ${who}`,
      other: (who: string, action: string) => `${who}: ${action}`,
      secKinds: {
        four_eyes_refused: "رُفض حسمٌ لأنّ صاحبه رفع التغيير بنفسه",
        mfa_required: "رُفض حسمٌ بلا العامل الثاني",
        api_client_revoked: "أُبطل مفتاح شريك",
        sso_failure: "أخفق دخولٌ من منصّة الشريك",
        orphan_frozen: "جُمّد ملفّ طفل",
        orphan_unfrozen: "رُفع تجميد ملفّ طفل",
      } as Record<string, string>,
      actions: {
        sso_linked: "ربط حساباً بالدخول الموحّد",
        child_update_create: "رفع تحديثاً لطفل",
        "orphan.exited": "سجّل خروج طفل من البرنامج",
        "sponsorship.created": "أنشأ كفالة",
        "sponsorship.status_changed": "غيّر حالة كفالة",
        "payment.manual_confirmed": "أكّد تحويلاً بنكياً",
      } as Record<string, string>,
    },
  },
  en: {
    title: "Decision log",
    childTitle: "Decisions on this file",
    lead: "Who settled what and when, as readable sentences from the audit and integrity logs. Administration only; security events have their own filter.",
    filter: "Event type",
    filters: { all: "All", decisions: "Decisions", security: "Security" },
    empty: "No decisions recorded yet.",
    emptySecurity: "No security events recorded.",
    securityTag: "Security event",
    sample: "Sample",
    sentences: {
      someone: "The system",
      empty: "—",
      approved: (who: string, field: string, to: string, from: string) =>
        `${who} approved ${field} ${to} instead of ${from}`,
      approvedNew: (who: string, field: string, to: string) => `${who} approved ${field} ${to}`,
      kept: (who: string, field: string, from: string, to: string) =>
        `${who} kept ${field} at ${from} and rejected ${to}`,
      alert: (who: string, signal: string, status: string) =>
        `${who} settled the “${signal}” alert: ${status}`,
      updateApproved: (who: string) => `${who} approved an update for the sponsor`,
      updateRejected: (who: string) => `${who} rejected an update for the sponsor`,
      staff: (who: string, from: string, to: string) =>
        `${who} changed a country team role: ${from} → ${to}`,
      mode: (who: string, from: string, to: string) =>
        `${who} moved the office platform from “${from}” to “${to}”`,
      ingest: (who: string, n: number) => `${who} uploaded ${n} records`,
      security: (what: string, who: string) => `${what} · ${who}`,
      other: (who: string, action: string) => `${who}: ${action}`,
      secKinds: {
        four_eyes_refused: "A settlement was refused because its author uploaded the change",
        mfa_required: "A settlement was refused without the second factor",
        api_client_revoked: "A partner key was revoked",
        sso_failure: "A sign-in from the partner platform failed",
        orphan_frozen: "A child's file was frozen",
        orphan_unfrozen: "A child's file was unfrozen",
      } as Record<string, string>,
      actions: {
        sso_linked: "linked an account to single sign-on",
        child_update_create: "uploaded an update for a child",
        "orphan.exited": "recorded a child leaving the programme",
        "sponsorship.created": "created a sponsorship",
        "sponsorship.status_changed": "changed a sponsorship status",
        "payment.manual_confirmed": "confirmed a bank transfer",
      } as Record<string, string>,
    },
  },
});
