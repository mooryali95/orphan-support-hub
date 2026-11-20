import { Link } from "@tanstack/react-router";
import { KahataynLockup } from "@/components/brand/KahataynMark";
import { PartnerLockup } from "@/components/brand/PartnerMark";
import { brandFor } from "@/config/brand";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/SiteFooter", {
  ar: {
    about:
      "منصة تربط الكافل باليتيم عبر ملفات موثّقة من جهات رعاية معتمدة، مع متابعة شهرية وتقارير أثر شفافة.",
    platform: "المنصة",
    orphans: "دليل الأيتام",
    support: "ادعم",
    traits: "نموذج السمات",
    how: "كيف تعمل الكفالة",
    orgs: "جهات الرعاية",
    account: "الحساب",
    signIn: "تسجيل الدخول",
    dashboard: "لوحتي",
    transparency: "الشفافية",
    privacy: "سياسة الخصوصية",
    terms: "شروط الاستخدام",
    faq: "الأسئلة الشائعة",
    developers: "للمطوّرين",
    rights: "جميع الحقوق محفوظة",
    hadithNote: null as string | null,
  },
  en: {
    about:
      "A platform that connects sponsors with orphans through files verified by approved care organizations, with monthly follow-up and transparent impact reports.",
    platform: "Platform",
    orphans: "Children",
    support: "Support",
    traits: "Trait model",
    how: "How sponsorship works",
    orgs: "Care organizations",
    account: "Account",
    signIn: "Sign in",
    dashboard: "My dashboard",
    transparency: "Transparency",
    privacy: "Privacy policy",
    terms: "Terms of use",
    faq: "FAQ",
    developers: "Developers",
    rights: "All rights reserved",
    hadithNote:
      "“I and the one who sponsors an orphan will be in Paradise like this,” and he gestured with his index and middle fingers, slightly apart.",
  },
});

/** `hadith={false}` where the page already sets the hadith in its body: once per page. */
export function SiteFooter({ hadith = true }: { hadith?: boolean } = {}) {
  const c = useCopy(COPY);
  const brand = brandFor(useLocale());
  return (
    <footer className="relative mt-16 overflow-hidden bg-secondary/40">
      <div className="brand-rule h-[3px] w-full" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-5 md:py-16">
        <div className="md:col-span-2">
          <div className="flex flex-wrap items-center gap-4">
            <KahataynLockup />
            <span aria-hidden="true" className="h-8 w-px bg-border" />
            <PartnerLockup />
          </div>
          <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">{c.about}</p>
          {hadith && (
            <>
              {/* «هكذا» اسم إشارة إلى حركة يدٍ، فحذفُها يترك اللفظ معلّقاً بلا مشار إليه. */}
              <blockquote className="mt-6 max-w-md border-t border-border pt-5 text-foreground">
                {/* النصّ النبوي يبقى بلفظه العربي، والإنجليزية ترجمةٌ لمعناه تحته. */}
                <p className="font-quran text-lg leading-9 text-balance" lang="ar" dir="rtl">
                  «أنا وكافلُ اليتيمِ في الجنّةِ هكذا» وأشارَ بالسبّابةِ والوسطى وفرَّجَ بينهما
                  شيئاً.
                </p>
                {c.hadithNote && (
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">{c.hadithNote}</p>
                )}
                <cite className="mt-1 block text-xs not-italic text-muted-foreground">
                  {c.hadithNote
                    ? "Sahih al-Bukhari 6005, narrated by Sahl ibn Sa‘d"
                    : "رواه البخاري (6005) عن سهل بن سعد رضي الله عنه"}
                </cite>
              </blockquote>
            </>
          )}
        </div>
        <div>
          <h2 className="text-sm font-bold">{c.platform}</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            <li>
              <Link to="/orphans" className="transition-colors hover:text-foreground">
                {c.orphans}
              </Link>
            </li>
            <li>
              <Link to="/support" className="transition-colors hover:text-foreground">
                {c.support}
              </Link>
            </li>
            <li>
              <Link to="/how-it-works" className="transition-colors hover:text-foreground">
                {c.how}
              </Link>
            </li>
            <li>
              <Link to="/organizations" className="transition-colors hover:text-foreground">
                {c.orgs}
              </Link>
            </li>
            <li>
              <Link to="/traits" className="transition-colors hover:text-foreground">
                {c.traits}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold">{c.account}</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            <li>
              <Link to="/auth" className="transition-colors hover:text-foreground">
                {c.signIn}
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className="transition-colors hover:text-foreground">
                {c.dashboard}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold">{c.transparency}</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            <li>
              <Link to="/legal/privacy" className="transition-colors hover:text-foreground">
                {c.privacy}
              </Link>
            </li>
            <li>
              <Link to="/legal/terms" className="transition-colors hover:text-foreground">
                {c.terms}
              </Link>
            </li>
            <li>
              <Link to="/legal/faq" className="transition-colors hover:text-foreground">
                {c.faq}
              </Link>
            </li>
            <li>
              <Link to="/developers" className="transition-colors hover:text-foreground">
                {c.developers}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="relative border-t border-border/70 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {brand.name} — {c.rights}
      </div>
    </footer>
  );
}
