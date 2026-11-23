import { createFileRoute } from "@tanstack/react-router";

import { pageTitle } from "@/config/brand";
import { parseHallSearch } from "@/lib/hall/source";
import { copyOf, defineCopy } from "@/lib/locale";

const COPY = defineCopy("routes/hall", {
  ar: {
    title: "قاعة الأثر",
    description:
      "رحلة الداعم ثلاثية الأبعاد في شبكة الندوة: اختر دولة، وادعمها، وشاهد أثر دعمك على البلد والمنطقة والمجموعة والطفل.",
  },
  en: {
    title: "Impact Hall",
    description:
      "The supporter's journey in 3D across the WAMY network: choose a country, support it, and see what your support does for the country, the region, the group and the child.",
  },
});

// المكوّن وتنسيقه في hall.lazy.tsx: يُحمَّلان عند فتح القاعة وحدها، فلا يثقلان بقية الصفحات.

/**
 * قاعة الأثر — رحلة الداعم ثلاثية الأبعاد: القاعة، ثم خريطة العالم، ثم الدولة،
 * ثم الدعم والأثر بمستوياته، ثم خلاصة أثر الداعم وطريقه إلى «أثري». المشهد يُحمَّل كسولاً عند فتح
 * الصفحة فقط (three.js والمعالجة السينمائية)، فلا يثقل بقية المنصّة.
 */
export const Route = createFileRoute("/hall")({
  validateSearch: parseHallSearch,
  head: ({ match }) => {
    const locale = match.context.locale ?? "ar";
    const c = copyOf(COPY, locale);
    return {
      meta: [
        { title: pageTitle(c.title, false, locale) },
        { name: "description", content: c.description },
      ],
    };
  },
});
