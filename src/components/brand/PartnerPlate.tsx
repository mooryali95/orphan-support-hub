import { BrandHalo } from "@/components/brand/BrandPattern";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * لوحة الشريك: الشعار كاملاً بألوانه على قرصٍ أبيض، فوق حقلٍ نبيذي تعبره «الهالة». الشعار
 * نفسه ملفّه الثابت لا يُمسّ؛ واللوحة تقول من يقف خلف المنصّة قبل أي كلام.
 */
export function PartnerPlate({ className }: { className?: string }) {
  const p = BRAND.partner;
  return (
    <figure
      className={cn(
        "mural-placeholder relative overflow-hidden rounded-[1.75rem] px-6 py-9 text-center shadow-lift lg:py-14",
        className,
      )}
    >
      <BrandHalo className="-start-[22%] -top-[12%] h-[125%] text-[color:var(--bridge-bright)] opacity-25" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-2.5 rounded-[1.25rem] border"
        style={{ borderColor: "color-mix(in oklch, var(--bridge-bright) 38%, transparent)" }}
      />
      <span className="relative mx-auto grid size-32 place-items-center rounded-full bg-white shadow-[0_18px_40px_-18px_rgb(0_0_0/0.55)] lg:size-44">
        <img
          src="/brand/partner-mark.svg"
          alt=""
          width={110}
          height={121}
          decoding="async"
          className="h-[66%] w-auto"
        />
      </span>
      <figcaption className="relative mt-6 text-white">
        <span className="block text-xs text-white/75">{p.with}</span>
        <span className="mt-1 block font-display text-2xl font-bold">{p.name}</span>
      </figcaption>
    </figure>
  );
}
