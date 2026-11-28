import { brandFor } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

/** لغات البريد: العربية (الافتراضية) والإنجليزية. */
export type EmailLocale = "ar" | "en";

/** لغة المستلم من قيمةٍ مخزّنة أو مُمرّرة؛ غير المعروف يعود عربياً. */
export function emailLocale(value: unknown): EmailLocale {
  return typeof value === "string" && value.toLowerCase().startsWith("en") ? "en" : "ar";
}

/**
 * لغة رسالة المصادقة من رابطها: الواجهة تضيف `lang` إلى عنوان العودة
 * (`redirect_to`)، فخطاف المصادقة يعرف لغة المستلم بلا قراءة حسابه.
 */
export function authEmailLocale(url: string | null | undefined): EmailLocale {
  return authEmailLocaleHint(url) ?? "ar";
}

/**
 * لغة الرابط إن حملها، أو `null` إن لم يحملها: رسالةٌ بدأها غير الواجهة (استعادةٌ من لوحة
 * المصادقة، أو دعوةٌ قديمة) تُسأل عنها لغة الحساب المخزّنة قبل العودة إلى العربية.
 */
export function authEmailLocaleHint(url: string | null | undefined): EmailLocale | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const direct = u.searchParams.get("lang");
    if (direct) return emailLocale(direct);
    const back = u.searchParams.get("redirect_to");
    if (back) {
      const lang = new URL(back, "https://x.invalid").searchParams.get("lang");
      if (lang) return emailLocale(lang);
    }
  } catch {
    return null;
  }
  return null;
}

/** يضيف لغة المستلم إلى عنوان العودة، فيعرفها خطاف البريد من الرابط وحده. */
export function withEmailLang(href: string, locale: unknown): string {
  const u = new URL(href);
  u.searchParams.set("lang", emailLocale(locale));
  return u.toString();
}

