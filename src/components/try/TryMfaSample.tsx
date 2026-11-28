/**
 * لوحة «المصادقة الثنائية» في «حسابي» التجريبي: حالٌ ثابتة لا تسجّل عاملاً ولا تطلب رمزاً.
 * التجربة بلا حساب مصادقة، فلا جلسة تُوثَّق؛ تعرض الصورة كما يراها صاحب حسابٍ فعّلها.
 */
import { ShieldCheck } from "lucide-react";

import { MFA_COPY } from "@/components/account/MfaSettings";
import { useCopy } from "@/lib/locale";

export function TryMfaSample() {
  const c = useCopy(MFA_COPY);
  return (
    <section
      id="security"
      aria-labelledby="try-mfa-h"
      className="rounded-3xl bg-card p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] sm:p-8"
    >
      <h2 id="try-mfa-h" className="flex items-center gap-2 font-bold">
        <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
        {c.title}
      </h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.intro}</p>
      <p className="mt-3 text-sm leading-7">{c.on}</p>
      <span className="mt-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        {c.badge}
      </span>
    </section>
  );
}
