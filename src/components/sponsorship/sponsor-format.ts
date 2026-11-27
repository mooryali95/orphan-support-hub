import { intlOf, type Locale } from "@/lib/locale";

const at = (ym: string) => new Date(`${ym.slice(0, 7)}-15T00:00:00Z`);

/** «نوفمبر 2026» بلغة الواجهة. */
export function monthLabel(ym: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlOf(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(at(ym));
}

/**
 * الشهر الهجري المقابل (أمّ القرى)، يُكتب خافتاً بجوار الميلادي: الداعم في الخليج يحسب
 * رمضان والزكاة بالهجري. منتصف الشهر الميلادي يقع في شهرٍ هجريّ واحد تقريباً.
 */
export function hijriLabel(ym: string, locale: Locale): string {
  try {
    const tag =
      locale === "ar" ? "ar-u-ca-islamic-umalqura-nu-latn" : `${locale}-u-ca-islamic-umalqura`;
    return new Intl.DateTimeFormat(tag, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(at(ym));
  } catch {
    return "";
  }
}
