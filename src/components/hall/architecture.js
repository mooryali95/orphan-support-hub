// قاعة الأثر — العمارة: أرضية رخامٍ معرَّق، أعمدة مخروطة بتيجان، عقودٌ مدبَّبة
// بإطارٍ ذهبي، حزام مقرنصات تحت القبّة، ومشربيات مضاءة من خلفها، وظلالٌ ناعمة
// عند قواعد الأعمدة. كلّها مولَّدة بالكود (بلا ملفّات نماذج) لتبقى خفيفة.
import * as THREE from "three";

const RING = 15.6; // نصف قطر حلقة الأعمدة
const COUNT = 14;
const SPRING = 10.95; // منبت العقود

function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* رخامٌ نبيذيٌّ داكن بعروقٍ ذهبية وعاجية: منحنياتٌ متشعّبة بشفافيةٍ متدرّجة. */
function marble(rnd) {
  const veins = (x, w, h, color, n, width) => {
    for (let i = 0; i < n; i++) {
      x.strokeStyle = color;
      x.lineWidth = width * (0.4 + rnd());
      x.beginPath();
      let px = rnd() * w,
        py = rnd() * h;
      x.moveTo(px, py);
      for (let k = 0; k < 7; k++) {
        const nx = px + (rnd() - 0.35) * w * 0.35,
          ny = py + (rnd() - 0.5) * h * 0.22;
        x.quadraticCurveTo(px + (rnd() - 0.5) * 120, py + (rnd() - 0.5) * 120, nx, ny);
        px = nx;
        py = ny;
      }
      x.stroke();
    }
  };
  const map = canvasTex(
    1024,
    1024,
    (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.75);
      g.addColorStop(0, "#241014");
      g.addColorStop(1, "#140709");
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      // soft clouding, not speckles: large faint blooms that never read as dots up close
      for (let i = 0; i < 420; i++) {
        const cx = rnd() * w,
          cy = rnd() * h,
          r = 40 + rnd() * 120;
        const c = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        const rgb = rnd() > 0.5 ? "96,30,44" : "10,4,6";
        c.addColorStop(0, `rgba(${rgb},${0.05 + rnd() * 0.06})`);
        c.addColorStop(1, `rgba(${rgb},0)`);
        x.fillStyle = c;
        x.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      veins(x, w, h, "rgba(243,235,224,0.08)", 26, 2.4);
      veins(x, w, h, "rgba(246,239,226,0.07)", 18, 1.2);
      veins(x, w, h, "rgba(205,174,118,0.16)", 8, 0.7);
    },
    { repeat: [3, 3] },
  );
  const rough = canvasTex(
    512,
    512,
    (x, w, h) => {
      x.fillStyle = "#6a6a6a";
      x.fillRect(0, 0, w, h);
      veins(x, w, h, "rgba(20,20,20,0.5)", 22, 3);
    },
    { repeat: [3, 3], srgb: false },
  );
  return { map, rough };
}

/* مشربية: حلقاتٌ متداخلة (حلقة الشعار مكرَّرةً كنسيج) بخطٍّ رفيع، تُرسم بقناة شفافية. */
function lattice() {
  return canvasTex(
    256,
    256,
    (x, w) => {
      x.clearRect(0, 0, w, w);
      x.strokeStyle = "#ffffff";
      x.lineWidth = 7;
      const s = w / 2;
      for (const [cx, cy] of [
        [0, 0],
        [w, 0],
        [0, w],
        [w, w],
        [s, s],
        [s, 0],
        [s, w],
        [0, s],
        [w, s],
      ]) {
        x.beginPath();
        x.arc(cx, cy, s, 0, Math.PI * 2);
        x.stroke();
      }
    },
    { repeat: [6, 8], srgb: false },
  );
}

