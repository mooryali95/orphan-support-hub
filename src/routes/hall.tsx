import { createFileRoute } from "@tanstack/react-router";

import { pageTitle } from "@/config/brand";
import { parseHallSearch } from "@/lib/hall/source";

// المكوّن وتنسيقه في hall.lazy.tsx: يُحمَّلان عند فتح القاعة وحدها، فلا يثقلان بقية الصفحات.

/**
 * قاعة الأثر — رحلة الداعم ثلاثية الأبعاد: القاعة، ثم خريطة العالم، ثم الدولة،
 * ثم الدعم والأثر بمستوياته، ثم خلاصة أثر الداعم وطريقه إلى «أثري». المشهد يُحمَّل كسولاً عند فتح
 * الصفحة فقط (three.js والمعالجة السينمائية)، فلا يثقل بقية المنصّة.
 */
export const Route = createFileRoute("/hall")({
  validateSearch: parseHallSearch,
  head: ({ match }) => ({
    meta: [
      { title: pageTitle("قاعة الأثر", false, match.context.locale ?? "ar") },
      {
        name: "description",
        content:
          "رحلة الداعم ثلاثية الأبعاد في شبكة الندوة: اختر دولة، وادعمها، وشاهد أثر دعمك على البلد والمنطقة والمجموعة والطفل.",
      },
    ],
  }),
});
