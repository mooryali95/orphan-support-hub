import type { OutgoingEmail } from "./types";
import { BRAND } from "@/config/brand";

/**
 * قوالب البريد — عربية، اتجاهها من اليمين.
 *
 * ثلاث قواعد تحكم بناءها، وكلّها من قيود عملاء البريد لا من الذوق:
 *
 *  1. **جداول لا flexbox.** Outlook يرسم بمحرّك Word، ولا يعرف flex ولا
 *     grid. الجدول هو التخطيط الوحيد الذي يُرسم في كل مكان.
 *  2. **أنماط مضمَّنة لا صفحة أنماط.** Gmail يُسقط `<style>` في بعض
 *     السياقات، فما لم يكن على العنصر نفسه قد لا يصل.
 *  3. **`dir="rtl"` على الجسم والجدول معاً.** بعض العملاء لا يورّث
 *     الاتجاه إلى الجداول، فيُقلب النصّ العربي.
 *
 * ولا صور خارجية: أكثر العملاء يحجبها افتراضياً، فرسالة تعتمد عليها
 * تصل فارغة.
 */

const NAVY = "#0B3A30";
const BLUE = "#0F4D3F";
const INK = "#7A5E1C";
const MUTED = "#5F6461";
const BORDER = "#E4E1D9";

function shell(heading: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body dir="rtl" style="margin:0;padding:0;background:#FAF8F3;font-family:Tahoma,Arial,sans-serif;">
<table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F3;padding:24px 12px;">
<tr><td align="center">
  <table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
    <tr><td style="height:4px;background:${BLUE};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:24px 24px 8px;">
      <div style="font-size:20px;font-weight:bold;color:${NAVY};">{BRAND.name}</div>
      <div style="font-size:12px;color:${MUTED};margin-top:2px;">منصة كفالة الأيتام</div>
    </td></tr>
    <tr><td style="padding:8px 24px 0;">
      <h1 style="margin:0;font-size:18px;color:${NAVY};">${heading}</h1>
    </td></tr>
    <tr><td style="padding:12px 24px 4px;font-size:14px;line-height:26px;color:#1E2B27;">
      ${bodyHtml}
    </td></tr>
    ${
      cta
        ? `<tr><td style="padding:16px 24px 4px;">
      <a href="${cta.url}" style="display:inline-block;background:${BLUE};color:#ffffff;
         text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:bold;">${cta.label}</a>
    </td></tr>`
        : ""
    }
    <tr><td style="padding:20px 24px 24px;font-size:11px;line-height:20px;color:${MUTED};border-top:1px solid ${BORDER};margin-top:16px;">
      وصلتك هذه الرسالة لأن لديك حساباً في {BRAND.name}.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function plain(heading: string, lines: string[], cta?: { label: string; url: string }) {
  return [
    `${BRAND.name} — ${heading}`,
    "",
    ...lines,
    ...(cta ? ["", `${cta.label}: ${cta.url}`] : []),
  ].join("\n");
}

export type TemplateInput = {
  to: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  baseUrl: string;
};

/**
 * الإشعار نفسه هو مصدر النصّ.
 *
 * فلا يمكن أن يقول التطبيق شيئاً ويقول البريد شيئاً آخر — وهو تناقض
 * يظهر حتماً حين يُصاغ النصّان في موضعين.
 */
export function renderNotificationEmail(input: TemplateInput): OutgoingEmail {
  const url = input.link ? `${input.baseUrl.replace(/\/$/, "")}${input.link}` : null;
  const cta = url ? { label: ctaLabel(input.kind), url } : undefined;
  const bodyText = input.body ?? "";

  const paragraphs = [
    `<p style="margin:0 0 12px;">${escapeHtml(bodyText)}</p>`,
    kindNote(input.kind),
  ]
    .filter(Boolean)
    .join("");

  return {
    to: input.to,
    subject: `${input.title} — ${BRAND.name}`,
    text: plain(input.title, [bodyText, stripTags(kindNote(input.kind))].filter(Boolean), cta),
    html: shell(escapeHtml(input.title), paragraphs, cta),
  };
}

function ctaLabel(kind: string): string {
  switch (kind) {
    case "report_published":
      return "اقرأ التقرير";
    case "orphan_approved":
    case "orphan_rejected":
    case "report_rejected":
      return "افتح مساحة الجهة";
    case "welcome":
      return "تصفّح الملفات";
    default:
      return "افتح لوحتك";
  }
}

/** سطر يُضاف حسب نوع الحدث — يمنع رسالة جافّة بلا سياق. */
function kindNote(kind: string): string {
  const note: Record<string, string> = {
    payment_failed:
      "لا إجراء مطلوب منك الآن؛ يُعيد مزوّد الدفع المحاولة تلقائياً. سنُعلمك إن تعذّر ذلك.",
    sponsorship_started: "ستصلك تقارير الأثر الدورية عن التعليم والصحة والمعيشة.",
    report_published: "التقرير معتمد من الإدارة بعد مراجعة ما رفعته جهة الرعاية.",
    welcome: "كل ملف معروض موثَّق من جهة رعاية معتمدة قبل نشره.",
  };
  const line = note[kind];
  return line ? `<p style="margin:0;color:${MUTED};font-size:13px;">${escapeHtml(line)}</p>` : "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

export type MonthlyDigest = {
  paid: number;
  delivered_months: number;
  reports: number;
  units: number;
  traits: number;
  pledges_delivered: number;
};

/**
 * «رسالة الشهر» — ملخّصٌ واحد بدل إشعاراتٍ متفرّقة.
 *
 * تُبنى من `my_monthly_digest` ولا تذكر إلا ما حدث فعلاً؛ والسطر الذي
 * قيمته صفر لا يُكتب، فلا تصل رسالةٌ ممتلئة بالأصفار.
 */
export function renderMonthlyDigest(
  to: string,
  d: MonthlyDigest,
  baseUrl: string,
  currency = "EUR",
): OutgoingEmail {
  const money = new Intl.NumberFormat("ar-u-nu-latn", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  })
    .format(d.paid)
    .replace("US$", "$");
  const lines = [
    d.paid > 0 && `دعمتَ هذا الشهر بـ${money}.`,
    d.delivered_months > 0 && `وصلت كفالتك ${d.delivered_months} مرّة موثّقةً بمستند.`,
    d.pledges_delivered > 0 && `سُلّم ${d.pledges_delivered} من تعهّداتك العينية أو التأهيلية.`,
    d.units > 0 && `اجتاز من تدعمهم ${d.units} جلسة في رحلة التأهيل.`,
    d.traits > 0 && `سُجّل ${d.traits} قياسٍ جديد لسماتهم.`,
    d.reports > 0 && `نُشر ${d.reports} تقريرٍ عن أثر دعمك.`,
  ].filter((l): l is string => Boolean(l));
  const body = lines.length ? lines : ["لم يُسجَّل جديدٌ هذا الشهر — سنكتب لك حين يحدث."];
  const url = `${baseUrl.replace(/\/$/, "")}/dashboard`;
  const cta = { label: "افتح «رحلتي»", url };
  const heading = "رسالة الشهر";
  return {
    to,
    subject: `${heading} — ${BRAND.name}`,
    text: plain(heading, body, cta),
    html: shell(
      heading,
      body.map((l) => `<p style="margin:0 0 10px;">${escapeHtml(l)}</p>`).join(""),
      cta,
    ),
  };
}
