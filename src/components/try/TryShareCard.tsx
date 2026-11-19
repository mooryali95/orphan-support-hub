import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import { PartnerMark } from "@/components/brand/PartnerMark";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";

/**
 * بطاقة الأثر للمشاركة. لا تحمل اسم الطفل ولا صورته ولا مكانه. وفي وضع التجربة تدعو إلى
 * تجربة الرحلة، فلا تدّعي كفالةً لم تقع.
 */
export function TryShareCard({ dedication }: { dedication?: string }) {
  const [done, setDone] = useState<"shared" | "copied" | null>(null);
  const text = `جرّبتُ رحلة كفالة اليتيم في ${BRAND.name}: تختار طفلاً، وترى أثر عطائك يتشكّل أمامك. جرّبها بلا حساب.`;

  async function share() {
    const url = `${window.location.origin}/try`;
    try {
      if (navigator.share) {
        await navigator.share({ title: BRAND.name, text, url });
        setDone("shared");
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setDone("copied");
    } catch {
      /* the visitor closed the share sheet, or the clipboard is blocked: nothing to report */
    }
  }

  return (
    <section aria-labelledby="share-card" className="mt-10">
      <h2 id="share-card" className="text-xl font-bold">
        ادعُ غيرك إلى الخير
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        «الدالّ على الخير كفاعله». بطاقةٌ بلا اسم الطفل ولا صورته.
      </p>
      <div className="mt-4 grid items-center gap-5 md:grid-cols-[minmax(0,22rem)_1fr]">
        <figure
          className="mural-placeholder relative overflow-hidden rounded-3xl p-6 text-center shadow-lift"
          aria-label="بطاقة الأثر"
        >
          <PartnerMark className="mx-auto h-14" />
          <p className="mt-4 font-display text-2xl font-bold leading-snug text-white">
            يدٌ امتدّت،
            <br />
            فلم يبقَ يتيمٌ ينتظر وحده
          </p>
          {dedication && (
            <p className="mt-3 text-sm text-white/85">
              صدقةٌ جارية عن <b>{dedication}</b>
            </p>
          )}
          <p
            className="mt-5 border-t pt-3 text-xs text-white/80"
            style={{ borderColor: "color-mix(in oklch, var(--bridge-bright) 45%, transparent)" }}
          >
            {BRAND.name} · {BRAND.partner.with} {BRAND.partner.name}
          </p>
        </figure>
        <div>
          <p className="max-w-md text-sm leading-7 text-muted-foreground">
            في التجربة تُشارك دعوةً إلى تجربة الرحلة. وبعد كفالتك الحقيقية تصير البطاقة شاهداً على
            أثرك أنت.
          </p>
          <Button size="lg" className="mt-4" onClick={() => void share()}>
            {done ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Share2 className="size-4" aria-hidden="true" />
            )}
            {done === "copied" ? "نُسخت الدعوة" : done === "shared" ? "شُوركت" : "شارك الدعوة"}
          </Button>
          <p aria-live="polite" className="sr-only">
            {done === "copied" ? "نُسخ نصّ الدعوة ورابطها" : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
