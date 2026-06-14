import * as THREE from "three";

/**
 * Cartoon model factory. Everything is built from primitives with cel-shaded
 * MeshToon materials and a shared 3-step gradient ramp, so it reads instantly
 * from the tilted top-down camera and still runs at 60fps on a phone.
 */

// ---- shared cel-shading ramp -------------------------------------------------
function makeToonRamp(): THREE.DataTexture {
  // 4 hard bands = clean cartoon shading
  const data = new Uint8Array([90, 140, 200, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
const RAMP = makeToonRamp();

const toonCache = new Map<number, THREE.MeshToonMaterial>();
function toon(color: number): THREE.MeshToonMaterial {
  let m = toonCache.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: RAMP });
    toonCache.set(color, m);
  }
  return m;
}

/**
 * Procedural lush-grass ground texture drawn on a canvas. Layered green noise
 * + scattered blades + soft sun dapple gives the meadow real depth instead of a
 * flat color, while staying GPU-cheap (one tiled texture, no extra geometry).
 */
export function makeGrassTexture(): THREE.Texture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;

  // base gradient — sunlit warm green to cooler shaded green
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#8fd16a");
  grad.addColorStop(0.5, "#79c057");
  grad.addColorStop(1, "#5fa844");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // soft mottled patches for organic variation
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 14 + Math.random() * 46;
    const tint = Math.random();
    ctx.globalAlpha = 0.06 + Math.random() * 0.1;
    ctx.fillStyle =
      tint > 0.5 ? "#9bdc74" : tint > 0.25 ? "#67ad48" : "#abe588";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // fine grass blades for crisp detail under the camera
  ctx.lineWidth = 1;
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const h = 2 + Math.random() * 5;
    ctx.globalAlpha = 0.18 + Math.random() * 0.25;
    ctx.strokeStyle = Math.random() > 0.5 ? "#56992f" : "#a6e57c";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 2, y - h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A small cartoon flower cluster used to dress the meadow. */
export function makeFlower(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0xff6b8a, 0xffd23f, 0xff8a3d, 0xb07bff, 0xffffff];
  const petalColor = colors[Math.floor(Math.random() * colors.length)];
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.025, 0.32, 5),
    toon(0x4f9a3a),
  );
  stem.position.y = 0.16;
  g.add(stem);
  const petals = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.1, 0),
    toon(petalColor),
  );
  petals.scale.set(1, 0.5, 1);
  petals.position.y = 0.33;
  g.add(petals);
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), toon(0xffe14d));
  center.position.y = 0.35;
  g.add(center);
  return g;
}

/** A rounded, fluffy cartoon bush for meadow edges. */
export function makeBush(): THREE.Group {
  const g = new THREE.Group();
  const greens = [0x4e9b3e, 0x57a846, 0x46913a];
  const blobs: [number, number, number, number][] = [
    [0, 0.35, 0, 0.5],
    [0.4, 0.25, 0.1, 0.34],
    [-0.38, 0.28, -0.05, 0.36],
    [0.1, 0.5, -0.2, 0.32],
    [-0.15, 0.46, 0.25, 0.3],
  ];
  for (const [x, y, z, r] of blobs) {
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      toon(greens[Math.floor(Math.random() * greens.length)]),
    );
    blob.position.set(x, y, z);
    blob.castShadow = true;
    g.add(blob);
  }
  return g;
}

/** A simple cartoon tree (trunk + chunky canopy) for the far meadow ring. */
export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.32, 1.5, 7),
    toon(0x8a5a32),
  );
  trunk.position.y = 0.75;
  trunk.castShadow = true;
  g.add(trunk);
  const greens = [0x4e9b3e, 0x57a846, 0x3f8a34];
  const blobs: [number, number, number, number][] = [
    [0, 1.9, 0, 0.95],
    [0.6, 1.6, 0.2, 0.6],
    [-0.55, 1.65, -0.15, 0.62],
    [0.15, 2.4, -0.2, 0.55],
  ];
  for (const [x, y, z, r] of blobs) {
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      toon(greens[Math.floor(Math.random() * greens.length)]),
    );
    blob.position.set(x, y, z);
    blob.castShadow = true;
    g.add(blob);
  }
  return g;
}

