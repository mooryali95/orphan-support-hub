import * as React from "react";

import { BRAND as IDENTITY } from "@/config/brand";
import { COLORS } from "@/config/brand-colors";
import {
  Body,
  Container,
  Head,
  Hr,
  Img,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * الغلاف البريدي الموحّد لهوية كهاتين.
 *
 * البريد هنا امتداد لاستعارة «المضيق»: ترويسة بالأزرق الملوكي (شط الفقد)،
 * يفصلها عن المتن خيطٌ ذهبي واحد لا ينقطع (فعل العبور)، ثم متن فاتح هادئ
 * (شط النماء). لا زخرفة زائدة ولا صور موضوعة للتزيين — الوثيقة تسمّي ذلك
 * «استراتيجية الفراغ»: ما يُترك فارغاً يعمل بقدر ما يُملأ.
 *
 * قيود تقنية مقصودة: جداول وأنماط سطرية فقط (لا Tailwind ولا CSS خارجي)
 * لأن Outlook و Gmail يسقطان أغلب ما عداها، وألوان صريحة لا متغيّرات ثيم.
 */

export const BRAND = {
  navy: COLORS.light.green,
  navyDeep: COLORS.light.greenDeep,
  gold: COLORS.light.gold,
  goldSoft: COLORS.light.goldBright,
  ink: COLORS.light.ink,
  muted: COLORS.light.muted,
  line: COLORS.light.line,
  paper: COLORS.light.paper,
  card: COLORS.light.surface,
} as const;

/** أصول مطلقة: عملاء البريد لا يحلّون المسارات النسبية. */
export const assetUrl = (siteUrl: string, path: string) => `${siteUrl.replace(/\/+$/, "")}${path}`;

export function BrandEmail({
  siteName,
  siteUrl,
  preview,
  eyebrow,
  heading,
  children,
  footNote,
  unsubscribeUrl,
}: {
  siteName: string;
  siteUrl: string;
  preview: string;
  /** سطر تصنيف صغير فوق العنوان: نوع الرسالة، لا شعار تسويقي. */
  eyebrow: string;
  heading: string;
  children: React.ReactNode;
  /** سطر الطمأنة الأخير (مثلاً: تجاهل الرسالة إن لم تطلبها). */
  footNote?: string;
  /**
   * رابط إلغاء الاشتراك — **اختياري عمداً**.
   *
   * رسائل المعامَلات تحمله وجوباً، ورسائل المصادقة **يجب ألّا تحمله**:
   * إلغاء الاشتراك من رسالة استعادة كلمة المرور يحبس صاحبه خارج حسابه،
   * وهي رسالة طلبها هو بنفسه لا رسالةٌ أُرسلت إليه.
   */
  unsubscribeUrl?: string;
}) {
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={shell}>
          <Section style={header}>
            {/* الشعار صورةً بدقّة مضاعفة (420×90 تُعرض 210×45) لشاشات Retina.
                وإن حجب العميل الصور (Outlook وGmail افتراضياً لمرسلٍ جديد) يظهر
                النص البديل منسّقاً بالذهبي وخطّ الهوية، لا مربّعاً فارغاً. */}
            <Link href={siteUrl} style={wordmarkLink}>
              <Img
                src={assetUrl(siteUrl, "/brand/email-logo-white.png")}
                alt={siteName}
                width="210"
                height="45"
                style={logo}
              />
            </Link>
            <table role="presentation" cellPadding={0} cellSpacing={0} style={ornament}>
              <tbody>
                <tr>
                  <td style={ornamentLine} />
                  <td style={ornamentDot}>◆</td>
                  <td style={ornamentLine} />
                </tr>
              </tbody>
            </table>
            <Text style={headerTag}>{IDENTITY.ownerLine}</Text>
          </Section>

          <Section style={card}>
            <Text style={eyebrowStyle}>{eyebrow}</Text>
            <Text style={h1}>{heading}</Text>
            {children}
            {footNote && (
              <>
                <Hr style={hr} />
                <Text style={note}>{footNote}</Text>
              </>
            )}
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              أُرسلت هذه الرسالة من{" "}
              <Link href={siteUrl} style={footerLink}>
                {siteName}
              </Link>
              . لا تُشارك روابطها مع أحد.
            </Text>
            <Text style={footerFine}>
              {IDENTITY.ownerLine}, {IDENTITY.partner.with} {IDENTITY.partner.name}.
            </Text>
            <Text style={footerFine}>كفالة اليتيم استثمار في عمرانٍ قادم، لا إحسان عابر.</Text>
            {unsubscribeUrl && (
              <Text style={footerFine}>
                <Link href={unsubscribeUrl} style={footerLink}>
                  إيقاف هذه الرسائل
                </Link>
                ، وتبقى إشعاراتك ظاهرةً داخل المنصّة.
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** الزر الرئيس: فعل واحد لا غير في كل رسالة. */
export function BrandButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "4px 0 8px" }}>
      <tbody>
        <tr>
          <td style={buttonCell}>
            <Link href={href} style={buttonLink}>
              {children}
            </Link>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** فقرة متن قياسية. */
export function BrandText({ children }: { children: React.ReactNode }) {
  return <Text style={text}>{children}</Text>;
}

/** الرابط الاحتياطي حين يحجب عميل البريد الأزرار. */
export function BrandFallbackLink({ url }: { url: string }) {
  return (
    <>
      <Text style={fallbackLabel}>تعذّر الزر؟ انسخ الرابط التالي في المتصفّح:</Text>
      <Text style={fallbackUrl} dir="ltr">
        {url}
      </Text>
    </>
  );
}

/** صندوق رمز التحقّق: أرقام كبيرة متباعدة تُقرأ من شاشة القفل. */
export function BrandCode({ token }: { token: string }) {
  return (
    <Text style={code} dir="ltr">
      {token}
    </Text>
  );
}

const FONT = "'Tajawal', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const main = {
  backgroundColor: BRAND.paper,
  fontFamily: FONT,
  margin: 0,
  padding: "28px 12px",
};
const shell = {
  width: "100%",
  maxWidth: "560px",
  margin: "0 auto",
};
const header = {
  backgroundColor: BRAND.navyDeep,
  borderRadius: "16px 16px 0 0",
  padding: "34px 28px 24px",
  textAlign: "center" as const,
};
const wordmarkLink = { textDecoration: "none" };
const logo = {
  display: "block",
  margin: "0 auto",
  border: 0,
  outline: "none",
  height: "45px",
  width: "210px",
  maxWidth: "100%",
  // يُطبَّق على النص البديل حين تُحجب الصورة.
  color: BRAND.goldSoft,
  fontFamily: "'Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', 'Times New Roman', serif",
  fontSize: "30px",
  fontWeight: 700 as const,
  lineHeight: "45px",
  textAlign: "center" as const,
};
const ornament = { margin: "10px auto 0" };
const ornamentLine = {
  borderTop: `1px solid ${BRAND.gold}`,
  width: "44px",
  height: "1px",
  lineHeight: "1px",
};
const ornamentDot = { color: BRAND.gold, fontSize: "8px", padding: "0 8px", lineHeight: "1px" };
const headerTag = {
  color: "#E9DCC6",
  fontSize: "12px",
  letterSpacing: "0.04em",
  margin: "10px 0 0",
};
const card = {
  backgroundColor: BRAND.card,
  borderRadius: "0 0 16px 16px",
  border: `1px solid ${BRAND.line}`,
  borderTop: `3px solid ${BRAND.gold}`,
  padding: "36px 36px 30px",
};
const eyebrowStyle = {
  color: BRAND.gold,
  fontSize: "12px",
  fontWeight: 700 as const,
  letterSpacing: "0.06em",
  margin: "0 0 8px",
};
const h1 = {
  color: BRAND.navyDeep,
  fontSize: "22px",
  fontWeight: 700 as const,
  lineHeight: "1.45",
  margin: "0 0 16px",
};
const text = {
  color: BRAND.ink,
  fontSize: "15px",
  lineHeight: "1.9",
  margin: "0 0 18px",
};
const buttonCell = {
  backgroundColor: BRAND.navy,
  borderRadius: "10px",
  borderBottom: `2px solid ${BRAND.gold}`,
};
const buttonLink = {
  color: "#FFFFFF",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 700 as const,
  padding: "14px 36px",
  textDecoration: "none",
};
const fallbackLabel = {
  color: BRAND.muted,
  fontSize: "12px",
  margin: "14px 0 4px",
};
const fallbackUrl = {
  color: BRAND.navy,
  fontSize: "12px",
  lineHeight: "1.7",
  margin: 0,
  wordBreak: "break-all" as const,
};
const code = {
  backgroundColor: BRAND.paper,
  border: `1px solid ${BRAND.gold}`,
  borderRadius: "12px",
  color: BRAND.navyDeep,
  fontFamily: "'SF Mono', Menlo, Consolas, 'Courier New', monospace",
  fontSize: "32px",
  fontWeight: 700 as const,
  letterSpacing: "0.3em",
  margin: "6px 0 20px",
  padding: "20px 0 20px 0.3em",
  textAlign: "center" as const,
};
const hr = { borderColor: BRAND.line, margin: "22px 0 14px" };
const note = { color: BRAND.muted, fontSize: "13px", lineHeight: "1.8", margin: 0 };
const footer = { padding: "18px 8px 0", textAlign: "center" as const };
const footerText = { color: BRAND.muted, fontSize: "12px", margin: "0 0 4px" };
const footerLink = { color: BRAND.navy, textDecoration: "none" };
const footerFine = { color: "#9AA3AD", fontSize: "11px", margin: 0 };
