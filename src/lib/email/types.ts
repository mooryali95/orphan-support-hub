/**
 * منفذ البريد — العقد الذي يفصل المنصة عن أي مزوّد إرسال.
 *
 * نفس سبب منفذ الدفع، وقد أثبت نفسه عملياً هناك حين تبدّل المزوّد كلّياً
 * ولم يتغيّر إلا ملف المحوّل.
 *
 * وله سبب ثانٍ هنا: بلا مفتاح إرسال يجب أن يبقى النظام عاملاً. الإشعار
 * داخل التطبيق هو الأصل، والبريد تذكير فوقه — فغيابه لا يُسقط شيئاً.
 */

export type OutgoingEmail = {
  to: string;
  subject: string;
  /** نصّ عادي: بعض العملاء لا يعرض HTML، وبعض المستخدمين يمنعه. */
  text: string;
  html: string;
};

export type SendResult =
  { ok: true; id: string } | { ok: false; error: string; retryable: boolean };

export interface EmailProvider {
  readonly id: string;
  isConfigured(): boolean;
  send(mail: OutgoingEmail): Promise<SendResult>;
}
