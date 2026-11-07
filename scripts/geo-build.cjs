// يبني ملفّات الخارطة في public/geo من Natural Earth (ملكٌ عام، بلا قيود):
//   ne_50m_admin_0_countries.geojson (الدول) و ne_10m_admin_1_states_provinces.geojson (المناطق)
//   من github.com/nvkelso/natural-earth-vector. التشغيل في مجلّدٍ فيه الملفّان و d3-geo
//   و topojson-server/simplify/client:  node geo-build.cjs <المستودع>/public/geo
const fs = require("fs");
const d3 = require("d3-geo");
const { topology } = require("topojson-server");
const { presimplify, simplify, quantile } = require("topojson-simplify");
const { feature } = require("topojson-client");
const OUT = process.argv[2];
const W = 1000,
  H = 520;
const adm0 = JSON.parse(fs.readFileSync("adm0.geojson", "utf8"));
const adm1 = JSON.parse(fs.readFileSync("adm1.geojson", "utf8"));
const countries = adm0.features.filter(
  (f) => f.properties.ISO_A2_EH !== "AQ" && f.properties.ISO_A2_EH !== "-99",
);
const proj = d3.geoNaturalEarth1().fitExtent(
  [
    [4, 4],
    [W - 4, H - 4],
  ],
  { type: "FeatureCollection", features: countries },
);
const r = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
// تهجئاتٌ عربية شائعة لا تحملها Natural Earth — بها تطابق الخارطةُ ملفّاتٍ
// كُتبت منطقتها نصّاً حرّاً قبل أن يصير الإدخال قائمةً (UX-10).
const ALIASES = { "ALB-1498": ["شكودر", "شقودرة"] };

function simplified(features, q) {
  let topo = topology({ f: { type: "FeatureCollection", features } }, 1e5);
  topo = presimplify(topo);
  topo = simplify(topo, quantile(topo, q));
  return feature(topo, topo.objects.f).features;
}
function pathOf(f, dec) {
  const p = d3.geoPath(proj).digits(dec);
  return p(f) || "";
}
function box(f) {
  const [[x0, y0], [x1, y1]] = d3.geoPath(proj).bounds(f);
  return [r(x0, 3), r(y0, 3), r(x1 - x0, 3), r(y1 - y0, 3)];
}

// العالم
const world = simplified(countries, 0.12).map((f) => {
  const code = f.properties.ISO_A2_EH;
  // مركز الوسم: أكبر جزء من الدولة لا مركز المجموع (فرنسا وغويانا مثلاً).
  const geom = f.geometry;
  let main = f;
  if (geom.type === "MultiPolygon") {
    const parts = geom.coordinates.map((c) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: c },
    }));
    main = parts.sort((a, b) => d3.geoArea(b) - d3.geoArea(a))[0];
  }
  const [cx, cy] = proj(d3.geoCentroid(main));
  return {
    c: code,
    n: f.properties.NAME_AR || f.properties.NAME,
    d: pathOf(f, 1),
    b: box(main),
    p: [r(cx, 2), r(cy, 2)],
  };
});
fs.mkdirSync(`${OUT}/admin1`, { recursive: true });
fs.writeFileSync(`${OUT}/world.json`, JSON.stringify({ w: W, h: H, countries: world }));

// المناطق — ملفٌّ لكل دولة يُحمَّل عند الضغط عليها.
const by = new Map();
for (const f of adm1.features) {
  const c = f.properties.iso_a2;
  if (!c || c === "-1" || c === "-99") continue;
  by.set(c, [...(by.get(c) || []), f]);
}
let total = 0;
for (const [code, feats] of by) {
  const list = simplified(feats, feats.length > 30 ? 0.25 : 0.45).map((f) => {
    const p = f.properties;
    const [cx, cy] = proj(d3.geoCentroid(f));
    return {
      id: p.adm1_code,
      n: String(p.name_ar || p.name || p.name_en || p.adm1_code).replace(
        /^(مقاطعة|محافظة|ولاية|منطقة|إقليم|إمارة|مديرية) /,
        "",
      ),
      en: p.name_en || p.name || p.adm1_code,
      alt: [
        p.name,
        p.name_alt,
        p.name_local,
        p.gn_name,
        p.woe_name,
        ...(ALIASES[p.adm1_code] || []),
      ]
        .filter(Boolean)
        .join("|"),
      d: pathOf(f, 3),
      b: box(f),
      p: [r(cx, 3), r(cy, 3)],
    };
  });
  const s = JSON.stringify({ c: code, regions: list });
  total += s.length;
  fs.writeFileSync(`${OUT}/admin1/${code}.json`, s);
}
console.log(
  "world",
  fs.statSync(`${OUT}/world.json`).size,
  "countries",
  world.length,
  "admin1 files",
  by.size,
  "total",
  total,
);
