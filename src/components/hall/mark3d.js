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
 * the mark as a lit object: the body a thick lacquer medallion with a broad rounded rim, its face
 * shaded as a shallow dome (so light pools on it and moves as it turns, instead of one flat tone),
 * the trim in brushed metal riding a little proud of it, the inlay a metal hairline standing off
 * the face, and a warm light standing inside it (it shows through whatever the body's path
 * leaves open). The bevels are cut inward, so the silhouette is exactly the vector's. Centred on
 * the viewBox's centre, one unit per viewBox unit, facing +z. `relief` scales the depth (a seal
 * set into a floor is shallower than an emblem). The caller owns the group; `dispose` frees it.
 * @param {MarkArt} art
 */
export function buildMark(art, { envMapIntensity = 1, relief = 1 } = {}) {
  const [vx, vy, vw, vh] = art.viewBox.split(/\s+/).map(Number);
  const loader = new SVGLoader();
  const group = new THREE.Group();
  const owned = [];
  const keep = (x) => (owned.push(x), x);
  // deep wine under a hard clear coat: the colour stays the logo's, the gloss is the coat's
  const lacquer = keep(
    new THREE.MeshPhysicalMaterial({
      color: art.colors.body,
      roughness: 0.46,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: envMapIntensity * 1.15,
    }),
  );
  // brushed, never mirror foil: the grain runs one way, so the highlight is a soft streak across
  // the metal that slides as the piece turns
  const metal = keep(
    new THREE.MeshPhysicalMaterial({
      color: art.colors.metal,
      metalness: 1,
      roughness: 0.3,
      anisotropy: 0.8,
      anisotropyRotation: Math.PI / 2,
      envMapIntensity: envMapIntensity * 2.4,
    }),
  );
  const light = keep(new THREE.MeshBasicMaterial({ color: art.colors.light, toneMapped: false }));
  const DEPTH = { body: 15 * relief, trim: 11 * relief, inlay: 1.4 };
  const BEVEL = {
    body: { t: 4.4 * relief, s: 3.6, n: 8 },
    trim: { t: 2.2 * relief, s: 1.3, n: 6 },
  };
  const face = DEPTH.body + BEVEL.body.t; // the body's front face
  // the trim's face stands a little proud of the body's; the inlay stands off it by a hair
  const Z = { body: 0, trim: face + 3 * relief - DEPTH.trim - BEVEL.trim.t, inlay: face - 0.5 };
  const at = art.lightAt ?? { x: vx + vw / 2, y: vy + vh / 2, r: Math.min(vw, vh) * 0.45 };
  // SVG's y runs down: the art is flipped, and the viewBox's centre is brought to the origin
  const art3d = new THREE.Group();
  art3d.scale.y = -1;
  art3d.position.set(-(vx + vw / 2), vy + vh / 2, -face / 2);
  group.add(art3d);
  for (const part of art.parts) {
    const bevel = BEVEL[part.role];
    const geo = keep(
      new THREE.ExtrudeGeometry(shapesOf(loader, part.d), {
        depth: DEPTH[part.role],
        bevelEnabled: !!bevel,
        bevelThickness: bevel?.t ?? 0,
        bevelSize: bevel?.s ?? 0,
        bevelOffset: -(bevel?.s ?? 0),
        bevelSegments: bevel?.n ?? 1,
        curveSegments: 40,
      }),
    );
    if (part.role === "body") {
      /* the face is flat geometry shaded as a shallow dome: each face vertex's normal leans
         outward from the centre, more toward the rim, and the renderer blends between them */
      const pos = geo.attributes.position,
        nor = geo.attributes.normal,
        lean = 0.3 / at.r;
      for (let i = 0; i < pos.count; i++) {
        if (nor.getZ(i) < 0.99 || pos.getZ(i) < face - 0.01) continue;
        const nx = (pos.getX(i) - at.x) * lean,
          ny = (pos.getY(i) - at.y) * lean,
          k = 1 / Math.hypot(nx, ny, 1);
        nor.setXYZ(i, nx * k, ny * k, k);
      }
      nor.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(geo, part.role === "body" ? lacquer : metal);
    mesh.position.z = Z[part.role];
    art3d.add(mesh);
  }
  // the light inside the body, within its silhouette: it shows through what the path leaves open
  const glow = new THREE.Mesh(keep(new THREE.CircleGeometry(at.r, 64)), light);
  glow.position.set(at.x, at.y, DEPTH.body * 0.3);
  art3d.add(glow);
  return {
    group,
    light,
    size: { w: vw, h: vh },
    /** where the body's light stands, in the group's own space (for a lamp on the cut walls) */
    lightAt: new THREE.Vector3(
      at.x - (vx + vw / 2),
      -(at.y - (vy + vh / 2)),
      DEPTH.body * 0.55 - face / 2,
    ),
    dispose() {
      owned.forEach((x) => x.dispose());
      group.clear();
    },
  };
}

/**
 * the mark as the page's emblem: drawn by the given renderer into an off-screen target (no second
 * WebGL context) and copied to a 2D canvas the caller lays over the flat mark. Studio light: the
 * given environment, a warm key high on one side, a cool rim light from behind the other (it
 * draws the edge of the medallion and the wall of its rim), a lamp inside that warms the cut
 * walls, and a narrow highlight that crosses the face now and then. A slow idle turn shows the
 * thickness, with a slight lean toward the pointer. `still` (reduced motion) holds one pose.
 *
 * Returns null where it cannot be drawn well (no float render target): the flat mark stays.
 * @param {{ renderer: THREE.WebGLRenderer, art: MarkArt, environment?: THREE.Texture|null, still?: boolean, pad?: number }} o
 */
export function createEmblem({ renderer, art, environment = null, still = false, pad = 0.14 }) {
  const gl = renderer.getContext();
  if (!renderer.capabilities.isWebGL2 || !gl.getExtension("EXT_color_buffer_float")) return null;
  const mark = buildMark(art, { envMapIntensity: 1 });
  const scene = new THREE.Scene();
  scene.environment = environment;
  const { w, h } = mark.size;
  const key = new THREE.DirectionalLight(0xfff1e2, 2.4);
  key.position.set(-0.8, 1, 1.2);
  // from behind and to the side: it never reaches the face, only the rim's wall and its far bevel
  const rim = new THREE.DirectionalLight(0xe9eeff, 3.4);
  rim.position.set(1.1, 0.5, -0.9);
  const under = new THREE.DirectionalLight(0xffd9b0, 0.9);
  under.position.set(0.2, -1, 0.5);
  // the lamp inside: the walls the two fingers are cut through glow warm from behind
  const lamp = new THREE.PointLight(0xffe9cc, w * w * 0.05, w * 0.5, 2);
  lamp.position.copy(mark.lightAt);
  mark.group.add(lamp);
  // the highlight: a narrow warm light that crosses the face now and then
  const sweep = new THREE.PointLight(0xfff1dc, 0, 0, 2);
  scene.add(
    mark.group,
    key,
    rim,
    under,
    sweep,
    new THREE.HemisphereLight(0xfff1e6, 0x2a0a12, 0.55),
  );
  const FOV = 22;
  const camera = new THREE.PerspectiveCamera(FOV, w / h, 10, 4000);
  // the art fills the canvas less its padding (room for the turn and the rim's thickness)
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
      0.1 + (still ? 0 : Math.sin(t * 0.42) * 0.05) + lean.y * 0.16,
      (still ? -0.3 : Math.sin(t * 0.31) * 0.34) + lean.x * 0.22,
      0,
    );
    // the sweep crosses once every nine seconds and rests dark between
    const s = still ? 0.42 : (t % 9) / 2.6;
    sweep.intensity = s < 1 ? Math.sin(s * Math.PI) * w * w * 0.55 : 0;
    sweep.position.set((s - 0.5) * w * 1.6, h * 0.16, w * 0.42);
    mark.light.color.setScalar(still ? 1.05 : 1 + Math.sin(t * 1.1) * 0.08);

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