const WOOL = 0xfbf7f0;
const WOOL_DK = 0xe7e0d4;
const HORN = 0xd9b886;
const FACE = 0x33302e;
const HOOF = 0x2a2724;

/** A round wool puff used for rams and sheep bodies. */
function woolPuff(radius: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), toon(color));
}

/**
 * An articulated quadruped leg whose pivot sits at the hip (group origin), so
 * the engine can swing it fore/aft with `leg.rotation.x` for a real walk cycle.
 * The limb + hoof hang downward from the origin.
 */
function makeQuadLeg(
  len: number,
  thickness: number,
  legColor: number,
  hoofColor: number,
): THREE.Group {
  const leg = new THREE.Group();
  const limb = new THREE.Mesh(
    new THREE.CapsuleGeometry(thickness, len, 4, 8),
    toon(legColor),
  );
  limb.position.y = -len / 2 - thickness;
  limb.castShadow = true;
  leg.add(limb);
  const hoof = new THREE.Mesh(
    new THREE.CylinderGeometry(thickness * 1.15, thickness, thickness * 1.4, 8),
    toon(hoofColor),
  );
  hoof.position.y = -len - thickness * 1.6;
  leg.add(hoof);
  return leg;
}

/**
 * Optional AI-generated model templates. When loaded, the factories clone them
 * for the visual; otherwise they fall back to the procedural primitives so the
 * game always renders something even before/without the GLBs.
 */
export const TEMPLATES: {
  ram: THREE.Object3D | null;
  sheep: THREE.Object3D | null;
  farmer: THREE.Object3D | null;
} = { ram: null, sheep: null, farmer: null };

/** A flat colored ground ring under a ram so each one reads instantly top-down. */
function makeGroundRing(color: number, inner: number, outer: number, opacity: number): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.renderOrder = 1;
  return ring;
}

/** A chunky, fluffy cartoon ram. Group children are tagged for animation. */
export function makeRam(color: number, hatColor: number, isPlayer = false): THREE.Group {
  const g = new THREE.Group();

  // colored ID ring on the ground — only the human player gets one so other
  // rams don't clutter the field with circles
  if (isPlayer) {
    const ring = makeGroundRing(color, 0.62, 0.92, 0.9);
    ring.name = "colorRing";
    g.add(ring);
  }

  // directional charge telegraph arrow (hidden until charging)
  const arrow = makeChargeArrow();
  arrow.name = "chargeArrow";
  arrow.visible = false;
  g.add(arrow);

  // the animated visual — generated clone if available, else procedural puffs
  const visual = new THREE.Group();
  visual.name = "visual";
  g.add(visual);

  if (TEMPLATES.ram) {
    const m = TEMPLATES.ram.clone(true);
    visual.add(m);
    // colored neck scarf for extra identification on the generated model
    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.1, 8, 16),
      toon(color),
    );
    scarf.position.set(0, 0.7, 0.35);
    scarf.rotation.x = Math.PI / 2.3;
    visual.add(scarf);
    return g;
  }

  buildProceduralRam(visual, color, hatColor);
  return g;
}

/** A flat arrow on the ground showing dash direction, scaled by charge. Local
 * forward is +z (the ram's facing), so the arrow extends along +z. */
function makeChargeArrow(): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.6); // tip
  shape.lineTo(-0.34, 0.0);
  shape.lineTo(-0.13, 0.0);
  shape.lineTo(-0.13, -0.55);
  shape.lineTo(0.13, -0.55);
  shape.lineTo(0.13, 0.0);
  shape.lineTo(0.34, 0.0);
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color: 0xffe14d,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = Math.PI / 2; // lay flat, shape +y -> world +z
  mesh.position.set(0, 0.05, 1.0);
  mesh.renderOrder = 2;
  return mesh;
}

