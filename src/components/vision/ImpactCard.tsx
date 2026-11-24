/**
 * «بطاقة أثري» للداعم: لوحةٌ بهوية الشريك تُرسم على canvas فتُحفظ صورةً أو
 * تُشارك — أرقامٌ مجمّعة فقط، بلا اسم طفلٍ ولا مكانه.
 */
import { Download, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useMoney } from "@/components/vision/VisionStore";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/vision/ImpactCard", {
  ar: {
    h: "بطاقة أثري",
    lead: "صورةٌ بأرقامك وحدها — لا اسم طفلٍ ولا مكان. احفظها أو شاركها.",
    save: "حفظ الصورة",
    share: "مشاركة",
    title: "أثري في منصّة الرؤية والتوجهات",
    given: "ما قدّمت",
    groups: "مجموعات وصلها دعمي",
    children: "أطفالٌ يصلهم أثري",
    measured: "قياساتٌ اكتملت",
    tag: "رعايةٌ تبني الأهليّة",
    sandbox: "بيئة تجريبية",
  },
  en: {
    h: "My impact card",
    lead: "An image with your figures only — no child's name or place. Save or share it.",
    save: "Save image",
    share: "Share",
    title: "My impact on the Vision and Directions platform",
    given: "Given",
    groups: "Groups my support reached",
    children: "Children my impact reaches",
    measured: "Measurements completed",
    tag: "Care that builds capability",
    sandbox: "Sandbox",
  },
});

const W = 1080;
const H = 1080;

export function ImpactCard({
  name,
  given,
  groups,
  children,
  measured,
}: {
  name: string;
  given: number;
  groups: number;
  children: number;
  measured: number;
}) {
  const c = useCopy(COPY);
  const money = useMoney();
  const locale = useLocale();
  const ref = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare("share" in navigator), []);
  const rtl = locale === "ar";

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let alive = true;
    const css = getComputedStyle(cv);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const wine = v("--wine");
    const deep = v("--wine-deep");
    const gold = v("--gold");
    const soft = v("--gold-soft");
    const ivory = v("--ivory");
    const sans = css.fontFamily || "sans-serif";

    void document.fonts.ready.then(() => {
      if (!alive) return;
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, wine);
      g.addColorStop(1, deep);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // هالة ذهبية
      const r = ctx.createRadialGradient(W * 0.8, 0, 0, W * 0.8, 0, W * 0.8);
      r.addColorStop(0, "rgba(201,161,96,0.28)");
      r.addColorStop(1, "rgba(201,161,96,0)");
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, W, H);
      // إطار
      ctx.strokeStyle = gold;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 3;
      ctx.strokeRect(48, 48, W - 96, H - 96);
      ctx.globalAlpha = 1;

      ctx.direction = rtl ? "rtl" : "ltr";
      ctx.textAlign = "center";
      // الختم
      ctx.fillStyle = ivory;
      ctx.beginPath();
      ctx.arc(W / 2, 190, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = wine;
      ctx.font = `64px Amiri, serif`;
      ctx.fillText("هـ", W / 2, 212);

      ctx.fillStyle = soft;
      ctx.font = `600 34px ${sans}`;
      ctx.fillText(c.title, W / 2, 320);
      ctx.fillStyle = ivory;
      ctx.font = `800 64px ${sans}`;
      ctx.fillText(name, W / 2, 410);

      const cells: Array<[string, string]> = [
        [money(given), c.given],
        [String(groups), c.groups],
        [String(children), c.children],
        [String(measured), c.measured],
      ];
      cells.forEach(([val, label], i) => {
        const col = rtl ? 1 - (i % 2) : i % 2;
        const x = W / 2 + (col === 0 ? -230 : 230);
        const y = 560 + Math.floor(i / 2) * 210;
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.roundRect(x - 200, y - 110, 400, 180, 28);
        ctx.fill();
        ctx.fillStyle = gold;
        ctx.font = `76px Amiri, serif`;
        ctx.fillText(val, x, y);
        ctx.fillStyle = "rgba(248,242,233,0.75)";
        ctx.font = `500 28px ${sans}`;
        ctx.fillText(label, x, y + 46);
      });

      ctx.fillStyle = gold;
      ctx.font = `44px Amiri, serif`;
      ctx.fillText(c.tag, W / 2, 1000 - 40);
      ctx.fillStyle = "rgba(248,242,233,0.5)";
      ctx.font = `500 22px ${sans}`;
      ctx.fillText(c.sandbox, W / 2, 1000);
      setUrl(cv.toDataURL("image/png"));
    });
    return () => {
      alive = false;
    };
  }, [name, given, groups, children, measured, rtl, c, money]);

  const share = async () => {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "impact.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] }))
        await navigator.share({ files: [file], title: c.title });
    } catch {
      /* أُلغيت */
    }
  };

  return (
    <section
      aria-labelledby="impact-h"
      className="grid items-center gap-6 rounded-3xl border border-gold/40 bg-white p-5 md:grid-cols-[18rem_1fr]"
    >
      <canvas
        ref={ref}
        width={W}
        height={H}
        role="img"
        aria-label={c.title}
        className="aspect-square w-full rounded-2xl shadow-[0_18px_40px_-20px_rgb(43_11_20/0.6)]"
      />
      <div>
        <h2 id="impact-h" className="text-xl font-extrabold text-wine">
          {c.h}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.lead}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={url || undefined}
            download="impact.png"
            aria-disabled={!url}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-wine px-5 font-semibold text-ivory active:scale-[0.97]"
          >
            <Download className="size-4" aria-hidden="true" />
            {c.save}
          </a>
          {canShare && (
            <button
              type="button"
              onClick={() => void share()}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-wine/20 px-5 font-semibold text-wine active:scale-[0.97]"
            >
              <Share2 className="size-4" aria-hidden="true" />
              {c.share}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
