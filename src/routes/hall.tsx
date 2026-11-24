import { createFileRoute } from "@tanstack/react-router";

// the hall's own stylesheet as a link of this route's head: it arrives with the document, so the
// gate is painted styled on the first frame instead of waiting for the lazy chunk to bring it
import hallCss from "@/components/hall/hall.css?url";
import { pageTitle } from "@/config/brand";
import { warmHall } from "@/lib/hall/preload";
import { parseHallSearch } from "@/lib/hall/source";
import { copyOf, defineCopy } from "@/lib/locale";

const COPY = defineCopy("routes/hall", {
  ar: {
    title: "قاعة الأثر",
    description:
      "قاعة الأثر ثلاثية الأبعاد: اختر دولةً من شبكة الندوة، وشاهد أثر عطائك على البلد والمنطقة والمجموعة والطفل.",
  },
  en: {
    title: "Impact Hall",
    description:
      "The supporter's journey in 3D across the WAMY network: choose a country, support it, and see what your support does for the country, the region, the group and the child.",
  },
});

// المكوّن في hall.lazy.tsx: يُحمَّل عند فتح القاعة وحدها، فلا يثقل بقية الصفحات. تنسيق القاعة
// رابطٌ في رأس هذا المسار وحده (لا يدخل حزمة الدخول)، فيصل مع المستند ويزول عند مغادرتها.

/**
 * قاعة الأثر — رحلة الداعم ثلاثية الأبعاد: القاعة، ثم خريطة العالم، ثم الدولة،
 * ثم الدعم والأثر بمستوياته، ثم خلاصة أثر الداعم وطريقه إلى «أثري». المشهد يُحمَّل كسولاً عند فتح
 * الصفحة فقط (three.js والمعالجة السينمائية)، فلا يثقل بقية المنصّة.
 */
/* a hard load of /hall: the scene chunk is asked for the moment the entry bundle runs, alongside
   the lazy page chunk, instead of after that chunk has loaded, hydrated and run its effect */
if (typeof window !== "undefined" && window.location.pathname === "/hall") {
  warmHall(
    parseHallSearch(Object.fromEntries(new URLSearchParams(window.location.search).entries())),
  );
}

export const Route = createFileRoute("/hall")({
  validateSearch: parseHallSearch,
  /* every way in (a link's hover, touch or focus preloads the route; a click navigates to it)
     passes here first: the heavy chunks start downloading before the page mounts */
  beforeLoad: ({ search }) => warmHall(search),
  head: ({ match }) => {
    const locale = match.context.locale ?? "ar";
    const c = copyOf(COPY, locale);
    return {
      meta: [
        { title: pageTitle(c.title, false, locale) },
        { name: "description", content: c.description },
        { property: "og:title", content: pageTitle(c.title, false, locale) },
        { property: "og:description", content: c.description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "stylesheet", href: hallCss }],
    };
  },
});
