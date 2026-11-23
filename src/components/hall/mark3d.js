// شعارٌ ثلاثي الأبعاد من مسارات SVG — قطعةٌ صغيرة تُعاد استعمالها.
// تأخذ بيانات المسارات (`d`) كما هي في الملفّ المتّجه المعتمد وتبثقها بحافّةٍ مشطوفة دقيقة؛ فأيّ
// شعارٍ متّجه (ومنه شعار الندوة الرسمي حين يُضاف ملفّه) يدخل من الباب نفسه بلا تغيير هنا.
// لا تفتح سياق WebGL: ترسم بالمُصيِّر الذي يُعطى لها في هدفٍ خارج الشاشة، ثم تنسخ الصورة إلى
// لوحةٍ ثنائية الأبعاد توضع فوق الـSVG. وكلّ ما تنشئه يُفكّ في `dispose`.
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

/**
 * @typedef {{ d: string, role: "body" | "trim" | "inlay" }} MarkPart
 *   body: the main form (lacquer); trim: the metal piece riding it; inlay: a hairline set in the body
 * @typedef {{ viewBox: string, parts: MarkPart[], lightAt?: { x: number, y: number, r: number }, colors: { body: number|string, metal: number|string, light: number|string } }} MarkArt
 */

const shapesOf = (loader, d) =>
  loader
    .parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`)
    .paths.flatMap((p) => SVGLoader.createShapes(p));

/**
 * the mark as a lit object: the body extruded with a fine bevel, the trim in brushed metal a
 * little proud of it, the inlay as a metal hairline on its face, and a warm light standing
 * behind it (it shows through whatever the body's path leaves open). Centred on the viewBox's
 * centre, one unit per viewBox unit, facing +z. The caller owns the group; `dispose` frees it.
 * @param {MarkArt} art
 */
export function buildMark(art, { envMapIntensity = 1 } = {}) {
  const [vx, vy, vw, vh] = art.viewBox.split(/\s+/).map(Number);
  const loader = new SVGLoader();
  const group = new THREE.Group();
  const owned = [];
  const keep = (x) => (owned.push(x), x);
  const lacquer = keep(
    new THREE.MeshPhysicalMaterial({
      color: art.colors.body,
      roughness: 0.42,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.3,
      envMapIntensity: envMapIntensity * 1.6,
    }),
  );
  // brushed, never mirror foil: the metal is a line and an edge, not a surface
  const metal = keep(
    new THREE.MeshPhysicalMaterial({
      color: art.colors.metal,
      metalness: 1,
      roughness: 0.34,
      envMapIntensity: envMapIntensity * 3.2,
    }),
  );
  const light = keep(new THREE.MeshBasicMaterial({ color: art.colors.light, toneMapped: false }));
  const DEPTH = { body: 9, trim: 7, inlay: 1.2 };
  const Z = { body: 0, trim: 5.5, inlay: 10.9 };
  // SVG's y runs down: the art is flipped, and the viewBox's centre is brought to the origin
  const art3d = new THREE.Group();
  art3d.scale.y = -1;
  art3d.position.set(-(vx + vw / 2), vy + vh / 2, -DEPTH.body / 2);
  group.add(art3d);
  for (const part of art.parts) {
    const geo = keep(
      new THREE.ExtrudeGeometry(shapesOf(loader, part.d), {
        depth: DEPTH[part.role],
        bevelEnabled: part.role !== "inlay",
        bevelThickness: 1.8,
        bevelSize: 1.5,
        bevelSegments: 5,
        curveSegments: 28,
      }),
    );
    const mesh = new THREE.Mesh(geo, part.role === "body" ? lacquer : metal);
    mesh.position.z = Z[part.role];
    art3d.add(mesh);
  }
  // the light behind the body, inside its silhouette: it shows through what the path leaves open
  const at = art.lightAt ?? { x: vx + vw / 2, y: vy + vh / 2, r: Math.min(vw, vh) * 0.45 };
  const glow = new THREE.Mesh(keep(new THREE.CircleGeometry(at.r, 64)), light);
  glow.position.set(at.x, at.y, -2.5);
  art3d.add(glow);
  return {
    group,
    light,
    size: { w: vw, h: vh },
    dispose() {
      owned.forEach((x) => x.dispose());
      group.clear();
    },
  };
}

/**
 * the mark as the page's emblem: drawn by the given renderer into an off-screen target (no second
 * WebGL context) and copied to a 2D canvas the caller lays over the flat mark. Soft studio light
 * (the given environment and one key), a slow highlight that crosses the face, a gentle idle
 * turn and a slight lean toward the pointer. `still` (reduced motion) holds one pose.
 *
 * Returns null where it cannot be drawn well (no float render target): the flat mark stays.
 * @param {{ renderer: THREE.WebGLRenderer, art: MarkArt, environment?: THREE.Texture|null, still?: boolean, pad?: number }} o
 */
export function createEmblem({ renderer, art, environment = null, still = false, pad = 0.1 }) {
  const gl = renderer.getContext();
  if (!renderer.capabilities.isWebGL2 || !gl.getExtension("EXT_color_buffer_float")) return null;
  const mark = buildMark(art, { envMapIntensity: 1.1 });
  const scene = new THREE.Scene();
  scene.environment = environment;
  const key = new THREE.DirectionalLight(0xfff4ea, 2.6);
  key.position.set(-0.7, 0.9, 1.4);
  // a soft pool high on the key side, so the flat face is never one flat tone
  const pool = new THREE.PointLight(0xfff0e2, 1, 0, 2);
  // the highlight: a narrow warm light that crosses the face now and then
  const sweep = new THREE.PointLight(0xfff1dc, 0, 0, 2);
  scene.add(mark.group, key, pool, sweep, new THREE.HemisphereLight(0xfff1e6, 0x3a0f1a, 1.1));
  const { w, h } = mark.size;
  pool.position.set(-w * 0.34, h * 0.36, w * 0.55);
  pool.intensity = w * w * 0.26;
  const FOV = 18;
  const camera = new THREE.PerspectiveCamera(FOV, w / h, 10, 4000);
  // the art fills the canvas less its padding (room for the turn and the bevel)
  const dist = (h * (1 + pad * 2)) / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  camera.position.set(0, 0, dist);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let target = null,
    floats = null,
    image = null;
  /* linear → sRGB by table: the target holds linear light (as every off-screen target does) */
  const LUT = new Uint8ClampedArray(4097);
  for (let i = 0; i <= 4096; i++) {
    const v = i / 4096;
    LUT[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  }
  function setSize(cssW, dpr) {
    const pw = Math.max(2, Math.round(cssW * dpr)),
      ph = Math.max(2, Math.round((cssW * h * dpr) / w));
    if (target && target.width === pw && target.height === ph) return;
    target?.dispose();
    target = new THREE.WebGLRenderTarget(pw, ph, {
      type: THREE.FloatType,
      samples: 4,
      depthBuffer: true,
    });
    canvas.width = pw;
    canvas.height = ph;
    floats = new Float32Array(pw * ph * 4);
    image = ctx.createImageData(pw, ph);
  }
  const lean = { x: 0, y: 0 };
  let failed = false;
  /** draws one frame; `pointer` is where the visitor points, -1..1 from the emblem's centre */
  function render(time, pointer = null) {
    if (!target || failed) return false;
    const t = still ? 0 : time;
    lean.x += ((pointer ? pointer.x : 0) - lean.x) * 0.06;
    lean.y += ((pointer ? pointer.y : 0) - lean.y) * 0.06;
    mark.group.rotation.set(
      0.05 + (still ? 0 : Math.sin(t * 0.42) * 0.035) + lean.y * 0.16,
      (still ? -0.2 : Math.sin(t * 0.31) * 0.26) + lean.x * 0.22,
      0,
    );
    // the sweep crosses once every nine seconds and rests dark between
    const s = still ? 0.5 : (t % 9) / 2.6;
    sweep.intensity = s < 1 ? Math.sin(s * Math.PI) * w * w * 0.75 : 0;
    sweep.position.set((s - 0.5) * w * 1.6, h * 0.12, w * 0.36);
    mark.light.color.setScalar(still ? 1.25 : 1.2 + Math.sin(t * 1.1) * 0.12);

    const prev = {
      target: renderer.getRenderTarget(),
      alpha: renderer.getClearAlpha(),
      color: renderer.getClearColor(new THREE.Color()),
      shadows: renderer.shadowMap.enabled,
    };
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    try {
      renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, floats);
    } catch {
      failed = true;
    }
    renderer.setRenderTarget(prev.target);
    renderer.setClearColor(prev.color, prev.alpha);
    renderer.shadowMap.enabled = prev.shadows;
    if (failed) return false;
    // GL rows run bottom-up; the edge pixels are premultiplied by coverage
    const out = image.data,
      W = target.width,
      H = target.height;
    for (let y = 0; y < H; y++) {
      let i = (H - 1 - y) * W * 4,
        o = y * W * 4;
      for (let x = 0; x < W; x++, i += 4, o += 4) {
        const a = floats[i + 3];
        if (a <= 0.002) {
          out[o + 3] = 0;
          continue;
        }
        const k = 4096 / (a < 1 ? a : 1);
        out[o] = LUT[Math.min(4096, (floats[i] * k) | 0)];
        out[o + 1] = LUT[Math.min(4096, (floats[i + 1] * k) | 0)];
        out[o + 2] = LUT[Math.min(4096, (floats[i + 2] * k) | 0)];
        out[o + 3] = a >= 1 ? 255 : (a * 255) | 0;
      }
    }
    ctx.putImageData(image, 0, 0);
    return true;
  }
  return {
    canvas,
    /** how much larger than the flat art the canvas is laid, on each side (share of the art) */
    pad,
    setSize,
    render,
    dispose() {
      target?.dispose();
      mark.dispose();
      scene.clear();
      canvas.width = canvas.height = 0;
      canvas.remove();
    },
  };
}
