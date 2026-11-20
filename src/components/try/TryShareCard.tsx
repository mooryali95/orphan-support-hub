import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import { PartnerMark } from "@/components/brand/PartnerMark";
import { Button } from "@/components/ui/button";
import { brandFor } from "@/config/brand";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/try/TryShareCard", {
  ar: {
    shareText: (brand: string) =>
      `جرّبتُ رحلة كفالة اليتيم في ${brand}: تختار طفلاً، وترى أثر عطائك يتشكّل أمامك. جرّبها بلا حساب.`,
    title: "ادعُ غيرك إلى الخير",
    lead: "«الدالّ على الخير كفاعله». بطاقةٌ بلا اسم الطفل ولا صورته.",
    cardLabel: "بطاقة الأثر",
    line1: "يدٌ امتدّت،",
    line2: "فلم يبقَ يتيمٌ ينتظر وحده",
    dedication: "صدقةٌ جارية عن",
    partnerWith: "بالشراكة مع",
    note: "في التجربة تُشارك دعوةً إلى تجربة الرحلة. وبعد كفالتك الحقيقية تصير البطاقة شاهداً على أثرك أنت.",
    copied: "نُسخت الدعوة",
    shared: "شُوركت",
    share: "شارك الدعوة",
    copiedLive: "نُسخ نصّ الدعوة ورابطها",
  },
  en: {
    shareText: (brand: string) =>
      `I tried the orphan sponsorship journey on ${brand}: you choose a child and watch your giving take shape. Try it, no account needed.`,
    title: "Invite others to do good",
    lead: "“Whoever guides to good is like the one who does it.” A card without the child's name or photo.",
    cardLabel: "Impact card",
    line1: "A hand reached out,",
    line2: "and no orphan waits alone",
    dedication: "Ongoing charity on behalf of",
    partnerWith: "in partnership with",
    note: "In the trial, you share an invitation to try the journey. After a real sponsorship, the card becomes a record of your own impact.",
    copied: "Invitation copied",
    shared: "Shared",
    share: "Share the invitation",
    copiedLive: "The invitation text and link were copied",
  },
});

/**
 * بطاقة الأثر للمشاركة. لا تحمل اسم الطفل ولا صورته ولا مكانه. وفي وضع التجربة تدعو إلى
 * تجربة الرحلة، فلا تدّعي كفالةً لم تقع.
 */
export function TryShareCard({ dedication }: { dedication?: string }) {
  const [done, setDone] = useState<"shared" | "copied" | null>(null);
  const locale = useLocale();
  const c = useCopy(COPY);
  const brand = brandFor(locale);
  const partner = locale === "ar" ? brand.partner.name : brand.partner.nameLatin;
  const text = c.shareText(brand.name);

  async function share() {
    const url = `${window.location.origin}/try`;
    try {
      if (navigator.share) {
        await navigator.share({ title: brand.name, text, url });
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
        {c.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{c.lead}</p>
      <div className="mt-4 grid items-center gap-5 md:grid-cols-[minmax(0,22rem)_1fr]">
        <figure
          className="mural-placeholder relative overflow-hidden rounded-3xl p-6 text-center shadow-lift"
          aria-label={c.cardLabel}
        >
          <PartnerMark className="mx-auto h-14" />
          <p className="mt-4 font-display text-2xl font-bold leading-snug text-white">
            {c.line1}
            <br />
            {c.line2}
          </p>
          {dedication && (
            <p className="mt-3 text-sm text-white/85">
              {c.dedication} <b>{dedication}</b>
            </p>
          )}
          <p
            className="mt-5 border-t pt-3 text-xs text-white/80"
            style={{ borderColor: "color-mix(in oklch, var(--bridge-bright) 45%, transparent)" }}
          >
            {brand.name} · {c.partnerWith} {partner}
          </p>
        </figure>
        <div>
          <p className="max-w-md text-sm leading-7 text-muted-foreground">{c.note}</p>
          <Button size="lg" className="mt-4" onClick={() => void share()}>
            {done ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Share2 className="size-4" aria-hidden="true" />
            )}
            {done === "copied" ? c.copied : done === "shared" ? c.shared : c.share}
          </Button>
          <p aria-live="polite" className="sr-only">
            {done === "copied" ? c.copiedLive : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
