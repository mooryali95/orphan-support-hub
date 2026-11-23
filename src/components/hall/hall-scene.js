// قاعة الأثر — المشهد ثلاثي الأبعاد (three.js) وطبقة الواجهة فوقه.
// المنطق والبيانات في `@/lib/hall/model` (مختبَر)؛ هنا العرض والحركة فقط.
// طريقان منفصلان بمفتاح `demo`: القاعة الحيّة تقرأ `model` وجسر المحرّك وأعداد الدليل، ونصوصها
// وعملتها وأسماء عيّنتها من `@/lib/hall/live` (تُمرَّر في `text`) بلغة الواجهة؛ وقاعة
// التجربة لا تقرأ منها رقماً ولا نصّاً: نموذجها ونصوصها وكتابتها كلّها من `@/lib/hall/trial`
// (كتالوج التجربة الواحد)، تُمرَّر في `demo`. كلّ ما يخصّ التجربة هنا اسمه يبدأ بـ`trial`.
// يُحمَّل كسولاً من `src/routes/hall.tsx` فلا يثقل بقية الصفحات.
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import CameraControls from "camera-controls";
import gsap from "gsap";
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  NoiseEffect,
  ChromaticAberrationEffect,
  SMAAEffect,
  HueSaturationEffect,
  BrightnessContrastEffect,
  ToneMappingEffect,
  ToneMappingMode,
  DepthOfFieldEffect,
  BlendFunction,
  ShaderPass,
  CopyMaterial,
} from "postprocessing";
import { N8AOPostPass } from "n8ao";

import { LAND_DOTS } from "@/data/hall-geo";
import {
  COUNTRIES,
  byCode,
  fnv,
  fitScale,
  regionsFor,
  gapOf,
  TRACKS,
  AMOUNTS,
  AMOUNT_PRESETS,
  countryFigures,
  totals as totalsOf,
  pace as paceOf,
  project as projectOf,
  apply as applyTo,
} from "@/lib/hall/model";
import {
  albaniaRegions,
  levelFacts,
  loadEngine,
  payEngine,
  saveEngine,
  SYNC_EVENT,
} from "@/lib/hall/engine-bridge";
import { hallDirectory } from "@/lib/hall/source";
import { rankPriorities } from "@/lib/office-gap";
import { buildArchitecture } from "./architecture.js";
import { createEmblem } from "./mark3d.js";
import { createSound } from "./sound.js";

const DISPLAY = "Amiri",
  BODY = "Readex Pro";

