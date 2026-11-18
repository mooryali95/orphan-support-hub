// قاعة الأثر — المشهد ثلاثي الأبعاد (three.js) وطبقة الواجهة فوقه.
// المنطق والبيانات في `@/lib/hall/model` (مختبَر)؛ هنا العرض والحركة فقط.
// يُحمَّل كسولاً من `src/routes/vision.hall.tsx` فلا يثقل بقية الصفحات.
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
  STATUS,
  TRACKS,
  TRAITS,
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
import { rankPriorities, rationale } from "@/lib/office-gap";
import { buildArchitecture } from "./architecture.js";
import { createSound } from "./sound.js";

const DISPLAY = "Amiri",
  BODY = "Readex Pro";

export function mountHall(root, { brand, linked = [] }) {
  const $ = (s, r = root) => r.querySelector(s);
  const fmt = (n) => new Intl.NumberFormat("en").format(Math.round(n));
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PHONE = () => innerWidth <= 760;
  const LOW = matchMedia("(max-width: 760px)").matches || (navigator.hardwareConcurrency || 8) < 4;
  const listeners = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  };
  let disposed = false,
    raf = 0;
  if (RM) gsap.globalTimeline.timeScale(20);
  if (window.__HALL_TEST) gsap.ticker.lagSmoothing(0); // automated runs in a software renderer

  /* ── Colour grade: lacquer wine, gold leaf, champagne, ivory, 3000K lamps ── */
  const G = {
    night: 0x0b0608,
    lacquer: 0x3a0f1a,
    wine: 0x6b1d2f,
    gold: 0xd4af6a,
    champagne: 0xf3e3b5,
    ivory: 0xf6efe2,
    lamp: 0xffd6a0,
  };

  /* ── State: the network view, the chosen country and its regions ── */
  const VIEW = { all: false, layer: "network" };
  /* the site map's "needs an office" layer, and operating platforms that are really linked */
  const PRI = new Map(rankPriorities().map((p) => [p.code, p]));
  const TIER = { high: "أولوية عالية", medium: "أولوية متوسطة", data: "تحتاج بيانات" };
  const LINKED = new Set();
  Promise.resolve(linked)
    .then((codes) => {
      (codes || []).forEach((c) => LINKED.add(c));
      if (S.stage === "world") renderWorld();
    })
    .catch(() => {});
  const shown = (c) =>
    VIEW.all || c.st !== "unconfirmed" || (VIEW.layer === "gap" && PRI.has(c.code));
  let CO = byCode("AL");
  let PICKED = false; // nothing chosen until the visitor picks a country on the globe
  const CITY_CACHE = {};
  let CITIES = [];
  const S = {
    stage: "gate",
    track: "qualify",
    amount: 10000,
    city: "tirana",
    history: [],
    last: null,
    before: null,
  };
  const store = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  let ENGINE = loadEngine(store);
  const isEngine = () => CO.code === "AL";
  function initCities() {
    if (isEngine()) {
      ENGINE = loadEngine(store);
      CITY_CACHE.AL = albaniaRegions(ENGINE, regionsFor(CO));
    } else if (!CITY_CACHE[CO.code]) CITY_CACHE[CO.code] = regionsFor(CO);
    CITIES = CITY_CACHE[CO.code];
    S.city = [...CITIES].sort((a, b) => gapOf(b) - gapOf(a))[0].id;
  }
  initCities();
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
  // warm studio for reflections: a dark room lit by lamp-coloured panels (no grey from a white box)
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x0b0608);
    const panel = (w, h, pos, rot, k) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(0xffc988).multiplyScalar(k),
          side: THREE.DoubleSide,
        }),
      );
      m.position.set(...pos);
      m.rotation.set(...rot);
      env.add(m);
    };
    panel(6, 6, [0, 9, 0], [Math.PI / 2, 0, 0], 3.2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      panel(1.2, 5, [Math.sin(a) * 8, 2, Math.cos(a) * 8], [0, a, 0], 1.4);
    }
    panel(20, 2, [0, -3, -9], [0, 0, 0], 0.25);
    scene.environment = pmrem.fromScene(env, 0.02).texture;
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
  }
  const bloom = new BloomEffect({
    luminanceThreshold: 0.72,
    luminanceSmoothing: 0.25,
    intensity: 0.95,
    mipmapBlur: true,
    radius: 0.72,
  });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
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
  const vignette = new VignetteEffect({ darkness: 0.62, offset: 0.3 });
  const grain = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: false });
  grain.blendMode.opacity.value = 0.22;
  const grade = [
    new BrightnessContrastEffect({ contrast: 0.08, brightness: -0.01 }),
    new HueSaturationEffect({ saturation: -0.08 }),
  ];
  composer.addPass(new EffectPass(camera, ...grade, ca, vignette, grain));
  composer.addPass(new EffectPass(camera, new SMAAEffect()));

  /* ── Materials: gold leaf, lacquer, smoked glass ─────────────────── */
  const goldM = new THREE.MeshPhysicalMaterial({
    color: G.gold,
    metalness: 1,
    roughness: 0.2,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.4,
  });
  const lacquer = new THREE.MeshPhysicalMaterial({
    color: G.lacquer,
    roughness: 0.32,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.55,
  });
  const goldLine = (o = 0.5) =>
    new THREE.LineBasicMaterial({
      color: 0xe9c983,
      transparent: true,
      opacity: o,
      toneMapped: false,
    });

  /* ── Lights: 3000K lamps, one key over the centre ───────────────── */
  scene.add(new THREE.HemisphereLight(0xffe0b0, 0x14060a, 0.35));
  const key = new THREE.SpotLight(G.lamp, 1400, 40, 0.55, 0.6, 2);
  key.position.set(0, 22, 4);
  key.target.position.set(0, 0, 0);
  scene.add(key, key.target);
  const lamps = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const l = new THREE.PointLight(G.lamp, 55, 18, 2);
    l.position.set(Math.sin(a) * 13.5, 8.5, Math.cos(a) * 13.5);
    scene.add(l);
    lamps.push(l);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }),
    );
    bulb.material.color.multiplyScalar(2.6);
    bulb.scale.setScalar(0.7);
    bulb.position.copy(l.position);
    scene.add(bulb);
    const cage = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshPhysicalMaterial({
        color: G.gold,
        metalness: 1,
        roughness: 0.3,
        wireframe: true,
      }),
    );
    cage.position.copy(l.position);
    scene.add(cage);
    lamps.push(cage);
  }

  /* ── The hall ───────────────────────────────────────────────────── */
  const hall = new THREE.Group();
  scene.add(hall);
  // mirror floor under smoked lacquer
  if (!LOW) {
    const mirror = new Reflector(new THREE.CircleGeometry(19, 96), {
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
  function star(r, k, o) {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2,
        b = ((i + k) / 16) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r),
        new THREE.Vector3(Math.sin(b) * r, 0, Math.cos(b) * r),
      );
    }
    return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), goldLine(o));
  }
  const inlay = new THREE.Group();
  inlay.position.y = 0.012;
  inlay.add(star(9, 5, 0.14), star(6, 3, 0.09));
  hall.add(inlay);
  [9.6, 15.2].forEach((r) => {
    const g = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.05, 160),
      new THREE.MeshBasicMaterial({
        color: 0xe9c983,
        transparent: true,
        opacity: 0.55,
        toneMapped: false,
      }),
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
    x.strokeStyle = "rgba(212,175,106,0.2)";
    x.lineWidth = 1.6;
    const st = (cx, cy, r) => {
      x.beginPath();
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2,
          rr = i % 2 ? r * 0.55 : r;
        x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      x.stroke();
    };
    [
      [128, 128],
      [0, 0],
      [256, 0],
      [0, 256],
      [256, 256],
    ].forEach(([a, b]) => st(a, b, 70));
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
  const crown = star(5, 5, 0.85);
  crown.position.y = 30.5;
  hall.add(crown);
  const oculus = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 64),
    new THREE.MeshBasicMaterial({ color: 0xffe9c0, toneMapped: false }),
  );
  oculus.material.color.multiplyScalar(2.2);
  oculus.rotation.x = Math.PI / 2;
  oculus.position.y = 32.8;
  hall.add(oculus);
  const arch = buildArchitecture({
    hall,
    goldM,
    lacquer,
    LOW,
    rnd: (() => {
      let a = 7;
      return () => (a = (a * 16807) % 2147483647) / 2147483647;
    })(),
  });
  floor.material = arch.floorMaterial;
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
      goldLine(0.95),
    );
    trim.position.copy(leaf.position);
    pivot.add(trim);
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 6), goldM);
      p.position.set(-s * 1.35, 2 + k * 2, 0.13);
      pivot.add(p);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), goldM);
    knob.position.set(-s * 2.4, 4, 0.22);
    pivot.add(knob);
    hall.add(pivot);
    doors.push({ pivot, s });
  });
  const portal = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.13, 16, 64, Math.PI), goldM);
  portal.position.set(0, 8, 17.65);
  hall.add(portal);
  const doorGlow = new THREE.PointLight(0xffc98a, 0, 14, 2);
  doorGlow.position.set(0, 4, 15);
  scene.add(doorGlow);

  // gold dust (shader: soft round motes that twinkle)
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
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vec3(1.0,0.86,0.6)*1.6, a*vA*0.55); }`,
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
      gl_FragColor = vec4(vec3(1.0,0.85,0.55), (1.0-edge)*stripes*fall*uI); }`,
    }),
  );
  rays.position.y = 15.5;
  hall.add(rays);

  /* ── Screens: canvas pages + a moving sheen shader ──────────────── */
  const proj = (lon, lat, k) => ({ x: (lon - 20.0) * k * 0.755, y: (lat - 41.2) * k });
  const sheenMat = () =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uHover: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uHover; varying vec2 vUv;
    void main(){ float x = vUv.x + vUv.y*0.35; float band = smoothstep(0.08,0.0,abs(fract(x*0.5 - uTime*0.08)-0.5));
      float rim = smoothstep(0.03,0.0,min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y)));
      gl_FragColor = vec4(vec3(1.0,0.88,0.6), band*0.07 + rim*(0.12+0.35*uHover)); }`,
    });
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
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
    );
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sheenMat());
    sheen.position.z = 0.01;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.42, h + 0.42, 0.14), goldM);
    frame.position.z = -0.09;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, h + 0.9, 0.1), lacquer);
    back.position.z = -0.2;
    g.add(back, frame, m, sheen);
    g.position.set(Math.sin(angle) * 13.2, 6, Math.cos(angle) * 13.2);
    g.lookAt(0, 6, 0);
    hall.add(g);
    const o = { cv, ctx: cv.getContext("2d"), tex, mesh: m, sheen, group: g };
    screens.push(o);
    return o;
  }
  const scrMap = makeScreen(Math.PI, 9, 6),
    scrTracks = makeScreen(Math.PI - 0.82, 6, 4.4),
    scrImpact = makeScreen(Math.PI + 0.82, 6, 4.4);
  function bg(ctx, w, h) {
    const gr = ctx.createRadialGradient(w * 0.6, h * 0.3, 50, w * 0.5, h * 0.5, w * 0.8);
    gr.addColorStop(0, "#3d1321");
    gr.addColorStop(1, "#110609");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(212,175,106,.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, w - 60, h - 60);
    ctx.strokeRect(40, 40, w - 80, h - 80);
  }
  function text(ctx, s, x, y, size, color, weight = 500, fam = BODY, align = "right") {
    ctx.direction = "rtl";
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "${fam}", sans-serif`;
    ctx.fillText(s, x, y);
  }
  function goldText(ctx, s, x, y, size) {
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.font = `700 ${size}px "${DISPLAY}", serif`;
    const g = ctx.createLinearGradient(0, y - size, 0, y);
    g.addColorStop(0, "#fbe9bf");
    g.addColorStop(0.6, "#d4af6a");
    g.addColorStop(1, "#8f6c33");
    ctx.fillStyle = g;
    ctx.fillText(s, x, y);
  }
  function drawMap() {
    const { ctx, cv, tex } = scrMap,
      w = cv.lw,
      h = cv.lh,
      t = totals();
    bg(ctx, w, h);
    if (!PICKED) {
      goldText(ctx, "شبكة الندوة حول العالم", w - 80, 130, 76);
      text(
        ctx,
        "المقرّ في الرياض و26 موقعاً مؤكَّد الحضور",
        w - 80,
        200,
        36,
        "rgba(246,239,226,.75)",
      );
      [
        ["1", "مقرّ رئيسي"],
        ["19", "مكتباً مؤكَّداً"],
        ["7", "نشاطاً ميدانياً"],
      ].forEach(([v, l], i) => {
        const x = w - 80 - i * 400;
        ctx.direction = "ltr";
        ctx.textAlign = "right";
        ctx.font = `700 140px "${DISPLAY}", serif`;
        const g = ctx.createLinearGradient(0, 300, 0, 440);
        g.addColorStop(0, "#fbe9bf");
        g.addColorStop(1, "#a9823f");
        ctx.fillStyle = g;
        ctx.fillText(v, x, 450);
        text(ctx, l, x, 520, 36, "rgba(246,239,226,.8)", 600);
      });
      text(
        ctx,
        "المس الكرة أو هذه الشاشة لتختار دولتك على خريطة العالم",
        w - 80,
        h - 120,
        38,
        "#e9c983",
        700,
      );
      tex.needsUpdate = true;
      return;
    }
    goldText(ctx, `${CO.ar} — الحال الآن`, w - 80, 130, 76);
    text(
      ctx,
      `${fmt(t.need)} يتيماً في الحاجة · ${t.pct}% مموّلة · ${fmt(t.gap)} ينتظرون التأهيل`,
      w - 80,
      200,
      36,
      "rgba(246,239,226,.75)",
    );
    const kk = 265,
      ox = w * 0.27,
      oy = 590;
    const path = () => {
      ctx.beginPath();
      CO.rings.forEach((r) => {
        r.forEach(([x, y], i) => ctx[i ? "lineTo" : "moveTo"](ox + x * kk, oy - y * kk));
        ctx.closePath();
      });
    };
    ctx.save();
    ctx.shadowColor = "rgba(212,175,106,.55)";
    ctx.shadowBlur = 30;
    path();
    const lg = ctx.createLinearGradient(0, oy - 300, 0, oy + 300);
    lg.addColorStop(0, "#5b1a2b");
    lg.addColorStop(1, "#2b0b14");
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.restore();
    path();
    ctx.strokeStyle = "#d4af6a";
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
      ctx.fillStyle = "#d4af6a";
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
      text(ctx, c.ar, X + L[0], Y + L[1], 28, "#f6efe2", 600, BODY, L[2]);
    });
    const lx = w - 80;
    let ly = 330;
    text(ctx, "أكبر الفجوات", lx, ly, 34, "#d4af6a", 700);
    ly += 20;
    [...CITIES]
      .sort((a, b) => gapOf(b) - gapOf(a))
      .slice(0, 5)
      .forEach((c) => {
        ly += 66;
        text(ctx, c.ar, lx, ly, 34, "#f6efe2", 600);
        text(ctx, `${gapOf(c)} ينتظرون`, lx - 330, ly, 30, "rgba(246,239,226,.7)");
        ctx.fillStyle = "rgba(246,239,226,.12)";
        ctx.fillRect(lx - 440, ly + 16, 440, 6);
        ctx.fillStyle = "#d4af6a";
        ctx.fillRect(lx - 440 * (c.qualified / c.need), ly + 16, 440 * (c.qualified / c.need), 6);
      });
    text(ctx, `المس الشاشة لتدخل ${CO.ar}`, w - 80, h - 90, 38, "#e9c983", 700);
    tex.needsUpdate = true;
  }
  function drawTracks() {
    const { ctx, cv, tex } = scrTracks,
      w = cv.lw;
    bg(ctx, w, cv.lh);
    goldText(ctx, "اتجاهات الدعم الثلاثة", w - 80, 140, 68);
    [
      ["تأهيل", "رحلة طفل · 600 ر.س", "ستّ جلسات وقياسٌ قبل وبعد في السمات الستّ"],
      ["كفالة", "شهر · 300 ر.س", "مبلغٌ شهري يصل الطفل بإثبات"],
      ["كسوة", "يتيم · 300 ر.س", "كسوةٌ تُسلَّم بإثبات قبل الموسم"],
    ].forEach(([a, b, c], i) => {
      const y = 300 + i * 200;
      ctx.fillStyle = "#d4af6a";
      ctx.beginPath();
      ctx.arc(w - 115, y - 20, 30, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(i + 1), w - 115, y - 6, 36, "#2b0e15", 700, DISPLAY, "center");
      text(ctx, a, w - 170, y, 54, "#f6efe2", 700, DISPLAY);
      text(ctx, b, w - 400, y, 34, "#e9c983", 600);
      text(ctx, c, w - 170, y + 62, 34, "rgba(246,239,226,.72)");
    });
    tex.needsUpdate = true;
  }
  function drawImpactScreen() {
    const { ctx, cv, tex } = scrImpact,
      w = cv.lw,
      h = cv.lh;
    bg(ctx, w, h);
    goldText(ctx, "أثرك حتى الآن", w - 80, 140, 68);
    if (!S.history.length) {
      text(ctx, "لم تدعم بعد.", w - 80, 300, 46, "rgba(246,239,226,.85)");
      text(ctx, "اختر دولةً وادعمها، فيُكتب هنا ما تمّ", w - 80, 370, 36, "rgba(246,239,226,.6)");
      text(ctx, "على البلد والمنطقة والمجموعة والطفل.", w - 80, 420, 36, "rgba(246,239,226,.6)");
      tex.needsUpdate = true;
      return;
    }
    const H = S.history,
      total = H.reduce((a, r) => a + r.amount, 0),
      kids = H.reduce((a, r) => a + r.kids, 0),
      cos = new Set(H.map((r) => r.co)).size;
    [
      [fmt(total), "ر.س دعمك"],
      [fmt(kids), "طفلاً وصلهم"],
      [String(cos), cos > 2 ? "دول" : cos === 2 ? "دولتان" : "دولة"],
    ].forEach(([v, l], i) => {
      const x = w - 80 - i * 400;
      ctx.direction = "ltr";
      ctx.textAlign = "right";
      ctx.font = `700 96px "${DISPLAY}", serif`;
      const g = ctx.createLinearGradient(0, 200, 0, 300);
      g.addColorStop(0, "#fbe9bf");
      g.addColorStop(1, "#a9823f");
      ctx.fillStyle = g;
      ctx.fillText(v, x, 300);
      text(ctx, l, x, 350, 32, "rgba(246,239,226,.75)", 600);
    });
    const by = (t) => H.filter((r) => r.track === t).reduce((a, r) => a + r.kids, 0);
    [
      ["qualify", "تأهّلوا"],
      ["sponsor", "كُفلوا"],
      ["kiswa", "كُسوا"],
    ].forEach(([t, l], i) => {
      const x = w - 80 - i * 400,
        v = by(t);
      text(ctx, `${v} ${l}`, x, 430, 34, v ? "#e9c983" : "rgba(246,239,226,.35)", 700);
    });
    ctx.strokeStyle = "rgba(212,175,106,.3)";
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
    text(ctx, "المس الشاشة لتفتح أثر كلّ دعمٍ بمستوياته", w - 80, h - 60, 32, "#e9c983", 700);
    tex.needsUpdate = true;
  }

  /* ── The chosen country, carved in lacquer and gold ─────────────── */
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
    color: 0x380b16,
    roughness: 0.38,
    metalness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.6,
  });
  const tierM = [0x40101b, 0x491420, 0x531927].map(
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
      new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), goldLine(0.95)),
    );
    const main = CO.rings[0],
      cx = main.reduce((a, p) => a + p[0], 0) / main.length,
      cy = main.reduce((a, p) => a + p[1], 0) / main.length;
    [0.84, 0.66, 0.46].forEach((k, i) => {
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
        new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), goldLine(0.42 - i * 0.08)),
      );
      t.position.y = 0.58 + i * 0.075;
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
      vec3 base = mix(vec3(0.03,0.016,0.016), vec3(0.075,0.04,0.035), 1.0 - r*1.6);
      gl_FragColor = vec4(base + glint*vec3(1.0,0.8,0.45)*0.1, 1.0); }`,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.002;
  country.add(sea);
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
    x.strokeStyle = "rgba(212,175,106,.6)";
    x.lineWidth = 2;
    x.strokeRect(0, 10, 4096, 108);
    x.direction = "rtl";
    x.textAlign = "center";
    x.font = `600 50px "${DISPLAY}", serif`;
    const gr = x.createLinearGradient(0, 30, 0, 100);
    gr.addColorStop(0, "#fbe9bf");
    gr.addColorStop(1, "#a9823f");
    x.fillStyle = gr;
    for (let i = 0; i < 3; i++)
      x.fillText(`${CO.ar} · ${STATUS[CO.st]} · منصة الرؤية والتوجهات`, (4096 * (i + 0.5)) / 3, 84);
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
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uO; varying vec2 vUv; void main(){ float a = smoothstep(0.0, 1.0, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y)); gl_FragColor = vec4(vec3(1.0,0.84,0.55), a*uO*0.09); }`,
    }),
  );
  beam.position.y = 5.1;
  country.add(beam);
  const beamLight = new THREE.SpotLight(0xffd59a, 0, 14, 0.22, 0.7, 2);
  beamLight.position.set(0, 10, 0);
  country.add(beamLight, beamLight.target);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.8, 0.5, 128), lacquer);
  plinth.position.y = -0.27;
  country.add(plinth);
  const plinthRing = new THREE.Mesh(new THREE.TorusGeometry(7.45, 0.05, 12, 160), goldM);
  plinthRing.rotation.x = Math.PI / 2;
  country.add(plinthRing);
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
    color: G.gold,
    metalness: 1,
    roughness: 0.18,
    emissive: 0x7a5414,
    emissiveIntensity: 0.55,
    envMapIntensity: 1.5,
  });
  let pillars = [];
  /* three supports, three visual languages, one palette */
  const TRACK_COL = { qualify: 0xd4af6a, sponsor: 0x5cc9a4, kiswa: 0xeef0f7 };
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
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xfff0c8).multiplyScalar(2.2),
        toneMapped: false,
        transparent: true,
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
    const ghost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 1, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffe7b0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    const cap = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 12, 48), goldM);
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
        color: 0xffd98f,
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
    g.add(glass, fill, delta, baseRing, ghost, cap, halo, dialG);
    country.add(g);
    glass.userData.city = fill.userData.city = c.id;
    const o = {
      c,
      g,
      glass,
      fill,
      delta,
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
    done: new THREE.Color(0xd4af6a),
    wait: new THREE.Color(0x5a2f38),
    lit: {
      qualify: new THREE.Color(0xfff0c8).multiplyScalar(3),
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
      sheenColor: new THREE.Color(0xe6dcff),
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
      sheenColor: new THREE.Color(0xe6dcff),
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
      pr = project();
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
    const cup = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.04, 16, 96), goldM);
    cup.rotation.x = Math.PI / 2;
    cup.position.y = 0.92;
    pedestal.add(cup);
    const meridian = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.03, 12, 128, Math.PI * 1.25),
      goldM,
    );
    meridian.position.y = 2.2;
    meridian.rotation.set(0, 0, -Math.PI * 0.62);
    pedestal.add(meridian);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.12, 64), goldM);
    foot.position.y = 0.06;
    pedestal.add(foot);
  }
  const GR = 3.6;
  const globeCore = new THREE.Mesh(
    new THREE.SphereGeometry(GR, 96, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x0f0407,
      roughness: 0.45,
      metalness: 0.25,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.45,
    }),
  );
  globe.add(globeCore);
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(GR * 1.18, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(0.0, 0.72 + dot(vN, vV)), 3.0); gl_FragColor = vec4(vec3(1.0,0.78,0.45)*1.4, f*0.9); }`,
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
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), goldLine(lat ? 0.05 : 0.18)),
    );
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 3) pts.push(ll(lat, lon, GR * 1.003));
    globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), goldLine(0.05)));
  }
  /* the world: Natural Earth land (world-atlas 50m) sampled to gold dots, embedded */
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
        vec3 col = vHot > 1.5 ? vec3(1.0,0.95,0.82)*2.4 : (vHot > 0.5 ? vec3(1.0,0.8,0.45)*1.05 : vec3(0.82,0.64,0.4)*0.55);
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
        PICKED && near(CO, lat, lon)
          ? 2
          : COUNTRIES.some((c) => shown(c) && near(c, lat, lon))
            ? 1
            : 0;
    }
    landDots.geometry.attributes.hot.needsUpdate = true;
  }
  const hq = byCode("SA"),
    arcs = [];
  const MARK = { hq: 0xffe0a0, office: 0xe9c983, field: 0xfff4e0, unconfirmed: 0x8a7766 };
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
      const line = new THREE.Line(geo, goldLine(0.22));
      globe.add(line);
      arcs.push({ geo, line, c, curve });
    }
    return { c, m };
  });
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xfff2c8).multiplyScalar(6),
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
      a.line.material.color.set(0xe9c983).multiplyScalar(on ? 2.6 : 1);
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
      color: new THREE.Color(0xffe0a0).multiplyScalar(3),
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
      color: new THREE.Color(0xffd98f).multiplyScalar(3),
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
    l.el.textContent = c.ar;
    l.globe = c;
    l.el.addEventListener("click", () => S.stage === "world" && selectCountry(c.code));
  });
  let TOP3 = new Set();
  /* the chosen city's name, laid in gold leaf on the land at the foot of its column */
  const engraveCv = document.createElement("canvas");
  engraveCv.width = 1024;
  engraveCv.height = 256;
  const engraveTex = new THREE.CanvasTexture(engraveCv);
  engraveTex.colorSpace = THREE.SRGBColorSpace;
  engraveTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const engrave = new THREE.Group();
  const engraveM = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.65),
    new THREE.MeshBasicMaterial({ map: engraveTex, transparent: true, depthWrite: false }),
  );
  engraveM.rotation.x = -Math.PI / 2;
  engraveM.position.z = 1.05;
  engrave.add(engraveM);
  country.add(engrave);
  let engraved = "";
  function engraveCity() {
    const o = pillars.find((p) => p.c.id === S.city);
    if (!o) return;
    engrave.position.set(o.g.position.x, 0.68, o.g.position.z);
    if (engraved === o.c.ar) return;
    engraved = o.c.ar;
    const x = engraveCv.getContext("2d");
    x.clearRect(0, 0, 1024, 256);
    x.direction = "rtl";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = `700 132px "${DISPLAY}", serif`;
    const g = x.createLinearGradient(0, 40, 0, 220);
    g.addColorStop(0, "#fbe9bf");
    g.addColorStop(0.55, "#d4af6a");
    g.addColorStop(1, "#8a6a32");
    x.shadowColor = "rgba(0,0,0,0.65)";
    x.shadowOffsetY = 4;
    x.shadowBlur = 10;
    x.fillStyle = g;
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
    labels.forEach((l) => l.globe && l.el.classList.toggle("hot", PICKED && l.globe === CO));
    pillars.forEach((o) => {
      o.label.el.classList.toggle("hot", o.c.id === S.city);
      o.label.el.innerHTML = `${o.c.ar} · <span class="num">${gapOf(o.c)}</span>`;
    });
  }
  const legend = $("#legend");
  function renderLegend() {
    const c = CITIES.find((x) => x.id === S.city);
    if (!legend || !c) return;
    const row = (t, n, w) =>
      `<li class="lg-${t}"><i aria-hidden="true"></i>${w}<b class="num">${fmt(n)}</b><small>/ <span class="num">${fmt(c.need)}</span></small></li>`;
    legend.innerHTML = `<p>${c.ar}</p><ul>${row("qualify", c.qualified, "تأهّلوا")}${row("sponsor", c.sponsored, "مكفولون")}${row("kiswa", c.clothed, "مكسوّون")}</ul>`;
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
  canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("pointerup", (e) => {
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
  canvas.addEventListener("pointermove", (e) => {
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
    view.ty = PHONE() && panel.classList.contains("on") ? panel.offsetHeight / 2 : 0;
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
    S.stage = s;
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
  }
  function hint(t) {
    const h = $("#hint");
    if (!t) {
      gsap.to(h, { autoAlpha: 0, y: 10, duration: 0.3 });
      return;
    }
    h.textContent = t;
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
  function showPanel(html) {
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

  /* ── Gate: title words, then doors, then the dolly ──────────────── */
  const words = $("#gate h1").textContent.trim().split(/\s+/);
  $("#gate h1").innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(" ");
  gsap.from("#gate .eyebrow, #gate h1 .w, #gate p, .country-pick button, #enter", {
    autoAlpha: 0,
    y: 30,
    filter: "blur(10px)",
    duration: 1.2,
    stagger: 0.09,
    ease: "expo.out",
    delay: 0.2,
    clearProps: "filter",
  });
  gsap.to(doorGlow, { intensity: 40, duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 });

  /* ── Direction: authored camera paths, optional sound, film mode ── */
  const sound = createSound();
  const focusBtn = $("#focusBtn");
  focusBtn?.addEventListener("click", () => {
    const v = root.classList.toggle("focus");
    frameForPanel();
    focusBtn.setAttribute("aria-pressed", String(v));
    focusBtn.textContent = v ? "إظهار اللوحات" : "عرض المجسّم";
  });
  const soundBtn = $("#soundBtn");
  soundBtn?.addEventListener("click", async () => {
    const v = await sound.toggle();
    soundBtn.setAttribute("aria-pressed", String(v));
    soundBtn.textContent = v ? "الصوت يعمل" : "الصوت";
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
  function hallPose(i) {
    const g = VIEWS[(i + VIEWS.length) % VIEWS.length].group,
      p = g.getWorldPosition(new THREE.Vector3()),
      w = i === 1 ? 9 : 6;
    const dir = new THREE.Vector3(p.x, 0, p.z).normalize();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const d = Math.min(24, Math.max(10, (w / 2 + 0.7) / half));
    const cam = p.clone().sub(dir.multiplyScalar(d));
    cam.y = 5.2;
    return { cam, target: p };
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
  function stopFilm() {
    if (!FILM) return;
    FILM = false;
    root.classList.remove("film");
    caption("");
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
    FILM = true;
    root.classList.add("film");
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const steps = [
      [() => enterHall(), "قاعة الأثر: هنا يرى الداعم أين يذهب دعمه، وماذا يغيّر", 5200],
      [() => enterWorld(), "شبكة الندوة: المقرّ في الرياض و26 موقعاً مؤكَّد الحضور", 4600],
      [
        () => selectCountry("AL"),
        "نختار ألبانيا: نشاطٌ ميداني للندوة، بأرقام محرّك منصة الرؤية",
        4200,
      ],
      [
        () => enterCountry(),
        "ندخلها: لكلّ مدينةٍ عمودٌ بقدر حاجتها، والذهبيّ ما مُوِّل تأهيله",
        7000,
      ],
      [
        () => {
          S.track = "qualify";
          S.amount = 10000;
          setStage("support");
          selectCity("tirana");
        },
        "ندعم تيرانا بعشرة آلاف ريال تأهيلاً، فيظهر الأثر قبل الدفع",
        5200,
      ],
      [() => pay(), "يتدفّق الدعم، ويرتفع عمود تيرانا بقدر ما موّل", 5200],
      [() => {}, "ثم الأثر على أربعة مستويات: البلد، والمدينة، والمجموعة، والطالب", 14000],
      [() => enterBig(), "وأخيراً الصورة الكلية في منصة القرار", 7000],
    ];
    for (const [act, text, ms] of steps) {
      if (!FILM || disposed) return;
      caption(text);
      act();
      await wait(ms);
    }
    stopFilm();
  }
  $("#film")?.addEventListener("click", () => film());

  function enterHall() {
    if (S.stage !== "gate") return;
    sound.cue("door");
    const tl = gsap.timeline();
    const end = hallPose(1);
    tl.to("#gate", { autoAlpha: 0, duration: 0.9, ease: "power2.inOut" })
      .add(() => $("#gate").classList.add("gone"))
      .to(doorGlow, { intensity: 260, duration: 0.8, ease: "power2.in" }, 0.2)
      .to(doors[0].pivot.rotation, { y: 1.85, duration: 2.6, ease: "power3.inOut" }, 0.4)
      .to(doors[1].pivot.rotation, { y: -1.85, duration: 2.6, ease: "power3.inOut" }, 0.4)
      .to(bloom, { intensity: 2.2, duration: 1.2, ease: "power2.in" }, 0.6)
      .to(bloom, { intensity: 1.15, duration: 1.6, ease: "power2.out" }, 1.8)
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
        if (!PHONE())
          hint(
            PICKED
              ? "المس الكرة لتختار دولة، أو الشاشة لتعود إلى " + CO.ar
              : "المس الكرة لتفتح خريطة العالم وتختار دولتك",
          );
      }, 3.8);
  }
  $("#enter")?.addEventListener("click", () => enterHall());
  focus.set(0, 4, 17.6);

  /* ── Into the country: push in, flash, rise ─────────────────────── */
  function enterCountry() {
    hint("");
    const fromWorld = S.stage === "world";
    sound.cue("dive");
    buildCountry();
    const tl = gsap.timeline();
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
      .to(ca.offset, { x: 0.004, y: 0.003, duration: 1.1, ease: "power2.in" }, 0)
      .to(bloom, { intensity: 3.4, duration: 1.1, ease: "power3.in" }, 0.15)
      .to("#veil", { opacity: 0.92, duration: 0.45, ease: "power2.in" }, 0.9)
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
      .to(bloom, { intensity: 1.15, duration: 1.4, ease: "power2.out" }, "<")
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
    controls.smoothTime = 1.2;
    controls.setLookAt(0, 7.4, 14.2, 0, 5.4, 0, true);
    gsap.to(focus, { x: 0, y: 5.4, z: 0, duration: 1.4 });
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
  }
  function selectCountry(code) {
    sound.cue("tick");
    if (CO.code === code && S.stage === "world" && panel.querySelector(".co-card")) {
      /* already chosen */
    }
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
    x.shadowColor = "rgba(233,201,131,.55)";
    x.shadowBlur = 26;
    path();
    const g = x.createLinearGradient(0, oy - s, 0, oy + s);
    g.addColorStop(0, "#6b1d2f");
    g.addColorStop(1, "#2b0b14");
    x.fillStyle = g;
    x.fill();
    x.restore();
    path();
    x.strokeStyle = "#e3c27e";
    x.lineWidth = 2;
    x.stroke();
    regionsFor(co).forEach((c) => {
      x.beginPath();
      x.arc(ox + c.nx * s, oy - c.ny * s, 4 + c.need / 14, 0, Math.PI * 2);
      x.fillStyle = "rgba(243,227,181,.85)";
      x.fill();
    });
  }
  function cardHTML() {
    const sim = CO.sim;
    return `<article class="co-card">
      <div class="co-head"><div><h3>${CO.ar}</h3><span class="st ${CO.st}">${STATUS[CO.st]}</span></div><canvas id="coShape" width="520" height="300" aria-label="شكل ${CO.ar}"></canvas></div>
      ${CO.type ? `<p class="co-line"><b>${CO.type}</b>${CO.city ? ` · ${CO.city}` : ""}</p>` : `<p class="co-line">لا دليل حديثاً على حضورٍ للندوة هنا، فلا تُعرض مكتباً لها. تظهر في النموذج الكامل للإدارة، وأرقامها افتراضية.</p>`}
      ${CO.act ? `<p class="co-act">${CO.act}<small> · من البحث العامّ</small></p>` : ""}
      <div class="kv">
        <div><dt>مجموعات تأهيل</dt><dd class="num">${sim.groups}</dd></div>
        <div><dt>أيتامٌ في التأهيل</dt><dd class="num">${sim.inQualification}</dd></div>
        <div><dt>نسبة التمويل</dt><dd class="num">${sim.funded}%</dd></div>
        <div><dt>مشرفون</dt><dd class="num">${sim.supervisors}</dd></div>
      </div>
      ${PRI.has(CO.code) ? `<p class="co-act"><b>${TIER[PRI.get(CO.code).tier]} لفتح مكتب:</b> ${rationale(PRI.get(CO.code), "ar")}</p>` : ""}
      <p class="note">${LINKED.has(CO.code) ? `<span class="src real">حقيقي</span> أرقامٌ من منصّة تشغيل ${CO.ar} المتّصلة.` : CO.code === "AL" ? `<span class="src">محرّك الرؤية</span> مدن ${CO.ar} ومجموعاتها وأطفالها من محرّك منصة الرؤية، ودعمك هنا يظهر هناك.` : `<span class="src">افتراضي</span> أرقام التشغيل افتراضية حتى تتّصل منصّة تشغيل ${CO.ar}.`}</p>
      <div class="row pin"><button class="cta" type="button" id="enterCo">ادخل ${CO.ar}</button><button class="ghost" type="button" id="toHall">عودة إلى القاعة</button></div>
    </article>`;
  }
  function renderWorld() {
    const n = (st) => COUNTRIES.filter((c) => c.st === st).length,
      sim = CO.sim,
      sites = COUNTRIES.filter(shown).length - 1;
    const groups = [
      ["hq", "المقرّ الرئيسي"],
      ["office", "مكاتب مؤكَّدة"],
      ["field", "نشاط ميداني"],
      ...(VIEW.all ? [["unconfirmed", "غير مؤكَّد — للإدارة فقط"]] : []),
    ];
    showPanel(`
    <h2>شبكة الندوة حول العالم</h2>
    ${PICKED ? cardHTML() : `<article class="co-card empty"><h3>اختر دولة</h3><p class="co-line">المس دولةً على الكرة أو من القائمة، فتظهر صورتها وحالها هنا، ثم تدخلها.</p></article>`}
    <p class="sub">${VIEW.all ? `النموذج الكامل: المقرّ و<span class="num">34</span> موقعاً، منها <span class="num">${n("unconfirmed")}</span> غير مؤكَّدة تظهر للإدارة فقط.` : `كخريطة الشبكة في الموقع: المقرّ في الرياض و<span class="num">${sites}</span> موقعاً مؤكَّد الحضور.`} كلّها تعمل هنا افتراضياً حتى تتّصل منصّة تشغيلها.</p>
    <div class="kpis ${VIEW.all ? "k4" : ""}">
      <div class="kpi"><b class="num" data-count="${n("hq")}">0</b><span>مقرّ رئيسي</span></div>
      <div class="kpi"><b class="num" data-count="${n("office")}">0</b><span>مكتباً مؤكَّداً</span></div>
      <div class="kpi"><b class="num" data-count="${n("field")}">0</b><span>نشاطاً ميدانياً</span></div>
      ${VIEW.all ? `<div class="kpi"><b class="num" data-count="${n("unconfirmed")}">0</b><span>غير مؤكَّد</span></div>` : ""}
    </div>
    <div class="layers" role="group" aria-label="الطبقة"><button type="button" data-layer="network" aria-pressed="${VIEW.layer === "network"}">الشبكة</button><button type="button" data-layer="gap" aria-pressed="${VIEW.layer === "gap"}">تحتاج مكتباً</button></div>
    ${
      VIEW.layer === "gap"
        ? `<p class="sub">كطبقة «تحتاج مكتباً» في خريطة الموقع: دولٌ للندوة فيها نشاطٌ ميداني أو حضورٌ غير مؤكَّد، مرتّبةً بتقدير أيتامها وثقة مصدره.</p>${[
            "high",
            "medium",
            "data",
          ]
            .map((t) => {
              const list = [...PRI.values()].filter((p) => p.tier === t);
              return list.length
                ? `<div class="sect">${TIER[t]}</div><div class="co-list">${list.map((p) => `<button type="button" data-co="${p.code}" aria-pressed="${PICKED && p.code === CO.code}"><i class="dot gap-${t}"></i>${(byCode(p.code) || { ar: p.code }).ar}</button>`).join("")}</div>`
                : "";
            })
            .join("")}`
        : ""
    }
    <div class="row" style="margin-top:12px"><button class="ghost" type="button" id="toggleAll" aria-pressed="${VIEW.all}">${VIEW.all ? "اعرض المؤكَّد فقط" : "اعرض النموذج الكامل · 34 موقعاً"}</button></div>

    ${(VIEW.layer === "gap" ? [] : groups)
      .map(
        ([st, name]) =>
          `<div class="sect">${name}</div><div class="co-list">${COUNTRIES.filter(
            (c) => c.st === st,
          )
            .map(
              (c) =>
                `<button type="button" data-co="${c.code}" aria-pressed="${c === CO}"><i class="dot ${c.st}"></i>${c.ar}</button>`,
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
    hint(PHONE() ? "" : "اسحب لتدير العالم · المس دولةً لترى صورتها");
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
    return [...CITIES]
      .sort((a, b) => gapOf(b) - gapOf(a))
      .map(
        (c) => `
    <li><button type="button" data-city="${c.id}" aria-pressed="${c.id === S.city}">
      <span><b>${c.ar}</b></span><small><span class="num">${gapOf(c)}</span> ينتظرون من <span class="num">${c.need}</span></small>
      <span class="bar"><i style="width:${Math.round((c.qualified / c.need) * 100)}%"></i></span></button></li>`,
      )
      .join("");
  }
  function renderCountry() {
    const t = totals(),
      c = city();
    hideImpact();
    showPanel(`
    <h2>${CO.ar} · الحال الآن</h2>
    <p class="sub">${STATUS[CO.st]}${CO.city ? ` · ${CO.city}` : ""}. ارتفاع كلّ عمود حاجةُ ${CO.code === "AL" ? "المدينة" : "المنطقة"}، والذهبيّ فيه ما مُوِّل تأهيله.${CO.code === "AL" ? "" : " المناطق وأرقامها افتراضية."}</p>
    <div class="kpis">
      <div class="kpi"><b class="num" data-count="${t.need}">0</b><span>يتيماً في الحاجة</span></div>
      <div class="kpi"><b class="num" data-count="${t.pct}" data-suf="%">0</b><span>مموّلٌ تأهيلهم</span></div>
      <div class="kpi"><b class="num" data-count="${t.gap}">0</b><span>ينتظرون</span></div>
    </div>
    <div class="sect">${CO.code === "AL" ? "المدن" : "المناطق"} · الأكبر فجوةً أوّلاً</div>
    <ul class="cities">${cityRows()}</ul>
    <div class="row"><button class="cta" type="button" id="toSupport">ادعم ${c.ar}</button><button class="ghost" type="button" id="otherCo">دولة أخرى</button></div>`);
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
    hint(PHONE() ? "" : "اسحب لتدور حول الدولة · المس عموداً لتختار مدينته");
    refreshLabels();
    layoutDots();
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

  function renderSupport() {
    const c = city();
    showPanel(`
    <h2>ادعم ${c.ar}</h2>
    <p class="sub">اختر نوع الدعم ومقداره، فيتغيّر الأثر أمامك على العمود ونقاط الأيتام وشاشة الأثر قبل أن تدفع.</p>
    <div class="sect">نوع الدعم</div>
    <div class="tracks" role="group" aria-label="نوع الدعم">
      ${Object.entries(TRACKS)
        .map(
          ([k, t]) =>
            `<button type="button" data-track="${k}" aria-pressed="${k === S.track}"><b>${t.name}</b><small>${t.unitName} · <span class="num">${t.unit}</span> ر.س</small></button>`,
        )
        .join("")}
    </div>
    <div class="sect">المقدار</div>
    <div class="amount"><span class="num" id="amtOut">${fmt(S.amount)}</span> <small>ر.س</small></div>
    <input id="amt" type="range" min="1000" max="100000" step="500" value="${S.amount}" aria-label="المقدار">
    <div class="presets">${[1000, 5000, 10000, 25000, 50000].map((v) => `<button type="button" data-amt="${v}" aria-pressed="${v === S.amount}"><span class="num">${fmt(v)}</span></button>`).join("")}</div>
    <div class="sect">الوجهة</div>
    <select id="dest" aria-label="المدينة">${CITIES.map((x) => `<option value="${x.id}" ${x.id === S.city ? "selected" : ""}>${x.ar} — ${gapOf(x)} ينتظرون</option>`).join("")}</select>
    <div class="row"><button class="cta" type="button" id="pay">ادعم الآن</button><button class="ghost" type="button" id="back">رجوع</button></div>
    <p class="note">الدفع هنا تصوّري. في المنصة الحقيقية يمرّ ببوابة الدفع ويُقيَّد بفاتورة وإيصال ببصمة.</p>`);
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
          onUpdate: () => (out.textContent = fmt(shown.v)),
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
      p = project(),
      money = `<span class="num">${fmt(S.amount)}</span> ر.س`;
    let title, items;
    if (p.track === "qualify") {
      title = `لو دعمت بـ ${money} تأهيلاً في ${c.ar}`;
      items = [
        [
          `<span class="num">${p.kids}</span> طفلاً يبدأون رحلة التأهيل`,
          `كلّ رحلة <span class="num">600</span> ر.س${p.spill ? ` · والباقي لـ <span class="num">${p.spill}</span> طفلاً يذهب لأقرب فجوة` : ""}`,
        ],
        [
          p.groups
            ? `<span class="num">${p.groups}</span> ${p.groups > 2 ? "مجموعات" : p.groups === 2 ? "مجموعتان" : "مجموعة"} كاملة${p.rest ? ` و<span class="num">${p.rest}</span> في مجموعةٍ قيد التكوين` : ""}`
            : `<span class="num">${p.kids}</span> في مجموعةٍ قيد التكوين`,
          "ستّ جلسات لكلّ مجموعة، وقياسٌ للسمات الستّ قبلها وبعدها",
        ],
        [
          `فجوة ${c.ar}: <span class="num">${p.gap0}</span> ← <span class="num">${p.gap1}</span> طفلاً`,
          `تنخفض <span class="num">${p.gap0 ? Math.round((p.kids / p.gap0) * 100) : 0}%</span> · متوسّط السمات المتوقّع <span class="num">15.4</span> ← <span class="num">17.0</span>`,
        ],
      ];
    } else if (p.track === "sponsor") {
      title = `لو كفلت بـ ${money} في ${c.ar}`;
      items = [
        [
          `<span class="num">${p.units}</span> شهر كفالة`,
          `كلّ شهر <span class="num">300</span> ر.س يصل الطفل بإثبات تسليم`,
        ],
        [
          p.years
            ? `<span class="num">${p.years}</span> ${p.years > 2 ? "أطفال" : p.years === 2 ? "طفلان" : "طفل"} لسنةٍ كاملة${p.months ? ` و<span class="num">${p.months}</span> أشهر لطفلٍ آخر` : ""}`
            : `<span class="num">${p.months}</span> أشهر لطفلٍ واحد`,
          "يُختار الأطفال ممّن أتمّوا التأهيل ولا كفيل لهم",
        ],
        [
          `المكفولون في ${c.ar}: <span class="num">${p.sp0}</span> ← <span class="num">${p.sp1}</span>`,
          "ارتفاعٌ متوقّع خلال سنة في الصمود والدراية والهمّة (تقديرٌ يضبطه القياس)",
        ],
      ];
    } else {
      title = `لو دعمت بـ ${money} كسوةً في ${c.ar}`;
      items = [
        [
          `<span class="num">${p.kids}</span> يتيماً يُكسَون`,
          `كسوة اليتيم <span class="num">300</span> ر.س${p.spill ? ` · والباقي لـ <span class="num">${p.spill}</span> يذهب لأقرب حاجة` : ""}`,
        ],
        [
          "تُسلَّم خلال 1–3 أسابيع بإثبات",
          "يُرفق إثبات التسليم بعدد المستلمين وتاريخه، بلا صورٍ للأطفال",
        ],
        [
          `حاجة الكسوة في ${c.ar}: <span class="num">${p.k0}</span> ← <span class="num">${p.k1}</span>`,
          `تُسدّ <span class="num">${p.k0 ? Math.round((p.kids / p.k0) * 100) : 0}%</span> من حاجة الموسم`,
        ],
      ];
    }
    const key = JSON.stringify(items.map((x) => x[0]));
    showImpact(
      `<div class="eyebrow">شاشة الأثر · قبل الدفع</div><h3>${title}</h3>
    <ol class="chain">${items.map(([b, s], i) => `<li><span class="n num">${i + 1}</span><div><b>${b}</b><span>${s}</span></div></li>`).join("")}</ol>`,
      key !== lastKey && !first,
    );
    if (first) reveal(impact.querySelector(".chain"), 0.3);
    lastKey = key;
    const o = pillars.find((x) => x.c.id === S.city);
    pillars.forEach((x) => {
      x.ghostTarget = x === o && p.track === "qualify" ? H(p.kids) : 0;
    });
  }

  /** qualification: six session rings climb the new gold; sponsorship: lanterns join the orbit; clothing: gifts fall onto the children */
  const SAY = {
    qualify: (k) => `انظر إلى العمود: صعد الذهب، والحلقات الذهبية جلسات ${k} طفلاً`,
    sponsor: (k) => `انظر حول العمود: ${k} فوانيس زمرّدية انضمّت إلى مدار الكفالة`,
    kiswa: (k) => `انظر إلى الأطفال: ${k} هديةً لؤلؤية نزلت عليهم`,
  };
  function arrive(p, o, c) {
    sound.cue(p.track);
    renderLegend();
    hint(SAY[p.track](fmt(p.kids)));
    const live = $("#srLive");
    if (live) live.textContent = SAY[p.track](fmt(p.kids));
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
    let p = project();
    if (!p.kids) return;
    S.before = { ...c, totals: totals() };
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
        donor: "داعم القاعة",
        at: Date.now(),
      });
      if (!FILM) {
        saveEngine(ENGINE, store);
        window.dispatchEvent(new Event(SYNC_EVENT));
      }
      const fresh = albaniaRegions(ENGINE, regionsFor(CO));
      CITIES.forEach((r) =>
        Object.assign(
          r,
          fresh.find((x) => x.id === r.id),
        ),
      );
      // the engine charges the gateway fee, so read back how many it actually funded
      if (p.track === "qualify")
        p = { ...p, kids: c.qualified - S.before.qualified, gap1: gapOf(c) };
      facts = levelFacts(s0, ENGINE, c.id);
    } else applyTo(p, c);
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
    const tl = gsap.timeline();
    tl.to(flow, { t: 1.1, duration: 1.9, ease: "power1.inOut", onStart: () => (flow.t = 0) })
      .to(bloom, { intensity: 2.1, duration: 0.9, ease: "power2.in" }, 0.6)
      .add(() => {
        shock.position.set(o.g.position.x, 0.66, o.g.position.z);
        shock.scale.setScalar(0.5);
        shock.material.opacity = 1;
      }, 1.7)
      .to(shock.scale, { x: 14, y: 14, z: 14, duration: 1.6, ease: "expo.out" }, 1.7)
      .to(shock.material, { opacity: 0, duration: 1.6, ease: "power2.out" }, 1.7)
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
      .to(bloom, { intensity: 1.15, duration: 1.4 }, 2.3)
      .add(() => arrive(p, o, c), 1.7)
      .add(() => {
        const label = {
          qualify: `تأهّل ${p.kids} طفلاً في ${c.ar}`,
          sponsor: `كفالة ${p.kids} ${p.kids > 2 ? "أطفال" : "طفل"} في ${c.ar}`,
          kiswa: `كُسي ${p.kids} يتيماً في ${c.ar}`,
        }[p.track];
        S.history.push({
          title: label,
          line: `${fmt(S.amount)} ر.س · ${TRACKS[p.track].name}`,
          amount: S.amount,
          kids: p.kids,
          track: p.track,
          co: CO.ar,
          place: c.ar,
          levels: "",
        });
        S.last = { ...p, city: c.id, amount: S.amount, facts, engine: isEngine() };
        drawMap();
        drawImpactScreen();
        refreshLabels();
        S.stage = "impactPending";
      }, 1.8)
      .add(() => {
        root.classList.remove("watching");
        setStage("impact");
        renderImpact();
      }, 3.6);
    void fillFrom;
  }

  function renderImpact() {
    sound.cue("bell");
    const L = S.last,
      c = city(L.city),
      b = S.before,
      money = `<span class="num">${fmt(L.amount)}</span> ر.س`;
    const fee = Math.round(L.amount * 0.05),
      net = L.amount - fee,
      inv = `DEMO-INV-2026-${String(S.history.length).padStart(4, "0")}`;
    const bars = (rows, after = true) =>
      `<div class="traits">${rows.map(([n, a, z]) => `<div class="trait"><span>${n}</span><div class="track"><i class="was" style="width:${(a / 24) * 100}%"></i>${after ? `<i class="now" data-w="${(z / 24) * 100}" style="width:${(a / 24) * 100}%"></i>` : ""}</div><em>${after ? `<span class="num">${a.toFixed(1)}</span> ← <b class="num">${z.toFixed(1)}</b>` : `<b class="num">${a.toFixed(1)}</b>`}</em></div>`).join("")}</div>`;
    const big = (label, v0, v1, suf = "", good = "down") => {
      const d = v1 - v0,
        sign = d > 0 ? "+" : "−",
        ok = good === "down" ? d < 0 : d > 0,
        int = Number.isInteger(v0) && Number.isInteger(v1),
        f = (v) => (int ? fmt(v) : v.toFixed(1));
      return `<div class="delta-row"><div><small>${label}</small><div class="dv"><b class="num was">${f(v0)}${suf}</b><span class="arrow">←</span>${int ? `<b class="num now" data-count="${v1}" data-from="${v0}" data-suf="${suf}">${f(v0)}${suf}</b>` : `<b class="num now">${f(v1)}${suf}</b>`}</div></div><span class="chip-d ${ok ? "ok" : ""}"><span class="num">${sign}${f(Math.abs(d))}${suf}</span></span></div>`;
    };
    const kv = (rows) =>
      `<dl class="kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
    const lvC = [
      "rgba(246,239,226,.22)",
      "rgba(212,175,106,.42)",
      "rgba(212,175,106,.72)",
      "#f3e3b5",
    ];
    const lvNames = ["في البداية", "نامٍ", "متمكّن", "متميّز"];
    const lvBar = (v) =>
      `<div class="lv">${v.map((x, i) => `<i style="flex-grow:${x};background:${lvC[i]}"></i>`).join("")}</div>`;
    const legend = `<div class="legend">${lvNames.map((n, i) => `<span><i style="background:${lvC[i]}"></i>${n}</span>`).join("")}</div>`;
    let base, done, change, details, title;
    if (L.track === "qualify") {
      const lv0 = [60, 35, 5, 0],
        lv1 = [10, 45, 35, 10];
      title = `تأهّل <span class="num">${L.kids}</span> طفلاً في ${c.ar}`;
      base = `<p class="lead">قبل دعمك، هذا حال ${c.ar} كما قاسته المنصة التشغيلية.</p>
      ${kv([
        ["في الحاجة", `<span class="num">${c.need}</span> يتيماً`],
        ["ينتظرون التأهيل", `<span class="num">${gapOf(b)}</span>`],
        ["مموّلٌ تأهيلهم", `<span class="num">${Math.round((b.qualified / b.need) * 100)}%</span>`],
        ["متوسّط السمات الستّ", `<span class="num">15.4</span> · في البداية`],
      ])}
      <div class="sect">توزيع المستويات · القياس القبلي</div>${lvBar(lv0)}${legend}`;
      done = `<p class="lead">موّل دعمك ${money} رحلة <span class="num">${L.kids}</span> طفلاً: ${L.groups ? `<span class="num">${L.groups}</span> ${L.groups === 2 ? "مجموعتان" : L.groups > 2 ? "مجموعات" : "مجموعة"}` : "مجموعةٌ قيد التكوين"}، لكلٍّ منها ستّ جلسات بين قياسين.</p>
      <div class="timeline">${["قياسٌ قبلي", 1, 2, 3, 4, 5, 6, "قياسٌ بعدي"].map((n) => `<i>${typeof n === "number" ? `<span class="num">${n}</span>` : n}</i>`).join("")}</div>
      ${kv([
        ["المدّة", "6–8 أسابيع"],
        ["المشرف", "مشرف تيرانا · اسمٌ مستعار"],
        ["الحضور", `<span class="num">94%</span>`],
      ])}`;
      const lvNow = `<div class="lv" id="lvNow">${lv0.map((x, i) => `<i data-g="${lv1[i]}" style="flex-grow:${x};background:${lvC[i]}"></i>`).join("")}</div>`;
      change = `${big(`فجوة ${c.ar}`, gapOf(b), gapOf(c))}${big(`مموّلٌ تأهيلهم في ${CO.ar}`, b.totals.pct, totals().pct, "%", "up")}
      <div class="sect">المستويات · قبل ← الآن</div><div class="levels"><span>قبل</span>${lvBar(lv0)}<span>الآن</span>${lvNow}</div>${legend}
      <p class="note">متوسّط السمات الستّ: <span class="num">15.4</span> ← <b class="num">17.0</b> · من «في البداية» إلى «نامٍ».</p>`;
      details = `<div class="sect">السمات الستّ للفئة · قبل ← الآن</div>${bars(TRAITS)}
      <div class="sect">القيد المالي</div>${kv([
        ["الفاتورة", `<span class="num">${inv}</span>`],
        ["المبلغ", money],
        ["رسوم البوابة", `<span class="num">${fmt(fee)}</span> ر.س`],
        ["الصافي إلى حساب الندوة", `<span class="num">${fmt(net)}</span> ر.س`],
      ])}`;
    } else if (L.track === "sponsor") {
      title = `كفالة <span class="num">${L.kids}</span> ${L.kids > 2 ? "أطفال" : "طفل"} في ${c.ar}`;
      base = `<p class="lead">قبل دعمك: أطفالٌ أتمّوا التأهيل في ${c.ar} ولا كفيل لهم.</p>
      ${kv([
        [
          "المكفولون",
          `<span class="num">${b.sponsored}</span> من <span class="num">${c.need}</span>`,
        ],
        ["بلا كفيل", `<span class="num">${c.need - b.sponsored}</span>`],
        ["متوسّط الصمود", `<span class="num">14.2</span>`],
      ])}`;
      done = `<p class="lead">${money} = <span class="num">${L.units}</span> شهر كفالة، يصل كلّ شهرٍ للطفل بإثبات تسليم.</p>
      <div class="timeline">${Array.from({ length: 12 }, (_, i) => `<i><span class="num">${i + 1}</span></i>`).join("")}</div>
      ${kv([
        ["الصرف", "شهرياً عبر المكتب"],
        ["الإثبات", "توقيع المستلم وتاريخه"],
      ])}`;
      change = `${big("المكفولون", b.sponsored, c.sponsored, "", "up")}${big("بلا كفيل", c.need - b.sponsored, c.need - c.sponsored)}`;
      details = `<div class="sect">ما يتغيّر في سنة · تقديرٌ يضبطه القياس</div>${bars([
        ["الصمود", 14.2, 15.8],
        ["الدراية", 16.1, 17.0],
        ["الهمّة", 15.0, 15.7],
      ])}
      <div class="sect">القيد المالي</div>${kv([
        ["الفاتورة", `<span class="num">${inv}</span>`],
        ["المبلغ", money],
        ["الصافي", `<span class="num">${fmt(net)}</span> ر.س`],
      ])}`;
    } else {
      title = `تمّت كسوة <span class="num">${L.kids}</span> يتيماً في ${c.ar}`;
      base = `<p class="lead">قبل دعمك: حاجة الكسوة لهذا الموسم في ${c.ar}.</p>
      ${kv([
        ["في الحاجة", `<span class="num">${c.need}</span> يتيماً`],
        ["كُسوا هذا الموسم", `<span class="num">${b.clothed}</span>`],
        ["ينتظرون", `<span class="num">${b.need - b.clothed}</span>`],
      ])}`;
      done = `<p class="lead">${money} = <span class="num">${L.kids}</span> كسوة كاملة، تُشترى وتُجهَّز وتُسلَّم بإثبات.</p>
      <div class="timeline"><i>الشراء</i><i>التجهيز</i><i>التسليم</i><i>الإثبات</i></div>
      ${kv([
        ["المدّة", "1–3 أسابيع"],
        ["الإثبات", "عدد المستلمين وتاريخه وتوقيع المكتب"],
      ])}`;
      change = `${big("ينتظرون الكسوة", b.need - b.clothed, c.need - c.clothed)}${big("كُسوا هذا الموسم", b.clothed, c.clothed, "", "up")}`;
      details = `<p class="note">بلا صورٍ ولا أماكن للأطفال؛ يُكتفى بالعدد والتاريخ والتوقيع.</p>
      <div class="sect">القيد المالي</div>${kv([
        ["الفاتورة", `<span class="num">${inv}</span>`],
        ["المبلغ", money],
        ["الصافي", `<span class="num">${fmt(net)}</span> ر.س`],
      ])}`;
    }
    /* the same support read at four levels: country, region, group, child */
    const T0 = b.totals,
      T1 = totals(),
      reg = CO.code === "AL" ? "المدينة" : "المنطقة";
    const hsh = fnv(c.id + ":" + S.history.length),
      INI = ["س", "ع", "م", "ن", "ر", "ي", "ح", "ل", "ف", "ز"];
    const kid = {
      name: `«${INI[hsh % 10]}. ${INI[(hsh >>> 4) % 10]}.»`,
      age: 8 + ((hsh >>> 8) % 7),
      code: `DEMO-${CO.code}-${1000 + (hsh % 9000)}`,
    };
    const nGroups = Math.max(1, Math.ceil(L.kids / 8)),
      gName = `مجموعة ${c.ar} · ${1 + (hsh % 4)}`;
    const level = (icon, name, place, rows, meaning) =>
      `<article class="lvl"><header><span class="ic">${icon}</span><div><small>${name}</small><b>${place}</b></div></header>${rows}<p class="mean">${meaning}</p></article>`;
    let levels;
    if (L.track === "qualify") {
      const lv0 = [5, 3, 0, 0],
        lv1 = [1, 4, 2, 1];
      levels =
        level(
          "1",
          "البلد",
          CO.ar,
          big("مموّلٌ تأهيلهم", T0.pct, T1.pct, "%", "up") + big("ينتظرون التأهيل", T0.gap, T1.gap),
          `اقترب ${CO.ar} من سدّ حاجته؛ بإيقاع اليوم تُسدّ الفجوة خلال <b class="num">${Math.ceil(T1.gap / pace())}</b> شهراً.`,
        ) +
        level(
          "2",
          reg,
          c.ar,
          big(`ينتظرون في ${c.ar}`, gapOf(b), gapOf(c)) +
            big(
              "تأهّل من حاجتها",
              Math.round((b.qualified / b.need) * 100),
              Math.round((c.qualified / c.need) * 100),
              "%",
              "up",
            ),
          `دعمك وحده موّل <b class="num">${Math.round((L.kids / Math.max(1, gapOf(b))) * 100)}%</b> ممّا كانت ${c.ar} تنتظره.`,
        ) +
        level(
          "3",
          "المجموعة",
          `${gName}${nGroups > 1 ? ` و<span class="num">${nGroups - 1}</span> غيرها` : ""}`,
          big("جلساتٌ منفّذة", 0, 6, "", "up") +
            big("متوسّط السمات الستّ", 15.4, 17.0, "", "up") +
            `<div class="levels"><span>قبل</span>${lvBar(lv0)}<span>الآن</span><div class="lv lvNow">${lv0.map((x, i) => `<i data-g="${lv1[i]}" style="flex-grow:${x};background:${lvC[i]}"></i>`).join("")}</div></div>${legend}`,
          `ثمانية أطفال في كلّ مجموعة؛ انتقل <b class="num">4</b> من <span class="num">8</span> إلى مستوىً أعلى.`,
        ) +
        level(
          "4",
          "الطالب",
          `${kid.name} · <span class="num">${kid.age}</span> سنة`,
          bars(
            TRAITS.map(([n, a, z], i) => [
              n,
              a - 0.6 + ((hsh >>> i) % 7) / 10,
              z - 0.3 + ((hsh >>> (i + 3)) % 7) / 10,
            ]),
          ),
          `انتقل من «في البداية» إلى «نامٍ»، وأكبر ارتفاعٍ عنده في الرشد والصمود. اسمٌ مستعار ورمز <span class="num">${kid.code}</span>.`,
        );
    } else if (L.track === "sponsor") {
      levels =
        level(
          "1",
          "البلد",
          CO.ar,
          big("مكفولون في البلد", T0.sponsored, T1.sponsored, "", "up"),
          `كفالاتٌ شهرية جديدة تصل بإثبات تسليم كلّ شهر.`,
        ) +
        level(
          "2",
          reg,
          c.ar,
          big(`مكفولون في ${c.ar}`, b.sponsored, c.sponsored, "", "up") +
            big("بلا كفيل", b.need - b.sponsored, c.need - c.sponsored),
          `تقلّص عدد من أتمّوا التأهيل ولا كفيل لهم.`,
        ) +
        level(
          "3",
          "المجموعة",
          gName,
          big("مكفولون من 8", 2, Math.min(8, 2 + L.kids), "", "up"),
          `الكفالة تُثبّت الطفل في مجموعته ومتابعته الشهرية.`,
        ) +
        level(
          "4",
          "الفرد",
          `${kid.name} · <span class="num">${kid.age}</span> سنة`,
          bars([
            ["الصمود", 14.2, 15.8],
            ["الدراية", 16.1, 17.0],
            ["الهمّة", 15.0, 15.7],
          ]) +
            `<div class="kv"><div><dt>يصله شهرياً</dt><dd><span class="num">300</span> ر.س</dd></div><div><dt>المدّة</dt><dd><span class="num">${Math.min(12, L.units)}</span> شهراً</dd></div></div>`,
          `مبلغٌ ثابت بإثبات تسليمٍ شهري، وارتفاعٌ متوقّع في سماته يضبطه القياس.`,
        );
    } else {
      levels =
        level(
          "1",
          "البلد",
          CO.ar,
          big("مكسوّون هذا الموسم", T0.clothed, T1.clothed, "", "up"),
          `تُسدّ حاجة الموسم في ${CO.ar} بقدر دعمك.`,
        ) +
        level(
          "2",
          reg,
          c.ar,
          big("ينتظرون الكسوة", b.need - b.clothed, c.need - c.clothed),
          `<b class="num">${Math.round((L.kids / Math.max(1, b.need - b.clothed)) * 100)}%</b> من حاجة ${c.ar} سُدّت بدعمك.`,
        ) +
        level(
          "3",
          "المجموعة",
          `<span class="num">${nGroups}</span> ${nGroups > 2 ? "مجموعات" : nGroups === 2 ? "مجموعتان" : "مجموعة"} في ${c.ar}`,
          big("مكسوّون من 8 في المجموعة", 0, Math.min(8, L.kids), "", "up"),
          `تُسلَّم الكسوة للمجموعة كاملةً في يومٍ واحد بإثبات.`,
        ) +
        level(
          "4",
          "الفرد",
          `${kid.name} · <span class="num">${kid.age}</span> سنة`,
          `<div class="kv"><div><dt>قبل</dt><dd>بلا كسوة الموسم</dd></div><div><dt>الآن</dt><dd>كسوةٌ كاملة مسلَّمة</dd></div></div>`,
          `ثوبٌ وحذاءٌ ومعطفٌ للشتاء، بلا صورةٍ ولا مكانٍ للطفل.`,
        );
    }
    if (L.facts) {
      const f = L.facts,
        LV = { start: "في البداية", growing: "نامٍ", capable: "متمكّن", distinct: "متميّز" };
      const count = (arr) =>
        ["start", "growing", "capable", "distinct"].map((k) => arr.filter((x) => x === k).length);
      const [c0, c1] = [count(f.group.levels[0]), count(f.group.levels[1])];
      const moved = JSON.stringify(c0) !== JSON.stringify(c1);
      const g3 = level(
        "3",
        "المجموعة",
        f.group.name,
        `<div class="kv"><div><dt>أطفالها</dt><dd class="num">${f.group.members}</dd></div><div><dt>الجلسات</dt><dd><span class="num">${f.group.sessions}</span> من <span class="num">6</span></dd></div><div><dt>التمويل</dt><dd>${f.group.funded ? "مموّلة كاملةً" : "تنتظر التمويل"}</dd></div><div><dt>المصدر</dt><dd>محرّك منصة الرؤية</dd></div></div>
         <div class="levels"><span>الآن</span>${lvBar(c0)}${moved ? `<span>بعد القياس</span>${lvBar(c1)}` : ""}</div>${legend}`,
        moved
          ? "قيست المجموعة بعد جلساتها الستّ، وهذا انتقال مستوياتها."
          : "موّل دعمك المجموعة؛ تبدأ جلساتها الستّ في منصة التشغيل، ويظهر انتقال مستوياتها بعد القياس البعدي.",
      );
      const g4 = level(
        "4",
        L.track === "qualify" ? "الطالب" : "الفرد",
        `${f.child.name} · <span class="num">${f.child.age}</span> سنة`,
        bars(f.child.traits.map(([n, a, z]) => [n, a, z ?? a])),
        `مستواه الآن «${LV[f.child.from]}»${f.child.to && f.child.to !== f.child.from ? `، وصار «${LV[f.child.to]}»` : f.child.traits.some((t) => t[2] !== null) ? "، وارتفعت سماته بالدعم" : "، وتُقاس سماته بعد الجلسة السادسة"}. رمزه <span class="num">${f.child.code}</span>، وملفّه في صفحة الأثر بمنصة الرؤية.`,
      );
      const parts = levels.split('<article class="lvl">');
      levels = parts.slice(0, 3).join('<article class="lvl">') + g3 + g4;
    }
    S.history[S.history.length - 1].levels = levels;
    const TABS = [
      ["الأساس", base],
      ["ما تمّ", done],
      [
        "الأثر بالمستويات",
        `<p class="lead">دعمك نفسه، مقروءاً على أربعة مستويات: البلد، ثم ${reg}، ثم المجموعة، ثم ${L.track === "qualify" ? "الطالب" : "الفرد"}.</p><p class="note">${L.engine ? `<span class="src">محرّك الرؤية</span> الأرقام من محرّك منصة الرؤية بعد قيد دعمك فيه.` : `<span class="src">افتراضي</span> أرقام ${CO.ar} افتراضية حتى تتّصل منصّة تشغيلها.`}</p>${levels}`,
      ],
      ["التفاصيل", details],
    ];
    impact.hidden = true;
    showImpact(`<div class="eyebrow">شاشة الأثر · دعمك ${money}</div><h3>${title}</h3>
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
        backgroundColor: "#d4af6a",
        color: "#2b0e15",
        borderColor: "#d4af6a",
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
      if (auto && i < 3) {
        const d = i === 2 ? 9 : 4.2;
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
    showPanel(`
    <h2>تمّ — شكراً لك</h2>
    <p class="sub">قُيِّد دعمك بفاتورة، وسلك طريقه إلى التشغيل. اقرأ أثره: الأساس، ثم ما تمّ، ثم أثره على البلد و${CO.code === "AL" ? "المدينة" : "المنطقة"} والمجموعة و${L.track === "qualify" ? "الطالب" : "الفرد"}، ثم التفاصيل.</p>
    <div class="kpis">
      <div class="kpi"><b class="num" data-count="${L.amount}">0</b><span>ر.س دعمك</span></div>
      <div class="kpi"><b class="num" data-count="${L.kids}">0</b><span>${L.track === "sponsor" ? "مكفولاً" : L.track === "kiswa" ? "مكسوّاً" : "متأهّلاً"}</span></div>
      <div class="kpi"><b class="num">${inv.slice(-4)}</b><span>رقم الفاتورة</span></div>
    </div>
    <div class="row"><button class="cta" type="button" id="toBig">الصورة الكلية</button><button class="ghost" type="button" id="again">دعمٌ آخر</button></div>`);
    onPanel(() => {
      $("#toBig")?.addEventListener("click", enterBig);
      $("#again")?.addEventListener("click", () => {
        pillars.forEach((o) => (o.baseH = o.fillH));
        setStage("support");
        renderSupport();
      });
    });
  }

  /* ── The big picture: crane up, the country flies into the globe ─ */
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
    const tl = gsap.timeline();
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
      .to(bloom, { intensity: 2.4, duration: 0.5, ease: "power2.in" }, 1.6)
      .add(() => (country.visible = false), 1.95)
      .to(bloom, { intensity: 1.2, duration: 1.2, ease: "power2.out" }, 2.0)
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
    const PACE = pace(),
      t = totals(),
      b = S.before.totals,
      L = S.last,
      months = Math.ceil(t.gap / PACE),
      months0 = Math.ceil(b.gap / PACE);
    const cmp = (l0, v0, l1, v1, suf = "") =>
      `<div class="compare"><div><small>${l0}</small><b class="num">${fmt(v0)}${suf}</b></div><span>←</span><div class="after"><small>${l1}</small><b class="num" data-count="${v1}" data-from="${v0}" data-suf="${suf}">${fmt(v0)}${suf}</b></div></div>`;
    showPanel(`
    <h2>الصورة الكلية</h2>
    <p class="sub">منصة الرؤية والتوجهات · المقرّ في الرياض و<span class="num">${COUNTRIES.filter(shown).length - 1}</span> موقعاً للندوة. الخطوط الذهبية من المقرّ، والأسطع إلى ${CO.ar} حيث وصل دعمك.</p>
    <div class="kpis">
      <div class="kpi"><b class="num" data-count="${COUNTRIES.filter(shown).length - 1}">0</b><span>موقعاً حول العالم</span></div>
      <div class="kpi"><b class="num" data-count="19">0</b><span>مكتباً مؤكَّداً</span></div>
      <div class="kpi"><b class="num" data-count="7">0</b><span>نشاطاً ميدانياً</span></div>
    </div>
    <div class="sect">ما حرّكه دعمك في ${CO.ar}</div>
    ${cmp("نسبة التمويل قبل", b.pct, "الآن", t.pct, "%")}
    ${cmp("ينتظرون التأهيل قبل", b.gap, "الآن", t.gap)}
    ${L.track === "kiswa" ? cmp("مكسوّون قبل", b.clothed, "الآن", t.clothed) : ""}
    ${L.track === "sponsor" ? cmp("مكفولون قبل", b.sponsored, "الآن", t.sponsored) : ""}
    <div class="sect">التوجّه</div>
    <p class="sub">بإيقاع اليوم (<span class="num">${PACE}</span> طفلاً شهرياً) تُسدّ فجوة ${CO.ar} خلال <b class="num">${months}</b> شهراً${months < months0 ? ` بدل <span class="num">${months0}</span>` : ""}.</p>
    <p class="sub">أقرب أثرٍ لدعمك القادم: <b>${[...CITIES].sort((a, b2) => gapOf(b2) - gapOf(a))[0].ar}</b> — أكبر فجوةٍ الآن.</p>
    <div class="row"><button class="cta" type="button" id="again2">دعمٌ آخر</button><button class="ghost" type="button" id="otherCo2">دولة أخرى</button><button class="ghost" type="button" id="hallBack">عودة إلى القاعة</button></div>`);
    onPanel(() => {
      $("#again2")?.addEventListener("click", backToCountry);
      $("#otherCo2")?.addEventListener("click", enterWorld);
      $("#hallBack")?.addEventListener("click", backToHall);
    });
  }
  function resetCountry() {
    country.position.set(0, 0, 0);
    country.scale.setScalar(1);
  }
  function backToCountry() {
    const tl = gsap.timeline();
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
        setStage("support");
        renderSupport();
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
    setTimeout(() => {
      setStage("hall");
      hallView(S.history.length ? 0 : 1);
      hint(PHONE() ? "" : "اسحب يميناً ويساراً بين الشاشات · المس شاشة الأثر لتفاصيله");
    }, 1500);
  }

  /* ── The hall: turn to each screen (swipe, arrows or dots) ─────── */
  const VIEWS = [scrImpact, scrMap, scrTracks],
    VIEW_NAMES = ["الأثر", "الخريطة", "الاتجاهات"];
  let hallAt = 1;
  function hallView(i, smooth = true) {
    hallAt = (i + VIEWS.length) % VIEWS.length;
    const g = VIEWS[hallAt].group,
      p = g.getWorldPosition(new THREE.Vector3()),
      w = hallAt === 1 ? 9 : 6;
    const dir = new THREE.Vector3(p.x, 0, p.z).normalize();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const d = Math.min(24, Math.max(10, (w / 2 + 0.7) / half));
    const cam = p.clone().sub(dir.multiplyScalar(d));
    cam.y = 5.2;
    controls.smoothTime = 0.9;
    controls.setLookAt(cam.x, cam.y, cam.z, p.x, p.y, p.z, smooth);
    gsap.to(focus, { x: p.x, y: p.y, z: p.z, duration: 1 });
    root
      .querySelectorAll("#hallNav [data-v]")
      .forEach((b) => b.setAttribute("aria-current", +b.dataset.v === hallAt ? "true" : "false"));
  }
  $("#hallNav")?.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    sound.cue("tick");
    if (b.dataset.v) hallView(+b.dataset.v);
    else hallView(hallAt + +b.dataset.d);
  });
  function openImpactLog(sel = S.history.length - 1) {
    const H = S.history;
    if (!H.length) {
      showPanel(
        `<h2>أثرك</h2><p class="sub">لم تدعم بعد. المس الكرة واختر دولةً وادعمها، فيُسجَّل أثرك هنا بمستوياته الأربعة.</p><div class="row"><button class="cta" type="button" id="goWorld">اختر دولة</button><button class="ghost" type="button" id="closeP">إغلاق</button></div>`,
      );
      onPanel(() => {
        $("#goWorld")?.addEventListener("click", enterWorld);
        $("#closeP")?.addEventListener("click", hidePanel);
      });
      return;
    }
    const r = H[sel];
    showPanel(`
    <h2>سجلّ أثرك</h2>
    <p class="sub">كلّ دعمٍ قدّمته، وأثره على البلد والمنطقة والمجموعة والطفل.</p>
    <div class="co-list">${H.map((x, i) => `<button type="button" data-h="${i}" aria-pressed="${i === sel}">${x.co} · ${TRACKS[x.track].name} · <span class="num">${fmt(x.amount)}</span></button>`).join("")}</div>
    <article class="co-card"><h3 class="log-h">${r.title}</h3><p class="co-line">${r.line} · ${r.co}</p>${r.levels || ""}</article>
    <div class="row"><button class="ghost" type="button" id="closeP">إغلاق</button></div>`);
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
  function openTracks() {
    const rows = [
      [
        "البلد",
        "نسبة التمويل والمنتظرون ومدّة سدّ الفجوة",
        "عدد المكفولين في البلد",
        "المكسوّون هذا الموسم",
      ],
      [
        "المنطقة",
        "منتظروها وما تأهّل من حاجتها",
        "المكفولون ومن بقي بلا كفيل",
        "ما سُدّ من حاجة الموسم",
      ],
      [
        "المجموعة",
        "6 جلسات، ومتوسّط السمات، وانتقال المستويات",
        "المكفولون من أطفالها الثمانية",
        "كسوة المجموعة كاملةً بإثبات",
      ],
      [
        "الطفل",
        "سماته الستّ قبل وبعد، ومستواه",
        "300 ر.س شهرياً وصمودُه ودرايتُه",
        "كسوةٌ كاملة مسلَّمة",
      ],
    ];
    showPanel(`
    <h2>اتجاهات الدعم الثلاثة</h2>
    <p class="sub">كلّ اتجاه يُقرأ أثره على أربعة مستويات. هذا ما تراه بعد دعمك في كلّ مستوى.</p>
    <div class="tracks" style="margin-top:14px"><div class="tcell"><b>تأهيل</b><small>رحلة طفل · <span class="num">600</span> ر.س</small></div><div class="tcell"><b>كفالة</b><small>شهر · <span class="num">300</span> ر.س</small></div><div class="tcell"><b>كسوة</b><small>يتيم · <span class="num">300</span> ر.س</small></div></div>
    ${rows.map(([lv, a, b2, c]) => `<article class="lvl"><header><span class="ic">${["1", "2", "3", "4"][rows.findIndex((x) => x[0] === lv)]}</span><div><small>المستوى</small><b>${lv}</b></div></header><dl class="kv kv3"><div><dt>تأهيل</dt><dd>${a}</dd></div><div><dt>كفالة</dt><dd>${b2}</dd></div><div><dt>كسوة</dt><dd>${c}</dd></div></dl></article>`).join("")}
    <div class="row"><button class="cta" type="button" id="goWorld">اختر دولةً وادعم</button><button class="ghost" type="button" id="closeP">إغلاق</button></div>`);
    onPanel(() => {
      $("#goWorld")?.addEventListener("click", enterWorld);
      $("#closeP")?.addEventListener("click", hidePanel);
    });
  }

  /* ── Loop ───────────────────────────────────────────────────────── */
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = PHONE() ? 55 : 42;
    camera.updateProjectionMatrix();
    placeImpact();
  }
  on(window, "resize", resize);
  resize();
  const clock = new THREE.Clock();
  canvas.addEventListener("pointerdown", () => (idle = 0));
  const perf = { n: 0, t: 0, stepped: false, tier: LOW ? "منخفضة (جوال)" : "عالية" };
  /* ?perf — a small meter for real-device testing: frames per second, draw calls, quality tier */
  const meter = new URLSearchParams(location.search).has("perf")
    ? document.createElement("output")
    : null;
  const meterStat = { frames: 0, since: performance.now() };
  if (meter) {
    renderer.info.autoReset = false; // count every pass of the frame, not only the last
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
      perf.tier = "مخفَّضة تلقائياً";
      renderer.setPixelRatio(1);
      composer.setSize(innerWidth, innerHeight);
      if (dof) dof.blendMode.opacity.value = 0;
      bloom.resolution.scale = 0.35;
    }
  }
  function frame() {
    if (disposed) return;
    const dt = Math.min(window.__DTCAP || 0.05, clock.getDelta()),
      time = clock.elapsedTime;
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
    if (!RM) {
      crown.rotation.y -= dt * 0.04;
      lamps.forEach((l, i) => {
        if (l.isLight) l.intensity = 55 + Math.sin(time * 1.7 + i) * 4;
        else l.rotation.y += dt * 0.3;
      });
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
      if (!RM)
        globe.rotation.y +=
          dt * (S.stage === "hall" || S.stage === "gate" ? 0.12 : S.stage === "world" ? 0 : 0.04);
      const cu = globe.userData.selCurve;
      if (cu) spark.position.copy(cu.getPoint((time * 0.35) % 1));
      gDots.forEach(({ c, m }) =>
        m.scale.setScalar(PICKED && c === CO ? 1.8 + Math.sin(time * 4) * 0.5 : 1),
      );
    }
    if (meter) renderer.info.reset();
    composer.render(dt);
    if (meter) tickMeter();
    for (const l of labels) {
      if (!l.when()) {
        l.el.style.opacity = 0;
        continue;
      }
      const p = l.getPos().clone().project(camera);
      if (p.z > 1) {
        l.el.style.opacity = 0;
        continue;
      }
      const sy = ((1 - p.y) / 2) * innerHeight,
        sx = ((p.x + 1) / 2) * innerWidth;
      // names never slide under the colour key
      const lr = legendBox();
      if (sy < 84 || (lr && sx > lr.left - 8 && sx < lr.right + 70 && sy < lr.bottom + 34)) {
        l.el.style.opacity = 0;
        continue;
      }
      // declutter: in the country only the chosen city and the three widest gaps keep a name
      const quiet =
        l.city &&
        l.city !== S.city &&
        (["support", "impact", "impactPending"].includes(S.stage) || !TOP3.has(l.city));
      l.el.style.opacity = quiet ? 0 : 1;
      l.el.style.transform = `translate(${((p.x + 1) / 2) * innerWidth}px, ${((1 - p.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
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
    enterWorld: () => enterWorld(),
    co: () => CO.code,
    codes: () => COUNTRIES.map((c) => c.code),
    /** for automated checks: pick a country on the globe and enter it */
    visit: (code) => {
      selectCountry(code);
      enterCountry();
    },
  }; // for automated checks
  return () => {
    sound.dispose();
    disposed = true;
    cancelAnimationFrame(raf);
    listeners.forEach((off) => off());
    controls.dispose();
    composer.dispose();
    renderer.dispose();
    pmrem.dispose();
    gsap.globalTimeline.timeScale(1);
    delete window.__hall;
  };
}
