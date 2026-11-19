import { createFileRoute } from "@tanstack/react-router";

import { pageTitle } from "@/config/brand";

// المكوّن وتنسيقه في hall.lazy.tsx: يُحمَّلان عند فتح القاعة وحدها، فلا يثقلان بقية الصفحات.
type HallSearch = { try?: 1; child?: string; cadence?: "monthly" | "one_time" };

/**
 * قاعة الأثر — رحلة الداعم ثلاثية الأبعاد: القاعة، ثم خريطة العالم، ثم الدولة،
 * ثم الدعم والأثر بمستوياته، ثم خلاصة أثر الداعم وطريقه إلى «أثري». المشهد يُحمَّل كسولاً عند فتح
 * الصفحة فقط (three.js والمعالجة السينمائية)، فلا يثقل بقية المنصّة.
 */
export const Route = createFileRoute("/hall")({
  validateSearch: (raw: Record<string, unknown>): HallSearch => ({
    ...(raw["try"] === 1 || raw["try"] === "1" ? { try: 1 as const } : {}),
    ...(typeof raw["child"] === "string" ? { child: raw["child"] } : {}),
    ...(raw["cadence"] === "one_time" || raw["cadence"] === "monthly"
      ? { cadence: raw["cadence"] }
      : {}),
  }),
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
