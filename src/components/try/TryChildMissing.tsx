import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/try/TryChildMissing", {
  ar: {
    title: "هذا الطفل ليس في التجربة",
    text: "الرابط لا يطابق أحد أطفال التجربة. اختر واحداً من القائمة.",
    choose: "اختر طفلاً من التجربة",
  },
  en: {
    title: "This child is not in the trial",
    text: "The link does not match any of the trial's fictional children. Choose one from the list.",
    choose: "Choose a trial child",
  },
});

/** رابطٌ لطفلٍ ليس في التجربة: يبقى الزائر داخل الوضع التجريبي ويختار غيره. */
export function TryChildMissing() {
  const c = useCopy(COPY);
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
      <h1 className="font-sans text-xl font-bold">{c.title}</h1>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.text}</p>
      <Button asChild className="mt-4">
        <Link to="/try">{c.choose}</Link>
      </Button>
    </div>
  );
}
