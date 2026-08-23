import { Link } from "@tanstack/react-router";
import { IocoLockup } from "@/components/brand/IocoMark";
import { BrandPattern } from "@/components/brand/BrandPattern";

export function SiteFooter() {
  return (
    <footer className="relative mt-20 overflow-hidden bg-secondary/40">
      <div className="brand-rule h-[3px] w-full" aria-hidden="true" />
      <BrandPattern density="watermark" className="text-gold-line" opacity={0.1} tile={84} />
      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-5">
        <div className="md:col-span-2">
          <IocoLockup />
          <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
            منصة تربط الكافل باليتيم عبر ملفات موثّقة من جهات رعاية معتمدة، مع متابعة شهرية وتقارير
            أثر شفافة.
          </p>
          <p className="mt-4 font-quran text-sm text-shore-need">
            «أنا وكافلُ اليتيمِ في الجنّةِ هكذا» — رواه البخاري
          </p>
        </div>
        <div>
          <h2 className="text-sm font-bold">المنصة</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/orphans" className="hover:text-foreground">
                دليل الأيتام
              </Link>
            </li>
            <li>
              <Link to="/how-it-works" className="hover:text-foreground">
                كيف تعمل الكفالة
              </Link>
            </li>
            <li>
              <Link to="/organizations" className="hover:text-foreground">
                جهات الرعاية
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold">الحساب</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/auth" className="hover:text-foreground">
                تسجيل الدخول
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className="hover:text-foreground">
                لوحتي
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold">الشفافية</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/legal/privacy" className="hover:text-foreground">
                سياسة الخصوصية
              </Link>
            </li>
            <li>
              <Link to="/legal/terms" className="hover:text-foreground">
                شروط الاستخدام
              </Link>
            </li>
            <li>
              <Link to="/legal/faq" className="hover:text-foreground">
                الأسئلة الشائعة
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="relative border-t border-border/70 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} IOCO — جميع الحقوق محفوظة
      </div>
    </footer>
  );
}
