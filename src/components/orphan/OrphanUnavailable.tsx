import { Link } from "@tanstack/react-router";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/orphan/OrphanUnavailable", {
  ar: {
    title: "ملف غير متاح",
    text: "هذا الملف غير معروض الآن: قد تكون كفالته اكتملت، أو سُحب من العرض، أو أنّ الرابط غير صحيح.",
    browse: "تصفّح دليل الأيتام",
    home: "الصفحة الرئيسية",
  },
  en: {
    title: "File unavailable",
    text: "This file is not on show right now: its sponsorship may be complete, it may have been withdrawn, or the link is wrong.",
    browse: "Browse the directory",
    home: "Home page",
  },
});

/** الملف غير متاح (اكتملت كفالته، أو سُحب، أو الرابط خاطئ): يُقال ذلك، ومعه طريقٌ إلى غيره. */
export function OrphanUnavailable() {
  const c = useCopy(COPY);
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-3xl leading-[1.4] font-bold">{c.title}</h1>
        <p className="mt-3 leading-8 text-muted-foreground">{c.text}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/orphans">{c.browse}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">{c.home}</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