/* عقدٌ مدبَّب (قوسان من دائرتين يلتقيان في الذروة) بعرض w؛ نصف القطر 0.8w. */
function pointedArc(w, steps = 28) {
  const R = 0.8 * w,
    cx = 0.3 * w,
    top = Math.acos(-0.375);
  const left = [],
    right = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - (Math.PI - top) * (i / steps);
    left.push(new THREE.Vector2(cx + Math.cos(a) * R, Math.sin(a) * R));
  }
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - top - (Math.PI - top) * (i / steps);
    right.push(new THREE.Vector2(-cx + Math.cos(a) * R, Math.sin(a) * R));
  }
  return [...left, ...right.slice(1)];
}

function archGeometry(w, band) {
  const outer = pointedArc(w),
    inner = pointedArc(w - band * 2).reverse();
  const shape = new THREE.Shape([...outer, new THREE.Vector2(w / 2 - band, 0), ...inner]);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.32,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.16);
  return geo;
}

function columnGeometry() {
  // مقطعٌ مخروط: قاعدةٌ متدرّجة، وبدنٌ بانتفاخٍ خفيف، وتاجٌ جرسيّ.
  const p = [
    [0.001, 0],
    [0.78, 0],
    [0.78, 0.16],
    [0.68, 0.24],
    [0.7, 0.34],
    [0.56, 0.48],
    [0.5, 0.62],
  ];
  for (let i = 1; i <= 12; i++) {
    const t = i / 12,
      y = 0.62 + t * 9.5;
    p.push([0.5 - 0.06 * t + 0.035 * Math.sin(t * Math.PI), y]);
  }
  p.push([0.5, 10.25], [0.58, 10.4], [0.72, 10.62], [0.84, 10.82], [0.86, SPRING], [0.001, SPRING]);
  return new THREE.LatheGeometry(
    p.map(([r, y]) => new THREE.Vector2(r, y)),
    64,
  );
}

