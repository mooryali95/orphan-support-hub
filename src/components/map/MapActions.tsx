import { Link } from "@tanstack/react-router";
import { ArrowLeft, HeartHandshake } from "lucide-react";

import { AuthDialog } from "@/components/auth/AuthDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { defineCopy, useCopy } from "@/lib/locale";
import type { MapActionContext } from "./WorldMap";

const COPY = defineCopy("components/map/MapActions", {
  ar: {
    region: "هذه المنطقة",
    country: "هذه الدولة",
    browse: "تصفّح من ينتظر هنا",
    support: (p: string) => `ادعم ${p}`,
    signInTo: (p: string) => `ادخل لتدعم ${p}`,
  },
  en: {
    region: "this region",
    country: "this country",
    browse: "Browse who is waiting here",
    support: (p: string) => `Support ${p}`,
    signInTo: (p: string) => `Sign in to support ${p}`,
  },
});

/**
 * ما يفعله الزائر من بطاقة الدولة أو المنطقة: يتصفّح من ينتظر، ويدعم
 * المكان نفسه. ومن لم يدخل بعد يدخل في نافذةٍ فوق الخارطة، ثم يكمل.
 */
export function MapActions({ ctx }: { ctx: MapActionContext }) {
  const { user } = useAuth();
  const c = useCopy(COPY);
  const country = ctx.countryValue ?? ctx.code;
  const place = ctx.regionName ? c.region : c.country;
  const supportSearch = {
    c: ctx.code,
    ...(ctx.regionValue ? { r: ctx.regionValue } : {}),
  };

  return (
    <div className="grid gap-2">
      <Button asChild size="lg" className="w-full">
        <Link
          to="/orphans"
          search={{
            // قيم القاعدة نفسها — فالدليل يجد ما وجدته الخارطة.
            country,
            ...(ctx.regionValue ? { region: ctx.regionValue } : {}),
            funding: "open",
          }}
        >
          {c.browse}
          <ArrowLeft className="ltr:-scale-x-100" aria-hidden="true" />
        </Link>
      </Button>
      {user ? (
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/support" search={supportSearch}>
            <HeartHandshake aria-hidden="true" />
            {c.support(place)}
          </Link>
        </Button>
      ) : (
        <AuthDialog
          title={c.signInTo(place)}
          trigger={(open) => (
            <Button size="lg" variant="outline" className="w-full" onClick={open}>
              <HeartHandshake aria-hidden="true" />
              {c.support(place)}
            </Button>
          )}
        />
      )}
    </div>
  );
}