/** Builds the procedural fluffy ram into the given group (fallback visual). */
function buildProceduralRam(g: THREE.Group, color: number, hatColor: number): void {
  // fluffy body — a cluster of wool puffs so the silhouette reads as wool
  const body = new THREE.Group();
  body.name = "body";
  body.scale.set(1.1, 0.85, 1.25);
  body.position.y = 0.6;
  const core = woolPuff(0.5, WOOL);
  core.castShadow = true;
  body.add(core);
  const puffs: [number, number, number, number][] = [
    [0.34, 0.16, 0.18, 0.3],
    [-0.34, 0.16, 0.18, 0.3],
    [0.3, 0.18, -0.26, 0.3],
    [-0.3, 0.18, -0.26, 0.3],
    [0, 0.34, -0.05, 0.32],
    [0, -0.12, 0.3, 0.26],
  ];
  for (const [px, py, pz, r] of puffs) {
    const p = woolPuff(r, py > 0.3 ? WOOL : WOOL_DK);
    p.position.set(px, py, pz);
    body.add(p);
  }
  g.add(body);

  // colored saddle blanket so each ram is identifiable from above
  const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 8), toon(color));
  saddle.scale.set(1.05, 0.42, 1.1);
  saddle.position.set(0, 0.92, -0.04);
  g.add(saddle);

  // head
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 0.66, 0.62);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), toon(FACE));
  skull.scale.set(0.92, 0.98, 1.05);
  skull.castShadow = true;
  head.add(skull);

  // wool tuft on forehead
  const tuft = woolPuff(0.2, WOOL);
  tuft.position.set(0, 0.26, 0.02);
  head.add(tuft);

  // curled horns
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.075, 10, 18, Math.PI * 1.5),
      toon(HORN),
    );
    horn.position.set(0.23 * side, 0.16, -0.02);
    horn.rotation.set(Math.PI / 2, 0, side * 0.7);
    head.add(horn);
  }
  // snout
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(0x4a4642));
  snout.scale.set(1.1, 0.8, 1);
  snout.position.set(0, -0.08, 0.28);
  head.add(snout);
  // eyes (white + pupil)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), toon(0xffffff));
    eye.position.set(0.13 * side, 0.06, 0.25);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), toon(0x111111));
    pupil.position.set(0.14 * side, 0.06, 0.31);
    head.add(pupil);
  }
  g.add(head);

  // hat cosmetic (little party cone)
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 10), toon(hatColor));
  hat.position.set(0, 0.36, 0);
  hat.castShadow = true;
  head.add(hat);
  const pom = woolPuff(0.08, 0xffffff);
  pom.position.set(0, 0.55, 0);
  head.add(pom);

  // four articulated legs, each pivoting at the hip so they can swing
  const legDefs: [string, number, number][] = [
    ["legFL", -0.26, 0.3],
    ["legFR", 0.26, 0.3],
    ["legBL", -0.26, -0.3],
    ["legBR", 0.26, -0.3],
  ];
  for (const [name, lx, lz] of legDefs) {
    const leg = makeQuadLeg(0.3, 0.075, FACE, HOOF);
    leg.name = name;
    leg.position.set(lx, 0.46, lz);
    g.add(leg);
  }

  // a stubby tail that flicks while idle
  const tail = woolPuff(0.13, WOOL);
  tail.name = "tail";
  tail.position.set(0, 0.7, -0.62);
  g.add(tail);
}

export function makeSheep(): THREE.Group {
  const g = new THREE.Group();
  const visual = new THREE.Group();
  visual.name = "visual";
  g.add(visual);

  if (TEMPLATES.sheep) {
    visual.add(TEMPLATES.sheep.clone(true));
    return g;
  }

  buildProceduralSheep(visual);
  return g;
}