export function buildArchitecture({ hall, champM, lacquer, LOW, rnd = Math.random }) {
  const group = new THREE.Group();
  hall.add(group);

  /* الأرضية */
  const { map, rough } = marble(rnd);
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap: rough,
    roughness: 0.55,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    envMapIntensity: 0.6,
    transparent: !LOW,
    opacity: LOW ? 1 : 0.86,
  });

  /* ظلّ ناعم عند كلّ قاعدة */
  const blob = canvasTex(
    256,
    256,
    (x, w) => {
      const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, "rgba(0,0,0,0.7)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, w, w);
    },
    { srgb: false },
  );
  const blobM = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });

  /* الأعمدة والعقود */
  const colGeo = columnGeometry();
  const archGeo = archGeometry(2 * RING * Math.sin(Math.PI / COUNT) - 0.9, 0.42);
  const trimGeo = new THREE.EdgesGeometry(archGeo, 25);
  // the arches are outlined in white, as the mark's ring is drawn on its wine disc
  const trimM = new THREE.LineBasicMaterial({
    color: 0xf3ebe0,
    transparent: true,
    opacity: 0.5,
    toneMapped: false,
  });
  const angle = (i) => (i / COUNT) * Math.PI * 2 + Math.PI / COUNT;
  const nearDoor = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.35;
  for (let i = 0; i < COUNT; i++) {
    const a = angle(i);
    if (nearDoor(a)) continue;
    const x = Math.sin(a) * RING,
      z = Math.cos(a) * RING;
    const col = new THREE.Mesh(colGeo, lacquer);
    col.position.set(x, 0, z);
    group.add(col);
    for (const y of [0.42, 10.3]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(y < 1 ? 0.6 : 0.56, 0.04, 12, 64), champM);
      r.rotation.x = Math.PI / 2;
      r.position.set(x, y, z);
      group.add(r);
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), blobM);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, 0.015, z);
    group.add(shadow);
    // العقد إلى العمود التالي، ما لم يكن الباب بينهما
    const b = a + Math.PI / COUNT;
    if (nearDoor(angle(i + 1)) || nearDoor(b)) continue;
    const arch = new THREE.Group();
    arch.add(new THREE.Mesh(archGeo, lacquer), new THREE.LineSegments(trimGeo, trimM));
    const r = RING * Math.cos(Math.PI / COUNT);
    arch.position.set(Math.sin(b) * r, SPRING, Math.cos(b) * r);
    arch.rotation.y = b;
    group.add(arch);
  }

  /* حزام المقرنصات: ثلاث طبقاتٍ متراصّة من خلايا نبيذية تغمق صعوداً (بلا رقعة شطرنج)،
     وخيطٌ واحد من الشمبانيا تحتها هو المعدن الوحيد */
  const cellGeo = new THREE.ConeGeometry(0.36, 0.62, 4, 1);
  cellGeo.rotateX(Math.PI);
  cellGeo.rotateY(Math.PI / 4); // faces square to the wall, so neighbours meet edge to edge
  const cellM = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.38,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.6,
  });
  const tiers = [
    [17.55, 13.25, 0, 0x6b1f30],
    [17.05, 13.85, 0.5, 0x561626],
    [16.55, 14.45, 0, 0x43111d],
  ];
  const per = LOW ? 48 : 72;
  const cells = new THREE.InstancedMesh(cellGeo, cellM, per * tiers.length);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    sc = new THREE.Vector3(1, 1, 0.8),
    pos = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0),
    tint = new THREE.Color();
  const HALF = 0.36 * Math.SQRT1_2; // half-width of a cell's square mouth
  let k = 0;
  tiers.forEach(([r, y, off, color]) => {
    sc.x = (Math.PI * r) / per / HALF; // each cell spans its share of the circle: no gaps
    tint.setHex(color);
    for (let i = 0; i < per; i++) {
      const a = ((i + off) / per) * Math.PI * 2;
      pos.set(Math.sin(a) * r, y, Math.cos(a) * r);
      q.setFromAxisAngle(up, a);
      m.compose(pos, q, sc);
      cells.setMatrixAt(k, m);
      cells.setColorAt(k, tint);
      k++;
    }
  });
  group.add(cells);
  const cornice = new THREE.Mesh(new THREE.TorusGeometry(17.62, 0.03, 8, 160), champM);
  cornice.rotation.x = Math.PI / 2;
  cornice.position.y = 12.9;
  group.add(cornice);

  /* المشربيات بين الأعمدة: خطوطٌ بيضاء رفيعة على أرضيةٍ نبيذية (كحلقة الشعار على قرصه). الخطّ
     والأرضية غير متأثّرين بالمصابيح، فلا يميل اللون إلى الرمادي أو البنفسجي تحت الضوء الدافئ */
  const lat = lattice();
  const screenM = new THREE.MeshBasicMaterial({
    color: 0x7d6d69, // ivory held back: a drawn line, not a light source (stays under the bloom)
    alphaMap: lat,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  });
  const groundM = new THREE.MeshBasicMaterial({ color: 0x24080f });
  const glowM = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ vec2 c = vUv - vec2(0.5, 0.42); float d = length(c * vec2(1.0, 0.7));
        float a = smoothstep(0.55, 0.0, d) * (0.85 + 0.15 * sin(uTime * 0.8 + vUv.y * 3.0));
        gl_FragColor = vec4(vec3(0.84, 0.2, 0.3) * 0.7, a * 0.17); }`,
  });
  for (let i = 0; i < COUNT; i++) {
    const b = angle(i) + Math.PI / COUNT;
    if (nearDoor(b)) continue;
    const r = 17.7,
      w = 2 * RING * Math.sin(Math.PI / COUNT) - 1.6;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, 7.2), screenM);
    panel.position.set(Math.sin(b) * r, 5.6, Math.cos(b) * r);
    panel.lookAt(0, 5.6, 0);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, 7.8), glowM);
    glow.position.set(Math.sin(b) * (r + 0.15), 5.6, Math.cos(b) * (r + 0.15));
    glow.lookAt(0, 5.6, 0);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, 7.8), groundM);
    ground.position.set(Math.sin(b) * (r + 0.22), 5.6, Math.cos(b) * (r + 0.22));
    ground.lookAt(0, 5.6, 0);
    group.add(ground, glow, panel);
  }

  return {
    floorMaterial,
    update(time) {
      glowM.uniforms.uTime.value = time;
    },
  };
}