export function mountHall(
  root,
  {
    brand,
    i18n,
    linked = [],
    demo = null,
    live = null,
    text: liveKit = null, // `text` is the canvas writer below
    start = null,
    mine = null,
    mark = null,
    onStage = null,
    onBack = null,
  },
) {
  const $ = (s, r = root) => r.querySelector(s);
  /* the interface language: the hall's own strings, its direction, the platform's numerals and
     the one country name the pages use (`@/lib/hall/copy`). The scene writes no word of its own. */
  const HC = i18n.copy,
    DIR = i18n.dir,
    LTR = DIR === "ltr";
  const fmt = i18n.count;
  /* the trial's copy, in the interface language (null in the live hall) */
  const T = demo?.copy ?? null;
  const TRIAL_KINDS = demo?.kinds ?? [];
  const num = (n) => `<span class="num">${fmt(n)}</span>`;
  /* the live hall's own copy and sample names, in the interface language (`@/lib/hall/live`);
     null in the trial and in the donor's hall, which never reach the live panels. Everything
     the live hall shows beyond the network and the directory's counts is sample data: each
     panel of it carries the SAMPLE chip, and money is written in the hall's one currency. */
  const LX = demo || mine ? null : liveKit,
    X = LX?.copy ?? null;
  const SAMPLE = X ? `<span class="src">${X.sample}</span>` : "";
  const ARROW = LTR ? "→" : "←";
  const cash = (n) => `<span class="num">${LX.money(n)}</span>`;
  /** a counted phrase: the number picks the plural form, and `{1}` is the figure as written */
  const many = (phrase, n, ...rest) => phrase(n, num(n), ...rest);
  const manyT = (phrase, n, ...rest) => phrase(n, fmt(n), ...rest); // plain text (canvas, hints)
  /** sample regions take their name in the interface language; the model holds both */
  const named = (regions) => {
    if (LX) regions.forEach((r) => (r.ar = LX.regionName(r)));
    return regions;
  };
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PHONE = () => innerWidth <= 760;
  // the light tier: a phone-width screen, few cores, little memory (deviceMemory is Chromium-only,
  // so its absence decides nothing), or a visitor who asked the browser to save data
  const LOW =
    matchMedia("(max-width: 760px)").matches ||
    // a phone held sideways is still a phone: the tier follows the device, not its rotation
    (matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 760) ||
    (navigator.hardwareConcurrency || 8) < 4 ||
    (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4) ||
    navigator.connection?.saveData === true;
  const listeners = [];
  const on = (target, type, fn, opts) => {
    if (!target) return;
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  };
  let disposed = false,
    raf = 0;
  if (RM) gsap.globalTimeline.timeScale(20);
  if (window.__HALL_TEST) gsap.ticker.lagSmoothing(0); // automated runs in a software renderer

  /* ── Colour grade: the partner mark's world — wine, white, and champagne only as a thin line.
     Wine is the hero surface, ivory/white draws the forms (as the mark's ring and hand do),
     champagne is satin metal trim and the "qualified" data colour; lamps are warm white, not amber. ── */
  const G = {
    night: 0x14060b,
    lacquer: 0x4a1220,
    wine: 0x6b1f30,
    champagne: 0xcdae76,
    ivory: 0xf3ebe0,
  };

  /* ── State: the network view, the chosen country and its regions ── */
  const VIEW = { all: false, layer: "network" };
  /* the site map's "needs an office" layer, and operating platforms that are really linked */
  const PRI = new Map(rankPriorities().map((p) => [p.code, p]));
  /* confirmed sites other than the HQ: counted from the network the hall draws, never typed */
  const SITES = COUNTRIES.filter((c) => c.st !== "unconfirmed").length - 1;
  const LINKED = new Set();
  Promise.resolve(linked)
    .then((codes) => {
      (codes || []).forEach((c) => LINKED.add(c));
      if (S.stage === "world") renderWorld();
    })
    .catch(() => {});
  /* ── the donor's own hall (`mine`): their real sponsorships as their dashboard reads them
     (`@/lib/hall/donor`). It shows the hall floor and the world only: their countries lit on the
     globe and one panel of their own figures. Nothing simulated is reachable in it (no country
     model, no support sheet, no film), so a real figure never stands beside a sample one. ── */
  const donor = !!mine && !demo;
  const D = HC.donor;
  /** undefined while loading, null when it could not be read, else the donor's hall */
  let MINE;
  const mineCodes = new Set();
  const mineAt = (code) => MINE?.countries.find((c) => c.code === code) ?? null;
  if (donor)
    Promise.resolve(mine.data)
      .catch(() => null)
      .then((data) => {
        if (disposed) return;
        MINE = data ?? null;
        (MINE?.countries ?? []).forEach((c) => mineCodes.add(c.code));
        markLand();
        refreshLabels();
        drawImpactScreen();
        if (S.stage === "world") donorFocus(true);
      });
  /* the real directory, by country: aggregate counts only (small cohorts stay hidden there) */
  const LIVE = new Map();
  Promise.resolve(live)
    .then((rows) => {
      (rows || []).forEach((r) => r.code && LIVE.set(r.code, r));
      if (S.stage === "country" && !demo) renderCountry();
    })
    .catch(() => {});
  // the trial shows and enters every country the hall draws, confirmed presence or not
  const shown = (c) =>
    !!demo ||
    VIEW.all ||
    c.st !== "unconfirmed" ||
    mineCodes.has(c.code) ||
    (VIEW.layer === "gap" && PRI.has(c.code));
  let CO = byCode("AL");
  let PICKED = false; // nothing chosen until the visitor picks a country on the globe
  const CITY_CACHE = {};
  let CITIES = [];
  const S = {
    stage: "gate",
    track: "qualify",
    amount: demo ? demo.amounts.initial : AMOUNTS.initial,
    // the trial: the kind of giving as the platform names it, and the currency the pledge is typed in
    kind: "qualification",
    currency: null,
    city: "tirana",
    history: [],
    last: null,
    before: null,
  };
  /* the fourth dimension: months from today (negative = the past, positive = today's pace onward) */
  const TIME = { m: 0, shown: 0, snap: null, play: null };
  const store = (() => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  })();
  let ENGINE = loadEngine(store);
  // the vision engine holds Albania for the live hall only; the trial reads its own catalogue
  const isEngine = () => !demo && CO.code === "AL";
  /* ── the trial model: read from the visitor's two stores through `demo`, never kept here ── */
  if (demo) demo.use(COUNTRIES.map((c) => c.code));
  let TRIAL = demo ? demo.model(0) : null;
  let TRIAL_MUTE = false; // the hall's own write is already being carried in
  const trialCo = (code = CO.code) => TRIAL?.countries[code] ?? null;
  const coName = (c = CO) => i18n.countryName(c.code);
  /** the trial's regions of a country, each with where its column stands: the one thing the
      trial takes from the hall's own model, and it is geometry, not a figure */
  function trialColumns(co) {
    const at = regionsFor(co);
    return (trialCo(co.code)?.regions ?? []).map((r) => {
      const g = at.find((x) => x.id === r.id);
      return { ...r, nx: g?.nx ?? 0, ny: g?.ny ?? 0 };
    });
  }
  /** re-reads the trial model and carries it into the region objects the columns stand on */
  function trialSync(ahead = Math.round(TIME.m), draft = null) {
    TRIAL = demo.model(ahead, draft);
    for (const [code, list] of Object.entries(CITY_CACHE)) {
      const fresh = TRIAL.countries[code]?.regions ?? [];
      list.forEach((r) =>
        Object.assign(
          r,
          fresh.find((x) => x.id === r.id),
        ),
      );
    }
  }
  function initCities() {
    if (demo) {
      const t = trialCo();
      if (!t) return; // outside the trial's countries the hall has no figures to stand on
      if (!CITY_CACHE[CO.code]) CITY_CACHE[CO.code] = trialColumns(CO);
      CITIES = CITY_CACHE[CO.code];
      S.city = CITIES[0].id; // the region the trial child and group stand in
      S.currency = t.currencies[0]; // each country opens on its own currency, as the support map does
      return;
    }
    if (isEngine()) {
      ENGINE = loadEngine(store);
      CITY_CACHE.AL = named(albaniaRegions(ENGINE, regionsFor(CO)));
    } else if (!CITY_CACHE[CO.code]) CITY_CACHE[CO.code] = named(regionsFor(CO));
    CITIES = CITY_CACHE[CO.code];
    S.city = [...CITIES].sort((a, b) => gapOf(b) - gapOf(a))[0].id;
  }
  initCities();
  /** the sample regions a country's stage stands on, without entering it: the very list the
      country panel totals (this visit's simulated support included), for the world card */
  const regionsOf = (co) =>
    co.code === "AL" && !demo
      ? named(albaniaRegions(loadEngine(store), regionsFor(co)))
      : (CITY_CACHE[co.code] ?? named(regionsFor(co)));
  const city = (id = S.city) => CITIES.find((c) => c.id === id);
  const totals = () => totalsOf(CITIES);
  const pace = () => paceOf(CITIES);
  const project = (track = S.track, amount = S.amount, c = city()) => projectOf(track, amount, c);

  /* ── Renderer, environment, post-processing ─────────────────────── */
  const canvas = $("#gl");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // graded in post
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(G.night);
  scene.fog = new THREE.FogExp2(G.night, 0.022);
  const pmrem = new THREE.PMREMGenerator(renderer);
  /* a procedural soft-box studio for reflections (no texture files): large soft-edged panels in
     neutral-warm white — an overhead box, a key box to the visitor's left, a long low fill, a rim
     strip behind — and a wine bounce from the floor. Lacquer, enamel and satin metal reflect
     pools of light with soft edges instead of hard lamp dots. */
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x0d0508);
    const sc = document.createElement("canvas");
    sc.width = sc.height = 64;
    const sx = sc.getContext("2d");
    const sg = sx.createRadialGradient(32, 32, 6, 32, 32, 32);
    sg.addColorStop(0, "rgba(255,255,255,1)");
    sg.addColorStop(0.55, "rgba(255,255,255,0.7)");
    sg.addColorStop(1, "rgba(255,255,255,0)");
    sx.fillStyle = sg;
    sx.fillRect(0, 0, 64, 64);
    const soft = new THREE.CanvasTexture(sc);
    const box = (w, h, pos, k, color = 0xfff4ea) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(color).multiplyScalar(k),
          map: soft,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(13, 13, [0, 9, 0.01], 1.8); // overhead
    box(11, 11, [-8, 5, 6], 2.8); // key
    box(6, 12, [9, 2.5, 3], 0.8); // fill
    box(16, 4, [0, 4, -10], 1.3); // rim
    box(22, 22, [0, -6, 0.01], 0.45, 0x6b1f30); // the floor returns wine
    scene.environment = pmrem.fromScene(env, 0.03).texture;
    soft.dispose();
  }

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  CameraControls.install({ THREE });
  const controls = new CameraControls(camera, canvas);
  controls.smoothTime = 0.55;
  controls.draggingSmoothTime = 0.18;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.42;
  controls.minDistance = 6;
  controls.maxDistance = 30;
  controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
  controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY;
  controls.enabled = false;
  controls.setLookAt(0, 3.6, 32, 0, 4.5, 0, false);

  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  /* contact depth: ambient occlusion where columns meet the land and beads sit on it */
  const ao = LOW ? null : new N8AOPostPass(scene, camera, innerWidth, innerHeight);
  if (ao) {
    Object.assign(ao.configuration, {
      aoRadius: 1.6,
      distanceFalloff: 0.6,
      intensity: 2.6,
      color: new THREE.Color(0x14060a),
      gammaCorrection: false,
      halfRes: true,
    });
    ao.setQualityMode("Medium");
    composer.addPass(ao);
    /* the occlusion pass hands its picture on in the composer's second buffer, so the next pass
       (depth of field, which reads the scene's depth) would draw into the buffer that depth is
       attached to: the driver refuses that draw every frame ("feedback loop"). One plain copy
       puts the picture back where a depth-reading pass may write beside it. */
    composer.addPass(new ShaderPass(new CopyMaterial()));
  }
  const BLOOM = 0.8; // resting bloom; the gate, country and payment beats rise from it and return
  const bloom = new BloomEffect({
    // only true emitters bloom (they are drawn above 1): white type and enamel stay crisp
    luminanceThreshold: 1.0,
    luminanceSmoothing: 0.25,
    intensity: BLOOM,
    mipmapBlur: true,
    radius: 0.72,
  });
  // AgX keeps hue under warm light (ACES pulls saturated wine toward orange-brown); the grade
  // below gives back the contrast and saturation AgX holds in reserve, with lifted blacks
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const dof = LOW
    ? null
    : new DepthOfFieldEffect(camera, {
        worldFocusDistance: 12,
        worldFocusRange: 9,
        bokehScale: 2.2,
      });
  const focus = new THREE.Vector3(0, 6, -13);
  if (dof) dof.target = focus;
  composer.addPass(new EffectPass(camera, ...(dof ? [dof] : []), bloom, tone));
  const ca = new ChromaticAberrationEffect({
    offset: new THREE.Vector2(0, 0),
    radialModulation: true,
    modulationOffset: 0.25,
  });
  const vignette = new VignetteEffect({ darkness: 0.5, offset: 0.32 });
  const grain = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: false });
  grain.blendMode.opacity.value = 0.14;
  const grade = [
    new BrightnessContrastEffect({ contrast: 0.1, brightness: 0.0 }),
    new HueSaturationEffect({ saturation: 0 }),
  ];
  composer.addPass(new EffectPass(camera, ...grade, ca, vignette, grain));
  composer.addPass(new EffectPass(camera, new SMAAEffect()));

  /* ── Materials: satin champagne trim, white enamel, wine lacquer, glass ─────────────────── */
  // champagne is brushed, never mirror foil: it is the thin line, not a surface
  const champM = new THREE.MeshPhysicalMaterial({
    color: G.champagne,
    metalness: 1,
    roughness: 0.36,
    envMapIntensity: 1,
  });
  // white enamel: the mark's ring and hand, as form (frames, the broken rings, the meridian)
  const ivoryM = new THREE.MeshPhysicalMaterial({
    color: 0xfaf6ef,
    metalness: 0,
    roughness: 0.42,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.95, // enamel is lit by the soft boxes: white, not putty
  });
  const lacquer = new THREE.MeshPhysicalMaterial({
    color: G.lacquer,
    roughness: 0.32,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.55,
  });
  // hairlines are drawn in white, as the mark's ring is
  const inkLine = (o = 0.5) =>
    new THREE.LineBasicMaterial({
      color: G.ivory,
      transparent: true,
      opacity: o,
      toneMapped: false,
    });

  /* ── Lights: one soft key, a low fill, a rim — and the soft-box environment for the rest.
     Three analytic lights instead of nine: no lamp dots on lacquer, no hot corners on the
     screen frames. The lanterns that remain are objects (they bloom) and light nothing. ── */
  scene.add(new THREE.HemisphereLight(0xfff1e6, 0x1c070d, 0.45));
  const key = new THREE.SpotLight(0xfff3e8, 1700, 52, 0.5, 1, 2);
  key.position.set(-9, 20, 17); // behind the visitor: its pool on the polished floor stays out of frame
  key.target.position.set(0, 1, -2);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffeadf, 0.4);
  fill.position.set(10, 6, 9);
  // the rim rises from behind and below, so it edges the globe and the columns of need but never
  // strikes the polished floor toward the visitor (no glare pool)
  const rim = new THREE.SpotLight(0xfff6f0, 520, 26, 0.5, 0.9, 2);
  rim.position.set(2.5, 2.2, -13.5);
  rim.target.position.set(0, 6.4, 0);
  scene.add(fill, rim, rim.target);
  /* one shadow map with a tight frustum over the centre (stand, globe, land, columns of need);
     LOW keeps the baked blobs only */
  const SHADOWS = !LOW;
  if (SHADOWS) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 8;
    key.shadow.camera.far = 40;
    key.shadow.focus = 0.8;
    key.shadow.radius = 5;
    key.shadow.blurSamples = 10;
    key.shadow.bias = -0.0005;
  }
  const casts = (o) => {
    if (SHADOWS) o.traverse((x) => x.isMesh && (x.castShadow = true));
    return o;
  };
  const takes = (o) => {
    if (SHADOWS) o.traverse((x) => x.isMesh && (x.receiveShadow = true));
    return o;
  };
  const lamps = [];
  for (const a of [-1.8, -0.95, 0.95, 1.8]) {
    const at = new THREE.Vector3(Math.sin(a) * 14.2, 9.4, Math.cos(a) * 14.2);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff4ea, toneMapped: false }),
    );
    bulb.material.color.multiplyScalar(1.7);
    bulb.position.copy(at);
    scene.add(bulb);
    const cage = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36, 0),
      new THREE.MeshPhysicalMaterial({
        color: G.champagne,
        metalness: 1,
        roughness: 0.4,
        wireframe: true,
      }),
    );
    cage.position.copy(at);
    scene.add(cage);
    lamps.push(cage);
  }

  /* ── The hall ───────────────────────────────────────────────────── */
  const hall = new THREE.Group();
  scene.add(hall);
  // mirror floor under smoked lacquer
  let mirror = null;
  if (!LOW) {
    mirror = new Reflector(new THREE.CircleGeometry(19, 96), {
      textureWidth: innerWidth * 0.5,
      textureHeight: innerHeight * 0.5,
      color: 0x6a5a55,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.01;
    hall.add(mirror);
  }
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(19, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0x120709,
      roughness: 0.25,
      metalness: 0.4,
      transparent: !LOW,
      opacity: LOW ? 1 : 0.82,
      envMapIntensity: 0.4,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  hall.add(floor);
  /* a hairline ring broken once, as the mark's ring is: the only ornament the hall repeats */
  function brokenRing(r, o, gap = 0.34, at = 0) {
    const pts = [],
      n = 160;
    for (let i = 0; i <= n; i++) {
      const a = at + gap + (i / n) * (Math.PI * 2 - gap * 2);
      pts.push(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), inkLine(o));
  }
  const inlay = new THREE.Group();
  inlay.position.y = 0.012;
  // two inner hairlines echo the outer ring's break at the door; the walk in stays clear
  inlay.add(brokenRing(6.4, 0.14), brokenRing(3.6, 0.1));
  hall.add(inlay);
  /* the floor carries the mark's geometry as form, not as a copy: a white ring that is broken
     where the visitor walks in — the way the alef crosses the mark's ring — and one champagne hairline */
  const GAP = 0.34; // half-width of the break, in radians, centred on the door (+z)
  [
    [9.6, 0.06, G.ivory, 0.5, GAP],
    [15.2, 0.04, G.champagne, 0.5, 0],
  ].forEach(([r, w, color, opacity, gap]) => {
    const g = new THREE.Mesh(
      new THREE.RingGeometry(r, r + w, 160, 1, -Math.PI / 2 + gap, Math.PI * 2 - gap * 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false }),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.014;
    hall.add(g);
  });

  function patternTex() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#1a090e";
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = "rgba(243,235,224,0.09)";
    x.lineWidth = 1.4;
    [
      [128, 128],
      [0, 0],
      [256, 0],
      [0, 256],
      [256, 256],
    ].forEach(([a, b]) => {
      x.beginPath();
      x.arc(a, b, 128, 0, Math.PI * 2);
      x.stroke();
    });
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(18, 3);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(18, 18, 15, 120, 1, true, 0.17, Math.PI * 2 - 0.34),
    new THREE.MeshStandardMaterial({
      map: patternTex(),
      side: THREE.BackSide,
      roughness: 0.85,
      metalness: 0.15,
      envMapIntensity: 0.3,
    }),
  );
  wall.position.y = 7.5;
  hall.add(wall);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(18, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x14070b, side: THREE.BackSide, roughness: 0.9 }),
  );
  dome.position.y = 15;
  hall.add(dome);
  const crown = brokenRing(5, 0.85, 0.3);
  crown.position.y = 30.5;
  hall.add(crown);
  const oculus = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 64),
    new THREE.MeshBasicMaterial({ color: 0xfff3e6, toneMapped: false }),
  );
  oculus.material.color.multiplyScalar(2);
  oculus.rotation.x = Math.PI / 2;
  oculus.position.y = 32.8;
  hall.add(oculus);
  const arch = buildArchitecture({
    hall,
    champM,
    lacquer,
    LOW,
    rnd: (() => {
      let a = 7;
      return () => (a = (a * 16807) % 2147483647) / 2147483647;
    })(),
  });
  floor.material = arch.floorMaterial;
  takes(floor);
  const doors = [];
  [-1, 1].forEach((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 2.7, 0, 17.6);
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 8, 0.22),
      new THREE.MeshPhysicalMaterial({
        color: 0x4a1424,
        roughness: 0.35,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
      }),
    );
    leaf.position.set(-s * 1.35, 4, 0);
    pivot.add(leaf);
    const trim = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.5, 7.8, 0.24)),
      inkLine(0.95),
    );
    trim.position.copy(leaf.position);
    pivot.add(trim);
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 6), champM);
      p.position.set(-s * 1.35, 2 + k * 2, 0.13);
      pivot.add(p);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), champM);
    knob.position.set(-s * 2.4, 4, 0.22);
    pivot.add(knob);
    hall.add(pivot);
    pivot.visible = false; // the partner mark is the door now (see enterHall); the leaves stay for film framing
    doors.push({ pivot, s });
  });
  const portal = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.1, 16, 64, Math.PI), ivoryM);
  portal.position.set(0, 8, 17.65);
  hall.add(portal);
  const doorGlow = new THREE.PointLight(0xffe2c8, 0, 14, 2);
  doorGlow.position.set(0, 4, 15);
  scene.add(doorGlow);

  // dust in the lamplight (shader: soft round motes that twinkle)
  const DN = LOW ? 500 : 1200,
    dp = new Float32Array(DN * 3),
    ds = new Float32Array(DN);
  for (let i = 0; i < DN; i++) {
    const r = Math.sqrt(Math.random()) * 15,
      a = Math.random() * Math.PI * 2;
    dp.set([Math.sin(a) * r, Math.random() * 15, Math.cos(a) * r], i * 3);
    ds[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  dustGeo.setAttribute("seed", new THREE.BufferAttribute(ds, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float seed; uniform float uTime; uniform float uPx; varying float vA;
    void main(){ vec3 p = position; p.y = mod(p.y + uTime*0.12*(0.3+seed), 15.0); p.x += sin(uTime*0.3+seed*20.0)*0.3;
      vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
      vA = 0.35 + 0.65*abs(sin(uTime*(0.6+seed)+seed*30.0)); gl_PointSize = (18.0+30.0*seed)*uPx/(-mv.z); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vec3(1.0,0.93,0.84)*1.3, a*vA*0.5); }`,
  });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // god rays from the oculus (additive cone)
  const rays = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 7.5, 31, 64, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uI: { value: 0.16 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 w = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; uniform float uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ float edge = pow(1.0-abs(dot(vN,vV)),1.5); float stripes = 0.6+0.4*sin(vUv.x*60.0+uTime*0.4); float fall = smoothstep(0.0,1.0,vUv.y);
      gl_FragColor = vec4(vec3(1.0,0.93,0.84), (1.0-edge)*stripes*fall*uI); }`,
    }),
  );
  rays.position.y = 15.5;
  hall.add(rays);

  /* ── Screens: objects, not canvases — a wine board, a white enamel frame with depth, a
     champagne fillet, the page set back inside it, and a still sheet of glass over the page ── */
  const proj = (lon, lat, k) => ({ x: (lon - 20.0) * k * 0.755, y: (lat - 41.2) * k });
  const sheenMat = () =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uHover: { value: 0 }, uDim: { value: 1 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vT;
    void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal);
      vV = normalize(cameraPosition - w.xyz); vT = dot(vV, normalize(mat3(modelMatrix)*vec3(1.0,0.0,0.0)));
      gl_Position = projectionMatrix*viewMatrix*w; }`,
      // glass, quietly: a fresnel lift at grazing angles and one wide soft-box pool that slides as
      // the visitor moves (nothing sweeps by itself); the rim answers the pointer
      fragmentShader: `uniform float uHover; uniform float uDim; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vT;
    void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0);
      float pool = smoothstep(0.42, 0.0, abs(vUv.x + vUv.y*0.38 - 0.62 - vT*1.3));
      float rim = smoothstep(0.03,0.0,min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y)));
      gl_FragColor = vec4(vec3(1.0,0.96,0.92), (f*0.3 + pool*0.035 + rim*0.3*uHover)*uDim); }`,
    });
  /** a rectangular moulding: outer (w+2t)x(h+2t), opening w x h, extruded with a small bevel */
  const moulding = (w, h, t, depth, bevel) => {
    const o = new THREE.Shape();
    const W2 = w / 2 + t,
      H2 = h / 2 + t;
    o.moveTo(-W2, -H2);
    o.lineTo(W2, -H2);
    o.lineTo(W2, H2);
    o.lineTo(-W2, H2);
    o.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-w / 2, -h / 2);
    hole.lineTo(-w / 2, h / 2);
    hole.lineTo(w / 2, h / 2);
    hole.lineTo(w / 2, -h / 2);
    hole.closePath();
    o.holes.push(hole);
    return new THREE.ExtrudeGeometry(o, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
    });
  };
  const screens = [];
  function makeScreen(angle, w, h) {
    const cv = document.createElement("canvas"),
      dens = LOW ? 1.3 : 1.7;
    cv.lw = 1400;
    cv.lh = Math.round((1400 * h) / w);
    cv.width = Math.round(cv.lw * dens);
    cv.height = Math.round(cv.lh * dens);
    cv.getContext("2d").scale(dens, dens);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const g = new THREE.Group();
    // the page sits 9cm behind the frame's face
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
    );
    m.position.z = -0.03;
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sheenMat());
    sheen.position.z = 0.0;
    // white enamel moulding, as the mark's ring sits on its disc; one champagne fillet inside it
    const frame = new THREE.Mesh(moulding(w + 0.03, h + 0.03, 0.13, 0.15, 0.018), ivoryM);
    frame.position.z = -0.1;
    const fillet = new THREE.Mesh(moulding(w, h, 0.015, 0.05, 0), champM);
    fillet.position.z = -0.04;
    const back = new THREE.Mesh(moulding(w + 0.29, h + 0.29, 0.36, 0.14, 0.02), lacquer);
    back.position.z = -0.24;
    g.add(back, frame, fillet, m, sheen);
    g.position.set(Math.sin(angle) * 13.2, 6, Math.cos(angle) * 13.2);
    g.lookAt(0, 6, 0);
    hall.add(g);
    const o = { cv, ctx: cv.getContext("2d"), tex, mesh: m, sheen, group: g };
    screens.push(o);
    return o;
  }
  /* the screens speak in the hall and fall quiet when the globe takes the room */
  const scrDim = { v: 1 };
  const dimScreens = (v) =>
    gsap.to(scrDim, {
      v,
      duration: 1.4,
      ease: "power2.inOut",
      overwrite: true,
      onUpdate: () =>
        screens.forEach((x) => {
          x.mesh.material.color.setScalar(scrDim.v);
          x.sheen.material.uniforms.uDim.value = scrDim.v;
        }),
    });
  const scrMap = makeScreen(Math.PI, 9, 6),
    scrTracks = makeScreen(Math.PI - 0.82, 6, 4.4),
    scrImpact = makeScreen(Math.PI + 0.82, 6, 4.4);
  function bg(ctx, w, h) {
    const gr = ctx.createRadialGradient(w * 0.6, h * 0.3, 50, w * 0.5, h * 0.5, w * 0.8);
    gr.addColorStop(0, "#6b1f30");
    gr.addColorStop(1, "#33101a");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
    // the page is set back in its frame: the moulding shades its top and its lit-side edge
    const edge = (x0, y0, x1, y1, a) => {
      const e = ctx.createLinearGradient(x0, y0, x1, y1);
      e.addColorStop(0, `rgba(12,3,6,${a})`);
      e.addColorStop(1, "rgba(12,3,6,0)");
      ctx.fillStyle = e;
      ctx.fillRect(0, 0, w, h);
    };
    edge(0, 0, 0, 46, 0.5);
    edge(0, 0, 38, 0, 0.36);
    edge(w, 0, w - 22, 0, 0.18);
    edge(0, h, 0, h - 18, 0.14);
  }
  /* the screens are composed right-to-left; in a left-to-right language the same page is
     mirrored: every anchor is reflected across the page and its alignment swapped. `fixed` keeps
     a position that belongs to geography (a city's name beside its dot), which never mirrors. */
  const flipX = (ctx, x) => (LTR ? ctx.canvas.lw - x : x);
  function text(ctx, s, x, y, size, color, weight = 500, fam = BODY, align = "right", fixed) {
    ctx.direction = DIR;
    if (LTR && !fixed) {
      x = flipX(ctx, x);
      align = align === "right" ? "left" : align === "left" ? "right" : align;
    }
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "${fam}", sans-serif`;
    ctx.fillText(s, x, y);
  }
  /** a screen's heading: flat white display type over one short champagne rule (no foil ramp) */
  function goldText(ctx, s, x, y, size) {
    ctx.direction = DIR;
    ctx.textAlign = LTR ? "left" : "right";
    x = flipX(ctx, x);
    ctx.font = `700 ${size}px "${DISPLAY}", serif`;
    ctx.fillStyle = "#fbf7f0";
    ctx.fillText(s, x, y);
  }
  const rule = (ctx, x, y, len) => {
    ctx.fillStyle = "rgba(205,174,118,.8)";
    ctx.fillRect(LTR ? flipX(ctx, x) : x - len, y, len, 2);
  };
  /** a large figure, anchored like the text under it */
  function figure(ctx, v, x, y, size) {
    ctx.direction = "ltr";
    ctx.textAlign = LTR ? "left" : "right";
    ctx.font = `700 ${size}px "${DISPLAY}", serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(v, flipX(ctx, x), y);
  }
  function drawMap() {
    const { ctx, cv, tex } = scrMap,
      w = cv.lw,
      h = cv.lh,
      t = totals();
    bg(ctx, w, h);
    if (!PICKED || donor) {
      goldText(ctx, HC.network.title, w - 90, 158, LTR ? 78 : 92);
      text(ctx, HC.network.sites(fmt(SITES)), w - 90, 238, 44, "rgba(246,239,226,.78)");
      rule(ctx, w - 90, 286, 150);
      [
        ["hq", HC.network.hq],
        ["office", HC.network.offices],
        ["field", HC.network.field],
      ].forEach(([st, l], i) => {
        const x = w - 90 - i * 410;
        // counted from the network the hall draws, as the world panel counts them
        figure(ctx, fmt(COUNTRIES.filter((c) => c.st === st).length), x, 520, 190);
        text(ctx, l, x, 596, LTR ? 38 : 44, "rgba(246,239,226,.82)", 600);
      });
      ctx.fillStyle = "rgba(246,239,226,.16)";
      ctx.fillRect(90, h - 196, w - 180, 2);
      text(ctx, HC.network.touch, w - 90, h - 104, LTR ? 40 : 45, "#e2c896", 700);
      tex.needsUpdate = true;
      return;
    }
    const tc = trialCo();
    if (demo && !tc) {
      // a country the catalogue does not hold (none today): its name, and no figure
      goldText(ctx, coName(), w - 80, 136, 80);
      tex.needsUpdate = true;
      return;
    }
    goldText(ctx, demo ? T.screen.map(tc.name) : X.screen.mapTitle(coName()), w - 80, 136, 80);
    text(
      ctx,
      demo
        ? T.screen.mapLine(fmt(tc.children), fmt(tc.enrolled), fmt(tc.deliveries))
        : X.screen.mapLine(fmt(t.need), fmt(t.pct), fmt(t.gap)),
      w - 80,
      200,
      36,
      "rgba(246,239,226,.75)",
    );
    const kk = 265,
      ox = LTR ? w * 0.73 : w * 0.27,
      oy = 590;
    const path = () => {
      ctx.beginPath();
      CO.rings.forEach((r) => {
        r.forEach(([x, y], i) => ctx[i ? "lineTo" : "moveTo"](ox + x * kk, oy - y * kk));
        ctx.closePath();
      });
    };
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,.28)";
    ctx.shadowBlur = 30;
    path();
    const lg = ctx.createLinearGradient(0, oy - 300, 0, oy + 300);
    lg.addColorStop(0, "#5b1a2b");
    lg.addColorStop(1, "#2b0b14");
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.restore();
    path();
    ctx.strokeStyle = "#cdae76";
    ctx.lineWidth = 3;
    ctx.stroke();
    CITIES.forEach((c) => {
      const r = 9 + c.need * 0.38,
        f = c.qualified / c.need,
        X = ox + c.nx * kk,
        Y = oy - c.ny * kk;
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(246,239,226,.12)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(X, Y);
      ctx.arc(X, Y, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = "#cdae76";
      ctx.fill();
      const L =
        {
          tirana: [0, -r - 14, "center"],
          elbasan: [r + 12, 20, "left"],
          durres: [-r - 12, 4, "right"],
          kukes: [r + 12, 8, "left"],
          korce: [r + 12, 8, "left"],
          berat: [r + 12, 12, "left"],
        }[c.id] || (c.nx > 0 ? [r + 12, 10, "left"] : [-r - 12, 10, "right"]);
      text(ctx, c.ar, X + L[0], Y + L[1], 28, "#f6efe2", 600, BODY, L[2], true);
    });
    const lx = w - 80;
    let ly = 330;
    text(ctx, demo ? T.screen.regions : X.screen.gaps, lx, ly, 34, "#cdae76", 700);
    ly += 20;
    [...CITIES]
      .sort((a, b) => gapOf(b) - gapOf(a))
      .slice(0, 5)
      .forEach((c) => {
        ly += 66;
        text(ctx, c.ar, lx, ly, 34, "#f6efe2", 600);
        text(
          ctx,
          demo ? T.children(c.need) : X.screen.waiting(fmt(gapOf(c))),
          lx - 330,
          ly,
          30,
          "rgba(246,239,226,.7)",
        );
        const full = 440 * (c.qualified / c.need);
        ctx.fillStyle = "rgba(246,239,226,.12)";
        ctx.fillRect(LTR ? flipX(ctx, lx) : lx - 440, ly + 16, 440, 6);
        ctx.fillStyle = "#cdae76";
        ctx.fillRect(LTR ? flipX(ctx, lx) : lx - full, ly + 16, full, 6);
      });
    text(
      ctx,
      demo ? T.screen.enter(tc.name) : X.screen.enter(coName()),
      w - 80,
      h - 84,
      48,
      "#e2c896",
      700,
    );
    tex.needsUpdate = true;
  }
  function drawTracks() {
    const { ctx, cv, tex } = scrTracks,
      w = cv.lw;
    bg(ctx, w, cv.lh);
    goldText(
      ctx,
      donor ? D.kinds : demo ? demo.giving.heading : X.screen.tracksTitle,
      w - 80,
      140,
      donor && LTR ? 58 : 68,
    );
    (donor
      ? // the platform's own kinds by their own names: no unit price is quoted to a real donor
        mine.kinds.map((k) => [k.name, "", ""])
      : demo
        ? TRIAL_KINDS.map((k) => [
            demo.giving.tracks[k].name,
            T.screen.tracksHow[k],
            T.screen.tracksSub[k],
          ])
        : // sample unit prices in the hall's one currency, named as sample under the list
          Object.keys(TRACKS).map((k) => [
            X.tracks[k].name,
            X.trackLine(X.tracks[k].per, LX.money(TRACKS[k].unit)),
            X.screen.tracksSub[k],
          ])
    ).forEach(([a, b, c], i) => {
      const y = 300 + i * 200;
      ctx.fillStyle = "#cdae76";
      ctx.beginPath();
      ctx.arc(flipX(ctx, w - 115), y - 20, 30, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(i + 1), w - 115, y - 6, 36, "#2b0e15", 700, DISPLAY, "center");
      text(ctx, a, w - 170, y, 54, "#f6efe2", 700, DISPLAY);
      // the second word stands clear of the name, however long the name is in this language
      const aw = ctx.measureText(a).width;
      text(ctx, b, w - 170 - Math.max(230, aw + 30), y, 34, "#cdae76", 600);
      text(ctx, c, w - 170, y + 62, 34, "rgba(246,239,226,.72)");
    });
    if (donor) text(ctx, D.kindsOpen, w - 80, cv.lh - 60, 36, "#e2c896", 700);
    else if (X) text(ctx, X.screen.tracksNote, w - 80, cv.lh - 60, 34, "#e2c896", 600);
    tex.needsUpdate = true;
  }
  /** the donor's three figures, written as their dashboard writes them */
  const donorStats = () => [
    [MINE.stats.inCare, D.inCare],
    [MINE.stats.months, D.months],
    [`${MINE.stats.share}%`, D.share],
  ];
  function drawImpactScreen() {
    const { ctx, cv, tex } = scrImpact,
      w = cv.lw,
      h = cv.lh;
    bg(ctx, w, h);
    if (donor) {
      goldText(ctx, D.screenTitle, w - 80, 140, 68);
      const say = (t) => text(ctx, t, w - 80, 300, 40, "rgba(246,239,226,.85)");
      if (MINE === undefined) say(D.loading);
      else if (!MINE) say(D.dashboard);
      else if (!MINE.impact.children.length) say(D.emptyTitle);
      else {
        donorStats().forEach(([v, l], i) => {
          const x = w - 80 - i * 400;
          figure(ctx, v, x, 330, 110);
          text(ctx, l, x, 390, 30, "rgba(246,239,226,.75)", 600);
        });
        text(ctx, D.tag, w - 80, 520, 34, "#b9dcb9", 600);
      }
      text(ctx, D.screenOpen, w - 80, h - 60, 36, "#e2c896", 700);
      tex.needsUpdate = true;
      return;
    }
    if (demo) {
      // the trial's record is the visitor's two stores: what the pages wrote shows here too
      const all = TRIAL.history;
      goldText(ctx, T.screen.impact, w - 80, 140, 68);
      if (!all.length) {
        text(ctx, T.screen.none, w - 80, 300, 46, "rgba(246,239,226,.85)");
        T.screen.noneSub.forEach((line, i) =>
          text(ctx, line, w - 80, 370 + i * 50, 36, "rgba(246,239,226,.6)"),
        );
        tex.needsUpdate = true;
        return;
      }
      TRIAL_KINDS.forEach((k, i) => {
        const x = w - 80 - i * 400;
        figure(ctx, fmt(all.filter((e) => e.kind === k).length), x, 300, 96);
        text(ctx, demo.giving.tracks[k].name, x, 350, 32, "rgba(246,239,226,.75)", 600);
      });
      ctx.strokeStyle = "rgba(205,174,118,.38)";
      ctx.beginPath();
      ctx.moveTo(80, 470);
      ctx.lineTo(w - 80, 470);
      ctx.stroke();
      all.slice(0, 3).forEach((e, i) => {
        const y = 540 + i * 82;
        text(
          ctx,
          T.impact.title(e.kindName, e.label),
          w - 80,
          y,
          36,
          i ? "rgba(246,239,226,.8)" : "#f6efe2",
          600,
        );
        text(ctx, e.money, 80 + 520, y, 28, "rgba(246,239,226,.55)", 500, BODY, "right");
      });
      text(ctx, T.screen.open, w - 80, h - 60, 36, "#e2c896", 700);
      tex.needsUpdate = true;
      return;
    }
    /* the live hall's record is this visit's simulated support, and the screen says so */
    const Sc = X.screen;
    goldText(ctx, Sc.impactTitle, w - 80, 140, LTR ? 58 : 64);
    if (!S.history.length) {
      text(ctx, Sc.none, w - 80, 300, 46, "rgba(246,239,226,.85)");
      Sc.noneSub.forEach((line, i) =>
        text(ctx, line, w - 80, 370 + i * 50, 36, "rgba(246,239,226,.6)"),
      );
      tex.needsUpdate = true;
      return;
    }
    const H = S.history,
      total = H.reduce((a, r) => a + r.amount, 0),
      kids = H.reduce((a, r) => a + r.kids, 0),
      cos = new Set(H.map((r) => r.co)).size;
    [
      [LX.money(total), Sc.support],
      [fmt(kids), Sc.reached(kids)],
      [fmt(cos), Sc.countries(cos)],
    ].forEach(([v, l], i) => {
      const x = w - 80 - i * 400;
      figure(ctx, v, x, 300, v.length > 9 ? 78 : 96); // a long total keeps to its column
      text(ctx, l, x, 350, 32, "rgba(246,239,226,.75)", 600);
    });
    const by = (t) => H.filter((r) => r.track === t).reduce((a, r) => a + r.kids, 0);
    Object.keys(TRACKS).forEach((t, i) => {
      const x = w - 80 - i * 400,
        v = by(t);
      text(ctx, Sc.by[t](fmt(v)), x, 430, 34, v ? "#cdae76" : "rgba(246,239,226,.35)", 700);
    });
    ctx.strokeStyle = "rgba(205,174,118,.38)";
    ctx.beginPath();
    ctx.moveTo(80, 470);
    ctx.lineTo(w - 80, 470);
    ctx.stroke();
    H.slice(-3)
      .reverse()
      .forEach((r, i) => {
        const y = 540 + i * 82;
        text(ctx, r.title, w - 80, y, 36, i ? "rgba(246,239,226,.8)" : "#f6efe2", 600);
        text(ctx, r.line, 80 + 520, y, 28, "rgba(246,239,226,.55)", 500, BODY, "right");
      });
    text(ctx, Sc.open, w - 80, h - 60, 36, "#e2c896", 700);
    tex.needsUpdate = true;
  }

  /* ── The chosen country, carved in wine lacquer and outlined in white ─────────────── */
  const country = new THREE.Group();
  country.visible = false;
  scene.add(country);
  /* shapes are normalised to their bounding box, so a squarish country (Egypt, Saudi Arabia)
     reaches ~1.4 at its corners: scale each country by its farthest point to stay on the plinth */
  let R = 6.3;
  const fitR = fitScale;
  const landGroup = new THREE.Group();
  country.add(landGroup);
  const landM = new THREE.MeshPhysicalMaterial({
    color: 0x3e0d19,
    roughness: 0.38,
    metalness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.6,
  });
  const tierM = [0x47121e, 0x551826, 0x631c2d].map(
    (c) =>
      new THREE.MeshPhysicalMaterial({
        color: c,
        roughness: 0.34,
        clearcoat: 1,
        clearcoatRoughness: 0.15,
        envMapIntensity: 0.7,
      }),
  );
  const clearGroup = (g) => {
    g.traverse((o) => o.geometry && o.geometry.dispose());
    g.clear();
  };
  const LAND_TIERS = [0.84, 0.66, 0.46]; // the terraces: the outline drawn in toward its centre
  function buildLand() {
    clearGroup(landGroup);
    R = fitR(CO);
    const shapes = CO.rings.map(
      (r) => new THREE.Shape(r.map(([x, y]) => new THREE.Vector2(x * R, y * R))),
    );
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: 0.5,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.05,
      bevelSegments: 3,
    });
    geo.rotateX(-Math.PI / 2);
    landGroup.add(
      new THREE.Mesh(geo, landM),
      new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), inkLine(0.7)),
    );
    takes(casts(landGroup.children[0]));
    const main = CO.rings[0],
      cx = main.reduce((a, p) => a + p[0], 0) / main.length,
      cy = main.reduce((a, p) => a + p[1], 0) / main.length;
    LAND_TIERS.forEach((k, i) => {
      const sh = new THREE.Shape(
        main.map(([x, y]) => new THREE.Vector2((cx + (x - cx) * k) * R, (cy + (y - cy) * k) * R)),
      );
      const g = new THREE.ExtrudeGeometry(sh, {
        depth: 0.07,
        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.03,
        bevelSegments: 3,
      });
      g.rotateX(-Math.PI / 2);
      const t = new THREE.Group();
      t.add(
        new THREE.Mesh(g, tierM[i]),
        new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), inkLine(0.3 - i * 0.07)),
      );
      t.position.y = 0.58 + i * 0.075;
      takes(t);
      landGroup.add(t);
    });
  }
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(7.36, 128),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
    void main(){ vec2 c = vUv-0.5; float r = length(c);
      float w = sin(c.x*90.0 + uTime*0.7 + sin(c.y*40.0+uTime*0.3)*2.0) * sin(c.y*70.0 - uTime*0.5);
      float glint = smoothstep(0.88, 1.0, w) * (1.0 - smoothstep(0.35, 0.5, r));
      vec3 base = mix(vec3(0.03,0.008,0.014), vec3(0.1,0.026,0.042), 1.0 - r*1.6);
      gl_FragColor = vec4(base + glint*vec3(1.0,0.92,0.86)*0.08, 1.0); }`,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.002;
  country.add(sea);
  if (SHADOWS) {
    // the sea is drawn by its own shader: a shadow-only sheet just above it takes the land's shadow
    const seaShade = new THREE.Mesh(
      new THREE.CircleGeometry(7.36, 64),
      new THREE.ShadowMaterial({ opacity: 0.5, depthWrite: false }),
    );
    seaShade.rotation.x = -Math.PI / 2;
    seaShade.position.y = 0.006;
    seaShade.receiveShadow = true;
    country.add(seaShade);
  }
  const bandCv = document.createElement("canvas");
  bandCv.width = 4096;
  bandCv.height = 128;
  const bandTex = new THREE.CanvasTexture(bandCv);
  bandTex.colorSpace = THREE.SRGBColorSpace;
  bandTex.anisotropy = 8;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(7.83, 7.83, 0.44, 160, 1, true),
    new THREE.MeshPhysicalMaterial({
      map: bandTex,
      roughness: 0.3,
      metalness: 0.4,
      clearcoat: 1,
      envMapIntensity: 0.6,
    }),
  );
  band.position.y = -0.27;
  country.add(band);
  function drawBand() {
    const x = bandCv.getContext("2d");
    x.fillStyle = "#2a0b13";
    x.fillRect(0, 0, 4096, 128);
    x.strokeStyle = "rgba(205,174,118,.55)";
    x.lineWidth = 2;
    x.strokeRect(0, 10, 4096, 108);
    x.direction = DIR;
    x.textAlign = "center";
    x.font = `600 50px "${DISPLAY}", serif`;
    x.fillStyle = "#f6efe2"; // the hand is written in white, as in the mark
    for (let i = 0; i < 3; i++)
      x.fillText(
        HC.band(coName(), demo ? T.sample : HC.status[CO.st], HC.hall),
        (4096 * (i + 0.5)) / 3,
        84,
      );
    bandTex.needsUpdate = true;
  }
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 1.1, 9, 48, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uO: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0);
        vF = abs(dot(normalize(normalMatrix*normal), normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }`,
      // the shaft dissolves at its silhouette and toward the ground: light in air, not a grey slab
      fragmentShader: `uniform float uO; varying vec2 vUv; varying float vF; void main(){ float a = smoothstep(0.0, 1.0, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y)) * vF * vF * vF; gl_FragColor = vec4(vec3(1.0,0.93,0.84), a*uO*0.11); }`,
    }),
  );
  beam.position.y = 5.1;
  country.add(beam);
  const beamLight = new THREE.SpotLight(0xffe6cc, 0, 14, 0.22, 0.7, 2);
  beamLight.position.set(0, 10, 0);
  country.add(beamLight, beamLight.target);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.8, 0.5, 128), lacquer);
  plinth.position.y = -0.27;
  country.add(plinth);
  /* the plinth's rim is the mark's ring: white, and broken once (never a closed gold hoop);
     a champagne hairline below it is the only metal on the plinth */
  const RIM_GAP = 0.62;
  const plinthRing = new THREE.Mesh(
    new THREE.TorusGeometry(7.45, 0.045, 12, 160, Math.PI * 2 - RIM_GAP),
    ivoryM,
  );
  plinthRing.rotation.set(Math.PI / 2, 0, Math.PI * 0.25 + RIM_GAP / 2); // the break sits to the north-east
  country.add(plinthRing);
  const plinthLine = new THREE.Mesh(new THREE.TorusGeometry(7.83, 0.018, 8, 160), champM);
  plinthLine.rotation.x = Math.PI / 2;
  plinthLine.position.y = -0.05;
  country.add(plinthLine);
  const H = (n) => n * 0.06;
  const glassM = new THREE.MeshPhysicalMaterial({
    color: 0xfff4e0,
    transparent: true,
    opacity: 0.16,
    roughness: 0.05,
    metalness: 0,
    clearcoat: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.2,
  });
  const fillM = new THREE.MeshPhysicalMaterial({
    color: G.champagne,
    metalness: 1,
    roughness: 0.3,
    emissive: 0x6a5632,
    emissiveIntensity: 0.55,
    envMapIntensity: 1.2,
  });
  let pillars = [];
  /* three supports, three visual languages: each differs in FORM as well as colour (solid bead /
     ring around the bead / faceted gem; inner / middle / outer dial arc), so the key survives
     colour-blindness. Champagne = qualified, emerald = sponsored (the one hue outside the mark,
     kept as a data colour), pearl = clothed. hall.css --t-* must match. */
  const TRACK_COL = { qualify: 0xcdae76, sponsor: 0x5cc9a4, kiswa: 0xeef0f7 };
  /* in the trial the same three forms carry the platform's three kinds of giving: the column is
     children under a qualification pledge, the lanterns the trial children this visitor sponsors,
     the pearls documented in-kind deliveries (never children reached) */
  const DIAL = [
    [0.36, 0.44, "qualify", "qualified"],
    [0.5, 0.58, "sponsor", "sponsored"],
    [0.64, 0.72, "kiswa", "clothed"],
  ];
  function makePillar(c) {
    const g = new THREE.Group();
    g.position.set(c.nx * R, 0.62, -c.ny * R);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 1, 48, 1, true),
      glassM.clone(),
    );
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1, 48), fillM.clone());
    fill.material.transparent = true;
    const delta = new THREE.Mesh(
      new THREE.CylinderGeometry(0.185, 0.185, 1, 48),
      // what this gift added reads white — white enamel with form, not a blown-out tube: it
      // arrives as light (see pay) and cools into the same enamel as the mark's ring
      new THREE.MeshPhysicalMaterial({
        color: G.ivory,
        emissive: 0xfff1e0,
        emissiveIntensity: 0.42,
        roughness: 0.36,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.5,
      }),
    );
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.018, 10, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xf6efe2).multiplyScalar(1.6),
        toneMapped: false,
        transparent: true,
      }),
    );
    baseRing.rotation.x = Math.PI / 2;
    delta.visible = baseRing.visible = false;
    if (SHADOWS) fill.castShadow = delta.castShadow = true;
    /* the arrival glow: a sleeve of light around what the gift added; it is lit once, in pay,
       and fades — at rest the added part is white enamel, faintly luminous */
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 1, 32, 1, true),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uO: { value: 0 } },
        vertexShader: `varying float vF; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0);
          vF = abs(dot(normalize(normalMatrix*normal), normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform float uO; varying float vF; varying vec2 vUv; void main(){
          float a = vF*vF * smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
          gl_FragColor = vec4(vec3(1.0,0.96,0.9)*1.5, a*uO); }`,
      }),
    );
    glow.visible = false;
    const ghost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 1, 48),
      new THREE.MeshBasicMaterial({
        color: 0xfff1e0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    const cap = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.022, 12, 48), ivoryM);
    cap.rotation.x = Math.PI / 2;
    const dialG = new THREE.Group();
    dialG.position.y = 0.26;
    const dial = DIAL.map(([r0, r1, t, key]) => {
      const flat = (m) => ((m.rotation.x = -Math.PI / 2), m);
      dialG.add(
        flat(
          new THREE.Mesh(
            new THREE.RingGeometry(r0, r1, 72),
            new THREE.MeshBasicMaterial({
              color: TRACK_COL[t],
              transparent: true,
              opacity: 0.13,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          ),
        ),
      );
      const arc = flat(
        new THREE.Mesh(
          new THREE.RingGeometry(r0, r1, 72, 1, Math.PI / 2, 0.001),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(TRACK_COL[t]).multiplyScalar(1.7),
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false,
          }),
        ),
      );
      dialG.add(arc);
      return { arc, r0, r1, key, shown: 0 };
    });
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 0.92, 64),
      new THREE.MeshBasicMaterial({
        color: 0xf6e8d6,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    g.add(glass, fill, delta, glow, baseRing, ghost, cap, halo, dialG);
    country.add(g);
    glass.userData.city = fill.userData.city = c.id;
    const o = {
      c,
      g,
      glass,
      fill,
      delta,
      glow,
      baseRing,
      ghost,
      cap,
      halo,
      dial,
      fillH: H(c.qualified),
      baseH: H(c.qualified),
      ghostH: 0,
      ghostTarget: 0,
      rise: 1,
      pulse: 0,
      dim: 1,
    };
    o.label = addLabel(
      () =>
        v3
          .set(o.g.position.x, o.g.position.y + H(o.c.need) * o.rise + 0.4, o.g.position.z)
          .applyMatrix4(country.matrixWorld),
      () => country.visible && S.stage !== "big" && S.stage !== "world" && o.rise > 0.9,
    );
    o.label.city = c.id;
    return o;
  }
  function layoutPillar(o) {
    const total = H(o.c.need) * o.rise;
    o.glass.scale.y = Math.max(0.001, total);
    o.glass.position.y = total / 2;
    const f = o.fillH * o.rise;
    o.fill.scale.y = Math.max(0.001, f);
    o.fill.position.y = f / 2;
    o.ghost.scale.y = Math.max(0.001, o.ghostH);
    o.ghost.position.y = f + o.ghostH / 2;
    const b = Math.min(o.baseH, o.fillH) * o.rise,
      d = f - b;
    o.delta.visible = o.baseRing.visible = d > 0.01;
    o.delta.scale.y = Math.max(0.001, d);
    o.delta.position.y = b + d / 2;
    o.glow.visible = o.delta.visible && o.glow.material.uniforms.uO.value > 0.004;
    o.glow.scale.y = Math.max(0.001, d + 0.5);
    o.glow.position.y = b + d / 2;
    o.baseRing.position.y = b;
    o.cap.position.y = total;
    o.cap.visible = o.rise > 0.02;
  }
  /** each arc's length is that support's coverage of the city's need; it eases toward the truth */
  function stepDial(o, dt) {
    for (const d of o.dial) {
      const target = Math.min(1, o.c[d.key] / Math.max(1, o.c.need));
      if (Math.abs(d.shown - target) < 0.002) continue;
      d.shown += (target - d.shown) * Math.min(1, dt * 2.5);
      d.arc.geometry.dispose();
      d.arc.geometry = new THREE.RingGeometry(
        d.r0,
        d.r1,
        72,
        1,
        Math.PI / 2,
        Math.max(0.001, d.shown * Math.PI * 2),
      );
    }
  }
  /* LOW has no shadow map, so each column of need stands on a baked blob: one instanced quad
     sharing the hall's blob texture and material — one draw call for the whole land, no light */
  const BLOBS = 48;
  const colBlobs = LOW
    ? new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2),
        arch.blobMaterial,
        BLOBS,
      )
    : null;
  if (colBlobs) {
    colBlobs.count = 0;
    colBlobs.frustumCulled = false; // instances spread over the land; the mesh's own bounds are one quad
    colBlobs.renderOrder = -1; // under the dials and halos drawn over the same ground
    country.add(colBlobs);
  }
  const inRing = (ring, x, y) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i],
        [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  /** the height of the land's surface under a city: the land itself, or the terrace it stands on */
  function groundAt(nx, ny) {
    const main = CO.rings[0],
      cx = main.reduce((a, p) => a + p[0], 0) / main.length,
      cy = main.reduce((a, p) => a + p[1], 0) / main.length;
    let y = 0.58;
    LAND_TIERS.forEach((k, i) => {
      if (inRing(main, cx + (nx - cx) / k, cy + (ny - cy) / k)) y = 0.675 + i * 0.075;
    });
    return y;
  }
  let blobKey = NaN;
  /** the blobs follow the land as it rises and each column as it grows; rewritten only on change */
  function layoutBlobs() {
    const n = Math.min(BLOBS, pillars.length);
    let key = landGroup.scale.y * 31 + n;
    for (let i = 0; i < n; i++) key += pillars[i].rise * (i + 2) + pillars[i].g.position.x;
    if (key === blobKey) return;
    blobKey = key;
    for (let i = 0; i < n; i++) {
      const o = pillars[i],
        k = Math.min(1, Math.max(0, o.rise) * 2.5);
      tmpM.makeScale(k, 1, k);
      tmpM.setPosition(o.g.position.x, (o.ground + 0.012) * landGroup.scale.y, o.g.position.z);
      colBlobs.setMatrixAt(i, tmpM);
    }
    colBlobs.count = n;
    colBlobs.instanceMatrix.needsUpdate = true;
  }
  let builtCode = null;
  function buildCountry() {
    if (builtCode === CO.code) return;
    builtCode = CO.code;
    R = fitR(CO);
    initCities();
    pillars.forEach((o) => {
      clearGroup(o.g);
      country.remove(o.g);
      o.label.el.remove();
      labels.splice(labels.indexOf(o.label), 1);
    });
    pillars = CITIES.map(makePillar);
    pillars.forEach(layoutPillar);
    buildLand();
    if (colBlobs) pillars.forEach((o) => (o.ground = groundAt(o.c.nx, o.c.ny)));
    drawBand();
    drawMap();
    refreshLabels();
    const o0 = pillars.find((p) => p.c.id === S.city);
    beam.position.x = beamLight.position.x = o0.g.position.x;
    beam.position.z = beamLight.position.z = o0.g.position.z;
    beamLight.target.position.copy(o0.g.position);
  }
  const DOTS = 100;
  const dots = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.064, 16, 16),
    new THREE.MeshStandardMaterial({ metalness: 0.75, roughness: 0.26, envMapIntensity: 1.5 }),
    DOTS,
  );
  dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  country.add(dots);
  const tmpM = new THREE.Matrix4();
  const COL = {
    done: new THREE.Color(TRACK_COL.qualify),
    wait: new THREE.Color(0x5a2f38),
    lit: {
      qualify: new THREE.Color(0xfff6ea).multiplyScalar(2.6),
      sponsor: new THREE.Color(TRACK_COL.sponsor).multiplyScalar(2.6),
      kiswa: new THREE.Color(TRACK_COL.kiswa).multiplyScalar(2.6),
    },
  };
  const ringsI = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.085, 0.012, 6, 24),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(TRACK_COL.sponsor).multiplyScalar(1.8),
      toneMapped: false,
    }),
    DOTS,
  );
  const giftsI = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.045, 0),
    new THREE.MeshPhysicalMaterial({
      color: 0xf4f0e8,
      roughness: 0.22,
      metalness: 0.05,
      iridescence: 1,
      iridescenceIOR: 1.6,
      sheen: 1,
      sheenColor: new THREE.Color(0xf3e6ee),
      clearcoat: 1,
      emissive: 0x2c2a30,
      envMapIntensity: 1.6,
    }),
    DOTS,
  );
  ringsI.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  giftsI.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  country.add(ringsI, giftsI);
  const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
    qI = new THREE.Quaternion(),
    vP = new THREE.Vector3(),
    vS = new THREE.Vector3(),
    zero = new THREE.Matrix4().makeScale(0, 0, 0);
  /** clothing gifts falling onto children, and sponsorship lanterns orbiting the column */
  const DROPS = { list: [], t0: 0 };
  const LANT = 24;
  const lanterns = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.036, 16, 16),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(TRACK_COL.sponsor).multiplyScalar(1.5),
      toneMapped: false,
    }),
    LANT,
  );
  lanterns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(0.64, 0.006, 6, 96),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(TRACK_COL.sponsor).multiplyScalar(1.4),
      transparent: true,
      opacity: 0.45,
      toneMapped: false,
    }),
  );
  orbit.rotation.x = Math.PI / 2;
  const falling = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.075, 0.075, 0.075),
    new THREE.MeshPhysicalMaterial({
      color: 0xf4f0e8,
      roughness: 0.22,
      metalness: 0.05,
      iridescence: 1,
      iridescenceIOR: 1.6,
      sheen: 1,
      sheenColor: new THREE.Color(0xf3e6ee),
      clearcoat: 1,
      emissive: 0x2c2a30,
      envMapIntensity: 1.6,
    }),
    64,
  );
  falling.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  country.add(lanterns, orbit, falling);
  const LG = { from: 0, t: 1 };
  let dotsShown = 0;
  function layoutDots(time = 0) {
    const o = pillars.find((p) => p.c.id === S.city),
      c = o.c,
      pr = demo ? { lit: trialLit(c) } : project();
    const base =
      S.track === "qualify" ? c.qualified : S.track === "kiswa" ? c.clothed : c.sponsored;
    const target = S.stage === "support" ? pr.lit : 0;
    const dropping = new Set(DROPS.list.filter((d) => d.t < 1).map((d) => d.i));
    dotsShown += (target - dotsShown) * 0.12; // ripple outward as the amount changes
    for (let i = 0; i < DOTS; i++) {
      if (i >= c.need) {
        tmpM.makeScale(0, 0, 0);
        dots.setMatrixAt(i, tmpM);
        continue;
      }
      const ring = Math.floor(Math.sqrt(i / 3)),
        inRing = i - 3 * ring * ring,
        per = 6 * ring + 3;
      const a = (inRing / per) * Math.PI * 2 + ring * 0.4,
        r = 1.02 + ring * 0.2;
      const lit = i >= base && i < base + Math.round(dotsShown);
      const bob = lit && !RM ? Math.sin(time * 4 + i) * 0.05 + 0.08 : 0;
      tmpM.makeTranslation(
        o.g.position.x + Math.cos(a) * r,
        0.86 + bob,
        o.g.position.z + Math.sin(a) * r,
      );
      dots.setMatrixAt(i, tmpM);
      dots.setColorAt(i, lit ? COL.lit[S.track] : i < c.qualified ? COL.done : COL.wait);
      vP.setFromMatrixPosition(tmpM);
      if (i < c.sponsored) ringsI.setMatrixAt(i, tmpM.compose(vP, qX, vS.set(1, 1, 1)));
      else ringsI.setMatrixAt(i, zero);
      if (i < c.clothed && !dropping.has(i))
        giftsI.setMatrixAt(
          i,
          tmpM.compose(
            vP.clone().add(vS.set(0, 0.11, 0)),
            qI.setFromAxisAngle(vS.set(0, 1, 0), time + i),
            vS.set(1, 1.3, 1),
          ),
        );
      else giftsI.setMatrixAt(i, zero);
    }
    for (let i = c.need; i < DOTS; i++) {
      ringsI.setMatrixAt(i, zero);
      giftsI.setMatrixAt(i, zero);
    }
    ringsI.instanceMatrix.needsUpdate = giftsI.instanceMatrix.needsUpdate = true;
    dots.instanceMatrix.needsUpdate = true;
    if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
  }

  /* ── The network globe with a fresnel atmosphere ────────────────── */
  const globe = new THREE.Group();
  scene.add(globe);
  const HALL_GLOBE = { pos: new THREE.Vector3(0, 2.2, -7.6), s: 0.34 };
  globe.position.copy(HALL_GLOBE.pos);
  globe.scale.setScalar(HALL_GLOBE.s);
  const pedestal = new THREE.Group();
  pedestal.position.set(0, 0, -7.6);
  scene.add(pedestal);
  {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 1.05, 48), lacquer);
    col.position.y = 0.5;
    pedestal.add(col);
    const cup = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.04, 16, 96), champM);
    cup.rotation.x = Math.PI / 2;
    cup.position.y = 0.92;
    pedestal.add(cup);
    const meridian = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.03, 12, 128, Math.PI * 1.25),
      ivoryM, // a broken white ring around the wine disc: the mark, as a stand
    );
    meridian.position.y = 2.2;
    meridian.rotation.set(0, 0, -Math.PI * 0.62);
    pedestal.add(meridian);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.12, 64), champM);
    foot.position.y = 0.06;
    pedestal.add(foot);
    casts(pedestal);
    // contact shadow under the stand (baked, both tiers)
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 5.6),
      new THREE.MeshBasicMaterial({ map: arch.blob, transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    pedestal.add(blob);
  }
  const GR = 3.6;
  const globeCore = new THREE.Mesh(
    new THREE.SphereGeometry(GR, 96, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x56122a, // the mark's wine disc: a cooler wine, so the warm lamps cannot brown it
      emissive: 0x1c040c, // the shadow side stays wine instead of falling to brown-black
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.42, // lamps read as a soft sheen, not eight hard dots
      envMapIntensity: 0.4,
    }),
  );
  globe.add(casts(globeCore));
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(GR * 1.18, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      // the shell is 1.18x the globe, so its limb sits at 0.53: the halo hugs the limb and is
      // gone before the shell's own edge (no milky disc around the world)
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float d = clamp(-dot(vN, vV) / 0.53, 0.0, 1.0); float f = d*d*d*d*d; gl_FragColor = vec4(vec3(1.0,0.94,0.87), f*0.075); }`,
    }),
  );
  globe.add(atmo);
  const ll = (lat, lon, r = GR) => {
    const p = ((90 - lat) * Math.PI) / 180,
      t = ((lon + 180) * Math.PI) / 180;
    return new THREE.Vector3(
      -r * Math.sin(p) * Math.cos(t),
      r * Math.cos(p),
      r * Math.sin(p) * Math.sin(t),
    );
  };
  for (let lat = -60; lat <= 60; lat += 20) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 3) pts.push(ll(lat, lon, GR * 1.003));
    globe.add(
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), inkLine(lat ? 0.05 : 0.18)),
    );
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 3) pts.push(ll(lat, lon, GR * 1.003));
    globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), inkLine(0.05)));
  }
  /* the world: Natural Earth land (world-atlas 50m) sampled to ivory dots, embedded */
  const LAND = LAND_DOTS;
  const landDots = (() => {
    const bin = atob(LAND),
      u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const v = new Int16Array(u8.buffer),
      n = v.length / 2,
      pos = new Float32Array(n * 3),
      hot = new Float32Array(n),
      LL = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const lat = v[i * 2] / 10,
        lon = v[i * 2 + 1] / 10,
        p = ll(lat, lon, GR * 1.004);
      pos.set([p.x, p.y, p.z], i * 3);
      LL[i * 2] = lat;
      LL[i * 2 + 1] = lon;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("hot", new THREE.BufferAttribute(hot, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPx: { value: renderer.getPixelRatio() },
        uTime: { value: 0 },
        uScale: { value: 1 },
      },
      vertexShader: `attribute float hot; uniform float uPx; uniform float uTime; uniform float uScale; varying float vA; varying float vHot;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vec3 c = (modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        float f = dot(normalize(w.xyz-c), normalize(cameraPosition-w.xyz)); vA = smoothstep(-0.02, 0.4, f); vHot = hot;
        vec4 mv = viewMatrix*w; gl_Position = projectionMatrix*mv;
        float s = hot > 1.5 ? 1.9 + 0.4*sin(uTime*4.0) : (hot > 0.5 ? 1.12 : 1.0);
        gl_PointSize = s * 5.2 * uScale * uPx * 5.2 / (-mv.z); }`,
      fragmentShader: `varying float vA; varying float vHot;
      void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5, 0.15, d);
        vec3 col = vHot > 1.5 ? vec3(1.0,0.97,0.92)*2.2 : (vHot > 0.5 ? vec3(1.0,0.95,0.9) : vec3(0.86,0.7,0.68)*0.5);
        gl_FragColor = vec4(col, a*vA*(vHot > 0.5 ? 1.0 : 0.85)); }`,
    });
    const p = new THREE.Points(g, m);
    p.userData.ll = LL;
    globe.add(p);
    return p;
  })();
  const near = (c, lat, lon, f = 0.6) => {
    const k = Math.cos((lat * Math.PI) / 180),
      r = Math.max(1.3, c.span * f);
    return (lat - c.lat) ** 2 + ((lon - c.lon) * k) ** 2 < r * r;
  };
  function markLand() {
    const LL = landDots.userData.ll,
      hot = landDots.geometry.attributes.hot.array;
    for (let i = 0; i < hot.length; i++) {
      const lat = LL[i * 2],
        lon = LL[i * 2 + 1];
      hot[i] =
        (PICKED && near(CO, lat, lon)) ||
        (mineCodes.size && COUNTRIES.some((c) => mineCodes.has(c.code) && near(c, lat, lon)))
          ? 2
          : COUNTRIES.some((c) => shown(c) && near(c, lat, lon))
            ? 1
            : 0;
    }
    landDots.geometry.attributes.hot.needsUpdate = true;
  }
  const hq = byCode("SA"),
    arcs = [];
  // champagne marks the headquarters only; offices and field sites are white (solid / ring)
  const MARK = { hq: 0xdcc08c, office: 0xf6efe2, field: 0xf6efe2, unconfirmed: 0x8a7376 };
  const gDots = COUNTRIES.map((c) => {
    const geo =
      c.st === "hq"
        ? new THREE.OctahedronGeometry(0.13, 0)
        : c.st === "office"
          ? new THREE.SphereGeometry(0.07, 20, 20)
          : new THREE.TorusGeometry(
              0.065,
              c.st === "field" ? 0.02 : 0.012,
              8,
              c.st === "field" ? 32 : 10,
            );
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(MARK[c.st]).multiplyScalar(c.st === "unconfirmed" ? 1 : 1.7),
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    m.position.copy(ll(c.lat, c.lon, GR * 1.012));
    m.userData.code = c.code;
    globe.add(m);
    if (c.st === "field" || c.st === "unconfirmed") m.lookAt(0, 0, 0);
    if (c !== hq) {
      const a = ll(hq.lat, hq.lon, GR * 1.01),
        b = m.position.clone(),
        mid = a.clone().add(b).multiplyScalar(0.5);
      mid.setLength(GR + a.distanceTo(b) * 0.38);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b),
        geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(64));
      geo.setDrawRange(0, 0);
      const line = new THREE.Line(geo, inkLine(0.22));
      globe.add(line);
      arcs.push({ geo, line, c, curve });
    }
    return { c, m };
  });
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xfff6ea).multiplyScalar(5),
      toneMapped: false,
    }),
  );
  globe.add(spark);
  function markArcs() {
    const AMBER = new THREE.Color(0xf0a060).multiplyScalar(1.8);
    gDots.forEach(({ c, m }) => {
      m.visible = shown(c);
      if (!m.userData.base) m.userData.base = m.material.color.clone();
      const pri = VIEW.layer === "gap" && PRI.get(c.code);
      m.material.color
        .copy(pri ? AMBER : m.userData.base)
        .multiplyScalar(VIEW.layer === "gap" && !pri ? 0.35 : 1);
    });
    arcs.forEach((a) => {
      a.line.visible = shown(a.c);
    });
    arcs.forEach((a) => {
      const on = PICKED && a.c === CO;
      a.line.material.opacity = on ? 1 : a.c.st === "unconfirmed" ? 0.1 : 0.22;
      a.line.material.color.set(on ? G.champagne : G.ivory).multiplyScalar(on ? 2.6 : 1);
    });
    globe.userData.selCurve = (PICKED && arcs.find((a) => a.c === CO)?.curve) || null;
    spark.visible = !!globe.userData.selCurve;
  }
  const selDot = () => gDots.find((d) => d.c === CO).m;
  const faceY = (co) => {
    const p = ll(co.lat, co.lon);
    return Math.atan2(-p.x, p.z);
  };
  markLand();
  markArcs();
  globe.rotation.set(0.35, faceY(CO), 0);

  /* ── The payment stream ─────────────────────────────────────────── */
  const SN = 320,
    sp = new Float32Array(SN * 3),
    streamGeo = new THREE.BufferGeometry();
  streamGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stream = new THREE.Points(
    streamGeo,
    new THREE.PointsMaterial({
      color: new THREE.Color(0xfff1dc).multiplyScalar(2.6),
      size: 0.14,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  scene.add(stream);
  const flow = { t: -1, curve: null };
  const seeds = Array.from({ length: SN }, () => [
    Math.random(),
    (Math.random() - 0.5) * 0.7,
    (Math.random() - 0.5) * 0.7,
  ]);
  const shock = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.6, 96),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xfbead2).multiplyScalar(2.6),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  shock.rotation.x = -Math.PI / 2;
  country.add(shock);

  /* ── Labels and cursor ──────────────────────────────────────────── */
  const labelBox = $("#labels"),
    labels = [];
  function addLabel(getPos, when, cls = "") {
    const el = document.createElement("div");
    el.className = "lbl " + cls;
    labelBox.appendChild(el);
    const l = { el, getPos, when };
    labels.push(l);
    return l;
  }
  const v3 = new THREE.Vector3(),
    tv = new THREE.Vector3();
  gDots.forEach(({ c, m }) => {
    const l = addLabel(
      () => m.getWorldPosition(v3),
      () =>
        shown(c) &&
        globe.visible &&
        globe.scale.x > 0.8 &&
        (S.stage === "world" || S.stage === "big") &&
        m
          .getWorldPosition(tv)
          .sub(globe.position)
          .dot(camera.position.clone().sub(globe.position)) > 0.4,
      "g " + c.st,
    );
    // one name for a country everywhere: the globe reads what the lists and the pages read
    l.el.textContent = coName(c);
    l.globe = c;
    on(l.el, "click", () => S.stage === "world" && selectCountry(c.code));
  });
  let TOP3 = new Set();
  let ordered = null,
    orderedFor = "";
  /* the chosen city's name, written in white on the wine land at the foot of its column */
  const engraveCv = document.createElement("canvas");
  engraveCv.width = 1024;
  engraveCv.height = 256;
  const engraveTex = new THREE.CanvasTexture(engraveCv);
  engraveTex.colorSpace = THREE.SRGBColorSpace;
  engraveTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const engrave = new THREE.Group();
  const engraveM = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 0.9),
    new THREE.MeshBasicMaterial({ map: engraveTex, transparent: true, depthWrite: false }),
  );
  engraveM.rotation.x = -Math.PI / 2;
  engraveM.position.z = 2.5; // beyond the outer ring of children
  engraveM.renderOrder = 2;
  engrave.add(engraveM);
  country.add(engrave);
  let engraved = "";
  function engraveCity() {
    const o = pillars.find((p) => p.c.id === S.city);
    if (!o) return;
    engrave.position.set(o.g.position.x, 0.86, o.g.position.z); // above the stepped tiers
    if (engraved === o.c.ar) return;
    engraved = o.c.ar;
    const x = engraveCv.getContext("2d");
    x.clearRect(0, 0, 1024, 256);
    x.direction = DIR;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = `700 132px "${DISPLAY}", serif`;
    x.shadowColor = "rgba(0,0,0,0.65)";
    x.shadowOffsetY = 4;
    x.shadowBlur = 10;
    x.fillStyle = "#f6efe2";
    x.fillText(o.c.ar, 512, 128);
    engraveTex.needsUpdate = true;
  }
  function refreshLabels() {
    engraveCity();
    TOP3 = new Set(
      [...CITIES]
        .sort((a, b) => gapOf(b) - gapOf(a))
        .slice(0, 3)
        .map((c) => c.id),
    );
    renderLegend();
    labels.forEach((l) => {
      if (!l.globe) return;
      l.el.classList.toggle("hot", PICKED && l.globe === CO);
      l.el.classList.toggle("mine", mineCodes.has(l.globe.code));
    });
    orderedFor = ""; // the donor's countries keep their names first
    pillars.forEach((o) => {
      o.label.el.classList.toggle("hot", o.c.id === S.city);
      o.label.el.dir = DIR;
      // the donor's hall never shows the country model: its columns keep no name
      o.label.el.innerHTML = donor
        ? ""
        : demo
          ? T.country.label(o.c.ar, num(o.c.need))
          : `${o.c.ar} · ${num(gapOf(o.c))}`;
    });
  }
  const legend = $("#legend");
  function renderLegend() {
    const c = CITIES.find((x) => x.id === S.city);
    if (!legend || !c) return;
    legend.dir = DIR;
    const row = (t, n, w, of = true) =>
      `<li class="lg-${t}"><i aria-hidden="true"></i>${w}<b class="num">${fmt(n)}</b>${of ? `<small>/ <span class="num">${fmt(c.need)}</span></small>` : ""}</li>`;
    if (demo) {
      legend.innerHTML = `<p>${c.ar}</p><ul>${row("qualify", c.qualified, T.legend.enrolled)}${row("sponsor", c.sponsored, T.legend.sponsored, false)}${row("kiswa", c.clothed, T.legend.deliveries, false)}</ul>`;
      return;
    }
    const Lg = X?.legend;
    legend.innerHTML = Lg
      ? `<p>${c.ar}</p><ul>${row("qualify", c.qualified, Lg.qualify)}${row("sponsor", c.sponsored, Lg.sponsor)}${row("kiswa", c.clothed, Lg.kiswa)}</ul>`
      : "";
  }
  const cur = $("#cursor");
  on(window, "pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    cur.style.opacity = 1;
    gsap.to(cur, { x: e.clientX, y: e.clientY, duration: 0.35, ease: "power3.out" });
  });

  /* ── Picking ────────────────────────────────────────────────────── */
  const ray = new THREE.Raycaster(),
    ndc = new THREE.Vector2();
  let down = null,
    hoverScr = 0;
  function hit(e, objs) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objs, false)[0];
  }
  const pillarMeshes = () => pillars.flatMap((o) => [o.glass, o.fill]);
  on(canvas, "pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  on(canvas, "pointerup", (e) => {
    if (down && S.stage === "hall") {
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
        down = null;
        hallView(hallAt + (dx < 0 ? 1 : -1));
        return;
      }
    }
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
      down = null;
      return;
    }
    down = null;
    if (S.stage === "hall") {
      // the donor's hall has one place to read: every screen opens their impact on the world
      if (donor) {
        if (hit(e, [scrImpact.mesh, scrTracks.mesh, globeCore, scrMap.mesh])) enterWorld();
        return;
      }
      if (hit(e, [scrImpact.mesh])) return openImpactLog();
      if (hit(e, [scrTracks.mesh])) return openTracks();
      if (hit(e, [globeCore])) return enterWorld();
      if (hit(e, [scrMap.mesh])) return PICKED ? enterCountry() : enterWorld();
    }
    if (S.stage === "world") {
      const h = hit(
        e,
        gDots.filter((d) => shown(d.c)).map((d) => d.m),
      );
      if (h) return selectCountry(h.object.userData.code);
    }
    if (["country", "support"].includes(S.stage)) {
      const h = hit(e, pillarMeshes());
      if (h) selectCity(h.object.userData.city);
    }
  });
  on(canvas, "pointermove", (e) => {
    let on = false;
    if (S.stage === "hall") on = !!hit(e, [scrMap.mesh, scrImpact.mesh, scrTracks.mesh, globeCore]);
    else if (["country", "support"].includes(S.stage)) on = !!hit(e, pillarMeshes());
    hoverScr = S.stage === "hall" && on ? 1 : 0;
    cur.classList.toggle("on", on);
    canvas.style.cursor = on
      ? "pointer"
      : S.stage === "hall" || S.stage === "gate"
        ? "default"
        : "grab";
  });

  /* ── Framing: keep the subject in the free space beside the panels ─ */
  const panel = $("#panel"),
    impact = $("#impact");
  const view = { x: 0, y: 0, tx: 0, ty: 0 };
  function frameView() {
    const open = panel.classList.contains("on") && !root.classList.contains("focus");
    view.ty = PHONE() && open ? panel.offsetHeight / 2 : 0;
    if (PHONE()) {
      view.tx = 0;
      return;
    }
    const right = panel.classList.contains("on") ? panel.getBoundingClientRect().left : innerWidth;
    const left =
      !impact.hidden && impact.parentNode === root ? impact.getBoundingClientRect().right : 0;
    view.tx = innerWidth / 2 - (left + right) / 2;
  }
  function placeImpact() {
    if (PHONE()) {
      if (impact.parentNode !== panel) panel.appendChild(impact);
    } else if (impact.parentNode !== root) root.appendChild(impact);
    requestAnimationFrame(frameView);
  }

  /* ── DOM choreography ───────────────────────────────────────────── */
  const ORDER = ["hall", "world", "country", "support", "impact", "big"];
  let idle = 0;
  let legendRect = null,
    legendAt = 0;
  const hud = $("#hud");
  let hudB = 56,
    hudAt = -1e9;
  /* the bar's lower edge (it is shorter on phones), re-measured now and then */
  const hudBottom = () => {
    const now = performance.now();
    if (hud && now - hudAt > 1000) {
      hudB = hud.offsetHeight || 56;
      hudAt = now;
    }
    return hudB;
  };
  const legendBox = () => {
    if (!root.classList.contains("in-country") || !legend) return null;
    const now = performance.now();
    if (now - legendAt > 500) {
      legendRect = legend.getBoundingClientRect();
      legendAt = now;
    }
    return legendRect;
  };
  /* on wide screens the glass covers the right third: shift the framing so the model sits in the open space */
  function frameForPanel() {
    const wide = innerWidth > 760 && !root.classList.contains("focus");
    // the impact moment has glass on both sides, so it stays centred
    const inCo = ["country", "support"].includes(S.stage);
    controls.setFocalOffset(wide && inCo ? -1.6 : 0, 0, 0, true);
  }
  function setStage(s) {
    if (s !== "country") {
      TIME.play?.kill();
      if (TIME.snap || (demo && TIME.m)) setTime(0); // support and payment always work on today's numbers
    }
    root.classList.toggle("at-country", s === "country");
    S.stage = s;
    root.dataset.stage = s; // the bar shows only what belongs to the stage (hall.css)
    dimScreens(s === "hall" || s === "gate" ? 1 : 0.32); // the globe owns the frame elsewhere
    // the shaft of light from the oculus thins when the globe stands in it (no milky aura)
    gsap.to(rays.material.uniforms.uI, {
      value: s === "world" || s === "big" ? 0.04 : 0.14,
      duration: 1.6,
      overwrite: true,
    });
    if (dof && s !== "impact" && s !== "impactPending" && s !== "support")
      gsap.to(dof.cocMaterial, { worldFocusRange: 9, duration: 1.2, overwrite: true });
    queueMicrotask(frameForPanel);
    root.classList.toggle(
      "in-country",
      ["country", "support", "impact", "impactPending"].includes(s),
    );
    idle = 0;
    root.classList.toggle("in-hall", s === "hall");
    root.querySelectorAll("#steps li").forEach((li) => {
      const i = ORDER.indexOf(li.dataset.s),
        j = ORDER.indexOf(s);
      li.classList.toggle("on", i === j);
      li.classList.toggle("done", i < j);
    });
    gsap.fromTo("#steps li.on", { scale: 0.86 }, { scale: 1, duration: 0.6, ease: "back.out(2)" });
    tellStage();
  }
  /* the page keeps the browser's history in step with the stage (`@/lib/hall/history`); the film
     walks the stages by itself, so it reports only where it stopped */
  function tellStage() {
    if (!FILM && !disposed) onStage?.(S.stage);
  }
  function hint(t) {
    const h = $("#hint");
    if (!t) {
      gsap.to(h, { autoAlpha: 0, y: 10, duration: 0.3 });
      return;
    }
    h.textContent = t;
    h.dir = DIR;
    gsap.fromTo(
      h,
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out", delay: 0.2 },
    );
  }
  function countUp(root) {
    root.querySelectorAll("[data-count]").forEach((el) => {
      const end = +el.dataset.count,
        suf = el.dataset.suf || "",
        o = { v: +el.dataset.from || 0 };
      gsap.to(o, {
        v: end,
        duration: 1.4,
        ease: "power3.out",
        onUpdate: () => (el.textContent = fmt(o.v) + suf),
      });
    });
  }
  function reveal(root, delay = 0) {
    const items = root.querySelectorAll(":scope > *");
    gsap.fromTo(
      items,
      { autoAlpha: 0, y: 18, filter: "blur(6px)" },
      {
        autoAlpha: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.75,
        stagger: 0.06,
        ease: "power3.out",
        delay,
        clearProps: "filter",
      },
    );
  }
  let swapping = false,
    readyQueue = [];
  /* run fn once the panel holds the newest content (a fixed delay raced the swap on slower phones) */
  function onPanel(fn) {
    if (swapping) readyQueue.push(fn);
    else requestAnimationFrame(() => fn());
  }
  function showPanel(html, dir) {
    // every hall's panels read in the interface language
    panel.dir = dir ?? DIR;
    const first = !panel.classList.contains("on");
    swapping = true;
    readyQueue = [];
    const swap = () => {
      panel.innerHTML = html;
      panel.scrollTop = 0;
      panel.classList.add("on");
      swapping = false;
      const q = readyQueue;
      readyQueue = [];
      q.forEach((f) => f());
      if (first)
        gsap.fromTo(
          panel,
          {
            autoAlpha: 0,
            x: PHONE() ? 0 : 40,
            y: PHONE() ? 40 : 0,
            clipPath: "inset(0 0 100% 0 round 28px)",
          },
          {
            autoAlpha: 1,
            x: 0,
            y: 0,
            clipPath: "inset(0 0 0% 0 round 28px)",
            duration: 0.9,
            ease: "expo.out",
          },
        );
      reveal(panel, first ? 0.2 : 0);
      countUp(panel);
      placeImpact();
    };
    if (first) swap();
    else
      gsap.to(panel.children, {
        autoAlpha: 0,
        y: -10,
        duration: 0.25,
        stagger: 0.02,
        ease: "power2.in",
        onComplete: swap,
      });
  }
  function hidePanel() {
    gsap.to(panel, {
      autoAlpha: 0,
      y: 20,
      duration: 0.5,
      ease: "power2.in",
      onComplete: () => {
        panel.classList.remove("on");
        gsap.set(panel, { clearProps: "all" });
        frameView();
      },
    });
  }
  function showImpact(html, flashKey) {
    impact.dir = DIR;
    const was = impact.hidden;
    impact.hidden = false;
    impact.innerHTML = html;
    placeImpact();
    if (was)
      gsap.fromTo(
        impact,
        { autoAlpha: 0, y: 30, scale: 0.97 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.8, ease: "expo.out" },
      );
    if (flashKey)
      gsap.fromTo(
        impact.querySelectorAll(".chain b"),
        { color: "#fff4d6", textShadow: "0 0 18px rgba(233,201,131,.9)" },
        { color: "#f6efe2", textShadow: "0 0 0 rgba(0,0,0,0)", duration: 0.9, stagger: 0.05 },
      );
  }
  function hideImpact() {
    if (impact.hidden) return;
    gsap.to(impact, {
      autoAlpha: 0,
      y: 20,
      duration: 0.4,
      onComplete: () => {
        impact.hidden = true;
        gsap.set(impact, { clearProps: "all" });
        frameView();
      },
    });
  }

  /* ── The emblem: the gate's mark in real 3D, laid over the flat one once it can be drawn.
     The flat SVG paints first and stays the mark on the light tier and wherever the emblem
     cannot be drawn; it is also what opens as the door, so entry hands back to it. ── */
  const markEl = $("#gate .mark");
  const emblem =
    mark && markEl && !LOW
      ? createEmblem({ renderer, art: mark, environment: scene.environment, still: RM })
      : null;
  const emblemAt = { x: 0, y: 0, on: false, drawn: -1 };
  function sizeEmblem() {
    if (!emblem) return;
    emblem.setSize(markEl.offsetWidth * (1 + emblem.pad * 2), renderer.getPixelRatio());
    if (emblemAt.on && RM) emblem.render(0);
  }
  if (emblem) {
    emblem.canvas.className = "mark-3d";
    emblem.canvas.setAttribute("aria-hidden", "true");
    emblem.canvas.style.setProperty("--pad", String(emblem.pad));
    markEl.appendChild(emblem.canvas);
    sizeEmblem();
    // after the flat mark has drawn itself (hall.css), and only once a frame has really been drawn
    gsap.delayedCall(RM ? 0.2 : 2.4, () => {
      if (S.stage !== "gate" || !emblem.render(clock.elapsedTime)) return;
      emblemAt.on = true;
      root.classList.add("mark-3d-on");
    });
    on(window, "pointermove", (e) => {
      if (!emblemAt.on || e.pointerType !== "mouse") return;
      const r = markEl.getBoundingClientRect();
      emblemAt.x = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (innerWidth / 2)));
      emblemAt.y = Math.max(
        -1,
        Math.min(1, (e.clientY - r.top - r.height / 2) / (innerHeight / 2)),
      );
    });
  }

  /* ── Gate: the two-fingers mark is drawn, the words rise, then the mark opens like a door ── */
  const words = $("#gate h1").textContent.trim().split(/\s+/);
  $("#gate h1").innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(" ");
  // the words rise in CSS (hall.css, g-rise) on wall-clock time, after the mark has been written
  gsap.to(doorGlow, { intensity: 40, duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 });

  /* ── Direction: authored camera paths, optional sound, film mode ── */
  const sound = createSound();
  const focusBtn = $("#focusBtn");
  on(focusBtn, "click", () => {
    const v = root.classList.toggle("focus");
    frameForPanel();
    frameView();
    focusBtn.setAttribute("aria-pressed", String(v));
    focusBtn.textContent = v ? HC.focus.on : HC.focus.off;
  });
  const soundBtn = $("#soundBtn");
  on(soundBtn, "click", async () => {
    const v = await sound.toggle();
    soundBtn.setAttribute("aria-pressed", String(v));
    soundBtn.textContent = v ? HC.sound.on : HC.sound.off;
  });
  /** a camera move along a spline (position and look-at), driven by one GSAP tween */
  function flyPath(points, targets, duration, ease = "power2.inOut") {
    const pc = new THREE.CatmullRomCurve3(points, false, "centripetal"),
      tc = new THREE.CatmullRomCurve3(targets, false, "centripetal");
    const o = { t: 0 },
      P = new THREE.Vector3(),
      T = new THREE.Vector3();
    return gsap.to(o, {
      t: 1,
      duration,
      ease,
      onUpdate: () => {
        pc.getPoint(o.t, P);
        tc.getPoint(o.t, T);
        controls.setLookAt(P.x, P.y, P.z, T.x, T.y, T.z, false);
      },
    });
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  /* the visitor stays in control: touching the scene ends an authored move where it stands */
  let flight = null;
  const takeOver = () => {
    if (flight && controls.enabled) flight.kill();
    flight = null;
  };
  on(canvas, "pointerdown", takeOver);
  on(canvas, "wheel", takeOver, { passive: true });
  function hallPose(i) {
    const at = (i + VIEWS.length) % VIEWS.length,
      g = VIEWS[at].group,
      p = g.getWorldPosition(new THREE.Vector3()),
      w = at === 1 ? 9 : 6;
    const dir = new THREE.Vector3(p.x, 0, p.z).normalize();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    /* the first view is the room, not a slide: on a wide screen the camera stands back so the
       arches frame the map and the globe on its stand sits in front of it (the thing to touch);
       the side screens stay close, as reading views. A narrow screen already stands back. */
    const wide = at === 1 && camera.aspect > 1.15;
    const d = wide ? 18.4 : Math.min(24, Math.max(10, (w / 2 + 0.7) / half));
    const cam = p.clone().sub(dir.multiplyScalar(d));
    cam.y = wide ? 4.9 : 5.2;
    const target = wide ? p.clone().setY(3.9) : p;
    return { cam, target, focus: wide ? V(0, 4, -10.6) : p }; // between the globe and the map
  }
  let FILM = false;
  const caption = (t) => {
    const c = $("#caption");
    if (!c) return;
    if (!t) return gsap.to(c, { autoAlpha: 0, duration: 0.5 });
    gsap.to(c, {
      autoAlpha: 0,
      duration: 0.25,
      onComplete: () => {
        c.textContent = t;
        gsap.fromTo(
          c,
          { autoAlpha: 0, y: 10, filter: "blur(6px)" },
          {
            autoAlpha: 1,
            y: 0,
            filter: "blur(0px)",
            duration: 0.9,
            ease: "expo.out",
            clearProps: "filter",
          },
        );
      },
    });
  };
  let filmRun = 0; // a stopped film never resumes: a later run cannot wake an earlier loop
  function stopFilm() {
    if (!FILM) return;
    FILM = false;
    filmRun++;
    root.classList.remove("film");
    caption("");
    tellStage();
    if (demo) trialRefresh(); // the film wrote nothing: back to what the stores really hold
  }
  on(
    root,
    "pointerdown",
    (e) => {
      if (FILM && !e.target.closest("#film")) stopFilm();
    },
    true,
  );
  async function film() {
    if (FILM || donor || S.stage !== "gate") return;
    const run = ++filmRun;
    FILM = true;
    root.classList.add("film");
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    /* the live film's captions, in the interface language; it names its sample data and its
       simulated payment as such. The trial's film reads its own captions below. */
    const F = X?.film,
      tirana = LX ? LX.regionName(regionsFor(byCode("AL")).find((r) => r.id === "tirana")) : "";
    const live = [
      [() => enterHall(), F?.hall, 5200],
      [() => enterWorld(), F?.network(fmt(SITES)), 4600],
      [() => selectCountry("AL"), F?.pick(coName(byCode("AL"))), 4200],
      [() => enterCountry(), F?.enter, 7000],
      [
        () => {
          S.track = "qualify";
          S.amount = AMOUNTS.initial;
          setStage("support");
          selectCity("tirana");
        },
        F?.support(tirana, LX?.money(AMOUNTS.initial)),
        5200,
      ],
      [() => pay(), F?.flow(tirana), 5200],
      [() => {}, F?.levels, 14000],
      [() => enterBig(), F?.close, 7000],
    ];
    /* the trial's film walks the same stages on the trial catalogue: a monthly qualification
       pledge for Tirana, shown and never recorded */
    const steps = demo
      ? live.map(([act, , ms], i) => [
          i === 4
            ? () => {
                S.kind = "qualification";
                S.amount = demo.amounts.initial;
                setStage("support");
                selectCity("tirana");
              }
            : act,
          T.film[i],
          ms,
        ])
      : live;
    for (const [act, text, ms] of steps) {
      if (!FILM || run !== filmRun || disposed) return;
      caption(text);
      act();
      await wait(ms);
    }
    stopFilm();
  }
  on($("#film"), "click", () => film());

  function enterHall() {
    if (S.stage !== "gate") return;
    gateShut = false; // the door is opening: the hall behind it draws every frame again
    sound.cue("door");
    const tl = gsap.timeline();
    const end = hallPose(1);
    // the two fingers are the key and the disc the door: the two slots fill with light and draw
    // together into one opening, the seam runs down to the rim, the disc parts along it as two
    // leaves, the light behind floods through, and the camera goes in
    // the flat mark is the door: the emblem hands back to it before it opens
    emblemAt.on = false;
    root.classList.remove("mark-3d-on");
    const gateMark = $("#gate .mark");
    if (gateMark) {
      // the idle float would override gsap's transform: stop it where it is, and settle from there
      const lift = new DOMMatrixReadOnly(getComputedStyle(gateMark).transform).m42;
      gateMark.style.animation = "none";
      gsap.set(gateMark, { y: lift });
    }
    const glow = $("#gate .k-glow");
    if (glow) {
      // the idle breath hands over to the timeline from wherever it is
      const at = getComputedStyle(glow).opacity;
      glow.style.animation = "none";
      glow.style.opacity = at;
    }
    if (window.__HALL_TEST) window.__hallGate = tl; // automated checks pause and seek it
    // slot geometry in the slot's own frame (KahataynMark MARK2_SLOTS): the bands meet on MID
    const MID = 19.29;
    const W = 19.08;
    const N = { x: 0.8387, y: 0.5446 }; // across the slot: the way the leaves part
    const PART = 132;
    tl.to("#gate > div > :not(.mark)", { autoAlpha: 0, y: 12, duration: 0.45, ease: "power2.in" })
      .to("#gate .mark", { scale: 1.05, y: 0, duration: 1, ease: "power2.out" }, 0)
      .to("#gate .k-glow", { opacity: 1, duration: 0.4, ease: "power2.out" }, 0)
      .set("#gate .k-lume", { opacity: 1 }, 0.05)
      .fromTo(
        "#gate .mark-flood",
        { opacity: 0, scale: 0.66 },
        { opacity: 0.32, scale: 0.86, duration: 0.8, ease: "power2.inOut" },
        0.15,
      )
      // side by side → joined: the two fingers come level and close into one opening
      .to(
        "#gate .k-slot-a",
        { attr: { x: MID - W, width: W + 5 }, duration: 0.62, ease: "power3.inOut" },
        0.32,
      )
      .to(
        "#gate .k-slot-b",
        { attr: { x: MID - 5, width: W + 5, height: 176 }, duration: 0.62, ease: "power3.inOut" },
        0.32,
      )
      // a champagne hairline runs down each door edge, ahead of the opening
      .to("#gate .k-edge", { strokeDashoffset: 0, duration: 0.5, ease: "power2.inOut" }, 0.7)
      // the one opening runs down to the rim, and the door is two leaves
      .to("#gate .k-slot", { attr: { height: 290 }, duration: 0.34, ease: "power2.in" }, 0.94)
      .to("#gate .k-glow", { opacity: 0, duration: 0.4, ease: "power1.in" }, 0.96)
      .to(
        "#gate .mark-flood",
        { opacity: 1, scale: 1.02, duration: 0.34, ease: "power1.out" },
        0.95,
      )
      .to(
        "#gate .k-leaf-a",
        { x: -N.x * PART, y: -N.y * PART, duration: 1.0, ease: "power3.inOut" },
        1.08,
      )
      .to(
        "#gate .k-leaf-b",
        { x: N.x * PART, y: N.y * PART, duration: 1.0, ease: "power3.inOut" },
        1.08,
      )
      .to("#gate .mark", { scale: 2.3, duration: 1.0, ease: "power2.in" }, 1.1)
      .to("#gate .mark-flood", { scale: 15, duration: 0.62, ease: "power2.in" }, 1.24)
      .to("#gate .k-leaf", { opacity: 0, duration: 0.34, ease: "power1.in" }, 1.52)
      .to("#gate", { autoAlpha: 0, duration: 0.8, ease: "power2.inOut" }, 1.72)
      .add(() => $("#gate").classList.add("gone"))
      .to(doorGlow, { intensity: 260, duration: 0.8, ease: "power2.in" }, 0.2)
      .to(bloom, { intensity: 1.8, duration: 1.2, ease: "power2.in" }, 0.6)
      .to(bloom, { intensity: BLOOM, duration: 1.6, ease: "power2.out" }, 1.8)
      .to(doorGlow, { intensity: 0, duration: 1.6 }, 2.2)
      .add(() => {
        // through the doorway on a gentle arc, settling on the map screen
        flyPath(
          [camera.position.clone(), V(0.9, 3.3, 24), V(-0.7, 3.9, 16.5), V(0.4, 4.6, 11), end.cam],
          [
            V(0, 4.5, 0),
            V(0, 4.8, -2),
            V(0, 5.4, -8),
            end.target.clone().add(V(0, -0.4, 0)),
            end.target,
          ],
          2.9,
          "power2.inOut",
        );
      }, 0.8)
      .to(focus, { z: -13, duration: 2.5, ease: "power2.inOut" }, 0.9)
      .add(() => {
        controls.smoothTime = 0.55;
        setStage("hall");
        hallView(1, false);
        if (demo?.focus && !FILM) {
          replayStep(0.8, demoFocus);
          return;
        }
        if (donor) {
          // the donor lands on their own impact: the world, turned to their first country
          replayStep(0.8, enterWorld);
          return;
        }
        if (startCountry() && !FILM) {
          replayStep(0.8, startFocus);
          return;
        }
        if (!PHONE()) hint(PICKED ? HC.hint.hallAgain(coName()) : HC.hint.hall);
      }, 3.8);
  }
  on($("#enter"), "click", () => enterHall());
  focus.set(0, 4, 17.6);

  /* ── Into the country: push in, flash, rise ─────────────────────── */
  function enterCountry() {
    if (donor) return; // the donor's hall holds no simulated country to enter
    if (demo && !trialCo()) return; // the trial enters only the countries its catalogue holds
    hint("");
    const fromWorld = S.stage === "world";
    sound.cue("dive");
    buildCountry();
    const tl = (MOVING = gsap.timeline());
    if (fromWorld) {
      hidePanel();
      globe.updateMatrixWorld();
      const p = selDot().getWorldPosition(new THREE.Vector3()),
        dir = p.clone().sub(globe.position).normalize(),
        c = p.clone().add(dir.multiplyScalar(2.4));
      tl.add(() => {
        controls.smoothTime = 0.8;
        controls.setLookAt(c.x, c.y, c.z, p.x, p.y, p.z, true);
      }, 0).to(
        globe.scale,
        { x: 0.001, y: 0.001, z: 0.001, duration: 0.5, ease: "power3.in" },
        0.95,
      );
    } else {
      const face = faceY(CO);
      let ry = globe.rotation.y % (Math.PI * 2);
      globe.rotation.y = ry;
      tl.to(
        globe.rotation,
        {
          y: face + Math.round((ry - face) / (Math.PI * 2)) * Math.PI * 2,
          duration: 0.9,
          ease: "power3.inOut",
        },
        0,
      )
        .to(globe.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.8, ease: "power3.in" }, 0.7)
        .to(pedestal.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.7, ease: "power3.in" }, 0.7)
        .add(() => {
          controls.smoothTime = 0.9;
          controls.setLookAt(0, 6, -7.2, 0, 6, -13.2, true);
        }, 0);
    }
    tl.add(() => {}, 0)
      .to(ca.offset, { x: 0.0016, y: 0.0012, duration: 1.1, ease: "power2.in" }, 0)
      .to(bloom, { intensity: 1.9, duration: 1.1, ease: "power3.in" }, 0.15)
      .to("#veil", { opacity: 1, duration: 0.5, ease: "power2.in" }, 0.85)
      .add(() => {
        country.visible = true;
        screens.forEach((s) => (s.group.visible = false));
        pillars.forEach((o) => {
          o.rise = 0;
          layoutPillar(o);
        });
        landGroup.scale.set(1, 0.001, 1);
        plinth.scale.set(0.2, 1, 0.2);
        plinthRing.scale.set(0.2, 0.2, 0.2);
        controls.setLookAt(6.5, 16, 12.5, 0, 0.8, 0, false);
        controls.smoothTime = 1.6;
        controls.setLookAt(5.4, 12.6, 10.2, 0, 0.8, 0, true);
        focus.set(0, 1.5, 0);
        controls.enabled = true;
        setStage("country");
      })
      .to("#veil", { opacity: 0, duration: 1.2, ease: "power2.out" })
      .to(ca.offset, { x: 0.0004, y: 0.0003, duration: 1.2, ease: "power2.out" }, "<")
      .to(bloom, { intensity: BLOOM, duration: 1.4, ease: "power2.out" }, "<")
      .to(plinth.scale, { x: 1, z: 1, duration: 1.2, ease: "expo.out" }, "<")
      .to(plinthRing.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: "expo.out" }, "<")
      .to(landGroup.scale, { y: 1, duration: 1.1, ease: "back.out(1.6)" }, "<0.35")
      .to(
        pillars,
        {
          rise: 1,
          duration: 1.2,
          ease: "expo.out",
          stagger: 0.07,
          onUpdate: () => pillars.forEach(layoutPillar),
        },
        "<0.4",
      )
      .add(() => {
        controls.smoothTime = 0.55;
        renderCountry();
      }, "<0.2");
  }

  /* ── The world: the network in front of you, pick a country ────── */
  function enterWorld() {
    cancelReplay();
    sound.cue("whoosh");
    setStage("world");
    hint("");
    controls.enabled = true;
    markLand();
    markArcs();
    refreshLabels();
    gsap.to(pedestal.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.7, ease: "power3.in" });
    gsap.to(globe.position, { x: 0, y: 5.4, z: 0, duration: 1.8, ease: "expo.inOut" });
    gsap.to(globe.scale, { x: 1, y: 1, z: 1, duration: 1.8, ease: "expo.inOut" });
    const fy = faceY(PICKED ? CO : byCode("SA"));
    gsap.to(globe.rotation, {
      x: 0.3,
      y: fy + Math.round((globe.rotation.y - fy) / (Math.PI * 2)) * Math.PI * 2,
      duration: 1.8,
      ease: "expo.inOut",
    });
    {
      // a slow eased arc out to the world, not a straight pull; a touch takes the camera back
      const c0 = camera.position.clone(),
        t0 = controls.getTarget(new THREE.Vector3()),
        c1 = V(0, 7.4, 14.2),
        t1 = V(0, 5.4, 0);
      if (RM || c0.distanceTo(c1) < 0.5)
        controls.setLookAt(c1.x, c1.y, c1.z, t1.x, t1.y, t1.z, true);
      else
        flight = flyPath(
          [
            c0,
            c0
              .clone()
              .lerp(c1, 0.5)
              .add(V(1.5, 0.7, 0)),
            c1,
          ],
          [t0, t0.clone().lerp(t1, 0.6), t1],
          2.4,
          "power2.inOut",
        );
    }
    gsap.to(focus, { x: 0, y: 5.4, z: 0, duration: 2, ease: "power2.inOut" });
    arcs.forEach((a, i) => {
      const o = { n: 0 };
      gsap.to(o, {
        n: 65,
        duration: 1.2,
        delay: 0.8 + i * 0.03,
        ease: "power2.out",
        onUpdate: () => a.geo.setDrawRange(0, Math.round(o.n)),
      });
    });
    renderWorld();
    if (donor) donorFocus();
  }
  /** turns the globe to the country the donor's hall lands on: the one they were looking at on
      the pages when it is theirs, else their first; once, and any touch cancels it */
  let donorLanded = false;
  function donorFocus(rerender) {
    if (rerender) renderWorld();
    if (donorLanded || !MINE) return;
    donorLanded = true;
    const code = start && mineCodes.has(start) ? start : MINE.start;
    if (code && byCode(code)) replayStep(1.6, () => S.stage === "world" && selectCountry(code));
  }
  function selectCountry(code) {
    sound.cue("tick");
    if (!byCode(code)) return; // a country the hall's globe does not draw
    OFF = null;
    CO = byCode(code);
    PICKED = true;
    markLand();
    markArcs();
    refreshLabels();
    globe.updateMatrixWorld();
    const p = selDot().getWorldPosition(new THREE.Vector3()),
      dir = p.clone().sub(globe.position).normalize();
    const cam = globe.position.clone().add(dir.multiplyScalar(12.8));
    cam.y = Math.max(cam.y + 1.4, 1.5);
    controls.smoothTime = 0.9;
    controls.setLookAt(
      cam.x,
      cam.y,
      cam.z,
      globe.position.x,
      globe.position.y,
      globe.position.z,
      true,
    );
    renderWorld();
  }
  function drawShape(cv, co) {
    const x = cv.getContext("2d"),
      w = cv.width,
      h = cv.height,
      s = Math.min(w, h) * 0.43,
      ox = w / 2,
      oy = h / 2;
    x.clearRect(0, 0, w, h);
    const path = () => {
      x.beginPath();
      co.rings.forEach((r) => {
        r.forEach(([a, b], i) => x[i ? "lineTo" : "moveTo"](ox + a * s, oy - b * s));
        x.closePath();
      });
    };
    x.save();
    x.shadowColor = "rgba(255,255,255,.28)";
    x.shadowBlur = 26;
    path();
    const g = x.createLinearGradient(0, oy - s, 0, oy + s);
    g.addColorStop(0, "#6b1d2f");
    g.addColorStop(1, "#2b0b14");
    x.fillStyle = g;
    x.fill();
    x.restore();
    path();
    x.strokeStyle = "#f6efe2";
    x.lineWidth = 2;
    x.stroke();
    (donor ? [] : demo ? trialColumns(co) : regionsFor(co)).forEach((c) => {
      x.beginPath();
      x.arc(ox + c.nx * s, oy - c.ny * s, 4 + c.need / 14, 0, Math.PI * 2);
      x.fillStyle = "rgba(243,227,181,.85)";
      x.fill();
    });
  }
  /**
   * the trial's country card. It leads with the country and what the visitor can do there (the
   * catalogue's own counts, then «ادخل»); what the organisation has there comes last, as one
   * plain line by its status. Every country the hall draws is in the catalogue.
   */
  function trialCard() {
    const t = trialCo(),
      name = coName(),
      W = T.world,
      kid = t?.regions.flatMap((r) => r.kids)[0];
    return `<article class="co-card">
      <div class="co-head"><div><h3>${name}</h3><span class="st">${T.sample}</span></div><canvas id="coShape" width="520" height="300" aria-label="${name}"></canvas></div>
      ${
        t
          ? `<p class="co-line" dir="${DIR}">${W.lead}</p>
      <div class="kv" dir="${DIR}">
        <div><dt>${W.regions}</dt><dd>${t.regions.map((r) => r.ar).join(DIR === "rtl" ? "، " : ", ")}</dd></div>
        <div><dt>${T.withFile}</dt><dd class="num">${fmt(t.children)}</dd></div>
        <div><dt>${W.group}</dt><dd>${t.group.name}</dd></div>
        <div><dt>${W.kid}</dt><dd>${kid ? W.kidLine(kid.name, kid.code) : ""}</dd></div>
      </div>
      <p class="note" dir="${DIR}">${W.note}</p>
      <p class="co-act" dir="${DIR}">${W.org[CO.st]}</p>
      <div class="row pin"><button class="cta" type="button" id="enterCo">${W.enter(name)}</button><button class="ghost" type="button" id="toHall">${W.back}</button></div>`
          : `<div class="row pin"><a class="cta" href="${demo.mapHref}">${W.more}</a><button class="ghost" type="button" id="toHall">${W.back}</button></div>`
      }
    </article>`;
  }
  function cardHTML() {
    if (demo) return trialCard();
    /* the share funded is the country stage's own figure (`countryFigures`): one computation
       for the card and the panel, so the two can never disagree */
    const f = countryFigures(CO, regionsOf(CO)).card,
      Cd = X.card,
      name = coName();
    return `<article class="co-card">
      <div class="co-head"><div><h3>${name}</h3><span class="st ${CO.st}">${HC.status[CO.st]}</span></div><canvas id="coShape" width="520" height="300" aria-label="${Cd.shape(name)}"></canvas></div>
      ${CO.type ? `<p class="co-line"><b>${LX.pick(CO.type)}</b>${CO.city ? ` · ${LX.pick(CO.city)}` : ""}</p>` : `<p class="co-line">${Cd.noPresence}</p>`}
      ${CO.act ? `<p class="co-act">${LX.pick(CO.act)}<small> · ${Cd.research}</small></p>` : ""}
      <div class="kv">
        <div><dt>${Cd.groups}</dt><dd class="num">${fmt(f.groups)}</dd></div>
        <div><dt>${Cd.inQualification}</dt><dd class="num">${fmt(f.inQualification)}</dd></div>
        <div><dt>${Cd.funded}</dt><dd class="num">${fmt(f.funded)}%</dd></div>
        <div><dt>${Cd.supervisors}</dt><dd class="num">${fmt(f.supervisors)}</dd></div>
      </div>
      <p class="note">${SAMPLE} ${LINKED.has(CO.code) ? Cd.noteLinked(name) : CO.code === "AL" ? Cd.noteDemo(name) : Cd.noteSim(name)}</p>
      <div class="row pin"><button class="cta" type="button" id="enterCo">${Cd.enter(name)}</button><button class="ghost" type="button" id="toHall">${Cd.back}</button></div>
    </article>`;
  }
  /** a country of the donor's that the globe does not draw, opened in the panel (it has no marker) */
  let OFF = null;
  /** the donor's panel: their own figures and countries, and the ways on to the real pages */
  function donorWorld() {
    const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const ways = `<div class="row"><a class="cta" href="/orphans">${MINE?.impact.children.length ? D.another : D.start}</a><a class="ghost" href="/dashboard">${D.dashboard}</a></div>
      <div class="row"><button class="ghost" type="button" id="toHall">${D.back}</button></div>`;
    const head = `<h2>${D.title}</h2>`;
    let body;
    if (MINE === undefined) body = `<p class="sub">${D.loading}</p>`;
    else if (!MINE) body = `<p class="sub">${D.unavailable}</p>${ways}`;
    else if (!MINE.impact.children.length)
      body = `<article class="co-card empty"><h3>${D.emptyTitle}</h3><p class="co-line">${D.empty}</p></article>${ways}`;
    else {
      const off = OFF ? mineAt(OFF) : null;
      const here = off ?? (PICKED ? mineAt(CO.code) : null);
      const hereName = off ? i18n.countryName(off.code) : coName();
      const card = !(PICKED || off)
        ? ""
        : here
          ? `<article class="co-card"${off ? ' data-off-card=""' : ""}><div class="co-head"><div><h3>${D.card(hereName)}</h3><span class="st">${here.inCare ? D.inCountry(here.inCare) : D.ended}</span></div>${off ? "" : `<canvas id="coShape" width="520" height="300" aria-label="${hereName}"></canvas>`}</div>${off ? `<p class="co-line">${D.offGlobeCard}</p>` : ""}
            <ul class="kids">${here.children
              .map(
                (k) =>
                  `<li class="${k.active ? "mine" : ""}"><span><b>${esc(k.name)}</b><small>${k.active ? D.childLine(D.monthsOf(k.months), `<span class="num">${esc(k.share)}</span>`) : D.endedLine(D.monthsOf(k.months))}</small></span><a class="ghost" href="${esc(k.href)}">${D.open}</a></li>`,
              )
              .join("")}</ul></article>`
          : `<article class="co-card empty"><h3>${coName()}</h3><p class="co-line">${D.elsewhere}</p></article>`;
      body = `<p class="sub"><span class="src real">${D.tag}</span> ${D.sub}</p>
      <div class="kpis">${donorStats()
        .map(([v, l]) => `<div class="kpi"><b class="num">${v}</b><span>${l}</span></div>`)
        .join("")}</div>
      ${card}
      ${
        MINE.countries.length
          ? `<div class="sect">${D.countries}</div><div class="co-list">${MINE.countries
              .map((c) =>
                byCode(c.code)
                  ? `<button type="button" data-co="${c.code}" aria-pressed="${!OFF && PICKED && c.code === CO.code}"><i class="dot office"></i>${i18n.countryName(c.code)} · ${num(c.children.length)}</button>`
                  : `<button type="button" class="off-globe" data-off="${c.code}" aria-pressed="${OFF === c.code}" title="${D.offGlobe}">${i18n.countryName(c.code)} · ${num(c.children.length)}</button>`,
              )
              .join("")}</div>`
          : ""
      }
      ${
        MINE.countries.some((c) => !byCode(c.code))
          ? `<p class="note">${D.offGlobe}: ${MINE.countries
              .filter((c) => !byCode(c.code))
              .map((c) => i18n.countryName(c.code))
              .join(LTR ? ", " : "، ")}</p>`
          : ""
      }
      ${MINE.unplaced ? `<p class="note">${D.unplaced(MINE.unplaced)}</p>` : ""}
      ${ways}
      <p class="note">${D.note}</p>`;
    }
    showPanel(head + body);
    onPanel(() => {
      const cv = $("#coShape");
      if (cv && PICKED) drawShape(cv, CO);
      panel
        .querySelectorAll("[data-co]")
        .forEach((b) => b.addEventListener("click", () => selectCountry(b.dataset.co)));
      // a country the globe does not draw opens in the panel: its children, with no globe turn
      panel.querySelectorAll("[data-off]").forEach((b) =>
        b.addEventListener("click", () => {
          OFF = b.dataset.off;
          donorWorld();
          panel.querySelector(`[data-off="${OFF}"]`)?.focus();
        }),
      );
      $("#toHall")?.addEventListener("click", backToHall);
    });
    hint(PHONE() ? "" : D.hint);
  }
  function renderWorld() {
    if (donor) return donorWorld();
    const n = (st) => COUNTRIES.filter((c) => c.st === st).length,
      sim = CO.sim,
      // the trial shows every country, but only confirmed presence is counted as a site
      sites = COUNTRIES.filter((c) => (demo ? c.st !== "unconfirmed" : shown(c))).length - 1;
    const W = X?.world,
      groups = W
        ? [
            ["hq", W.groups.hq],
            ["office", W.groups.office],
            ["field", W.groups.field],
            ...(VIEW.all ? [["unconfirmed", W.groups.unconfirmed]] : []),
          ]
        : [];
    showPanel(`
    <h2>${HC.network.title}</h2>
    ${PICKED ? cardHTML() : `<article class="co-card empty"><h3>${HC.network.pick}</h3><p class="co-line">${HC.network.pickLine}</p></article>`}
    <p class="sub">${demo ? T.world.count(num(demo.codes.length), T.world.sites(sites), T.world.trialOnly(demo.codes.length - sites - 1)) : VIEW.all && W ? W.full(num(COUNTRIES.length - 1), num(n("unconfirmed"))) : HC.network.choose(num(sites))}${!demo && W ? ` ${SAMPLE} ${W.simNote}` : ""}</p>
    ${
      demo
        ? `<p class="sub" dir="${DIR}"><span class="src">${T.sample}</span> ${T.world.sub}</p>
    <div class="sect">${T.world.sect}</div><div class="co-list">${demo.codes
      .map(
        (code) =>
          `<button type="button" data-co="${code}" aria-pressed="${PICKED && code === CO.code}"${byCode(code).st === "unconfirmed" ? ` title="${T.world.unconfirmedMark}"` : ""}><i class="dot ${byCode(code).st}"></i>${coName(byCode(code))}</button>`,
      )
      .join("")}</div>
    <p class="sub" dir="${DIR}"><a href="${demo.mapHref}">${T.world.more}</a></p>`
        : ""
    }
    <div class="kpis ${VIEW.all ? "k4" : ""}">
      <div class="kpi"><b class="num" data-count="${n("hq")}">0</b><span>${HC.network.hq}</span></div>
      <div class="kpi"><b class="num" data-count="${n("office")}">0</b><span>${HC.network.offices}</span></div>
      <div class="kpi"><b class="num" data-count="${n("field")}">0</b><span>${HC.network.field}</span></div>
      ${VIEW.all && W ? `<div class="kpi"><b class="num" data-count="${n("unconfirmed")}">0</b><span>${W.unconfirmed}</span></div>` : ""}
    </div>
    ${
      VIEW.layer === "gap" && W
        ? `<p class="sub">${W.gapLead}</p>${["high", "medium", "data"]
            .map((t) => {
              const list = [...PRI.values()].filter((p) => p.tier === t);
              return list.length
                ? `<div class="sect">${W.tier[t]}</div><div class="co-list">${list.map((p) => `<button type="button" data-co="${p.code}" aria-pressed="${PICKED && p.code === CO.code}"><i class="dot gap-${t}"></i>${byCode(p.code) ? coName(byCode(p.code)) : p.code}</button>`).join("")}</div>`
                : "";
            })
            .join("")}`
        : ""
    }

    ${(demo || VIEW.layer === "gap" ? [] : groups)
      .map(
        ([st, name]) =>
          `<div class="sect">${name}</div><div class="co-list">${COUNTRIES.filter(
            (c) => c.st === st,
          )
            .map(
              (c) =>
                `<button type="button" data-co="${c.code}" aria-pressed="${c === CO}"><i class="dot ${c.st}"></i>${coName(c)}</button>`,
            )
            .join("")}</div>`,
      )
      .join("")}`);
    onPanel(() => {
      const cv = $("#coShape");
      if (cv && PICKED) drawShape(cv, CO);
      panel
        .querySelectorAll("[data-co]")
        .forEach((b) => b.addEventListener("click", () => selectCountry(b.dataset.co)));
      $("#enterCo")?.addEventListener("click", enterCountry);
      $("#toHall")?.addEventListener("click", backToHall);
      panel.querySelectorAll("[data-layer]").forEach((b) =>
        b.addEventListener("click", () => {
          VIEW.layer = b.dataset.layer;
          if (!shown(CO)) PICKED = false;
          markLand();
          markArcs();
          refreshLabels();
          renderWorld();
        }),
      );
      $("#toggleAll")?.addEventListener("click", () => {
        VIEW.all = !VIEW.all;
        if (!shown(CO)) PICKED = false;
        markLand();
        markArcs();
        refreshLabels();
        renderWorld();
      });
    });
    hint(PHONE() ? "" : HC.hint.world);
  }
  function backToWorld() {
    hideImpact();
    gsap.to(country.scale, {
      x: 0.001,
      y: 0.001,
      z: 0.001,
      duration: 0.8,
      ease: "power3.in",
      onComplete: () => {
        country.visible = false;
        country.scale.setScalar(1);
      },
    });
    globe.position.set(0, 5.4, 0);
    gsap.to(globe.scale, { x: 1, y: 1, z: 1, duration: 1.4, ease: "expo.out", delay: 0.4 });
    enterWorld();
  }

  function cityRows() {
    if (demo)
      return CITIES.map(
        (c) => `
    <li><button type="button" data-city="${c.id}" aria-pressed="${c.id === S.city}">
      <span><b>${c.ar}</b></span><small>${T.children(c.need)}</small>
      <span class="bar"><i style="width:${Math.round((c.qualified / c.need) * 100)}%"></i></span></button></li>`,
      ).join("");
    return [...CITIES]
      .sort((a, b) => gapOf(b) - gapOf(a))
      .map(
        (c) => `
    <li><button type="button" data-city="${c.id}" aria-pressed="${c.id === S.city}">
      <span><b>${c.ar}</b></span><small>${X.country.row(num(gapOf(c)), num(c.need))}</small>
      <span class="bar"><i style="width:${Math.round((c.qualified / c.need) * 100)}%"></i></span></button></li>`,
      )
      .join("");
  }
  function renderCountry() {
    const k = countryFigures(CO, CITIES).kpis, // the card's own computation (`./model`)
      AL = CO.code === "AL",
      N = X?.country,
      c = city();
    hideImpact();
    showPanel(
      demo
        ? trialCountryHtml(c)
        : `
    <h2>${N.title(coName(), N.now)}</h2>
    <p class="sub">${SAMPLE} ${HC.status[CO.st]}${CO.city ? ` · ${LX.pick(CO.city)}` : ""}. ${AL ? N.subCity : N.subRegion} ${AL ? N.sampleCity : N.sampleRegion}</p>
    <div class="kpis">
      <div class="kpi"><b class="num" data-count="${k.need}">0</b><span>${N.need}</span></div>
      <div class="kpi"><b class="num" data-count="${k.funded}" data-suf="%">0</b><span>${N.funded}</span></div>
      <div class="kpi"><b class="num" data-count="${k.waiting}">0</b><span>${N.waiting}</span></div>
    </div>
    ${liveHtml()}
    <div class="sect">${AL ? N.cities : N.regions}</div>
    <ul class="cities">${cityRows()}</ul>
    <div class="row"><button class="cta" type="button" id="toSupport">${N.support(c.ar)}</button><button class="ghost" type="button" id="otherCo">${N.other}</button></div>`,
      DIR,
    );
    onPanel(() => {
      panel
        .querySelectorAll("[data-city]")
        .forEach((b) => b.addEventListener("click", () => selectCity(b.dataset.city)));
      $("#toSupport")?.addEventListener("click", () => {
        setStage("support");
        renderSupport();
      });
      $("#otherCo")?.addEventListener("click", backToWorld);
    });
    hint(PHONE() ? "" : demo ? T.country.hint : X.country.hint);
    refreshLabels();
    layoutDots();
    if (TIME.m) setTime(TIME.m);
  }
  /* ── The fourth dimension: the country a year ago, today, and a year on at today's pace ──
     The past is reconstructed: each region reached today's numbers at its own steady rate. The
     future projects the country's monthly pace, shared by need. Both are labelled as estimates;
     support and payment always run on today's numbers (setStage restores them). */
  const tlRange = $("#tlRange"),
    tlOut = $("#tlOut"),
    tlPlay = $("#tlPlay");
  /** the trial's kinds, the country as the catalogue has it now, and the months as the pages say them */
  const trialWhen = (m) => (m === 0 ? T.today : m > 0 ? T.after(m) : T.before(-m));
  const trialKpis = (t = trialCo()) => [
    [t.children, T.withFile],
    [t.enrolled, T.enrolled],
    [t.deliveries, T.deliveries],
  ];
  function trialCountryHtml(c) {
    const t = trialCo();
    return `
    <h2>${T.country.title(t.name, trialWhen(TIME.shown))}</h2>
    <p class="sub"><span class="src">${T.sample}</span> ${T.country.sub}</p>
    <div class="kpis">${trialKpis(t)
      .map(
        ([v, l]) =>
          `<div class="kpi"><b class="num" data-count="${v}">0</b><span>${l}</span></div>`,
      )
      .join("")}</div>
    ${demoKidsHtml(c)}
    <div class="sect">${T.country.regions}</div>
    <ul class="cities">${cityRows()}</ul>
    <div class="row"><button class="cta" type="button" id="toSupport">${T.country.support(c.ar)}</button><button class="ghost" type="button" id="otherCo">${T.country.other}</button></div>`;
  }
  /** the columns and screens follow the trial model after any change to it */
  function trialRefresh() {
    trialSync();
    pillars.forEach((o) => {
      o.fillH = o.baseH = H(o.c.qualified);
      layoutPillar(o);
    });
    drawMap();
    drawImpactScreen();
    if (S.stage === "country") renderCountry();
    else refreshLabels();
  }
  if (demo)
    listeners.push(
      // a pledge or gift recorded on the pages (another tab, or this one) shows here at once
      demo.subscribe(() => {
        if (!TRIAL_MUTE && !FILM && !disposed) trialRefresh();
      }),
    );
  const timeLabel = (m) =>
    demo
      ? trialWhen(m)
      : !X
        ? ""
        : m === 0
          ? X.time.today
          : Math.abs(m) === 12
            ? m < 0
              ? X.time.yearAgo
              : X.time.yearOn
            : m < 0
              ? X.time.before(-m)
              : X.time.after(m);
  function setTime(m) {
    const shown = Math.round(m);
    if (demo) {
      // the trial moves time as «أثري» does: the same records read `shown` months from today
      if (shown !== TIME.shown) {
        trialSync(shown);
        pillars.forEach((o) => (o.fillH = o.baseH = H(o.c.qualified)));
      }
    } else if (!TIME.snap && m !== 0)
      TIME.snap = CITIES.map((c) => ({ c, q: c.qualified, k: c.clothed, s: c.sponsored }));
    if (!demo && TIME.snap) {
      const need = TIME.snap.reduce((a, x) => a + x.c.need, 0) || 1,
        monthly = Math.max(6, Math.round(need / 18));
      for (const { c, q, k, s } of TIME.snap) {
        const back = 0.045 + (fnv(c.id) % 30) / 1000, // each region started at its own time
          share = c.need / need;
        const at = (v, rate) =>
          m <= 0
            ? Math.round(v * Math.max(0, 1 + m * back))
            : Math.min(c.need, Math.round(v + monthly * share * rate * m));
        c.qualified = m === 0 ? q : at(q, 1);
        c.sponsored = m === 0 ? s : at(s, 0.45);
        c.clothed = m === 0 ? k : at(k, 0.7);
      }
      pillars.forEach((o) => (o.fillH = o.baseH = H(o.c.qualified)));
      if (m === 0) TIME.snap = null;
    }
    TIME.m = m;
    if (tlRange) {
      tlRange.value = String(shown);
      tlRange.setAttribute("aria-valuetext", timeLabel(shown));
    }
    if (tlOut)
      tlOut.innerHTML =
        timeLabel(shown) +
        (demo
          ? shown
            ? `<small>${T.simulated}</small>`
            : ""
          : shown > 0
            ? `<small>${X.time.estimate}</small>`
            : shown < 0
              ? `<small>${X.time.past}</small>`
              : "");
    root.classList.toggle("in-past", shown < 0);
    root.classList.toggle("in-future", shown > 0);
    if (S.stage === "country") {
      const t = totals(),
        nums = panel.querySelectorAll(".kpis .num");
      (demo ? trialKpis().map(([v]) => fmt(v)) : [fmt(t.need), `${t.pct}%`, fmt(t.gap)]).forEach(
        (v, i) => nums[i] && (nums[i].textContent = v),
      );
      const head = panel.querySelector("h2");
      if (head)
        head.textContent = demo
          ? T.country.title(trialCo().name, trialWhen(shown))
          : X.country.title(coName(), shown === 0 ? X.country.now : timeLabel(shown));
      const list = panel.querySelector("ul.cities");
      if (list && TIME.shown !== shown) {
        list.innerHTML = cityRows();
        list
          .querySelectorAll("[data-city]")
          .forEach((b) => b.addEventListener("click", () => selectCity(b.dataset.city)));
      }
      layoutDots();
      refreshLabels();
    }
    TIME.shown = shown;
  }
  if (demo && tlOut) tlOut.textContent = T.today;
  if (tlRange)
    on(tlRange, "input", () => {
      TIME.play?.kill();
      setTime(Number(tlRange.value));
    });
  if (tlPlay)
    on(tlPlay, "click", () => {
      TIME.play?.kill();
      const p = { m: -12 };
      setTime(-12);
      TIME.play = gsap.to(p, {
        m: 0,
        duration: 6,
        ease: "power1.inOut",
        onUpdate: () => setTime(p.m),
        onComplete: () => setTime(0),
      });
    });

  /* ── demo mode: the hall's regions lead to the children standing in them (/try) ── */
  /** outside the demo, the country's real children in the directory: counts and a way in */
  function liveHtml() {
    const r = LIVE.get(CO.code);
    if (!r) return "";
    /* the one real figure of the country stage: the directory's own row, read as the map reads
       it (`hallDirectory`), small cohorts hidden. It is named as the directory's, apart from
       the sample figures around it. */
    const d = hallDirectory(r),
      Dr = X.directory;
    return `<div class="sect">${Dr.sect}</div>
      <ul class="kids"><li><span><b>${
        d.total != null ? many(Dr.count, d.total, coName()) : Dr.hidden(coName())
      }</b><small>${
        d.waiting != null ? many(Dr.waiting, d.waiting) : Dr.small
      }</small></span><a class="cta" href="${d.href}">${Dr.browse}</a></li></ul>
      <p class="note"><span class="src real">${Dr.chip}</span> ${Dr.note}</p>`;
  }
  /** the trial child standing in the region and their group, as the catalogue holds them */
  function demoKidsHtml(c) {
    if (!demo) return "";
    const K = T.country;
    if (c.kids.length)
      return `<div class="sect">${K.kid(c.ar)}</div>
      <ul class="kids">${c.kids
        .map((k) => {
          const journey = k.journey
            ? `<small>${K.journey(num(k.journey.held), num(k.journey.planned))}</small>`
            : "";
          return k.gift === "monthly"
            ? `<li class="mine"><span><b>${k.name}</b><small>${K.mine}</small>${journey}</span><a class="ghost" href="${demo.impactHref("monthly")}">${K.impact}</a></li>`
            : `<li><span><b>${k.name}</b><small>${k.gift ? `${K.once} · ` : ""}${K.gap(demo.money(k.gap, k.currency))}</small>${journey}</span><a class="cta" href="${demo.childHref(k.id)}">${K.sponsor(k.name)}</a></li>`;
        })
        .join(
          "",
        )}</ul>${c.group ? `<p class="sub">${c.group.name} · ${T.children(c.group.children)}</p>` : ""}`;
    const r = CITIES.find((x) => x.kids.length);
    return r
      ? `<p class="sub">${K.elsewhere} <button type="button" class="linkish" data-city="${r.id}">${r.ar}</button>.</p>`
      : "";
  }
  /** after the simulated payment the visitor returns here: the hall flies to that region and plays the arrival */
  /* the replay is the only thing that moves the visitor without being asked, so it plays once and
     stops the moment they act: a touch, a key, or a stage they opened themselves cancels the rest */
  let REPLAY = null;
  function replayStep(delay, fn) {
    REPLAY = gsap.delayedCall(delay, () => {
      REPLAY = null;
      fn();
    });
  }
  function cancelReplay() {
    REPLAY?.kill();
    REPLAY = null;
  }
  on(root, "pointerdown", cancelReplay, true);
  on(root, "keydown", cancelReplay, true);
  function demoFocus() {
    const f = demo?.focus;
    if (!f || !byCode(f.co)) return;
    selectCountry(f.co);
    replayStep(1.2, () => {
      enterCountry();
      replayStep(4.2, () => {
        const c = CITIES.find((x) => x.id === f.region);
        const o = c && pillars.find((p) => p.c.id === c.id);
        if (!c || !o) return;
        selectCity(c.id);
        replayStep(1.4, () => {
          // the gift is already in the model (read from the gift store): only its arrival plays
          refreshLabels();
          if (f.cadence === "monthly")
            arrive({ track: "sponsor", kids: 1, say: T.say.monthly(f.name) }, o, c);
          else hint(T.say.once(f.name, c.ar));
        });
      });
    });
  }
  /** the country the visitor came from on the pages, when this hall shows and can enter it */
  function startCountry() {
    const co = start && byCode(start);
    return co && shown(co) && (!demo || trialCo(co.code)) ? co : null;
  }
  /** arriving from a country's page lands on that country: once, and any touch cancels it */
  function startFocus() {
    const co = startCountry();
    if (!co) return;
    start = null;
    selectCountry(co.code);
    replayStep(1.2, enterCountry);
  }
  function selectCity(id) {
    S.city = id;
    const o = pillars.find((p) => p.c.id === id);
    o.pulse = 1;
    const wp = o.g.position.clone().applyMatrix4(country.matrixWorld);
    controls.moveTo(wp.x * 0.7, 1.6, wp.z * 0.7, true);
    controls.dollyTo(13, true);
    gsap.to(beam.position, {
      x: o.g.position.x,
      z: o.g.position.z,
      duration: 1.1,
      ease: "expo.out",
    });
    beamLight.target.position.copy(o.g.position);
    gsap.to(beamLight.position, {
      x: o.g.position.x,
      z: o.g.position.z,
      duration: 1.1,
      ease: "expo.out",
    });
    gsap.fromTo(
      o.halo.scale,
      { x: 1, y: 1, z: 1 },
      { x: 3.2, y: 3.2, z: 3.2, duration: 1, ease: "expo.out", yoyo: true, repeat: 1 },
    );
    if (S.stage === "country") renderCountry();
    else if (S.stage === "support") renderSupport();
  }

  /* ── the trial's support stage: the platform's three kinds, recorded through the pages' stores ── */
  const trialKid = (c) => c.kids[0] ?? null;
  /** what would be recorded now: a pledge for the region as typed, or the child's sponsorship */
  function trialDraft(c = city()) {
    if (S.kind !== "monthly")
      return { kind: S.kind, co: CO.code, region: c.id, amount: S.amount, currency: S.currency };
    const kid = trialKid(c);
    return kid && kid.gift !== "monthly" && kid.gap > 0
      ? { kind: "monthly", childId: kid.id }
      : null;
  }
  /** children the support being composed would newly light */
  const trialLit = (c) =>
    S.kind === "qualification"
      ? c.need - c.qualified
      : S.kind === "monthly" && trialDraft(c)
        ? 1
        : 0;
  function trialSupport() {
    const c = city(),
      t = trialCo(),
      kid = trialKid(c),
      U = T.support;
    if (!t.currencies.includes(S.currency)) S.currency = t.currencies[0];
    S.track = demo.track[S.kind];
    const money = () => demo.money(S.amount, S.currency);
    let body, cta;
    if (S.kind === "monthly") {
      const other = CITIES.find((x) => x.kids.length);
      if (!kid) {
        body = other
          ? `<p class="sub">${U.noChild} <button type="button" class="linkish" data-city="${other.id}">${other.ar}</button>.</p>`
          : "";
        cta = "";
      } else if (!trialDraft(c)) {
        body = `<p class="sub">${U.already(kid.name)}</p>`;
        cta = `<a class="cta" href="${demo.impactHref("monthly")}">${T.country.impact}</a>`;
      } else {
        const gap = demo.money(kid.gap, kid.currency);
        body = `<p class="sub">${U.need(kid.name, demo.money(kid.need, kid.currency), gap)}</p>`;
        cta = `<button class="cta" type="button" id="pay">${U.sponsor(kid.name, gap)}</button>`;
      }
    } else {
      body = `<div class="sect">${U.amount}</div>
    <div class="amount"><span class="num" id="amtOut">${money()}</span></div>
    <div class="presets">${demo.amounts.presets.map((v) => `<button type="button" data-amt="${v}" aria-pressed="${v === S.amount}"><span class="num">${demo.money(v, S.currency)}</span></button>`).join("")}<input id="amt" type="number" inputmode="numeric" min="${demo.amounts.min}" max="${demo.amounts.max}" value="${S.amount}" aria-label="${U.other}"></div>
    ${t.currencies.length > 1 ? `<div class="sect">${U.currency}</div><div class="presets" role="group" aria-label="${U.currency}">${t.currencies.map((cur) => `<button type="button" data-cur="${cur}" aria-pressed="${cur === S.currency}">${demo.currencyName(cur)}</button>`).join("")}</div>` : ""}`;
      cta = `<button class="cta" type="button" id="pay">${U.confirm(money())}</button>`;
    }
    showPanel(
      `
    <h2>${U.title(c.ar)}</h2>
    <p class="sub">${U.sub}</p>
    <div class="sect">${U.kind}</div>
    <div class="tracks" role="group" aria-label="${U.kind}">
      ${TRIAL_KINDS.map(
        (k) =>
          `<button type="button" data-kind="${k}" aria-pressed="${k === S.kind}"><b>${demo.giving.tracks[k].name}</b><small>${k === "monthly" ? (kid?.name ?? "—") : U.pledge}</small></button>`,
      ).join("")}
    </div>
    ${body}
    <div class="sect">${U.dest}</div>
    <select id="dest" aria-label="${U.dest}">${CITIES.map((x) => `<option value="${x.id}" ${x.id === S.city ? "selected" : ""}>${U.destOption(x.ar, T.children(x.need))}</option>`).join("")}</select>
    <div class="row">${cta}<button class="ghost" type="button" id="back">${U.back}</button></div>
    <p class="note"><span class="src">${T.sample}</span> ${U.note}</p>`,
      DIR,
    );
    onPanel(() => {
      panel.querySelectorAll("[data-kind]").forEach((b) =>
        b.addEventListener("click", () => {
          S.kind = b.dataset.kind;
          trialSupport();
        }),
      );
      panel.querySelectorAll("[data-cur]").forEach((b) =>
        b.addEventListener("click", () => {
          S.currency = b.dataset.cur;
          trialSupport();
        }),
      );
      panel
        .querySelectorAll("[data-city]")
        .forEach((b) => b.addEventListener("click", () => selectCity(b.dataset.city)));
      const amt = $("#amt");
      // the amount is typed freely and recorded as typed: no unit price, no conversion
      const setAmount = (v) => {
        S.amount = Math.min(demo.amounts.max, Math.max(demo.amounts.min, Math.floor(v) || 1));
        $("#amtOut").textContent = money();
        $("#pay").textContent = U.confirm(money());
        panel
          .querySelectorAll("[data-amt]")
          .forEach((b) => b.setAttribute("aria-pressed", +b.dataset.amt === S.amount));
        renderPreview();
      };
      amt?.addEventListener("input", () => setAmount(+amt.value));
      panel.querySelectorAll("[data-amt]").forEach((b) =>
        b.addEventListener("click", () => {
          amt.value = b.dataset.amt;
          setAmount(+b.dataset.amt);
        }),
      );
      $("#dest")?.addEventListener("change", (e) => selectCity(e.target.value));
      $("#back")?.addEventListener("click", () => {
        setStage("country");
        renderCountry();
      });
      $("#pay")?.addEventListener("click", pay);
    });
    hint("");
    renderPreview(true);
  }
  /** what the support being composed covers, before it is recorded: the catalogue's own counts */
  function trialPreview(c) {
    const P = T.preview,
      t = trialCo(),
      kid = trialKid(c);
    // a pooled pledge joins the region's fund: its share is shown, never the whole region
    const reach =
      S.kind === "monthly"
        ? null
        : demo.reach({ co: CO.code, region: c.id, amount: S.amount, currency: S.currency });
    if (S.kind === "qualification")
      return {
        title: P.qTitle(demo.money(S.amount, S.currency), c.ar),
        items: [
          [reach.head, reach.line],
          [P.qSessions(num(c.need * t.sessions)), P.qSessionsSub(num(t.sessions))],
          [P.qStart, P.qStartSub],
        ],
      };
    if (S.kind === "in_kind")
      return {
        title: P.kTitle(demo.money(S.amount, S.currency), c.ar),
        items: [
          [reach.head, reach.line],
          [P.kCount, P.kCountSub],
          [P.kNow(c.ar, num(c.clothed)), P.kNowSub],
        ],
      };
    if (!kid) return { title: T.support.title(c.ar), items: [] };
    return {
      title: P.mTitle(kid.name, demo.money(kid.gap, kid.currency)),
      items: [
        [P.mCover(num(kid.coverage[0]), num(kid.coverage[1])), P.mCoverSub],
        [P.mMonthly, kid.covers],
        [P.mIn(c.ar), P.mInSub],
      ],
    };
  }

  function renderSupport() {
    if (demo) return trialSupport();
    const c = city(),
      U = X.support;
    /* a sample sheet: its amounts, unit prices and payment are simulated, and it says so at the
       top, on the button and under it. Nothing here reaches a payment or a payable child. */
    showPanel(`
    <h2>${U.title(c.ar)}</h2>
    <p class="sub">${SAMPLE} ${U.sub}</p>
    <div class="sect">${U.kind}</div>
    <div class="tracks" role="group" aria-label="${U.kind}">
      ${Object.entries(TRACKS)
        .map(
          ([k, t]) =>
            `<button type="button" data-track="${k}" aria-pressed="${k === S.track}"><b>${X.tracks[k].name}</b><small>${X.trackLine(X.tracks[k].unit, cash(t.unit))}</small></button>`,
        )
        .join("")}
    </div>
    <div class="sect">${U.amount}</div>
    <div class="amount"><span class="num" id="amtOut">${LX.money(S.amount)}</span></div>
    <input id="amt" type="range" min="${AMOUNTS.min}" max="${AMOUNTS.max}" step="${AMOUNTS.step}" value="${S.amount}" aria-label="${U.amount}">
    <div class="presets">${AMOUNT_PRESETS.map((v) => `<button type="button" data-amt="${v}" aria-pressed="${v === S.amount}"><span class="num">${LX.money(v)}</span></button>`).join("")}</div>
    <div class="sect">${U.dest}</div>
    <select id="dest" aria-label="${CO.code === "AL" ? U.city : U.region}">${CITIES.map((x) => `<option value="${x.id}" ${x.id === S.city ? "selected" : ""}>${U.option(x.ar, fmt(gapOf(x)))}</option>`).join("")}</select>
    <div class="row"><button class="cta" type="button" id="pay">${U.pay}</button><button class="ghost" type="button" id="back">${U.back}</button></div>
    <p class="note">${SAMPLE} ${U.note}</p>`);
    onPanel(() => {
      panel.querySelectorAll("[data-track]").forEach((b) =>
        b.addEventListener("click", () => {
          S.track = b.dataset.track;
          renderSupport();
        }),
      );
      const amt = $("#amt"),
        out = $("#amtOut"),
        shown = { v: S.amount };
      if (!amt) return;
      amt.addEventListener("input", () => {
        S.amount = +amt.value;
        gsap.to(shown, {
          v: S.amount,
          duration: 0.5,
          ease: "power3.out",
          onUpdate: () => (out.textContent = LX.money(shown.v)),
        });
        panel
          .querySelectorAll("[data-amt]")
          .forEach((b) => b.setAttribute("aria-pressed", +b.dataset.amt === S.amount));
        renderPreview();
      });
      panel.querySelectorAll("[data-amt]").forEach((b) =>
        b.addEventListener("click", () => {
          amt.value = b.dataset.amt;
          amt.dispatchEvent(new Event("input"));
        }),
      );
      $("#dest")?.addEventListener("change", (e) => selectCity(e.target.value));
      $("#back")?.addEventListener("click", () => {
        setStage("country");
        renderCountry();
      });
      $("#pay")?.addEventListener("click", pay);
    });
    hint("");
    renderPreview(true);
  }

  let lastKey = "";
  function renderPreview(first = false) {
    const c = city(),
      p = demo ? null : project(),
      P = X?.preview,
      money = demo ? "" : cash(S.amount);
    const share = (part, whole) => num(whole ? Math.round((part / whole) * 100) : 0);
    let title, items;
    if (demo) ({ title, items } = trialPreview(c));
    else if (p.track === "qualify") {
      title = P.qTitle(money, c.ar);
      items = [
        [
          many(P.qStart, p.kids),
          `${P.qUnit(cash(TRACKS.qualify.unit))}${p.spill ? P.spill(num(p.spill)) : ""}`,
        ],
        [
          p.groups
            ? `${many(P.qGroups, p.groups)}${p.rest ? P.qRest(num(p.rest)) : ""}`
            : P.qForming(num(p.kids)),
          P.qSessions,
        ],
        [
          P.qGap(c.ar, num(p.gap0), num(p.gap1)),
          P.qDrop(
            share(p.kids, p.gap0),
            `<span class="num">15.4</span>`,
            `<span class="num">17.0</span>`,
          ),
        ],
      ];
    } else if (p.track === "sponsor") {
      title = P.sTitle(money, c.ar);
      items = [
        [many(P.sMonths, p.units), P.sUnit(cash(TRACKS.sponsor.unit))],
        [
          p.years
            ? `${many(P.sYears, p.years)}${p.months ? many(P.sMore, p.months) : ""}`
            : many(P.sOnly, p.months),
          P.sPick,
        ],
        [P.sCount(c.ar, num(p.sp0), num(p.sp1)), P.sExpect],
      ];
    } else {
      title = P.kTitle(money, c.ar);
      items = [
        [
          many(P.kKids, p.kids),
          `${P.kUnit(cash(TRACKS.kiswa.unit))}${p.spill ? P.spill(num(p.spill)) : ""}`,
        ],
        [P.kWhen, P.kProof],
        [P.kNeed(c.ar, num(p.k0), num(p.k1)), P.kMet(share(p.kids, p.k0))],
      ];
    }
    const key = JSON.stringify(items.map((x) => x[0]));
    showImpact(
      `<div class="eyebrow">${demo ? T.preview.eyebrow : P.eyebrow}</div><h3>${title}</h3>
    <ol class="chain">${items.map(([b, s], i) => `<li><span class="n num">${i + 1}</span><div><b>${b}</b><span>${s}</span></div></li>`).join("")}</ol>`,
      key !== lastKey && !first,
    );
    if (first) reveal(impact.querySelector(".chain"), 0.3);
    lastKey = key;
    const o = pillars.find((x) => x.c.id === S.city);
    pillars.forEach((x) => {
      x.ghostTarget =
        x !== o
          ? 0
          : demo
            ? S.kind === "qualification"
              ? H(c.need - c.qualified)
              : 0
            : p.track === "qualify"
              ? H(p.kids)
              : 0;
    });
  }

  /** qualification: six session rings climb the new gold; sponsorship: lanterns join the orbit; clothing: gifts fall onto the children */
  const SAY = X?.say;
  function arrive(p, o, c) {
    sound.cue(p.track);
    renderLegend();
    const say = p.say ?? manyT(SAY[p.track], p.kids); // the trial says it in the catalogue's words
    hint(say);
    const live = $("#srLive");
    if (live) live.textContent = say;
    if (p.track === "qualify") {
      const b0 = o.baseH,
        b1 = H(c.qualified);
      for (let k = 0; k < 6; k++) {
        const r = new THREE.Mesh(
          new THREE.TorusGeometry(0.3, 0.014, 8, 48),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(TRACK_COL.qualify).multiplyScalar(2.4),
            transparent: true,
            toneMapped: false,
          }),
        );
        r.rotation.x = Math.PI / 2;
        r.position.set(0, b0 + ((b1 - b0) * (k + 0.5)) / 6, 0);
        r.scale.setScalar(0.001);
        o.g.add(r);
        gsap
          .timeline({
            delay: 0.25 + k * 0.22,
            onComplete: () => {
              o.g.remove(r);
              r.geometry.dispose();
            },
          })
          .to(r.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: "back.out(2)" })
          .to(r.material, { opacity: 0, duration: 1.2, ease: "power2.in" }, 2.4);
      }
    } else if (p.track === "sponsor") {
      LG.from = Math.max(0, c.sponsored - p.kids);
      LG.t = 0;
      gsap.to(LG, { t: 1, duration: 1.8, ease: "expo.out" });
    } else {
      const from = Math.max(0, c.clothed - p.kids);
      DROPS.list = [];
      DROPS.t0 = performance.now();
      for (let i = from; i < Math.min(c.clothed, from + 64); i++) {
        dots.getMatrixAt(i, tmpM);
        vP.setFromMatrixPosition(tmpM);
        DROPS.list.push({ i, x: vP.x, y: vP.y + 0.11, z: vP.z, t: 0 });
      }
    }
  }
  function pay() {
    sound.cue("chime");
    const c = city(),
      o = pillars.find((x) => x.c.id === S.city);
    let p;
    if (demo) {
      p = trialCommit(c);
      if (!p) return;
    } else {
      p = project();
      if (!p.kids) return;
      S.before = { ...c, totals: totals() };
    }
    $("#pay").disabled = true;
    const end = new THREE.Vector3(o.g.position.x, H(c.need) + 0.9, o.g.position.z).applyMatrix4(
      country.matrixWorld,
    );
    const start = camera.position.clone().add(new THREE.Vector3(0, -1.6, 0)),
      mid = start.clone().lerp(end, 0.5);
    mid.y += 6;
    flow.curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const fillFrom = o.fillH;
    o.baseH = fillFrom;
    let facts = null;
    if (isEngine()) {
      const s0 = ENGINE;
      ENGINE = payEngine(s0, {
        track: p.track,
        amount: S.amount,
        kids: p.kids,
        city: c.id,
        donor: X.donor,
        at: Date.now(),
      });
      if (!FILM) {
        saveEngine(ENGINE, store);
        window.dispatchEvent(new Event(SYNC_EVENT));
      }
      const fresh = named(albaniaRegions(ENGINE, regionsFor(CO)));
      CITIES.forEach((r) =>
        Object.assign(
          r,
          fresh.find((x) => x.id === r.id),
        ),
      );
      // the engine charges the gateway fee, so read back how many it actually funded
      if (p.track === "qualify")
        p = { ...p, kids: c.qualified - S.before.qualified, gap1: gapOf(c) };
      facts = levelFacts(s0, ENGINE, c.id, LX.lang);
    } else if (!demo) applyTo(p, c);
    root.classList.add("watching");
    controls.setFocalOffset(0, 0, 0, true);
    {
      const at = o.g.getWorldPosition(new THREE.Vector3()),
        h = H(c.need),
        d = camera.position.clone().sub(at).setY(0).normalize();
      controls.smoothTime = 1.1;
      controls.setLookAt(
        at.x + d.x * 6.4,
        at.y + h * 0.55 + 3.4,
        at.z + d.z * 6.4,
        at.x,
        at.y + h * 0.45,
        at.z,
        true,
      );
    }
    const tl = (MOVING = gsap.timeline());
    {
      // the one focus pull: from the whole land to the column the gift is about to raise
      const at = o.g.getWorldPosition(new THREE.Vector3());
      tl.to(
        focus,
        { x: at.x, y: at.y + H(c.need) * 0.5, z: at.z, duration: 1.8, ease: "power2.inOut" },
        0,
      );
      if (dof)
        tl.to(dof.cocMaterial, { worldFocusRange: 5, duration: 1.8, ease: "power2.inOut" }, 0);
    }
    tl.to(flow, { t: 1.1, duration: 1.9, ease: "power1.inOut", onStart: () => (flow.t = 0) })
      /* the arrival is quiet: one slow ring crosses the land, and the added part of the column
         comes in as light and cools into white enamel — no flash, no burst */
      .to(bloom, { intensity: 1.35, duration: 0.9, ease: "power2.in" }, 0.6)
      .add(() => {
        shock.position.set(o.g.position.x, 0.66, o.g.position.z);
        shock.scale.setScalar(0.5);
        shock.material.opacity = 0.55;
      }, 1.7)
      .to(shock.scale, { x: 10, y: 10, z: 10, duration: 2.6, ease: "power3.out" }, 1.7)
      .to(shock.material, { opacity: 0, duration: 2.6, ease: "power1.out" }, 1.7)
      .fromTo(
        o.delta.material,
        { emissiveIntensity: 2.4 },
        { emissiveIntensity: 0.42, duration: 5.2, ease: "power1.out" },
        1.7,
      )
      .fromTo(
        o.glow.material.uniforms.uO,
        { value: 0.55 },
        { value: 0, duration: 6, ease: "power1.out" },
        1.7,
      )
      .to(
        o,
        {
          fillH: H(c.qualified),
          ghostH: 0,
          duration: 1.6,
          ease: "expo.out",
          onStart: () => (o.ghostTarget = 0),
          onUpdate: () => layoutPillar(o),
        },
        1.7,
      )
      .fromTo(
        o.fill.material,
        { emissiveIntensity: 2.4 },
        { emissiveIntensity: 0.55, duration: 2, ease: "power2.out" },
        1.7,
      )
      .to(bloom, { intensity: BLOOM, duration: 1.4 }, 2.3)
      .add(() => arrive(p, o, c), 1.7)
      .add(() => {
        if (demo) {
          // the trial keeps no history of its own: the record is the stores, already written
          S.last = { ...p, city: c.id };
          drawMap();
          drawImpactScreen();
          refreshLabels();
          S.stage = "impactPending";
          root.dataset.stage = "impactPending";
          return;
        }
        S.history.push({
          title: manyT(X.did[p.track], p.kids, c.ar),
          line: X.did.line(LX.money(S.amount), X.tracks[p.track].name),
          amount: S.amount,
          kids: p.kids,
          track: p.track,
          co: coName(),
          place: c.ar,
          levels: "",
        });
        S.last = { ...p, city: c.id, amount: S.amount, facts, engine: isEngine() };
        drawMap();
        drawImpactScreen();
        refreshLabels();
        S.stage = "impactPending";
        root.dataset.stage = "impactPending";
      }, 1.8)
      .add(() => {
        root.classList.remove("watching");
        setStage("impact");
        renderImpact();
      }, 3.6);
    void fillFrom;
  }

  /**
   * the trial records the support being composed: a pledge through `addPledge` or a sponsorship
   * through `addGift` (the pages' own stores), then reads the model back. The film only shows.
   */
  function trialCommit(c) {
    const draft = trialDraft(c),
      kid = trialKid(c);
    if (!draft) return null;
    const before = { region: { ...c }, country: { ...trialCo() } };
    let id = demo.draftId;
    if (FILM) trialSync(0, draft);
    else {
      TRIAL_MUTE = true;
      id = draft.kind === "monthly" ? demo.sponsor(draft.childId) : demo.pledge(draft);
      TRIAL_MUTE = false;
      if (!id) return null;
      trialSync(0);
    }
    const entry = TRIAL.history.find((e) => e.id === id);
    if (!entry) return null;
    S.before = before;
    return {
      track: demo.track[S.kind],
      kind: S.kind,
      kids:
        S.kind === "qualification"
          ? c.qualified - before.region.qualified
          : S.kind === "monthly"
            ? 1
            : 0,
      entry,
      kid,
      film: FILM,
      say:
        S.kind === "qualification"
          ? T.say.qualification(c.ar)
          : S.kind === "monthly"
            ? T.say.monthly(kid.name)
            : T.say.in_kind,
    };
  }
  const trialKv = (rows) =>
    `<dl class="kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  /** a count before and after the support; one plain row when it did not move */
  const trialDelta = (label, v0, v1, suf = "") =>
    v0 === v1
      ? trialKv([[label, `<span class="num">${fmt(v1)}${suf}</span>`]])
      : `<div class="delta-row"><div><small>${label}</small><div class="dv"><b class="num was">${fmt(v0)}${suf}</b><span class="arrow">${DIR === "rtl" ? "←" : "→"}</span><b class="num now" data-count="${v1}" data-from="${v0}" data-suf="${suf}">${fmt(v0)}${suf}</b></div></div><span class="chip-d ok"><span class="num">${v1 > v0 ? "+" : "−"}${fmt(Math.abs(v1 - v0))}${suf}</span></span></div>`;
  /** a count as «أثري» publishes it: below the cohort minimum it is withheld, here too */
  const trialSafe = (n) =>
    n === null || demo.cohortSafe(n) === null ? T.fewer(num(demo.cohortMin)) : num(n);
  const trialLevel = (icon, name, place, rows, meaning) =>
    `<article class="lvl"><header><span class="ic">${icon}</span><div><small>${name}</small><b>${place}</b></div></header>${rows}<p class="mean">${meaning}</p></article>`;
  /** the recorded pledge's share of its region's fund, as the support sheet words it */
  const trialReach = (L) =>
    demo.reach({
      co: L.entry.co,
      region: L.entry.region ?? L.city,
      amount: L.entry.amount,
      currency: L.entry.currency,
    });
  /** the two figures the trial's closing panels open with: what was typed, and what it stands on */
  function trialDoneKpis(L) {
    const t = trialCo(),
      c = city(L.city),
      e = L.entry;
    // a pooled pledge is shown as its share of the fund it joined, not as the fund's children
    const reach = L.kind === "monthly" ? null : trialReach(L);
    const second = reach
      ? reach.share
        ? `<b>${reach.share}</b><span>${reach.shareLabel}</span>`
        : `<b class="num" data-count="${reach.children}">0</b><span>${reach.childrenLabel}</span>`
      : `<b class="num" data-count="${t.sponsored}">0</b><span>${T.sponsored}</span>`;
    return `<div class="kpis k2">
      <div class="kpi"><b class="num">${e.money}</b><span>${T.impact.perMonth}</span></div>
      <div class="kpi">${second}</div>
    </div>${reach ? `<p class="sub" dir="${DIR}">${reach.line}</p>` : ""}`;
  }
  function trialImpact() {
    const L = S.last,
      e = L.entry,
      c = city(L.city),
      b = S.before,
      t = trialCo(),
      kid = L.kid,
      I = T.impact;
    const recorded = `${L.film ? "" : `<p class="lead">${I.lead}</p>`}${trialKv([
      [I.kind, e.kindName],
      [I.target, `${e.label} · ${e.country}`],
      [I.amount, e.money],
      [I.date, e.date],
      ...(L.film
        ? []
        : [
            [I.status, I.active],
            [I.ref, `<span class="num">${e.id}</span>`],
          ]),
    ])}<p class="note"><span class="src">${T.sample}</span> ${T.support.note}</p>`;
    let levels;
    if (L.kind === "qualification") {
      levels =
        trialLevel(
          "1",
          I.level.country,
          t.name,
          trialDelta(T.enrolled, b.country.enrolled, t.enrolled) +
            trialKv([[T.withFile, num(t.children)]]),
          I.qCountry(c.ar),
        ) +
        trialLevel(
          "2",
          I.level.region,
          c.ar,
          trialDelta(T.enrolled, b.region.qualified, c.qualified) +
            trialKv([
              ...(trialReach(L)?.share ? [[trialReach(L).shareLabel, trialReach(L).share]] : []),
              [T.started, trialSafe(c.started)],
              [T.held, `${num(c.sessionsHeld)} ${T.planned(num(c.sessionsPlanned))}`],
            ]),
          I.qRegion,
        ) +
        (c.group
          ? trialLevel(
              "3",
              I.level.group,
              c.group.name,
              trialKv([
                [T.enrolled, num(c.group.children)],
                [I.sessions, num(c.group.children * t.sessions)],
              ]),
              I.qGroup(num(c.group.children * t.sessions)),
            )
          : "") +
        (kid?.journey
          ? trialLevel(
              "4",
              I.level.child,
              kid.name,
              trialKv([
                [I.sessions, `${num(kid.journey.held)} / ${num(kid.journey.planned)}`],
                [T.log.measuredBefore, kid.journey.before ? T.log.yes : T.log.no],
              ]),
              I.qChild(`<span class="num">${kid.code}</span>`),
            )
          : "");
    } else if (L.kind === "in_kind") {
      levels =
        trialLevel(
          "1",
          I.level.country,
          t.name,
          trialDelta(T.deliveries, b.country.deliveries, t.deliveries),
          I.kCountry,
        ) +
        trialLevel(
          "2",
          I.level.region,
          c.ar,
          trialDelta(T.deliveries, b.region.clothed, c.clothed),
          I.kRegion,
        );
    } else {
      levels =
        trialLevel(
          "1",
          I.level.country,
          t.name,
          trialDelta(T.sponsored, b.country.sponsored, t.sponsored),
          I.mCountry,
        ) +
        trialLevel(
          "2",
          I.level.region,
          c.ar,
          trialDelta(T.sponsored, b.region.sponsored, c.sponsored),
          I.mRegion,
        ) +
        trialLevel(
          "3",
          I.level.child,
          kid.name,
          trialDelta(I.coverage, kid.coverage[0], kid.coverage[1], "%"),
          I.mChild(`<span class="num">${kid.code}</span>`),
        );
    }
    const next = `<p class="lead">${I.next[L.kind]}</p><p class="note">${I.slider}</p>${L.film ? "" : `<div class="row"><a class="cta" href="${demo.impactHref(L.kind)}">${I.see}</a></div>`}`;
    story(
      `<div class="eyebrow">${L.film ? I.filmEyebrow : I.eyebrow}</div><h3>${I.title(e.kindName, e.label)}</h3>`,
      [
        [I.tabs[0], recorded],
        [I.tabs[1], `<p class="lead">${I.levelsLead}</p>${levels}`],
        [I.tabs[2], next],
      ],
    );
    showPanel(
      `
    <h2>${I.done}</h2>
    <p class="sub">${I.doneSub}</p>
    ${trialDoneKpis(L)}
    <div class="row"><button class="cta" type="button" id="toBig">${I.summary}</button><button class="ghost" type="button" id="again">${I.again}</button></div>`,
      DIR,
    );
    onPanel(wireDone);
  }
  /** the trial's close: what the recorded support stands on in the country, before and after */
  function trialBig() {
    const L = S.last,
      e = L.entry,
      t = trialCo(),
      b = S.before.country,
      B = T.big;
    const cmp = (label, v0, v1) =>
      `<div class="compare"><div><small>${label} · ${T.was}</small><b class="num">${fmt(v0)}</b></div><span>${DIR === "rtl" ? "←" : "→"}</span><div class="after"><small>${T.now}</small><b class="num" data-count="${v1}" data-from="${v0}">${fmt(v0)}</b></div></div>`;
    showPanel(
      `
    <h2>${B.title}</h2>
    <p class="sub">${B.sub(e.label, t.name)}</p>
    ${trialDoneKpis(L)}
    <div class="sect">${B.sect(t.name)}</div>
    ${cmp(T.enrolled, b.enrolled, t.enrolled)}
    ${cmp(T.sponsored, b.sponsored, t.sponsored)}
    ${cmp(T.deliveries, b.deliveries, t.deliveries)}
    <p class="warm">${B.warm}</p>
    <p class="note"><span class="src">${T.sample}</span> ${B.note}</p>
    <div class="row"><button class="ghost" type="button" id="again2">${T.impact.again}</button><button class="ghost" type="button" id="otherCo2">${T.country.other}</button><button class="ghost" type="button" id="hallBack">${B.hall}</button></div>
    <div class="row pin"><button class="cta" type="button" id="toMine">${B.mine}</button></div>`,
      DIR,
    );
  }

  function renderImpact() {
    sound.cue("bell");
    if (demo) return trialImpact();
    const L = S.last,
      c = city(L.city),
      b = S.before,
      Y = X.story,
      AL = CO.code === "AL",
      money = cash(L.amount);
    const fee = Math.round(L.amount * 0.05),
      net = L.amount - fee,
      inv = `DEMO-INV-2026-${String(S.history.length).padStart(4, "0")}`;
    const bars = (rows, after = true) =>
      `<div class="traits">${rows.map(([n, a, z]) => `<div class="trait"><span>${n}</span><div class="track"><i class="was" style="width:${(a / 24) * 100}%"></i>${after ? `<i class="now" data-w="${(z / 24) * 100}" style="width:${(a / 24) * 100}%"></i>` : ""}</div><em>${after ? `<span class="num">${a.toFixed(1)}</span> ${ARROW} <b class="num">${z.toFixed(1)}</b>` : `<b class="num">${a.toFixed(1)}</b>`}</em></div>`).join("")}</div>`;
    const big = (label, v0, v1, suf = "", good = "down") => {
      const d = v1 - v0,
        sign = d > 0 ? "+" : "−",
        ok = good === "down" ? d < 0 : d > 0,
        int = Number.isInteger(v0) && Number.isInteger(v1),
        f = (v) => (int ? fmt(v) : v.toFixed(1));
      return `<div class="delta-row"><div><small>${label}</small><div class="dv"><b class="num was">${f(v0)}${suf}</b><span class="arrow">${ARROW}</span>${int ? `<b class="num now" data-count="${v1}" data-from="${v0}" data-suf="${suf}">${f(v0)}${suf}</b>` : `<b class="num now">${f(v1)}${suf}</b>`}</div></div><span class="chip-d ${ok ? "ok" : ""}"><span class="num">${sign}${f(Math.abs(d))}${suf}</span></span></div>`;
    };
    const kv = (rows) =>
      `<dl class="kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
    const lvC = [
      "rgba(246,239,226,.22)",
      "rgba(212,175,106,.42)",
      "rgba(212,175,106,.72)",
      "#f3e3b5",
    ];
    const LV = X.levels,
      lvNames = [LV.start, LV.growing, LV.capable, LV.distinct];
    const lvBar = (v) =>
      `<div class="lv">${v.map((x, i) => `<i style="flex-grow:${x};background:${lvC[i]}"></i>`).join("")}</div>`;
    const legend = `<div class="legend">${lvNames.map((n, i) => `<span><i style="background:${lvC[i]}"></i>${n}</span>`).join("")}</div>`;
    /* the three traits a sponsorship is expected to lift, by the demo's own names */
    const yearTraits = [
      [LX.traits[2][0], 14.2, 15.8],
      [LX.traits[4][0], 16.1, 17.0],
      [LX.traits[5][0], 15.0, 15.7],
    ];
    const ledger = (rows) =>
      `<div class="sect">${Y.ledger}</div>${kv([[Y.invoice, `<span class="num">${inv}</span>`], [Y.amount, money], ...rows])}`;
    let base, done, details, title;
    if (L.track === "qualify") {
      const lv0 = [60, 35, 5, 0];
      title = many(X.did.qualify, L.kids, c.ar);
      base = `<p class="lead">${SAMPLE} ${Y.qBase(c.ar)}</p>
      ${kv([
        [Y.need, num(c.need)],
        [Y.waitingQ, num(gapOf(b))],
        [Y.fundedQ, `<span class="num">${fmt(Math.round((b.qualified / b.need) * 100))}%</span>`],
        [Y.traitsAvg, Y.traitsAt(`<span class="num">15.4</span>`, LV.start)],
      ])}
      <div class="sect">${Y.dist}</div>${lvBar(lv0)}${legend}`;
      done = `<p class="lead">${Y.qDone(money, many(X.kids, L.kids), L.groups ? many(X.groups, L.groups) : Y.forming)}</p>
      <div class="timeline">${[Y.before, 1, 2, 3, 4, 5, 6, Y.after].map((n) => `<i>${typeof n === "number" ? `<span class="num">${n}</span>` : n}</i>`).join("")}</div>
      ${kv([
        [Y.duration, Y.weeks68],
        [Y.supervisor, Y.supervisorOf(c.ar)],
        [Y.attendance, `<span class="num">94%</span>`],
      ])}`;
      details = `<div class="sect">${Y.traitsSect}</div>${bars(LX.traits)}
      ${ledger([
        [Y.fee, cash(fee)],
        [Y.netWamy, cash(net)],
      ])}`;
    } else if (L.track === "sponsor") {
      title = many(X.did.sponsor, L.kids, c.ar);
      base = `<p class="lead">${SAMPLE} ${Y.sBase(c.ar)}</p>
      ${kv([
        [Y.sponsored, Y.of(num(b.sponsored), num(c.need))],
        [Y.noSponsor, num(c.need - b.sponsored)],
        [Y.resilience, `<span class="num">14.2</span>`],
      ])}`;
      done = `<p class="lead">${Y.sDone(money, many(X.preview.sMonths, L.units))}</p>
      <div class="timeline">${Array.from({ length: 12 }, (_, i) => `<i><span class="num">${i + 1}</span></i>`).join("")}</div>
      ${kv([
        [Y.payout, Y.payoutVal],
        [Y.proof, Y.proofS],
      ])}`;
      details = `<div class="sect">${Y.yearSect}</div>${bars(yearTraits)}
      ${ledger([[Y.net, cash(net)]])}`;
    } else {
      title = many(X.did.kiswa, L.kids, c.ar);
      base = `<p class="lead">${SAMPLE} ${Y.kBase(c.ar)}</p>
      ${kv([
        [Y.need, num(c.need)],
        [Y.clothedSeason, num(b.clothed)],
        [Y.waiting, num(b.need - b.clothed)],
      ])}`;
      done = `<p class="lead">${Y.kDone(money, many(Y.kits, L.kids))}</p>
      <div class="timeline">${Y.steps.map((s) => `<i>${s}</i>`).join("")}</div>
      ${kv([
        [Y.duration, Y.weeks13],
        [Y.proof, Y.proofK],
      ])}`;
      details = `<p class="note">${Y.noPhotos}</p>
      ${ledger([[Y.net, cash(net)]])}`;
    }
    /* the same support read at four levels: country, region, group, child */
    const T0 = b.totals,
      T1 = totals(),
      reg = AL ? X.lvl.city : X.lvl.region,
      last = L.track === "qualify" ? "student" : "person";
    const hsh = fnv(c.id + ":" + S.history.length),
      INI = X.initials;
    const kid = {
      name: X.kidName(INI[hsh % 10], INI[(hsh >>> 4) % 10]),
      age: 8 + ((hsh >>> 8) % 7),
      code: `DEMO-${CO.code}-${1000 + (hsh % 9000)}`,
    };
    const kidLine = (k) => Y.kidLine(k.name, many(X.age, k.age));
    const share = (part, whole) =>
      `<b class="num">${fmt(Math.round((part / Math.max(1, whole)) * 100))}</b>`;
    const nGroups = Math.max(1, Math.ceil(L.kids / 8)),
      gName = Y.groupName(c.ar, num(1 + (hsh % 4)));
    const level = (icon, name, place, rows, meaning) =>
      `<article class="lvl"><header><span class="ic">${icon}</span><div><small>${name}</small><b>${place}</b></div></header>${rows}<p class="mean">${meaning}</p></article>`;
    let levels;
    if (L.track === "qualify") {
      const lv0 = [5, 3, 0, 0],
        lv1 = [1, 4, 2, 1];
      levels =
        level(
          "1",
          X.lvl.country,
          coName(),
          big(Y.fundedQ, T0.pct, T1.pct, "%", "up") + big(Y.waitingQ, T0.gap, T1.gap),
          Y.q1(coName(), many(X.months, Math.ceil(T1.gap / pace()))),
        ) +
        level(
          "2",
          reg,
          c.ar,
          big(Y.waitingIn(c.ar), gapOf(b), gapOf(c)) +
            big(
              Y.qualifiedOfNeed,
              Math.round((b.qualified / b.need) * 100),
              Math.round((c.qualified / c.need) * 100),
              "%",
              "up",
            ),
          Y.q2(share(L.kids, gapOf(b)), c.ar),
        ) +
        level(
          "3",
          X.lvl.group,
          `${gName}${nGroups > 1 ? Y.andOthers(num(nGroups - 1)) : ""}`,
          big(Y.sessions, 0, 6, "", "up") +
            big(Y.traitsAvg, 15.4, 17.0, "", "up") +
            `<div class="levels"><span>${Y.was}</span>${lvBar(lv0)}<span>${Y.now}</span><div class="lv lvNow">${lv0.map((x, i) => `<i data-g="${lv1[i]}" style="flex-grow:${x};background:${lvC[i]}"></i>`).join("")}</div></div>${legend}`,
          Y.q3(`<b class="num">4</b>`, num(8)),
        ) +
        level(
          "4",
          X.lvl.student,
          kidLine(kid),
          bars(
            LX.traits.map(([n, a, z], i) => [
              n,
              a - 0.6 + ((hsh >>> i) % 7) / 10,
              z - 0.3 + ((hsh >>> (i + 3)) % 7) / 10,
            ]),
          ),
          Y.q4(LV.start, LV.growing, `<span class="num">${kid.code}</span>`),
        );
    } else if (L.track === "sponsor") {
      levels =
        level(
          "1",
          X.lvl.country,
          coName(),
          big(Y.sponsoredCountry, T0.sponsored, T1.sponsored, "", "up"),
          Y.s1,
        ) +
        level(
          "2",
          reg,
          c.ar,
          big(Y.sponsoredIn(c.ar), b.sponsored, c.sponsored, "", "up") +
            big(Y.noSponsor, b.need - b.sponsored, c.need - c.sponsored),
          Y.s2,
        ) +
        level(
          "3",
          X.lvl.group,
          gName,
          big(Y.sponsoredOf8, 2, Math.min(8, 2 + L.kids), "", "up"),
          Y.s3,
        ) +
        level(
          "4",
          X.lvl.person,
          kidLine(kid),
          bars(yearTraits) +
            `<div class="kv"><div><dt>${Y.monthly}</dt><dd>${cash(TRACKS.sponsor.unit)}</dd></div><div><dt>${Y.duration}</dt><dd>${many(X.months, Math.min(12, L.units))}</dd></div></div>`,
          Y.s4,
        );
    } else {
      levels =
        level(
          "1",
          X.lvl.country,
          coName(),
          big(Y.clothedNow, T0.clothed, T1.clothed, "", "up"),
          Y.k1(coName()),
        ) +
        level(
          "2",
          reg,
          c.ar,
          big(Y.waitingK, b.need - b.clothed, c.need - c.clothed),
          Y.k2(share(L.kids, b.need - b.clothed), c.ar),
        ) +
        level(
          "3",
          X.lvl.group,
          many(Y.groupsIn, nGroups, c.ar),
          big(Y.clothedOf8, 0, Math.min(8, L.kids), "", "up"),
          Y.k3,
        ) +
        level(
          "4",
          X.lvl.person,
          kidLine(kid),
          `<div class="kv"><div><dt>${Y.was}</dt><dd>${Y.kBefore}</dd></div><div><dt>${Y.now}</dt><dd>${Y.kNow}</dd></div></div>`,
          Y.k4,
        );
    }
    if (L.facts) {
      const f = L.facts;
      const count = (arr) =>
        ["start", "growing", "capable", "distinct"].map((k) => arr.filter((x) => x === k).length);
      const [c0, c1] = [count(f.group.levels[0]), count(f.group.levels[1])];
      const moved = JSON.stringify(c0) !== JSON.stringify(c1);
      const g3 = level(
        "3",
        X.lvl.group,
        f.group.name,
        `<div class="kv"><div><dt>${Y.members}</dt><dd class="num">${fmt(f.group.members)}</dd></div><div><dt>${Y.sessionsOf}</dt><dd>${Y.of(num(f.group.sessions), num(6))}</dd></div><div><dt>${Y.funding}</dt><dd>${f.group.funded ? Y.fundedFull : Y.fundedWait}</dd></div><div><dt>${Y.source}</dt><dd>${X.sample}</dd></div></div>
         <div class="levels"><span>${Y.now}</span>${lvBar(c0)}${moved ? `<span>${Y.afterMeasure}</span>${lvBar(c1)}` : ""}</div>${legend}`,
        moved ? Y.moved : Y.pending,
      );
      const code = `<span class="num">${f.child.code}</span>`;
      const g4 = level(
        "4",
        X.lvl[last],
        kidLine(f.child),
        bars(f.child.traits.map(([n, a, z]) => [n, a, z ?? a])),
        f.child.to && f.child.to !== f.child.from
          ? Y.childMoved(LV[f.child.from], LV[f.child.to], code)
          : f.child.traits.some((t) => t[2] !== null)
            ? Y.childRose(LV[f.child.from], code)
            : Y.childLater(LV[f.child.from], code),
      );
      const parts = levels.split('<article class="lvl">');
      levels = parts.slice(0, 3).join('<article class="lvl">') + g3 + g4;
    }
    S.history[S.history.length - 1].levels = levels;
    const regIn = AL ? X.lvlIn.city : X.lvlIn.region;
    const TABS = [
      [Y.tabs.base, base],
      [Y.tabs.done, done],
      [
        Y.tabs.levels,
        `<p class="lead">${Y.levelsLead(regIn, X.lvlIn[last])}</p><p class="note">${SAMPLE} ${L.engine ? Y.noteEngine : Y.noteSim(coName())}</p>${levels}`,
      ],
      [Y.tabs.details, details],
    ];
    story(`<div class="eyebrow">${Y.eyebrow(money)}</div><h3>${title}</h3>`, TABS);
    /* a simulated support ends as one: the heading and the lead say nothing was charged */
    showPanel(`
    <h2>${X.done.title}</h2>
    <p class="sub">${SAMPLE} ${X.done.sub(regIn, X.lvlIn[last])}</p>
    <div class="kpis">
      <div class="kpi"><b class="num">${LX.money(L.amount)}</b><span>${X.done.support}</span></div>
      <div class="kpi"><b class="num" data-count="${L.kids}">0</b><span>${X.reached[L.track](L.kids)}</span></div>
      <div class="kpi"><b class="num">${inv.slice(-4)}</b><span>${X.done.invoice}</span></div>
    </div>
    <div class="row"><button class="cta" type="button" id="toBig">${X.done.summary}</button><button class="ghost" type="button" id="again">${X.done.again}</button></div>`);
    onPanel(wireDone);
  }
  /** the impact told in tabs that advance by themselves until the visitor takes over */
  function story(head, TABS) {
    impact.hidden = true;
    showImpact(`${head}
    <div class="story-tabs" role="tablist">${TABS.map(([n], i) => `<button type="button" role="tab" data-i="${i}" aria-selected="${i === 0}"><span class="num">${i + 1}</span> ${n}<i class="prog"></i></button>`).join("")}</div>
    <div class="story">${TABS.map(([, h], i) => `<section class="pane" data-i="${i}" ${i ? "hidden" : ""}>${h}</section>`).join("")}</div>`);
    const tabs = [...impact.querySelectorAll(".story-tabs button")],
      panes = [...impact.querySelectorAll(".pane")];
    let cur = 0,
      auto = true,
      timer = null;
    const animatePane = (pane) => {
      reveal(pane, 0);
      const cells = pane.querySelectorAll(".timeline i");
      gsap.to(cells, {
        backgroundColor: "#cdae76",
        color: "#2b0e15",
        borderColor: "#cdae76",
        duration: 0.25,
        stagger: 0.18,
        ease: "power2.out",
        delay: 0.3,
      });
      gsap.to(pane.querySelectorAll(".trait .now"), {
        width: (i, el) => el.dataset.w + "%",
        duration: 1.4,
        stagger: 0.08,
        ease: "expo.out",
        delay: 0.3,
      });
      gsap.to(pane.querySelectorAll("#lvNow i, .lvNow i"), {
        flexGrow: (i, el) => +el.dataset.g,
        duration: 1.6,
        ease: "expo.inOut",
        delay: 0.5,
      });
      countUp(pane);
    };
    const go = (i) => {
      if (i === cur && panes[i].dataset.shown) return;
      const from = panes[cur],
        to = panes[i];
      cur = i;
      tabs.forEach((t, k) => t.setAttribute("aria-selected", k === i));
      if (from !== to)
        gsap.to(from, {
          autoAlpha: 0,
          x: 24,
          duration: 0.3,
          ease: "power2.in",
          onComplete: () => (from.hidden = true),
        });
      gsap.delayedCall(from !== to ? 0.3 : 0, () => {
        to.hidden = false;
        gsap.fromTo(
          to,
          { autoAlpha: 0, x: -24 },
          { autoAlpha: 1, x: 0, duration: 0.6, ease: "expo.out" },
        );
        animatePane(to);
        to.dataset.shown = 1;
      });
      if (auto && i < TABS.length - 1) {
        const d = i === TABS.length - 2 ? 9 : 4.2;
        gsap.fromTo(
          tabs[i].querySelector(".prog"),
          { scaleX: 0 },
          { scaleX: 1, duration: d, ease: "none" },
        );
        timer = gsap.delayedCall(d, () => auto && go(i + 1));
      }
    };
    tabs.forEach((t, i) =>
      t.addEventListener("click", () => {
        auto = false;
        timer && timer.kill();
        gsap.set(impact.querySelectorAll(".prog"), { scaleX: 0 });
        go(i);
      }),
    );
    go(0);
  }
  function wireDone() {
    $("#toBig")?.addEventListener("click", enterBig);
    $("#again")?.addEventListener("click", () => {
      pillars.forEach((o) => (o.baseH = o.fillH));
      setStage("support");
      renderSupport();
    });
  }

  /* ── The close: crane up, the country flies back into the globe, and the donor reads their impact ─ */
  function enterBig() {
    sound.cue("rise");
    setStage("big");
    hideImpact();
    hint("");
    const alWorld = () => {
      globe.updateMatrixWorld();
      return selDot().getWorldPosition(new THREE.Vector3());
    };
    globe.visible = true;
    globe.position.set(0, 5.4, 0);
    globe.scale.setScalar(0.001);
    arcs.forEach((a) => a.geo.setDrawRange(0, 0));
    globe.rotation.y = faceY(CO) - 0.6;
    markLand();
    markArcs();
    const tl = (MOVING = gsap.timeline());
    tl.add(() => {
      const c0 = camera.position.clone();
      flyPath(
        [c0, V(c0.x * 0.7, c0.y + 5, c0.z * 0.7 + 3), V(2.5, 11, 17), V(0, 8.6, 15.5)],
        [V(0, 1.2, 0), V(0, 3, 0), V(0, 5, 0), V(0, 5.4, 0)],
        2.6,
        "power2.inOut",
      );
    })
      .to(focus, { x: 0, y: 5.4, z: 0, duration: 1.6, ease: "power2.inOut" }, 0)
      .to(globe.scale, { x: 1, y: 1, z: 1, duration: 1.8, ease: "expo.out" }, 0.3)
      .add(() => {
        const p = alWorld();
        tl.to(country.position, { x: p.x, y: p.y, z: p.z, duration: 1.4, ease: "power3.in" }, 0.5);
        tl.to(
          country.scale,
          { x: 0.012, y: 0.012, z: 0.012, duration: 1.4, ease: "power3.in" },
          0.5,
        );
      }, 0.45)
      .to(bloom, { intensity: 1.9, duration: 0.5, ease: "power2.in" }, 1.6)
      .add(() => (country.visible = false), 1.95)
      .to(bloom, { intensity: BLOOM, duration: 1.2, ease: "power2.out" }, 2.0)
      .add(
        () =>
          arcs.forEach((a, i) => {
            const o = { n: 0 };
            gsap.to(o, {
              n: 65,
              duration: 1.2,
              delay: i * 0.05,
              ease: "power2.out",
              onUpdate: () => a.geo.setDrawRange(0, Math.round(o.n)),
            });
          }),
        1.2,
      );
    if (demo) trialBig();
    else liveBig();
    onPanel(() => {
      // the page owns the route to «أثري» (the demo's or the donor's dashboard): follow its link
      $("#toMine")?.addEventListener("click", () => $("#hud a.exit")?.click());
      $("#again2")?.addEventListener("click", () => backToCountry());
      $("#otherCo2")?.addEventListener("click", enterWorld);
      $("#hallBack")?.addEventListener("click", backToHall);
    });
  }
  function liveBig() {
    const PACE = pace(),
      t = totals(),
      b = S.before.totals,
      L = S.last,
      months = Math.ceil(t.gap / PACE),
      months0 = Math.ceil(b.gap / PACE);
    const cmp = (label, v0, v1, suf = "") =>
      `<div class="compare"><div><small>${label} · ${X.story.was}</small><b class="num">${fmt(v0)}${suf}</b></div><span>${ARROW}</span><div class="after"><small>${X.story.now}</small><b class="num" data-count="${v1}" data-from="${v0}" data-suf="${suf}">${fmt(v0)}${suf}</b></div></div>`;
    const place = city(L.city)?.ar,
      B = X.big;
    /* the close of a simulated support: what it moved in the sample figures, named as a
       simulation in the heading, the lead and the note; never a result */
    showPanel(`
    <h2>${B.title}</h2>
    <p class="sub">${SAMPLE} ${place ? B.sub(place, coName()) : B.subCountry(coName())}</p>
    <div class="kpis k2">
      <div class="kpi"><b class="num">${LX.money(L.amount)}</b><span>${X.done.support}</span></div>
      <div class="kpi"><b class="num" data-count="${L.kids}">0</b><span>${X.reached[L.track](L.kids)}</span></div>
    </div>
    <div class="sect">${B.sect(coName())}</div>
    ${cmp(B.funded, b.pct, t.pct, "%")}
    ${cmp(B.waiting, b.gap, t.gap)}
    ${L.track === "kiswa" ? cmp(B.clothed, b.clothed, t.clothed) : ""}
    ${L.track === "sponsor" ? cmp(B.sponsored, b.sponsored, t.sponsored) : ""}
    ${months < months0 ? `<p class="sub">${B.closer(coName(), many(X.months, months), num(months0))}</p>` : ""}
    <p class="warm">${B.warm}</p>
    <p class="note">${SAMPLE} ${B.note}</p>
    <div class="row"><button class="ghost" type="button" id="again2">${X.done.again}</button><button class="ghost" type="button" id="otherCo2">${B.another}</button><button class="ghost" type="button" id="hallBack">${B.hall}</button></div>
    <div class="row pin"><a class="cta" href="/orphans">${B.real}</a></div>`);
  }
  function resetCountry() {
    country.position.set(0, 0, 0);
    country.scale.setScalar(1);
  }
  /** from the closing view back into the country, onto the stage asked for (the support sheet,
      unless the browser's Back asked for the country itself or for the impact just read) */
  function backToCountry(to = "support") {
    const tl = (MOVING = gsap.timeline());
    tl.to(globe.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.9, ease: "power3.in" })
      .add(() => {
        screens.forEach((s) => (s.group.visible = false));
        resetCountry();
        country.visible = true;
        landGroup.scale.y = 0.001;
        pillars.forEach((o) => {
          o.rise = 0;
          layoutPillar(o);
        });
        controls.setLookAt(5.4, 12.6, 10.2, 0, 0.8, 0, true);
        focus.set(0, 1.5, 0);
      })
      .to(landGroup.scale, { y: 1, duration: 1, ease: "back.out(1.6)" })
      .to(
        pillars,
        {
          rise: 1,
          duration: 1,
          ease: "expo.out",
          stagger: 0.05,
          onUpdate: () => pillars.forEach(layoutPillar),
        },
        "<0.2",
      )
      .add(() => {
        setStage(to);
        if (to === "country") renderCountry();
        else if (to === "impact") renderImpact();
        else renderSupport();
      }, "<");
  }
  function backToHall() {
    hidePanel();
    hideImpact();
    controls.enabled = false;
    gsap.to(globe.scale, {
      x: 0.001,
      y: 0.001,
      z: 0.001,
      duration: 0.9,
      ease: "power3.in",
      onComplete: () => {
        country.visible = false;
        resetCountry();
        arcs.forEach((a) => a.geo.setDrawRange(0, 0));
        globe.position.copy(HALL_GLOBE.pos);
        gsap.to(globe.scale, {
          x: HALL_GLOBE.s,
          y: HALL_GLOBE.s,
          z: HALL_GLOBE.s,
          duration: 1.2,
          ease: "expo.out",
        });
        gsap.to(pedestal.scale, { x: 1, y: 1, z: 1, duration: 1, ease: "expo.out" });
      },
    });
    screens.forEach((s) => (s.group.visible = true));
    controls.smoothTime = 1.2;
    controls.setLookAt(0, 4.6, 7.5, 0, 5.8, -13, true);
    gsap.to(focus, { x: 0, y: 6, z: -13, duration: 1.4 });
    drawImpactScreen();
    drawMap();
    const left = S.stage;
    MOVING = performance.now() + 1550;
    setTimeout(() => {
      // the visitor may have gone elsewhere meanwhile (the globe is touchable): do not pull them back
      if (disposed || S.stage !== left) return;
      setStage("hall");
      hallView(donor || (demo ? TRIAL.history : S.history).length ? 0 : 1);
      hint(PHONE() ? "" : HC.hint.screens);
    }, 1500);
  }

  /* ── Back: one stage at a time, for the browser's Back button and for Escape ────────────
     The page owns the history; it asks for the stage the visitor should stand on and the hall
     goes there with the moves it already has. A request that arrives while a move is still
     playing waits for it, so two transitions never run over each other. */
  let MOVING = null,
    WANT = null,
    wantCall = null;
  const moving = () =>
    S.stage === "impactPending" ||
    (typeof MOVING === "number" ? performance.now() < MOVING : !!MOVING?.isActive());
  function goTo(stage) {
    WANT = stage;
    if (wantCall) return;
    const run = () => {
      wantCall = null;
      if (disposed || !WANT) return;
      if (moving()) {
        wantCall = gsap.delayedCall(0.15, run);
        return;
      }
      const to = WANT;
      WANT = null;
      stepTo(to);
      // a step the hall could not take leaves the visitor where they are: say so
      if (!moving() && S.stage !== to) tellStage();
    };
    run();
  }
  function stepTo(to) {
    const from = S.stage;
    if (from === to || from === "gate") return;
    cancelReplay();
    stopFilm();
    root.classList.remove("watching");
    const settle = () => pillars.forEach((o) => (o.baseH = o.fillH));
    if (to === "hall") return backToHall();
    if (to === "world") return from === "hall" || from === "big" ? enterWorld() : backToWorld();
    if (to === "country") {
      if (from === "hall" || from === "world") return PICKED ? enterCountry() : undefined;
      if (from === "big") return backToCountry("country");
      settle();
      setStage("country");
      return renderCountry();
    }
    if (to === "support") {
      if (from === "big") return backToCountry("support");
      if (from !== "country" && from !== "impact") return;
      settle();
      setStage("support");
      return renderSupport();
    }
    if (to === "impact" && from === "big" && S.last) return backToCountry("impact");
  }
  on(window, "keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
    if (e.target instanceof HTMLSelectElement) return; // Escape there closes the list
    if (FILM) return stopFilm();
    if (S.stage === "gate") return;
    // on the hall floor Escape closes the open record or guide; deeper, it is one step back
    if (S.stage === "hall") return panel.classList.contains("on") ? hidePanel() : undefined;
    onBack?.();
  });

  /* ── The hall: turn to each screen (swipe, arrows or dots) ─────── */
  const VIEWS = [scrImpact, scrMap, scrTracks];
  let hallAt = 1;
  function hallView(i, smooth = true) {
    hallAt = (i + VIEWS.length) % VIEWS.length;
    const { cam, target, focus: f } = hallPose(hallAt);
    controls.smoothTime = 1.05; // a slow dolly between the screens
    controls.setLookAt(cam.x, cam.y, cam.z, target.x, target.y, target.z, smooth);
    gsap.to(focus, { x: f.x, y: f.y, z: f.z, duration: 1.2, ease: "power2.inOut" });
    root
      .querySelectorAll("#hallNav [data-v]")
      .forEach((b) => b.setAttribute("aria-current", +b.dataset.v === hallAt ? "true" : "false"));
  }
  on($("#hallNav"), "click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    sound.cue("tick");
    if (b.dataset.v) hallView(+b.dataset.v);
    else hallView(hallAt + +b.dataset.d);
  });
  /** the trial's record: every pledge and gift in the two stores, read as «أثري» reads them */
  function trialLog(sel = 0) {
    const all = TRIAL.history,
      G = T.log;
    if (!all.length) {
      showPanel(
        `<h2>${G.title}</h2><p class="sub">${G.empty}</p><div class="row"><button class="cta" type="button" id="goWorld">${G.world}</button><button class="ghost" type="button" id="closeP">${G.close}</button></div>`,
        DIR,
      );
      onPanel(() => {
        $("#goWorld")?.addEventListener("click", enterWorld);
        $("#closeP")?.addEventListener("click", hidePanel);
      });
      return;
    }
    const r = all[Math.min(sel, all.length - 1)],
      d = r.detail;
    const safe = trialSafe;
    const yes = (v) => (v ? G.yes : G.no);
    const detail =
      d.type === "area"
        ? trialKv([
            [T.enrolled, safe(d.enrolled)],
            [T.started, safe(d.started)],
            [T.completed, safe(d.completed)],
            [T.held, `${num(d.sessionsHeld)} ${T.planned(num(d.sessionsPlanned))}`],
          ]) +
          (d.traits
            ? `<div class="sect">${G.traits}</div>${trialKv(d.traits.map((x) => [x.label, T.move(num(x.before), num(x.latest))]))}`
            : `<p class="note">${G.traitsHidden(num(demo.cohortMin))}</p>`)
        : d.type === "journey"
          ? trialKv([
              [T.impact.sessions, `${num(d.held)} / ${num(d.planned)}`],
              [G.measuredBefore, yes(d.before)],
              [G.measuredAfter, yes(d.after)],
            ])
          : d.type === "in_kind"
            ? trialKv([
                [T.deliveries, num(d.documented)],
                [T.preparing, num(d.preparing)],
              ])
            : trialKv([
                [T.impact.kind, G.cadence[d.cadence]],
                [T.impact.coverage, `<span class="num">${d.coverage}%</span>`],
              ]);
    showPanel(
      `
    <h2>${G.title}</h2>
    <p class="sub"><span class="src">${T.sample}</span> ${G.sub}</p>
    <div class="co-list">${all.map((x, i) => `<button type="button" data-h="${i}" aria-pressed="${x === r}">${T.impact.title(x.kindName, x.label)}</button>`).join("")}</div>
    <article class="co-card" data-entry="${r.id}"><h3 class="log-h">${T.impact.title(r.kindName, r.label)}</h3><p class="co-line">${(r.kind === "monthly" ? G.gift : G.line)(r.money, r.country, r.date)}</p>${detail}
    <div class="row"><a class="cta" href="${demo.impactHref(r.kind)}">${T.impact.see}</a></div></article>
    <div class="row"><button class="ghost" type="button" id="closeP">${G.close}</button></div>`,
      DIR,
    );
    onPanel(() => {
      panel
        .querySelectorAll("[data-h]")
        .forEach((b) => b.addEventListener("click", () => trialLog(+b.dataset.h)));
      $("#closeP")?.addEventListener("click", hidePanel);
    });
  }
  function openImpactLog(sel = S.history.length - 1) {
    if (demo) return trialLog();
    const H = S.history;
    if (!H.length) {
      showPanel(
        `<h2>${X.log.emptyTitle}</h2><p class="sub">${X.log.empty}</p><div class="row"><button class="cta" type="button" id="goWorld">${X.log.pick}</button><button class="ghost" type="button" id="closeP">${X.log.close}</button></div>`,
      );
      onPanel(() => {
        $("#goWorld")?.addEventListener("click", enterWorld);
        $("#closeP")?.addEventListener("click", hidePanel);
      });
      return;
    }
    const r = H[sel];
    showPanel(`
    <h2>${X.log.title}</h2>
    <p class="sub">${SAMPLE} ${X.log.sub}</p>
    <div class="co-list">${H.map((x, i) => `<button type="button" data-h="${i}" aria-pressed="${i === sel}">${X.log.item(x.co, X.tracks[x.track].name, cash(x.amount))}</button>`).join("")}</div>
    <article class="co-card"><h3 class="log-h">${r.title}</h3><p class="co-line">${X.log.line(r.line, r.co)}</p>${r.levels || ""}</article>
    <div class="row"><button class="ghost" type="button" id="closeP">${X.log.close}</button></div>`);
    onPanel(() => {
      panel
        .querySelectorAll("[data-h]")
        .forEach((b) => b.addEventListener("click", () => openImpactLog(+b.dataset.h)));
      $("#closeP")?.addEventListener("click", hidePanel);
      gsap.to(panel.querySelectorAll(".trait .now"), {
        width: (i, el) => el.dataset.w + "%",
        duration: 1.2,
        stagger: 0.06,
        ease: "expo.out",
        delay: 0.3,
      });
      gsap.to(panel.querySelectorAll(".lvNow i"), {
        flexGrow: (i, el) => +el.dataset.g,
        duration: 1.4,
        ease: "expo.inOut",
        delay: 0.4,
      });
      countUp(panel);
    });
  }
  /** the trial's three kinds, by the platform's own names and promises */
  function trialTracks() {
    showPanel(
      `
    <h2>${demo.giving.heading}</h2>
    <p class="sub">${T.tracks.sub}</p>
    ${TRIAL_KINDS.map((k, i) => `<article class="lvl"><header><span class="ic">${i + 1}</span><div><small>${T.screen.tracksHow[k]}</small><b>${demo.giving.tracks[k].name}</b></div></header><p class="mean">${demo.giving.tracks[k].promise}</p><p class="mean">${T.impact.next[k]}</p></article>`).join("")}
    <div class="row"><button class="cta" type="button" id="goWorld">${T.tracks.go}</button><button class="ghost" type="button" id="closeP">${T.log.close}</button></div>`,
      DIR,
    );
    onPanel(() => {
      $("#goWorld")?.addEventListener("click", enterWorld);
      $("#closeP")?.addEventListener("click", hidePanel);
    });
  }
  function openTracks() {
    if (demo) return trialTracks();
    const K = X.kinds,
      rows = ["country", "region", "group", "child"].map((k) => K.rows[k]),
      kinds = Object.keys(TRACKS);
    showPanel(`
    <h2>${K.title}</h2>
    <p class="sub">${SAMPLE} ${K.sub}</p>
    <div class="tracks" style="margin-top:14px">${kinds.map((k) => `<div class="tcell"><b>${X.tracks[k].name}</b><small>${X.trackLine(X.tracks[k].per, cash(TRACKS[k].unit))}</small></div>`).join("")}</div>
    ${rows.map((r, i) => `<article class="lvl"><header><span class="ic">${i + 1}</span><div><small>${K.level}</small><b>${r.name}</b></div></header><dl class="kv kv3">${kinds.map((k) => `<div><dt>${X.tracks[k].name}</dt><dd>${r[k]}</dd></div>`).join("")}</dl></article>`).join("")}
    <div class="row"><button class="cta" type="button" id="goWorld">${K.go}</button><button class="ghost" type="button" id="closeP">${X.log.close}</button></div>`);
    onPanel(() => {
      $("#goWorld")?.addEventListener("click", enterWorld);
      $("#closeP")?.addEventListener("click", hidePanel);
    });
  }

  /* ── Loop ───────────────────────────────────────────────────────── */
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    // the mirror floor's picture follows the window: half its size, as when it was made
    mirror
      ?.getRenderTarget()
      .setSize(
        Math.max(1, Math.round(innerWidth * 0.5)),
        Math.max(1, Math.round(innerHeight * 0.5)),
      );
    gateDrawn = -1;
    camera.aspect = innerWidth / innerHeight;
    camera.fov = PHONE() ? 55 : 42;
    camera.updateProjectionMatrix();
    placeImpact();
    sizeEmblem();
  }
  /* behind the gate the hall is a dim, still backdrop: once it has settled it holds its pose and
     is redrawn once a second (late textures, a resize), not every frame. `enterHall` lifts this. */
  const GATE_SETTLE = 2.5,
    GATE_EVERY = 1;
  let gateShut = true,
    gateDrawn = -1;
  on(window, "resize", resize);
  resize();
  const clock = new THREE.Clock();
  /* a hidden tab draws nothing: the loop stops, and starts again from now when the tab returns */
  on(document, "visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf && !disposed && !lost) {
      clock.getDelta();
      raf = requestAnimationFrame(frame);
    }
  });
  /* a lost WebGL context (the GPU process restarted, the device ran short of memory) would leave
     a frozen picture: the loop stops and the hall says so, with a way to reload it and a way on
     to the same figures on the pages. The message stays if the browser hands a context back: the
     scene's baked light and render targets went with the old one, so only a reload is whole. */
  let lost = false;
  const lostEl = document.createElement("div");
  lostEl.className = "gl-lost";
  lostEl.setAttribute("role", "alert");
  lostEl.hidden = true;
  root.appendChild(lostEl);
  on(canvas, "webglcontextlost", (e) => {
    if (disposed) return;
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    const exit = $(".exits .exit");
    lostEl.innerHTML = `<div><h2>${HC.lost.title}</h2><p>${HC.lost.body}</p><div class="row"><button class="cta" type="button">${HC.lost.reload}</button>${exit ? `<a class="ghost" href="${exit.getAttribute("href")}">${HC.lost.mine}</a>` : ""}</div></div>`;
    lostEl.querySelector("button").addEventListener("click", () => location.reload());
    lostEl.hidden = false;
    root.classList.add("gl-is-lost");
    lostEl.querySelector("button").focus();
  });
  on(canvas, "pointerdown", () => (idle = 0));
  const perf = { n: 0, t: 0, stepped: false, tier: LOW ? HC.perf.low : HC.perf.high };
  /* ?perf — a small meter for real-device testing: frames per second, draw calls, quality tier */
  const meter = new URLSearchParams(location.search).has("perf")
    ? document.createElement("output")
    : null;
  const meterStat = { frames: 0, since: performance.now() };
  const counted = !!meter || !!window.__HALL_TEST;
  const lastInfo = { calls: 0, triangles: 0, frames: 0 };
  if (counted) renderer.info.autoReset = false; // count every pass of the frame, not only the last
  if (meter) {
    meter.className = "perf";
    root.appendChild(meter);
  }
  function tickMeter() {
    meterStat.frames++;
    const now = performance.now();
    if (now - meterStat.since < 1000) return;
    const fps = Math.round((meterStat.frames * 1000) / (now - meterStat.since));
    const i = renderer.info.render;
    meter.textContent = `${fps} fps · ${i.calls} draw · ${Math.round(i.triangles / 1000)}k tri · ${perf.tier} · dpr ${renderer.getPixelRatio().toFixed(2)}`;
    meterStat.frames = 0;
    meterStat.since = now;
  }
  function adapt(dt) {
    if (perf.stepped || S.stage === "gate") return;
    perf.n++;
    perf.t += dt;
    if (perf.n < 90) return;
    const ms = (perf.t / perf.n) * 1000;
    perf.stepped = true;
    if (ms > 28) {
      // under ~35fps: drop depth of field and render at a lower resolution
      perf.tier = HC.perf.stepped;
      renderer.setPixelRatio(1);
      composer.setSize(innerWidth, innerHeight);
      if (dof) dof.blendMode.opacity.value = 0;
      bloom.resolution.scale = 0.35;
    }
  }
  const placed = [],
    RANK = { hq: 1, office: 2, field: 3, unconfirmed: 4 };
  const rankOf = (l) =>
    !l.globe
      ? 9
      : PICKED && l.globe === CO
        ? 0
        : mineCodes.has(l.globe.code)
          ? 0.5
          : RANK[l.globe.st] || 5;
  /** labels in priority order (stable within a rank), re-sorted only when the choice changes */
  function labelOrder() {
    const key = labels.length + (PICKED ? CO.code : "");
    if (key !== orderedFor) {
      orderedFor = key;
      ordered = [...labels].sort((a, b) => rankOf(a) - rankOf(b));
    }
    return ordered;
  }
  const vLbl = new THREE.Vector3();
  function frame() {
    if (disposed || lost) return;
    const dt = Math.min(window.__DTCAP || 0.05, clock.getDelta()),
      real = clock.elapsedTime,
      // the settled backdrop behind the gate holds one moment: nothing in it drifts or jumps
      backdrop = gateShut && S.stage === "gate" && real > GATE_SETTLE,
      time = backdrop ? GATE_SETTLE : real;
    if (!window.__HALL_TEST) adapt(dt);
    idle += dt;
    if (
      controls.enabled &&
      !RM &&
      idle > 4 &&
      ["country", "support", "impact", "big"].includes(S.stage)
    )
      controls.rotate(dt * 0.05, 0, true);
    controls.update(dt);
    if (Math.abs(view.x - view.tx) + Math.abs(view.y - view.ty) > 0.5) {
      const k = Math.min(1, dt * 4);
      view.x += (view.tx - view.x) * k;
      view.y += (view.ty - view.y) * k;
      camera.setViewOffset(innerWidth, innerHeight, view.x, view.y, innerWidth, innerHeight);
    }
    dustMat.uniforms.uTime.value = time;
    arch.update(time);
    rays.material.uniforms.uTime.value = time;
    screens.forEach((s) => {
      s.sheen.material.uniforms.uTime.value = time;
      s.sheen.material.uniforms.uHover.value +=
        ((s === scrMap ? hoverScr : 0) - s.sheen.material.uniforms.uHover.value) * 0.1;
    });
    if (!RM && !backdrop) {
      crown.rotation.y -= dt * 0.04;
      lamps.forEach((l) => (l.rotation.y += dt * 0.3));
    }
    pillars.forEach((o) => {
      if (Math.abs(o.ghostH - o.ghostTarget) > 0.001)
        o.ghostH += (o.ghostTarget - o.ghostH) * Math.min(1, dt * 5);
      if (country.visible) layoutPillar(o);
      o.ghost.material.opacity = Math.min(0.7, o.ghostH * 1.8) * (0.7 + Math.sin(time * 4) * 0.3);
      const sel = o.c.id === S.city && country.visible && S.stage !== "big";
      const focusMode = ["support", "impact", "impactPending"].includes(S.stage);
      o.dim += ((focusMode && !sel ? 0.28 : 1) - o.dim) * Math.min(1, dt * 3);
      o.fill.material.opacity = o.dim;
      o.glass.material.opacity = 0.16 * o.dim;
      o.dial.forEach((d) => (d.arc.material.opacity = o.dim));
      o.dial[0].arc.parent.visible = sel || S.stage === "big";
      o.cap.visible = o.rise > 0.02 && (sel || S.stage === "big");
      o.pulse = Math.max(0, o.pulse - dt * 0.8);
      o.halo.material.opacity = (sel ? 0.7 : 0) + o.pulse * 0.5;
      if (sel) o.halo.rotation.z += dt;
    });
    const inCountry =
      country.visible && ["country", "support", "impact", "impactPending"].includes(S.stage);
    if (country.visible) pillars.forEach((o) => stepDial(o, dt));
    if (colBlobs && country.visible) layoutBlobs();
    if (inCountry) layoutDots(time);
    lanterns.visible = orbit.visible = falling.visible = inCountry;
    if (inCountry) {
      const o = pillars.find((p) => p.c.id === S.city);
      const n = Math.min(LANT, o.c.sponsored),
        hL = Math.max(0.7, H(o.c.need) * 0.55),
        base = o.g.position;
      orbit.position.set(base.x, base.y + hL, base.z);
      for (let i = 0; i < LANT; i++) {
        if (i >= n) {
          lanterns.setMatrixAt(i, zero);
          continue;
        }
        const grow = i >= LG.from ? LG.t : 1,
          a = (RM ? 0 : time * 0.5) + (i / Math.max(1, n)) * Math.PI * 2;
        const beat = 1 + 0.35 * Math.max(0, Math.sin(time * 2.4 + i * 0.9)) ** 3;
        vP.set(
          base.x + Math.cos(a) * 0.64 * grow,
          base.y + hL + (1 - grow) * 2.4 + Math.sin(time * 2 + i) * 0.03,
          base.z + Math.sin(a) * 0.64 * grow,
        );
        lanterns.setMatrixAt(
          i,
          tmpM.compose(vP, qI.identity(), vS.setScalar(beat * (0.4 + 0.6 * grow))),
        );
      }
      lanterns.instanceMatrix.needsUpdate = true;
      const now = performance.now();
      DROPS.list.forEach((d, k) => {
        d.t = RM ? 1 : Math.min(1, Math.max(0, (now - DROPS.t0 - k * 45) / 1100));
        const e = d.t * d.t;
        vP.set(d.x, 4.6 - (4.6 - d.y) * e, d.z);
        falling.setMatrixAt(
          k,
          d.t >= 1
            ? zero
            : tmpM.compose(
                vP,
                qI.setFromAxisAngle(vS.set(0.3, 1, 0.2).normalize(), d.t * 9 + k),
                vS.setScalar(1),
              ),
        );
      });
      for (let k = DROPS.list.length; k < 64; k++) falling.setMatrixAt(k, zero);
      falling.instanceMatrix.needsUpdate = true;
    }
    inlay.visible = !country.visible;
    engrave.visible = country.visible && S.stage !== "big";
    if (engrave.visible) {
      const az = Math.atan2(
        camera.position.x - engrave.position.x,
        camera.position.z - engrave.position.z,
      );
      let d = az - engrave.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      engrave.rotation.y += d * Math.min(1, dt * 2);
    }
    const beamOn =
      country.visible && ["country", "support", "impact", "impactPending"].includes(S.stage)
        ? 1
        : 0;
    beam.material.uniforms.uO.value +=
      (beamOn - beam.material.uniforms.uO.value) * Math.min(1, dt * 2);
    beamLight.intensity = beam.material.uniforms.uO.value * 45;
    sea.material.uniforms.uTime.value = time;
    if (flow.t >= 0 && flow.curve) {
      const pos = streamGeo.attributes.position.array;
      for (let i = 0; i < SN; i++) {
        const [s, ox, oz] = seeds[i],
          u = Math.min(1, Math.max(0, flow.t * 1.6 - s * 0.6));
        const p = flow.curve.getPoint(u);
        pos[i * 3] = p.x + ox * (1 - u);
        pos[i * 3 + 1] = p.y + Math.sin(u * 9 + s * 6) * 0.15 * (1 - u);
        pos[i * 3 + 2] = p.z + oz * (1 - u);
      }
      streamGeo.attributes.position.needsUpdate = true;
      stream.material.opacity = flow.t < 0.9 ? 1 : Math.max(0, 1 - (flow.t - 0.9) * 5);
      if (flow.t >= 1.1) flow.t = -1;
    }
    landDots.material.uniforms.uTime.value = time;
    landDots.material.uniforms.uScale.value = globe.scale.x;
    if (globe.visible) {
      if (!RM && !backdrop)
        globe.rotation.y +=
          dt * (S.stage === "hall" || S.stage === "gate" ? 0.12 : S.stage === "world" ? 0 : 0.04);
      const cu = globe.userData.selCurve;
      if (cu) spark.position.copy(cu.getPoint((time * 0.35) % 1));
      gDots.forEach(({ c, m }) =>
        m.scale.setScalar(
          PICKED && c === CO ? 1.8 + Math.sin(time * 4) * 0.5 : mineCodes.has(c.code) ? 1.6 : 1,
        ),
      );
    }
    // the emblem turns slowly: thirty pictures a second carry it, at half the read-back cost
    if (emblemAt.on && !RM && S.stage === "gate" && real - emblemAt.drawn > 1 / 40) {
      emblemAt.drawn = real;
      emblem.render(real, emblemAt);
    }
    if (!backdrop || gateDrawn < 0 || real - gateDrawn >= GATE_EVERY) {
      gateDrawn = real;
      if (counted) renderer.info.reset();
      composer.render(dt);
      if (counted) {
        lastInfo.calls = renderer.info.render.calls;
        lastInfo.triangles = renderer.info.render.triangles;
        lastInfo.frames++;
      }
    }
    if (meter) tickMeter();
    placed.length = 0;
    /* hysteresis: among globe names, the chosen country first, then every name that was already
       showing (in rank order), then the newcomers — and a newcomer needs a clear margin to come
       in. A name that is up stays up while the globe turns; two neighbours no longer swap. */
    const order = labelOrder();
    for (let pass = 0; pass < 2; pass++)
      for (const l of order) {
        const kept = !l.globe || l.on || (PICKED && l.globe === CO);
        if (kept === (pass === 1)) continue;
        if (!l.when()) {
          l.el.style.opacity = 0;
          l.on = false;
          continue;
        }
        const p = vLbl.copy(l.getPos()).project(camera);
        if (p.z > 1) {
          l.el.style.opacity = 0;
          l.on = false;
          continue;
        }
        const sy = ((1 - p.y) / 2) * innerHeight,
          sx = ((p.x + 1) / 2) * innerWidth;
        // names never slide under the bar or the colour key
        const lr = legendBox();
        if (
          sy < hudBottom() + 30 ||
          (lr && sx > lr.left - 8 && sx < lr.right + 70 && sy < lr.bottom + 34)
        ) {
          l.el.style.opacity = 0;
          l.on = false;
          continue;
        }
        // declutter: in the country only the chosen city and the three widest gaps keep a name
        const quiet =
          l.city &&
          l.city !== S.city &&
          (["support", "impact", "impactPending"].includes(S.stage) || !TOP3.has(l.city));
        // globe names never stack (West Africa): the chosen country, then the headquarters, then
        // offices, then field sites keep theirs; a crowded-out country stays reachable by its dot
        // and by the panel list
        if (l.globe) {
          const w = (l.w ||= l.el.offsetWidth) || 60,
            pad = l.on ? 3 : 12,
            x0 = sx - w / 2 - pad,
            x1 = sx + w / 2 + pad,
            y0 = sy - 25 - (pad - 3),
            y1 = sy + 1 + (pad - 3);
          const hitLabel = placed.some((r) => x0 < r[1] && x1 > r[0] && y0 < r[3] && y1 > r[2]);
          l.el.style.pointerEvents = hitLabel ? "none" : "";
          l.on = !hitLabel;
          if (hitLabel) {
            l.el.style.opacity = 0;
            continue;
          }
          placed.push([sx - w / 2 - 3, sx + w / 2 + 3, sy - 25, sy + 1]);
        }
        l.el.style.opacity = quiet ? 0 : 1;
        l.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
      }
    raf = requestAnimationFrame(frame);
  }
  Promise.all(
    [`700 40px "${DISPLAY}"`, `500 30px "${BODY}"`, `700 30px "${BODY}"`].map((f) =>
      document.fonts.load(f),
    ),
  )
    .catch(() => {})
    .then(() => {
      drawMap();
      drawBand();
      drawTracks();
      drawImpactScreen();
    });
  buildCountry();
  drawTracks();
  drawImpactScreen();
  layoutDots();
  frame();
  window.__hall = {
    S,
    live: LIVE,
    rerender: () => S.stage === "country" && renderCountry(),
    enterWorld: () => enterWorld(),
    co: () => CO.code,
    /** draw calls and triangles of the last frame (all passes), for automated checks */
    info: () => ({ ...lastInfo }),
    /** whether the after-payment replay still has a step waiting */
    replaying: () => !!REPLAY,
    // the countries the hall can enter: all of the network live, the trial catalogue's in the trial
    codes: () => (demo ? [...demo.codes] : COUNTRIES.map((c) => c.code)),
    /** the trial model the hall is drawing now (null in the live hall) */
    trial: () => TRIAL,
    /** for automated checks: open the impact record, and move the time bar */
    log: () => openImpactLog(),
    time: (m) => setTime(m),
    /** for automated checks: stand the camera somewhere and look at a point */
    look: (...at) => controls.setLookAt(...at, false),
    /** for automated checks: pick a country on the globe and enter it */
    visit: (code) => {
      selectCountry(code);
      enterCountry();
    },
  }; // for automated checks
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    sound.dispose();
    /* every tween, timeline and delayed call is the hall's (nothing else on the site animates
       with GSAP): an endless one left alive would hold the whole scene and its DOM */
    cancelReplay();
    gsap.globalTimeline.getChildren(true, true, true).forEach((t) => t.kill());
    gsap.globalTimeline.timeScale(1);
    listeners.forEach((off) => off());
    listeners.length = 0;
    controls.dispose();
    /* the GPU side: geometries, materials and their textures, render targets, then the context */
    const freed = new Set();
    const free = (x) => {
      if (x && typeof x.dispose === "function" && !freed.has(x)) {
        freed.add(x);
        x.dispose();
      }
    };
    const freeMaterial = (m) => {
      for (const v of Object.values(m)) if (v && v.isTexture) free(v);
      for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture) free(u.value);
      free(m);
    };
    scene.traverse((o) => {
      free(o.geometry);
      (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach(
        freeMaterial,
      );
      if (o.isLight) free(o.shadow);
      if (typeof o.getRenderTarget === "function") free(o.getRenderTarget()); // the mirror floor
      if (o.isInstancedMesh) free(o);
    });
    free(scene.environment);
    scene.clear();
    /* the post-processing libraries draw every pass with one full-screen triangle they keep for
       the life of the page. Each renderer hangs its GPU buffer and a listener on that shared
       geometry, so a hall that leaves it alone stays reachable through it (context, canvas and
       page markup) after every visit. Disposing it lets go of both; the next hall uploads it anew. */
    for (const pass of composer.passes) {
      free(pass.screen?.geometry);
      for (const v of Object.values(pass)) {
        if (v?._mesh?.geometry) {
          free(v._mesh.geometry);
          free(v._mesh.material);
        } else if (v?.isWebGLRenderTarget) free(v);
      }
    }
    composer.dispose();
    pmrem.dispose();
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    emblem?.dispose();
    /* what the scene wrote into the page's markup */
    labels.forEach((l) => l.el.remove());
    labels.length = 0;
    meter?.remove();
    lostEl.remove();
    if (impact.parentNode !== root) root.appendChild(impact); // the page owns it
    for (const el of [panel, impact, legend]) if (el) el.replaceChildren();
    delete window.__hall;
    delete window.__hallGate;
  };
  return Object.assign(dispose, { goTo });
}