function buildProceduralSheep(g: THREE.Group): void {
  const body = new THREE.Group();
  body.position.y = 0.42;
  const core = woolPuff(0.32, WOOL);
  core.castShadow = true;
  body.add(core);
  for (const [px, py, pz, r] of [
    [0.2, 0.1, 0.1, 0.2],
    [-0.2, 0.1, 0.1, 0.2],
    [0.18, 0.12, -0.18, 0.2],
    [-0.18, 0.12, -0.18, 0.2],
    [0, 0.22, -0.04, 0.22],
  ] as [number, number, number, number][]) {
    const p = woolPuff(r, py > 0.2 ? WOOL : WOOL_DK);
    p.position.set(px, py, pz);
    body.add(p);
  }
  g.add(body);

  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 0.5, 0.3);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), toon(0x3a3632));
  skull.scale.set(0.95, 1, 1.05);
  head.add(skull);
  // little face fluff so it reads cute, not a black blob
  const cheek = woolPuff(0.12, WOOL);
  cheek.position.set(0, 0.06, -0.06);
  head.add(cheek);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), toon(0x111111));
    eye.position.set(0.07 * side, 0.03, 0.13);
    head.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0x3a3632));
    ear.scale.set(0.6, 0.3, 1);
    ear.position.set(0.18 * side, 0.06, -0.02);
    ear.rotation.z = side * 0.3;
    ear.name = side < 0 ? "earL" : "earR";
    head.add(ear);
  }
  g.add(head);

  // four articulated legs pivoting at the hip
  const legDefs: [string, number, number][] = [
    ["legFL", -0.14, 0.16],
    ["legFR", 0.14, 0.16],
    ["legBL", -0.14, -0.16],
    ["legBR", 0.14, -0.16],
  ];
  for (const [name, lx, lz] of legDefs) {
    const leg = makeQuadLeg(0.18, 0.045, 0x3a3632, 0x2a2724);
    leg.name = name;
    leg.position.set(lx, 0.3, lz);
    g.add(leg);
  }
}

export function makeFarmer(): THREE.Group {
  const g = new THREE.Group();
  const visual = new THREE.Group();
  visual.name = "visual";
  g.add(visual);

  if (TEMPLATES.farmer) {
    visual.add(TEMPLATES.farmer.clone(true));
    return g;
  }

  buildProceduralFarmer(visual);
  return g;
}

function buildProceduralFarmer(g: THREE.Group): void {
  // torso group bobs as one unit while marching
  const torso = new THREE.Group();
  torso.name = "torso";
  g.add(torso);
  // overalls torso
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 6, 12), toon(0x2f5fa0));
  body.position.y = 0.85;
  body.castShadow = true;
  torso.add(body);
  // plaid shirt collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.35, 12), toon(0xb5443a));
  collar.position.y = 1.2;
  torso.add(collar);
  // head
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), toon(0xe7b48a));
  head.position.y = 1.55;
  head.castShadow = true;
  torso.add(head);
  // bushy beard
  const beard = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), toon(0xcfc6ba));
  beard.scale.set(1, 0.8, 0.7);
  beard.position.set(0, 1.42, 0.16);
  torso.add(beard);
  // straw hat
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.4, 12), toon(0xd9a441));
  hat.position.y = 1.86;
  torso.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.07, 16), toon(0xd9a441));
  brim.position.y = 1.68;
  torso.add(brim);

  // right arm pivoting at the shoulder, holding the stick (animated via "arm")
  const arm = new THREE.Group();
  arm.name = "arm";
  arm.position.set(0.42, 1.18, 0.05);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 4, 8), toon(0x2f5fa0));
  upper.position.set(0.06, -0.12, 0.12);
  upper.rotation.x = -0.6;
  arm.add(upper);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0xe7b48a));
  hand.position.set(0.1, -0.28, 0.3);
  arm.add(hand);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 8), toon(0x7a542e));
  stick.position.set(0.1, -0.1, 0.55);
  stick.rotation.x = Math.PI / 2.2;
  arm.add(stick);
  torso.add(arm);

  // left arm that swings opposite the legs while marching
  const armL = new THREE.Group();
  armL.name = "armL";
  armL.position.set(-0.42, 1.18, 0.05);
  const upperL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 4, 8), toon(0x2f5fa0));
  upperL.position.y = -0.2;
  armL.add(upperL);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0xe7b48a));
  handL.position.y = -0.42;
  armL.add(handL);
  torso.add(armL);

  // two legs pivoting at the hip for a stomping march
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? "legL" : "legR";
    leg.position.set(0.16 * side, 0.62, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.4, 4, 8), toon(0x274d82));
    thigh.position.y = -0.28;
    thigh.castShadow = true;
    leg.add(thigh);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.32), toon(0x3a2a1c));
    boot.position.set(0, -0.56, 0.06);
    leg.add(boot);
    g.add(leg);
  }
}

