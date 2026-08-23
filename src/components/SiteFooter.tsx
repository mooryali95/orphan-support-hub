import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/70 bg-secondary/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <h2 className="text-lg font-extrabold">كافل</h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">
            منصة تربط الكافل باليتيم عبر ملفات موثّقة من جهات رعاية معتمدة، مع متابعة شهرية
            وتقارير أثر شفافة.
          </p>
          <p className="mt-4 font-quran text-sm text-primary">
            «أنا وكافلُ اليتيمِ في الجنّةِ هكذا» — رواه البخاري
          </p>
        </div>
        <div>
          <h3 className="text-sm font-bold">المنصة</h3>
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
          <h3 className="text-sm font-bold">الحساب</h3>
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
      </div>
      <div className="border-t border-border/70 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} كافل — جميع الحقوق محفوظة
      </div>
    </footer>
  );
}