export const EMAIL_COPY = defineCopy("email/templates", {
  ar: {
    shell: {
      sentFrom: "أُرسلت هذه الرسالة من",
      dontShare: ". لا تُشارك روابطها مع أحد.",
      motto: "كفالة اليتيم استثمار في عمرانٍ قادم، لا إحسان عابر.",
      stop: "إيقاف هذه الرسائل",
      stopTail: "، وتبقى إشعاراتك ظاهرةً داخل المنصّة.",
      fallback: "تعذّر الزر؟ انسخ الرابط التالي في المتصفّح:",
    },
    signup: {
      subject: "تأكيد بريدك الإلكتروني",
      preview: (s: string) => `تأكيد بريدك للانضمام إلى ${s}`,
      eyebrow: "تفعيل الحساب",
      heading: "خطوة واحدة ويبدأ عبورك معنا",
      foot: "إن لم تُنشئ هذا الحساب فلا حاجة لأي إجراء؛ يكفي تجاهل الرسالة.",
      bodyA: "سجّلنا طلب إنشاء حساب باستخدام البريد",
      bodyB: ". أكّد ملكيتك لهذا البريد لتفعيل الحساب والوصول إلى ملفّات الأيتام الموثّقة.",
      codeLead: "اكتب هذا الرمز في الصفحة التي طلبته منها:",
      orButton: "أو أكّد بالزر:",
      cta: "تأكيد البريد",
    },
    invite: {
      subject: (s: string) => `دعوة للانضمام إلى ${s}`,
      eyebrow: "دعوة",
      heading: "دُعيت للانضمام إلى المنصّة",
      foot: "إن وصلتك هذه الدعوة عن طريق الخطأ، فتجاهلها آمن تماماً.",
      body: (s: string) =>
        `وُجّهت إليك دعوة للانضمام إلى ${s}؛ حيث يلتقي الكافلون بمكاتب الندوة وشركائها الميدانيين حول ملفّات موثّقة، وتتحوّل الكفالة من إحسانٍ عابر إلى مسار نماء مُتابَع.`,
      cta: "قبول الدعوة",
    },
    magic: {
      subject: (s: string) => `رمز دخولك إلى ${s}`,
      previewCode: (s: string, t: string) => `رمز دخولك إلى ${s}: ${t}`,
      previewLink: (s: string) => `رابط دخولك إلى ${s}`,
      eyebrow: "رابط دخول",
      heading: "ادخل بنقرة واحدة، دون كلمة مرور",
      foot: "الرابط صالح لمدة قصيرة ولمرّة واحدة. إن لم تطلبه، تجاهل الرسالة ولن يتغيّر شيء.",
      codeLead: "اكتب هذا الرمز في الصفحة التي طلبته منها:",
      orButton: "أو اضغط الزر للدخول مباشرة:",
      noCode: (s: string) => `اضغط الزر أدناه للدخول إلى حسابك في ${s}.`,
      cta: "تسجيل الدخول",
    },
    recovery: {
      subject: "إعادة تعيين كلمة المرور",
      preview: (s: string) => `إعادة تعيين كلمة المرور في ${s}`,
      eyebrow: "أمان الحساب",
      heading: "إعادة تعيين كلمة المرور",
      foot: "إن لم تطلب إعادة التعيين فكلمة مرورك الحالية سليمة ولم تتغيّر؛ تجاهل الرسالة.",
      body: (s: string) =>
        `وصلنا طلب لإعادة تعيين كلمة مرور حسابك في ${s}. اختر كلمة مرور جديدة من الرابط أدناه.`,
      cta: "تعيين كلمة مرور جديدة",
    },
    change: {
      subject: "تأكيد بريدك الجديد",
      preview: (s: string) => `تأكيد تغيير البريد في ${s}`,
      eyebrow: "أمان الحساب",
      heading: "تأكيد بريدك الجديد",
      foot: "لن يُنفَّذ التغيير قبل التأكيد. إن لم تطلبه، تجاهل الرسالة وراجع أمان حسابك.",
      bodyA: "طُلب تغيير بريد الحساب من",
      bodyB: "إلى",
      bodyC: ". أكّد العنوان الجديد لإتمام التغيير.",
      cta: "تأكيد التغيير",
    },
    reauth: {
      subject: "رمز التحقّق الخاص بك",
      preview: "رمز التحقّق الخاص بك",
      eyebrow: "تحقّق",
      heading: "رمز التحقّق",
      foot: "لا تُشارك هذا الرمز مع أي شخص، ولا يطلبه منك فريقنا مطلقاً.",
      body: "أدخل الرمز التالي لإتمام العملية:",
    },
    kinds: {
      welcome: ["أهلاً بك", "تصفّح الملفات"],
      orphan_approved: ["قرار اعتماد", "عرض الملفّ"],
      orphan_rejected: ["الملفّ يحتاج تصحيحاً", "فتح الملفّ"],
      organization_approved: ["اعتماد الجهة الميدانية", "لوحة الجهة"],
      organization_rejected: ["طلب الجهة يحتاج تصحيحاً", "لوحة الجهة"],
      sponsorship_started: ["بدأت الكفالة", "عرض الكفالة"],
      payment_succeeded: ["إيصال دفعة", "عرض الكفالة"],
      payment_failed: ["تعثّرت دفعة", "معالجة الدفع"],
      report_published: ["تقرير أثر", "قراءة التقرير"],
      report_rejected: ["التقرير يحتاج تصحيحاً", "فتح التقرير"],
      pledge_preparing: ["يُجهَّز تبرّعك", "متابعة التبرّع"],
      pledge_delivered: ["وصل تبرّعك", "عرض مستند التسليم"],
      other: ["إشعار", "فتح المنصّة"],
    } as Record<string, string[]>,
  },
  en: {
    shell: {
      sentFrom: "This message was sent from",
      dontShare: ". Do not share its links with anyone.",
      motto: "Sponsoring an orphan is an investment in what comes next, not passing charity.",
      stop: "Stop these emails",
      stopTail: "; your notifications stay visible inside the platform.",
      fallback: "Button not working? Copy this link into your browser:",
    },
    signup: {
      subject: "Confirm your email",
      preview: (s: string) => `Confirm your email to join ${s}`,
      eyebrow: "Account activation",
      heading: "One step and your journey with us begins",
      foot: "If you did not create this account, no action is needed; simply ignore this message.",
      bodyA: "We received a request to create an account with",
      bodyB:
        ". Confirm that this address is yours to activate the account and reach verified orphan files.",
      codeLead: "Type this code on the page that asked for it:",
      orButton: "Or confirm with the button:",
      cta: "Confirm email",
    },
    invite: {
      subject: (s: string) => `An invitation to join ${s}`,
      eyebrow: "Invitation",
      heading: "You are invited to join the platform",
      foot: "If this invitation reached you by mistake, it is safe to ignore it.",
      body: (s: string) =>
        `You are invited to join ${s}, where sponsors meet WAMY's offices and field partners around verified files, and sponsorship becomes a followed path of growth rather than passing charity.`,
      cta: "Accept the invitation",
    },
    magic: {
      subject: (s: string) => `Your sign-in code for ${s}`,
      previewCode: (s: string, t: string) => `Your sign-in code for ${s}: ${t}`,
      previewLink: (s: string) => `Your sign-in link for ${s}`,
      eyebrow: "Sign-in link",
      heading: "Sign in with one click, no password",
      foot: "The link works once and for a short time. If you did not ask for it, ignore this message and nothing changes.",
      codeLead: "Type this code on the page that asked for it:",
      orButton: "Or press the button to sign in directly:",
      noCode: (s: string) => `Press the button below to sign in to your ${s} account.`,
      cta: "Sign in",
    },
    recovery: {
      subject: "Reset your password",
      preview: (s: string) => `Reset your ${s} password`,
      eyebrow: "Account security",
      heading: "Reset your password",
      foot: "If you did not ask for a reset, your current password is safe and unchanged; ignore this message.",
      body: (s: string) =>
        `We received a request to reset the password of your ${s} account. Choose a new password from the link below.`,
      cta: "Set a new password",
    },
    change: {
      subject: "Confirm your new email",
      preview: (s: string) => `Confirm the email change on ${s}`,
      eyebrow: "Account security",
      heading: "Confirm your new email",
      foot: "Nothing changes before you confirm. If you did not ask for this, ignore the message and review your account security.",
      bodyA: "A change of the account email was requested from",
      bodyB: "to",
      bodyC: ". Confirm the new address to complete the change.",
      cta: "Confirm the change",
    },
    reauth: {
      subject: "Your verification code",
      preview: "Your verification code",
      eyebrow: "Verification",
      heading: "Verification code",
      foot: "Do not share this code with anyone; our team never asks you for it.",
      body: "Enter the following code to complete the action:",
    },
    kinds: {
      welcome: ["Welcome", "Browse the files"],
      orphan_approved: ["Approval decision", "View the file"],
      orphan_rejected: ["The file needs a correction", "Open the file"],
      organization_approved: ["Field organization approved", "Organization dashboard"],
      organization_rejected: [
        "The organization request needs a correction",
        "Organization dashboard",
      ],
      sponsorship_started: ["Sponsorship started", "View the sponsorship"],
      payment_succeeded: ["Payment receipt", "View the sponsorship"],
      payment_failed: ["A payment failed", "Fix the payment"],
      report_published: ["Impact report", "Read the report"],
      report_rejected: ["The report needs a correction", "Open the report"],
      pledge_preparing: ["Your gift is being prepared", "Follow the gift"],
      pledge_delivered: ["Your gift was delivered", "View the delivery record"],
      other: ["Notification", "Open the platform"],
    },
  },
});

export const emailCopy = (locale: EmailLocale) => copyOf(EMAIL_COPY, locale);

/** لغة رسالة المصادقة واسم المنصّة ونصوصها، من رابط الرسالة نفسه. */
export function authEmailFrame(url: string | null | undefined, stored?: EmailLocale | null) {
  const locale = authEmailLocaleHint(url) ?? stored ?? "ar";
  return { locale, name: brandFor(locale).name, c: emailCopy(locale) };
}