export function makeBarn(): THREE.Group {
  const g = new THREE.Group();

  // --- main body: classic barn silhouette with sloped lower walls ---
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 3.6), toon(0xcc3f35));
  body.position.y = 1.3;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // creamy stone foundation
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.45, 3.75), toon(0x8a8579));
  base.position.y = 0.22;
  base.receiveShadow = true;
  g.add(base);

  // vertical plank battens on the front + back for texture
  for (const z of [1.81, -1.81]) {
    for (let i = -2; i <= 2; i++) {
      const batten = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.06), toon(0xab2f27));
      batten.position.set(i * 0.82, 1.35, z);
      g.add(batten);
    }
  }
  // side plank battens
  for (const x of [2.11, -2.11]) {
    for (let i = -1; i <= 1; i++) {
      const batten = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.1), toon(0xab2f27));
      batten.position.set(x, 1.35, i * 0.95);
      g.add(batten);
    }
  }

  // --- gambrel-style roof (two slopes) made of stacked prisms ---
  const lowerRoof = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.9, 3.9), toon(0x5e6470));
  lowerRoof.position.y = 3.0;
  lowerRoof.castShadow = true;
  g.add(lowerRoof);
  const upperRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 2.0, 1.2, 4), toon(0x6b7280));
  upperRoof.position.y = 4.0;
  upperRoof.rotation.y = Math.PI / 4;
  upperRoof.scale.z = 0.86;
  upperRoof.castShadow = true;
  g.add(upperRoof);
  // ridge cap
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 4.0), toon(0x3f4450));
  ridge.position.y = 4.55;
  g.add(ridge);
  // little weather vane on top
  const vanePole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), toon(0x2c2c2c));
  vanePole.position.set(1.6, 4.85, 0);
  g.add(vanePole);
  const vane = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 4), toon(0x2c2c2c));
  vane.rotation.z = -Math.PI / 2;
  vane.position.set(1.78, 5.05, 0);
  g.add(vane);

  // gable triangle face in cream
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 1.55, 1.05, 3), toon(0xf3ead6));
  gable.rotation.x = -Math.PI / 2;
  gable.position.set(0, 3.6, 1.83);
  gable.scale.set(1.3, 1, 1);
  g.add(gable);
  // hayloft door in the gable
  const loft = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), toon(0x7a3b2c));
  loft.position.set(0, 3.45, 1.86);
  g.add(loft);
  const hay = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), toon(0xe6c34d));
  hay.scale.set(1.1, 0.7, 0.5);
  hay.position.set(0, 3.35, 1.95);
  g.add(hay);

  // --- big double barn doors with white trim ---
  const doorBg = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.1, 0.12), toon(0x9c2c24));
  doorBg.position.set(0, 1.05, 1.82);
  g.add(doorBg);
  for (const sx of [-0.48, 0.48]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.95, 0.14), toon(0xf3ead6));
    door.position.set(sx, 1.0, 1.86);
    g.add(door);
    // diagonal cross beam on each door
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.04), toon(0xc23b32));
    beam.position.set(sx, 1.0, 1.94);
    beam.rotation.z = sx > 0 ? 0.65 : -0.65;
    g.add(beam);
  }

  // corner trim posts
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), toon(0xf3ead6));
    post.position.set(sx * 2.0, 1.3, 1.7);
    g.add(post);
  }

  // --- a tall silo tucked beside the barn ---
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.6, 18), toon(0xdbd5c7));
  silo.position.set(-3.1, 1.8, -0.6);
  silo.castShadow = true;
  g.add(silo);
  // silo ribs
  for (const y of [1.0, 1.9, 2.8]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.91, 0.05, 6, 18), toon(0xbdb7a8));
    rib.rotation.x = Math.PI / 2;
    rib.position.set(-3.1, y, -0.6);
    g.add(rib);
  }
  const siloCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
    toon(0x9aa0ad),
  );
  siloCap.position.set(-3.1, 3.6, -0.6);
  g.add(siloCap);

  // hay bales by the door
  for (const [bx, bz, rot] of [[1.7, 2.4, 0.3], [2.3, 2.0, -0.5]] as [number, number, number][]) {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 14), toon(0xe2bf4e));
    bale.rotation.z = Math.PI / 2;
    bale.rotation.y = rot;
    bale.position.set(bx, 0.4, bz);
    bale.castShadow = true;
    g.add(bale);
  }
  // a small water trough
  const trough = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.5), toon(0x6b4a33));
  trough.position.set(-1.9, 0.35, 2.2);
  g.add(trough);
  const water = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.1, 0.4), toon(0x4fb3d9));
  water.position.set(-1.9, 0.48, 2.2);
  g.add(water);

  return g;
}

