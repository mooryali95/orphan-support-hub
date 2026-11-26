#!/usr/bin/env node
// يولّد src/data/hall-geo.ts لقاعة الأثر من Natural Earth (world-atlas):
//   - LAND: نقاط اليابسة كلّ 1.25° (خطّ عرض/طول × 10، Int16) مرمّزة base64.
//   - SHAPES: حدود دول شبكة الندوة مطبَّعة إلى [-1, 1] حول مركزها، بالآلاف.
//
//   node scripts/gen-hall-geo.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
import { geoArea, geoCentroid, geoContains } from "d3-geo";

const require = createRequire(import.meta.url);
const atlas = (f) => JSON.parse(readFileSync(require.resolve(`world-atlas/${f}`), "utf8"));

// رموز الدول من src/data/wamy-network.ts ← رقم ISO 3166-1 في world-atlas (أو اسمه حيث لا رقم).
const ISO = {
  SA: "682",
  TD: "148",
  NE: "562",
  SD: "729",
  KE: "404",
  DJ: "262",
  SN: "686",
  GN: "324",
  MR: "478",
  EG: "818",
  NG: "566",
  KG: "417",
  TH: "764",
  CM: "120",
  ML: "466",
  ID: "360",
  BD: "050",
  BA: "070",
  BR: "076",
  PS: "275",
  AL: "008",
  MK: "807",
  ET: "231",
  TZ: "834",
  RW: "646",
  CI: "384",
  SO: "706",
  YE: "887",
  PH: "608",
  IQ: "368",
  ZA: "710",
  MY: "458",
  TJ: "762",
  UG: "800",
  LK: "144",
  PK: "586",
  XK: null,
};
const NAME = { XK: ["Kosovo"], PS: ["Palestine"], SO: ["Somaliland"] };

const landTopo = atlas("land-50m.json");
const land = feature(landTopo, landTopo.objects.land);
const dots = [];
const step = 1.25;
for (let lat = -58; lat <= 82; lat += step) {
  const dl = step / Math.max(0.18, Math.cos((lat * Math.PI) / 180));
  for (let lon = -180; lon < 180; lon += dl)
    if (geoContains(land, [lon, lat])) dots.push(Math.round(lat * 10), Math.round(lon * 10));
}

const ct = atlas("countries-50m.json");
const all = feature(ct, ct.objects.countries).features;
const shapes = {};
for (const code of Object.keys(ISO)) {
  const feats = all.filter(
    (f) => (ISO[code] && f.id === ISO[code]) || (NAME[code] ?? []).includes(f.properties.name),
  );
  if (!feats.length) throw new Error(`no shape for ${code}`);
  let polys = [];
  for (const f of feats)
    (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(
      (p) => polys.push(p[0]),
    );
  polys = polys
    .map((r) => ({ r, a: geoArea({ type: "Polygon", coordinates: [r] }) }))
    .sort((a, b) => b.a - a.a);
  const big = polys[0].a;
  polys = polys.filter((p) => p.a > big * 0.004).slice(0, 14);
  const main = feats.find((f) => f.id === ISO[code]) ?? {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [polys[0].r] },
  };
  const [clon, clat] = geoCentroid(main);
  const k = Math.cos((clat * Math.PI) / 180);
  const P = ([lon, lat]) => [(lon - clon) * k, lat - clat];
  let minx = Infinity,
    maxx = -Infinity,
    miny = Infinity,
    maxy = -Infinity;
  for (const { r } of polys)
    for (const pt of r) {
      const [x, y] = P(pt);
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
      miny = Math.min(miny, y);
      maxy = Math.max(maxy, y);
    }
  const cx = (minx + maxx) / 2,
    cy = (miny + maxy) / 2,
    s = Math.max(maxx - minx, maxy - miny) / 2;
  const rings = polys
    .map(({ r }) => {
      const pts = r.map((pt) => {
        const [x, y] = P(pt);
        return [(x - cx) / s, (y - cy) / s];
      });
      const out = [pts[0]];
      for (const p of pts) {
        const q = out[out.length - 1];
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.012) out.push(p);
      }
      return out.flatMap(([x, y]) => [Math.round(x * 1000), Math.round(y * 1000)]);
    })
    .filter((r) => r.length >= 8);
  shapes[code] = {
    lat: +clat.toFixed(2),
    lon: +clon.toFixed(2),
    span: +(s * 2).toFixed(3),
    off: [+(cx / k).toFixed(3), +cy.toFixed(3)],
    rings,
  };
}

const out = `// مولَّد بـ scripts/gen-hall-geo.mjs من Natural Earth (world-atlas 50m) — لا يُعدَّل يدوياً.
/* eslint-disable */
export type HallShape = { lat: number; lon: number; span: number; off: [number, number]; rings: number[][] };
/** نقاط اليابسة: أزواج (خطّ عرض × 10، خطّ طول × 10) Int16 بترتيب little-endian، مرمّزة base64. */
export const LAND_DOTS = "${Buffer.from(new Int16Array(dots).buffer).toString("base64")}";
export const SHAPES: Record<string, HallShape> = ${JSON.stringify(shapes)};
`;
writeFileSync("src/data/hall-geo.ts", out);
console.log(
  `✓ ${dots.length / 2} land dots, ${Object.keys(shapes).length} shapes, ${Math.round(out.length / 1024)}KB`,
);
