import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

/**
 * الغلاف البريدي الموحّد لهوية IOCO.
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
  navy: '#17538F',
  navyDeep: '#0E2C4B',
  gold: '#C9A058',
  goldSoft: '#DCBB7C',
  ink: '#1B2430',
  muted: '#5B6672',
  line: '#E4E0D6',
  paper: '#F7F5F0',
  card: '#FFFFFF',
} as const

/** أصول مطلقة: عملاء البريد لا يحلّون المسارات النسبية. */
export const assetUrl = (siteUrl: string, path: string) =>
  `${siteUrl.replace(/\/+$/, '')}${path}`

export function BrandEmail({
  siteName,
  siteUrl,
  preview,
  eyebrow,
  heading,
  children,
  footNote,
}: {
  siteName: string
  siteUrl: string
  preview: string
  /** سطر تصنيف صغير فوق العنوان: نوع الرسالة، لا شعار تسويقي. */
  eyebrow: string
  heading: string
  children: React.ReactNode
  /** سطر الطمأنة الأخير (مثلاً: تجاهل الرسالة إن لم تطلبها). */
  footNote?: string
}) {
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={shell}>
          <Section style={header}>
            <Link href={siteUrl}>
              <Img
                src={assetUrl(siteUrl, '/brand/ioco-email-logo-white.png')}
                alt={siteName}
                width="168"
                style={logo}
              />
            </Link>
            <Text style={headerTag}>منظمة الرعاية الدولية لليتيم</Text>
          </Section>

          {/* الخيط الذهبي المتصل — العنصر الوحيد المسموح له بعبور العرض كاملاً. */}
          <Section style={rule} />

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
              أُرسلت هذه الرسالة من{' '}
              <Link href={siteUrl} style={footerLink}>
                {siteName}
              </Link>
              . لا تُشارك روابطها مع أحد.
            </Text>
            <Text style={footerFine}>
              كفالة اليتيم استثمار في عمرانٍ قادم، لا إحسان عابر.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/** الزر الرئيس: فعل واحد لا غير في كل رسالة. */
export function BrandButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '4px 0 8px' }}>
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
  )
}

/** فقرة متن قياسية. */
export function BrandText({ children }: { children: React.ReactNode }) {
  return <Text style={text}>{children}</Text>
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
  )
}

/** صندوق رمز التحقّق: أرقام كبيرة متباعدة تُقرأ من شاشة القفل. */
export function BrandCode({ token }: { token: string }) {
  return (
    <Text style={code} dir="ltr">
      {token}
    </Text>
  )
}

const FONT =
  "'Tajawal', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

const main = {
  backgroundColor: BRAND.paper,
  fontFamily: FONT,
  margin: 0,
  padding: '28px 12px',
}
const shell = {
  width: '100%',
  maxWidth: '560px',
  margin: '0 auto',
}
const header = {
  backgroundColor: BRAND.navyDeep,
  borderRadius: '14px 14px 0 0',
  padding: '26px 28px 18px',
  textAlign: 'center' as const,
}
const logo = { display: 'block', margin: '0 auto', maxWidth: '100%' }
const headerTag = {
  color: '#C7D3E2',
  fontSize: '12px',
  letterSpacing: '0.04em',
  margin: '6px 0 0',
}
const rule = {
  height: '3px',
  lineHeight: '3px',
  fontSize: '1px',
  backgroundColor: BRAND.gold,
}
const card = {
  backgroundColor: BRAND.card,
  borderRadius: '0 0 14px 14px',
  border: `1px solid ${BRAND.line}`,
  borderTop: 'none',
  padding: '30px 28px 26px',
}
const eyebrowStyle = {
  color: BRAND.gold,
  fontSize: '12px',
  fontWeight: 700 as const,
  letterSpacing: '0.06em',
  margin: '0 0 8px',
}
const h1 = {
  color: BRAND.navyDeep,
  fontSize: '22px',
  fontWeight: 700 as const,
  lineHeight: '1.45',
  margin: '0 0 16px',
}
const text = {
  color: BRAND.ink,
  fontSize: '15px',
  lineHeight: '1.9',
  margin: '0 0 18px',
}
const buttonCell = {
  backgroundColor: BRAND.navy,
  borderRadius: '10px',
}
const buttonLink = {
  color: '#FFFFFF',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 700 as const,
  padding: '13px 30px',
  textDecoration: 'none',
}
const fallbackLabel = {
  color: BRAND.muted,
  fontSize: '12px',
  margin: '14px 0 4px',
}
const fallbackUrl = {
  color: BRAND.navy,
  fontSize: '12px',
  lineHeight: '1.7',
  margin: 0,
  wordBreak: 'break-all' as const,
}
const code = {
  backgroundColor: BRAND.paper,
  border: `1px solid ${BRAND.line}`,
  borderRadius: '10px',
  color: BRAND.navyDeep,
  fontSize: '30px',
  fontWeight: 700 as const,
  letterSpacing: '0.28em',
  margin: '4px 0 18px',
  padding: '16px 0',
  textAlign: 'center' as const,
}
const hr = { borderColor: BRAND.line, margin: '22px 0 14px' }
const note = { color: BRAND.muted, fontSize: '13px', lineHeight: '1.8', margin: 0 }
const footer = { padding: '18px 8px 0', textAlign: 'center' as const }
const footerText = { color: BRAND.muted, fontSize: '12px', margin: '0 0 4px' }
const footerLink = { color: BRAND.navy, textDecoration: 'none' }
const footerFine = { color: '#9AA3AD', fontSize: '11px', margin: 0 }