const POWERUP_COLORS: Record<string, number> = {
  snow: 0x9fe7ff,
  lovePill: 0xff5d9e,
  woolArmor: 0xf4f1ea,
  pepper: 0xff3b1f,
  golden: 0xffd000,
};

/** Build the distinctive icon mesh for each powerup kind, centered at origin. */
function makePowerupIcon(kind: string, color: number): THREE.Group {
  const icon = new THREE.Group();
  const mat = (c: number) =>
    new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.15,
      flatShading: true,
    });

  if (kind === "snow") {
    // snowflake: three crossed bars + center hub
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), mat(color));
      bar.rotation.z = (i * Math.PI) / 3;
      icon.add(bar);
      // little arm tips
      for (const s of [-1, 1]) {
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.08), mat(0xffffff));
        tip.position.set(s * 0.26, s * 0.1, 0);
        tip.rotation.z = (i * Math.PI) / 3 + 0.6;
        icon.add(tip);
      }
    }
    const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), mat(0xffffff));
    icon.add(hub);
  } else if (kind === "lovePill") {
    // chunky heart from two spheres + a cone
    for (const s of [-1, 1]) {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(color));
      lobe.position.set(s * 0.16, 0.12, 0);
      icon.add(lobe);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.42, 12), mat(color));
    tip.position.y = -0.22;
    tip.rotation.z = Math.PI;
    icon.add(tip);
  } else if (kind === "woolArmor") {
    // shield: rounded plate with a cross emblem
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.28, 0.12, 6), mat(color));
    plate.rotation.x = Math.PI / 2;
    plate.scale.y = 1.25;
    icon.add(plate);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 6), mat(0xcfc8b6));
    rim.scale.y = 1.25;
    icon.add(rim);
    for (const [w, h] of [[0.1, 0.36], [0.28, 0.1]] as [number, number][]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), mat(0x6fa8d6));
      bar.position.z = 0.05;
      icon.add(bar);
    }
  } else if (kind === "pepper") {
    // chili pepper: curved red body + green stem
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.4, 6, 12), mat(color));
    body.rotation.z = 0.5;
    body.position.y = -0.08;
    icon.add(body);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 8), mat(color));
    tip.position.set(0.16, -0.34, 0);
    tip.rotation.z = -0.6;
    icon.add(tip);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 6), mat(0x4caf50));
    stem.position.set(-0.18, 0.26, 0);
    stem.rotation.z = 0.5;
    icon.add(stem);
  } else {
    // golden: a little crown
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12, 1, true), mat(color));
    icon.add(band);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), mat(color));
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.28, 0.18, Math.sin(a) * 0.28);
      icon.add(spike);
      const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(0xff4d6d));
      gem.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
      icon.add(gem);
    }
  }
  return icon;
}

export function makePowerup(kind: string): THREE.Group {
  const g = new THREE.Group();
  const color = POWERUP_COLORS[kind] ?? 0xffffff;

  // the readable floating icon (this is what spins/pulses)
  const orb = makePowerupIcon(kind, color);
  orb.position.y = 0.85;
  orb.scale.setScalar(1.15);
  orb.name = "orb";
  g.add(orb);

  // a single soft halo ring so it reads as a pickup
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.04, 8, 28),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1 }),
  );
  ring.position.y = 0.85;
  ring.rotation.x = Math.PI / 2;
  ring.name = "ring";
  g.add(ring);

  // vertical beam of light so it's spottable from across the arena
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.34, 2.4, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.position.y = 1.4;
  beam.name = "beam";
  g.add(beam);

  // soft glow base disc on the ground
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.02;
  base.name = "glowBase";
  g.add(base);

  return g;
}
