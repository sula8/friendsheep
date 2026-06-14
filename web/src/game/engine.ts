import * as THREE from "three";

import { audio } from "./audio";
import { resolveHit } from "./combat";
import { CONFIG } from "./config";
import {
  makeBarn,
  makeBush,
  makeFarmer,
  makeFlower,
  makeGrassTexture,
  makePowerup,
  makeRam,
  makeSheep,
  makeTree,
} from "./models";
import { assignTitles, HAT_COLORS, nextName, RAM_COLORS, resetNamePool } from "./names";
import { makeFloatingText, NameTag } from "./sprites";
import type {
  FarmerEntity,
  FoundPowerup,
  HudState,
  PodiumEntry,
  PowerupKind,
  Ram,
  Sheep,
} from "./types";

interface InputState {
  moveX: number;
  moveZ: number;
  charging: boolean;
  aimX: number; // world-space aim target (cursor) or 0
  aimZ: number;
  hasAim: boolean;
}

let RAM_ID = 1;
let SHEEP_ID = 1;
let PU_ID = 1;

const UNIT = new THREE.Vector3(1, 1, 1);

export class Engine {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock = new THREE.Clock();
  private raf = 0;
  private accumulator = 0;

  private rams: Ram[] = [];
  private sheep: Sheep[] = [];
  private powerups: FoundPowerup[] = [];
  private farmer!: FarmerEntity;
  private barn!: THREE.Group;
  private barnPos = new THREE.Vector3();

  private player: Ram | null = null;
  readonly input: InputState = {
    moveX: 0,
    moveZ: 0,
    charging: false,
    aimX: 0,
    aimZ: 0,
    hasAim: false,
  };

  private arenaHalf: number = CONFIG.minArenaHalf;
  private zoneRadius: number = CONFIG.minArenaHalf;
  private roundTime = 0;
  private phase: "playing" | "podium" = "playing";
  private podiumTimer = 0;
  private foundSpawnTimer: number = CONFIG.foundRespawn;
  private goldenTimer: number = CONFIG.goldenRespawn;
  private hitStop = 0;
  private shake = 0;
  private podiumData: PodiumEntry[] = [];
  private killcam: { attacker: string; victim: string } | null = null;
  private killcamTimer = 0;
  private toast: string | null = null;
  private toastTimer = 0;
  private particles: {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    heart?: boolean;
  }[] = [];

  private zoneRing: THREE.LineLoop;
  private ground: THREE.Mesh;
  private crown: THREE.Mesh;
  private beacon: THREE.Group;
  private tags = new Map<number, NameTag>();
  private rings: { mesh: THREE.Mesh; life: number; ttl: number; grow: number }[] = [];
  private floaters: { sprite: THREE.Sprite; life: number; ttl: number; vy: number; base: number }[] = [];
  private trails: { mesh: THREE.Mesh; life: number; ttl: number }[] = [];

  onHud: (h: HudState) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // warm hazy summer-afternoon fog so distant hills melt into the sky
    this.scene.fog = new THREE.Fog(0xcdeaf6, 38, 88);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, 22, 14);
    this.camera.lookAt(0, 0, 0);

    // lights — soft sky/ground bounce + warm low sun for long cozy shadows
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x6f8a3c, 0.85);
    this.scene.add(hemi);
    const amb = new THREE.AmbientLight(0xfff0d8, 0.35);
    this.scene.add(amb);
    const sun = new THREE.DirectionalLight(0xfff1cf, 1.45);
    sun.position.set(18, 26, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    this.buildSky();
    this.buildHills();

    // ground — lush textured grass
    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(120, 64),
      new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 0.95, metalness: 0 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.buildMeadowProps();

    // zone ring
    const ringGeo = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 65 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a), 0.05, Math.sin(a));
      }),
    );
    this.zoneRing = new THREE.LineLoop(
      ringGeo,
      new THREE.LineBasicMaterial({ color: 0x00e5ff }),
    );
    this.zoneRing.visible = false;
    this.scene.add(this.zoneRing);

    // leader crown
    this.crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.22, 8, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xffd000, emissive: 0xffb000, emissiveIntensity: 0.6, side: THREE.DoubleSide }),
    );
    this.crown.visible = false;
    this.scene.add(this.crown);

    this.beacon = this.buildBeacon();
    this.beacon.visible = false;
    this.scene.add(this.beacon);

    window.addEventListener("resize", this.onResize);
  }

  /** Bright bobbing chevron + pulsing ring marking the human player's ram. */
  private buildBeacon(): THREE.Group {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.6, 4),
      new THREE.MeshBasicMaterial({ color: 0x3df5ff }),
    );
    cone.rotation.x = Math.PI; // point down
    cone.position.y = 2.9;
    cone.name = "chevron";
    g.add(cone);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.18, 36),
      new THREE.MeshBasicMaterial({
        color: 0x3df5ff,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.name = "ring";
    g.add(ring);
    return g;
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  // ---------------------------------------------------------------- environment
  /** Big gradient sky dome (sunny blue → warm horizon) with drifting clouds. */
  private buildSky(): void {
    const geo = new THREE.SphereGeometry(200, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x4aa3e8) },
        mid: { value: new THREE.Color(0x9fd4f5) },
        bottom: { value: new THREE.Color(0xe8f6f3) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        void main() {
          float h = normalize(vWorld).y;
          vec3 col = h > 0.0
            ? mix(mid, top, smoothstep(0.0, 0.6, h))
            : mix(mid, bottom, smoothstep(0.0, -0.15, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    this.scene.add(sky);

    // a few soft puffy clouds high up
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      fog: false,
    });
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Group();
      const blobs = 3 + Math.floor(Math.random() * 3);
      for (let b = 0; b < blobs; b++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), cloudMat);
        puff.position.set((b - blobs / 2) * 5 + Math.random() * 2, Math.random() * 2, Math.random() * 4);
        puff.scale.set(5 + Math.random() * 4, 3 + Math.random() * 2, 4);
        cloud.add(puff);
      }
      const ang = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 60;
      cloud.position.set(Math.cos(ang) * dist, 45 + Math.random() * 30, Math.sin(ang) * dist);
      cloud.rotation.y = Math.random() * Math.PI;
      this.scene.add(cloud);
    }
  }

  /** Layered rolling hills on the horizon so the meadow feels open and alive. */
  private buildHills(): void {
    const greens = [0x6cae4b, 0x5c9f40, 0x4f9038];
    for (let layer = 0; layer < 3; layer++) {
      const ring = new THREE.Group();
      const dist = 95 + layer * 16;
      const count = 16;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const hill = new THREE.Mesh(
          new THREE.SphereGeometry(14 + Math.random() * 10, 14, 10),
          new THREE.MeshStandardMaterial({ color: greens[layer], roughness: 1 }),
        );
        hill.scale.set(1.6, 0.5 + Math.random() * 0.4, 1.6);
        hill.position.set(
          Math.cos(ang) * dist + (Math.random() - 0.5) * 18,
          -6 + layer * 1.5,
          Math.sin(ang) * dist + (Math.random() - 0.5) * 18,
        );
        ring.add(hill);
      }
      this.scene.add(ring);
    }
  }

  /** Scatter flowers, bushes, and a few trees just outside the play area. */
  private buildMeadowProps(): void {
    const inner = CONFIG.minArenaHalf + 3;
    // flowers sprinkled across the whole meadow including the pasture
    for (let i = 0; i < 90; i++) {
      const f = makeFlower();
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * 46;
      f.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      f.rotation.y = Math.random() * Math.PI;
      const s = 0.7 + Math.random() * 0.7;
      f.scale.setScalar(s);
      this.scene.add(f);
    }
    // bushes ring the play field
    for (let i = 0; i < 30; i++) {
      const bush = makeBush();
      const ang = Math.random() * Math.PI * 2;
      const rad = inner + 4 + Math.random() * 30;
      bush.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      bush.scale.setScalar(0.8 + Math.random() * 0.9);
      this.scene.add(bush);
    }
    // a handful of trees further out
    for (let i = 0; i < 14; i++) {
      const tree = makeTree();
      const ang = Math.random() * Math.PI * 2;
      const rad = inner + 24 + Math.random() * 40;
      tree.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      tree.scale.setScalar(1 + Math.random() * 1.2);
      tree.rotation.y = Math.random() * Math.PI;
      this.scene.add(tree);
    }
  }

  // ---------------------------------------------------------------- lifecycle
  start(): void {
    this.startRound(true);
    this.clock.start();
    this.loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    audio.stopMusic();
    for (const t of this.tags.values()) t.dispose();
    this.tags.clear();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- round
  private startRound(firstTime: boolean): void {
    resetNamePool();
    this.phase = "playing";
    this.roundTime = 0;
    this.killcam = null;
    this.toast = null;

    // clear actors
    for (const r of this.rams) this.scene.remove(r.mesh);
    for (const s of this.sheep) this.scene.remove(s.mesh);
    for (const p of this.powerups) this.scene.remove(p.mesh);
    for (const t of this.tags.values()) t.dispose();
    this.tags.clear();
    this.rams = [];
    this.sheep = [];
    this.powerups = [];

    const count = CONFIG.entityTarget;
    this.arenaHalf = Math.max(
      CONFIG.minArenaHalf,
      Math.sqrt((count * CONFIG.areaPerEntity)) / 2,
    );
    this.zoneRadius = this.arenaHalf;

    // barn at a corner
    if (!this.barn) {
      this.barn = makeBarn();
      this.scene.add(this.barn);
    }
    this.barnPos.set(this.arenaHalf - 2, 0, -this.arenaHalf + 2);
    this.barn.position.copy(this.barnPos);
    this.barn.rotation.y = Math.PI * 0.75;

    // farmer
    if (!this.farmer) {
      const mesh = makeFarmer();
      mesh.visible = false;
      this.scene.add(mesh);
      this.farmer = {
        mesh,
        x: this.barnPos.x,
        z: this.barnPos.z,
        facing: 0,
        active: false,
        swingTimer: 0,
        cooldown: 20,
        outTimer: 0,
        controlledBy: null,
        swungAt: 0,
        swingTarget: null,
        postHitTimer: 0,
      };
    }
    this.farmer.active = false;
    this.farmer.controlledBy = null;
    this.farmer.cooldown = 20;
    this.farmer.mesh.visible = false;
    this.farmer.x = this.barnPos.x;
    this.farmer.z = this.barnPos.z;

    // create player + bots
    const colorPool = [...RAM_COLORS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const isPlayer = i === 0;
      const ram = this.makeRamEntity(isPlayer, colorPool[i % colorPool.length]);
      this.rams.push(ram);
      this.scene.add(ram.mesh);
      if (isPlayer) this.player = ram;
    }

    // sheep — a field of points
    const sheepCount = Math.round(count * 1.1);
    for (let i = 0; i < sheepCount; i++) this.spawnSheep();

    audio.startMusic();
    if (!firstTime) audio.countdown();
  }

  private makeRamEntity(isPlayer: boolean, color: number): Ram {
    const hat = HAT_COLORS[Math.floor(Math.random() * HAT_COLORS.length)];
    const mesh = makeRam(color, hat, isPlayer);
    const angle = Math.random() * Math.PI * 2;
    const r = this.zoneRadius * 0.7 * Math.random();
    const ram: Ram = {
      id: RAM_ID++,
      name: isPlayer ? "YOU" : nextName(),
      isPlayer,
      isBot: !isPlayer,
      color,
      hat,
      mesh,
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
      vx: 0,
      vz: 0,
      facing: Math.random() * Math.PI * 2,
      y: 0,
      vy: 0,
      spin: 0,
      state: "idle",
      score: CONFIG.startScore,
      alive: true,
      charge: 0,
      charging: false,
      aim: 0,
      dashTimer: 0,
      dashStrength: 0,
      recoveryTimer: 0,
      ragdollTimer: 0,
      popTimer: 0,
      invulnUntil: 1,
      spawnFlash: 0,
      barnSafeRemaining: CONFIG.barnSafeTime,
      barnReadyAt: 0,
      inBarn: false,
      barnSafe: false,
      powerups: { snowUntil: 0, loveUntil: 0, woolArmor: false, pepperHits: 0, golden: false },
      stats: { sheepPopped: 0, pointsStolen: 0, farmerHits: 0, knockouts: 0, timesLaunched: 0, activity: 0 },
      aggression: Math.random(),
      skill: 0.3 + Math.random() * 0.7,
      reaction: CONFIG.botReactionMin + Math.random() * (CONFIG.botReactionMax - CONFIG.botReactionMin),
      botTimer: 0,
      botState: "wander",
      wanderX: 0,
      wanderZ: 0,
    };
    mesh.position.set(ram.x, 0, ram.z);

    // floating name + score tag that follows the ram
    const tag = new NameTag();
    tag.sprite.position.y = 2.3;
    mesh.add(tag.sprite);
    this.tags.set(ram.id, tag);

    return ram;
  }

  private spawnSheep(): void {
    const mesh = makeSheep();
    mesh.scale.setScalar(CONFIG.sheepScale);
    const angle = Math.random() * Math.PI * 2;
    const r = this.zoneRadius * 0.85 * Math.random();
    const s: Sheep = {
      id: SHEEP_ID++,
      mesh,
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
      vx: 0,
      vz: 0,
      facing: Math.random() * Math.PI * 2,
      wanderTimer: Math.random() * 2,
      beingPopped: false,
      popper: null,
    };
    mesh.position.set(s.x, 0, s.z);
    this.scene.add(mesh);
    this.sheep.push(s);
  }

  // ---------------------------------------------------------------- loop
  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const frame = Math.min(this.clock.getDelta(), 0.05);
    this.accumulator += frame;
    while (this.accumulator >= CONFIG.fixedDt) {
      this.step(CONFIG.fixedDt);
      this.accumulator -= CONFIG.fixedDt;
    }
    this.render(frame);
  };

  private step(dt: number): void {
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }

    if (this.phase === "podium") {
      this.podiumTimer -= dt;
      this.stepPodium(dt);
      if (this.podiumTimer <= 0) this.startRound(false);
      this.emitHud();
      return;
    }

    this.roundTime += dt;
    this.updateZone(dt);
    this.updateFarmer(dt);
    this.updatePowerupSpawns(dt);

    for (const ram of this.rams) this.updateRam(ram, dt);
    for (const s of this.sheep) this.updateSheep(s, dt);

    this.handleCollisions(dt);
    this.checkPowerupPickup();
    this.checkWinConditions();

    if (this.killcamTimer > 0) {
      this.killcamTimer -= dt;
      if (this.killcamTimer <= 0) this.killcam = null;
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast = null;
    }

    this.emitHud();
  }

  // ---------------------------------------------------------------- zone
  private updateZone(dt: number): void {
    // Zone no longer shrinks — the pen stays at full arena size all round.
    const target = this.arenaHalf;
    this.zoneRadius += (target - this.zoneRadius) * Math.min(1, dt * 1.5);
  }

  // ---------------------------------------------------------------- farmer
  private updateFarmer(dt: number): void {
    const f = this.farmer;
    const finalPhase = this.roundTime >= CONFIG.phase3Start;

    if (!f.active) {
      f.cooldown -= dt;
      if (f.cooldown <= 0 || (finalPhase && this.roundTime > 0)) {
        f.active = true;
        f.mesh.visible = true;
        f.x = this.barnPos.x;
        f.z = this.barnPos.z;
        f.outTimer = finalPhase ? 999 : 15;
        audio.farmer();
      }
      return;
    }

    f.outTimer -= dt;
    if (f.outTimer <= 0 && !finalPhase) {
      // walk home
      const dx = this.barnPos.x - f.x;
      const dz = this.barnPos.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d < 1) {
        f.active = false;
        f.mesh.visible = false;
        f.cooldown = 20 + Math.random() * 12;
        return;
      }
      f.x += (dx / d) * CONFIG.farmerSpeed * dt;
      f.z += (dz / d) * CONFIG.farmerSpeed * dt;
      f.facing = Math.atan2(dz, dx);
      f.mesh.position.set(f.x, 0, f.z);
      f.mesh.rotation.y = -f.facing + Math.PI / 2;
      this.animateFarmer(true, 0);
      return;
    }

    // post-hit recovery: the farmer plants his stick and catches his breath,
    // giving the ram he just clobbered a clear window to dash away.
    if (f.postHitTimer > 0) {
      f.postHitTimer -= dt;
      this.animateFarmer(false, 0);
      f.mesh.position.set(f.x, 0, f.z);
      f.mesh.rotation.y = -f.facing + Math.PI / 2;
      return;
    }

    // leash: don't chase forever — if the farmer strays too far from the barn,
    // he gives up and trudges home (unless it's the final phase).
    const leash = this.arenaHalf * 1.15;
    const fromBarn = Math.hypot(f.x - this.barnPos.x, f.z - this.barnPos.z);
    if (!finalPhase && fromBarn > leash) {
      f.outTimer = Math.min(f.outTimer, 0);
    }

    // hunt nearest living ram (or chase via player control)
    let target: Ram | null = null;
    let best = Infinity;
    for (const r of this.rams) {
      if (!r.alive) continue;
      if (r.barnSafe || this.now() < r.invulnUntil) continue; // can't grab sheltered/spawning rams
      const d = (r.x - f.x) ** 2 + (r.z - f.z) ** 2;
      if (d < best) {
        best = d;
        target = r;
      }
    }
    // ignore targets that have already fled out of reach (gives dashers a real escape)
    const giveUpRange = finalPhase ? Infinity : 13;
    if (target && Math.sqrt(best) > giveUpRange) target = null;
    if (target) {
      const dx = target.x - f.x;
      const dz = target.z - f.z;
      const d = Math.hypot(dx, dz) || 1;
      f.x += (dx / d) * CONFIG.farmerSpeed * dt;
      f.z += (dz / d) * CONFIG.farmerSpeed * dt;
      f.facing = Math.atan2(dz, dx);
      if (d < 1.7 && f.swingTimer <= 0) {
        // start a swing: windup (1.0 -> ~0.45) then slam (~0.45 -> 0)
        f.swingTimer = 1;
        f.swungAt = 0;
        f.swingTarget = target;
      }
    }
    if (f.swingTimer > 0) {
      const prev = f.swingTimer;
      f.swingTimer -= dt * 2.2; // ~0.45s total swing — snappy
      // land the hit at the slam moment (crossing the windup->slam threshold)
      if (prev > 0.45 && f.swingTimer <= 0.45 && f.swungAt === 0) {
        f.swungAt = 1;
        const tgt = f.swingTarget;
        if (tgt && tgt.alive && (tgt.x - f.x) ** 2 + (tgt.z - f.z) ** 2 < 2.4 * 2.4) {
          this.applyFarmerHit(tgt);
        }
        // dust kick + ground ring on the slam
        const fx = f.x + Math.cos(f.facing) * 0.9;
        const fz = f.z + Math.sin(f.facing) * 0.9;
        this.spawnParticles(fx, 0.2, fz, 0xb9935a, 8);
        this.spawnRing(fx, fz, 0xffcf66, 0.35);
      }
      if (f.swingTimer <= 0) {
        f.swingTimer = 0;
        f.swingTarget = null;
        f.swungAt = 0;
      }
    }
    const swing = Math.max(0, f.swingTimer);
    this.animateFarmer(target !== null, swing);
    f.mesh.position.set(f.x, 0, f.z);
    f.mesh.rotation.y = -f.facing + Math.PI / 2;
  }

  /** Swing a quadruped's four named hip-pivot legs in diagonal pairs. */
  private swingLegs(mesh: THREE.Object3D, phase: number, amp: number): void {
    const s = Math.sin(phase) * amp;
    const fl = mesh.getObjectByName("legFL");
    const fr = mesh.getObjectByName("legFR");
    const bl = mesh.getObjectByName("legBL");
    const br = mesh.getObjectByName("legBR");
    if (fl) fl.rotation.x = s;
    if (br) br.rotation.x = s;
    if (fr) fr.rotation.x = -s;
    if (bl) bl.rotation.x = -s;
  }

  /** Stomping march, swinging legs/arms, and a stick-swing lunge for the farmer. */
  private animateFarmer(moving: boolean, swing: number): void {
    const f = this.farmer;
    const t = this.now();
    const arm = f.mesh.getObjectByName("arm");
    const armL = f.mesh.getObjectByName("armL");
    const torso = f.mesh.getObjectByName("torso");
    const legL = f.mesh.getObjectByName("legL");
    const legR = f.mesh.getObjectByName("legR");
    const visual = f.mesh.getObjectByName("visual");

    const gait = t * 8;
    const stride = moving ? Math.sin(gait) * 0.6 : 0;

    // --- swing pose: windup (swing 1 -> 0.45) raises stick way back, then
    // slam (0.45 -> 0) whips it down hard past vertical. Two-handed lunge.
    let armX = moving ? -stride * 0.5 : 0;
    let armLX = moving ? stride * 0.6 : 0;
    let torsoLean = 0;
    let torsoTwist = 0;
    if (swing > 0) {
      if (swing > 0.45) {
        // windup: rear back, raise stick high, lean torso back
        const w = (swing - 0.45) / 0.55; // 1 at start of windup -> 0 at slam
        armX = -2.6 * w - 0.3;
        armLX = -1.4 * w;
        torsoLean = 0.35 * w; // lean back
        torsoTwist = -0.3 * w;
      } else {
        // slam: whip the stick down fast, body lunges forward
        const s = swing / 0.45; // 1 right after impact -> 0 at end
        armX = 1.5 * s; // overshoot down
        armLX = 1.0 * s;
        torsoLean = -0.5 * (1 - s) - 0.15; // pitch forward into the hit
        torsoTwist = 0.4 * (1 - s);
      }
    }

    if (legL) legL.rotation.x = swing > 0 ? 0.4 : stride; // brace stance on swing
    if (legR) legR.rotation.x = swing > 0 ? -0.5 : -stride;
    if (arm) arm.rotation.x = armX;
    if (armL) armL.rotation.x = armLX;

    if (torso) {
      torso.position.y = moving ? Math.abs(Math.sin(gait)) * 0.1 : 0;
      torso.rotation.z = moving ? Math.sin(gait) * 0.05 : 0;
      torso.rotation.x = torsoLean;
      torso.rotation.y = torsoTwist;
    } else if (visual) {
      // generated farmer fallback — big body lunge through the swing
      visual.rotation.x = swing > 0.45 ? 0.4 : -0.6 * (1 - swing / 0.45);
      visual.rotation.y = torsoTwist;
    }
  }

  /** Comedic mount-and-thrust while a ram "pops" a sheep (Sven gag — rooted, rhythmic). */
  private animateRamPop(ram: Ram): void {
    const visual = ram.mesh.getObjectByName("visual");
    if (!visual) return;
    const prog = 1 - Math.max(0, ram.popTimer) / CONFIG.popTime; // 0..1
    const t = this.now();
    // rhythmic hip thrusts that speed up toward the payoff
    const rhythm = 9 + prog * 8;
    const thrust = Math.max(0, Math.sin(t * rhythm)); // 0..1 forward pump
    // ram rears up onto the sheep's back: lifted, tilted forward, riding the pump
    visual.position.y = 0.42 + thrust * 0.12;
    visual.rotation.x = 0.55 + thrust * 0.35; // leaning over, thrusting in
    visual.rotation.z = Math.sin(t * rhythm * 0.5) * 0.06;
    visual.scale.setScalar(1);
    // head nods along with the rhythm
    const head = ram.mesh.getObjectByName("head");
    if (head) head.rotation.x = thrust * 0.25;
    // tail flicks
    const tail = ram.mesh.getObjectByName("tail");
    if (tail) tail.rotation.x = Math.sin(t * 16) * 0.4 + 0.1;
    // front legs hug forward (raised), back legs stay planted for the stand
    const fl = ram.mesh.getObjectByName("legFL");
    const fr = ram.mesh.getObjectByName("legFR");
    if (fl) fl.rotation.x = -0.9 - thrust * 0.3;
    if (fr) fr.rotation.x = -0.9 - thrust * 0.3;
    const bl = ram.mesh.getObjectByName("legBL");
    const br = ram.mesh.getObjectByName("legBR");
    if (bl) bl.rotation.x = 0.1;
    if (br) br.rotation.x = 0.1;
    // small pink hearts puff out continuously through the act
    if (Math.random() < 0.5) {
      const pink = Math.random() < 0.5 ? 0xff8fc0 : 0xff5d9e;
      this.spawnHeart(
        ram.x + (Math.random() - 0.5) * 0.8,
        1.3 + Math.random() * 0.6,
        ram.z + (Math.random() - 0.5) * 0.8,
        pink,
      );
    }
  }

  private applyFarmerHit(ram: Ram): void {
    if (this.now() < ram.invulnUntil) return;
    audio.thunk(0.6);
    audio.bleat();
    const before = ram.score;
    ram.score = Math.max(0, ram.score - CONFIG.farmerHit);
    ram.stats.farmerHits++;
    this.knockRam(ram, Math.atan2(ram.z - this.farmer.z, ram.x - this.farmer.x), 14);
    this.spawnParticles(ram.x, 1, ram.z, 0xff5555, 8);
    if (ram.score <= 0 && before > 0) this.eliminate(ram, null);
    if (ram.isPlayer) this.shake = Math.max(this.shake, 0.5);
    // farmer recovers for a beat after connecting — the victim gets a real escape window
    this.farmer.postHitTimer = 1.6;
    this.farmer.swingTimer = 0;
    this.farmer.swingTarget = null;
    this.farmer.swungAt = 0;
  }

  // ---------------------------------------------------------------- powerups
  private updatePowerupSpawns(dt: number): void {
    this.foundSpawnTimer -= dt;
    this.goldenTimer -= dt;
    const nonGolden = this.powerups.filter((p) => p.kind !== "golden").length;
    if (this.foundSpawnTimer <= 0) {
      this.foundSpawnTimer = CONFIG.foundRespawn;
      if (this.powerups.length < CONFIG.foundCap) {
        this.spawnFound(Math.random() < 0.8 ? "pepper" : "golden");
      }
    }
    if (this.goldenTimer <= 0) {
      this.goldenTimer = CONFIG.goldenRespawn;
      const goldenOut = this.powerups.some((p) => p.kind === "golden");
      if (!goldenOut && this.powerups.length < CONFIG.foundCap) this.spawnFound("golden");
    }
    void nonGolden;
    const t = this.now();
    for (const p of this.powerups) {
      const orb = p.mesh.getObjectByName("orb");
      if (orb) {
        orb.rotation.y += dt * 2.4;
        orb.rotation.x = Math.sin(t * 1.5 + p.id) * 0.25;
        const pulse = 1 + Math.sin(t * 4 + p.id) * 0.08;
        orb.scale.setScalar(pulse);
      }
      const beam = p.mesh.getObjectByName("beam") as THREE.Mesh | undefined;
      if (beam) (beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + (Math.sin(t * 4 + p.id) + 1) * 0.06;
      const glow = p.mesh.getObjectByName("glowBase");
      if (glow) glow.scale.setScalar(1 + Math.sin(t * 3 + p.id) * 0.15);
      p.mesh.position.y = Math.sin(t * 2.5 + p.id) * 0.12;
      p.mesh.rotation.y += dt * 0.6;
    }
  }

  private spawnFound(kind: PowerupKind): void {
    const mesh = makePowerup(kind);
    const angle = Math.random() * Math.PI * 2;
    const r = this.zoneRadius * 0.7 * Math.random();
    const p: FoundPowerup = {
      id: PU_ID++,
      kind,
      mesh,
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
    };
    mesh.position.set(p.x, 0, p.z);
    this.scene.add(mesh);
    this.powerups.push(p);
  }

  private checkPowerupPickup(): void {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      for (const ram of this.rams) {
        if (!ram.alive) continue;
        if ((ram.x - p.x) ** 2 + (ram.z - p.z) ** 2 < 0.8 * 0.8) {
          this.givePowerup(ram, p.kind);
          this.scene.remove(p.mesh);
          this.powerups.splice(i, 1);
          break;
        }
      }
    }
  }

  private givePowerup(ram: Ram, kind: PowerupKind): void {
    if (kind === "pepper") ram.powerups.pepperHits = CONFIG.pepperHits;
    else if (kind === "golden") ram.powerups.golden = true;
    else if (kind === "snow") ram.powerups.snowUntil = this.now() + CONFIG.snowDuration;
    else if (kind === "lovePill") ram.powerups.loveUntil = this.now() + CONFIG.lovePillDuration;
    else if (kind === "woolArmor") ram.powerups.woolArmor = true;
    if (ram.isPlayer) {
      audio.powerup();
      this.setToast(
        kind === "pepper" ? "PEPPER HORNS! x2 knockback" : kind === "golden" ? "GOLDEN HORNS! mega launch ready" : "POWERUP!",
      );
    }
  }

  /** Called from React shop UI. */
  buyShop(kind: "snow" | "lovePill" | "woolArmor"): boolean {
    const p = this.player;
    if (!p || !p.alive) return false;
    const price = kind === "snow" ? CONFIG.priceSnow : kind === "lovePill" ? CONFIG.priceLovePill : CONFIG.priceWoolArmor;
    if (p.score < price) return false;
    p.score -= price;
    this.givePowerup(p, kind);
    audio.buy();
    return true;
  }

  /**
   * Barn shelter: stepping inside the barn makes a ram invulnerable and (for the
   * player) opens the shop — but only for a limited window per visit. Once the
   * window runs out the ram is exposed again, and the barn won't shelter them
   * until they've stayed out for the cooldown. Leaving refills the window and
   * starts the cooldown, so you can't camp the doorway.
   */
  private updateBarnShelter(ram: Ram, dt: number): void {
    const dist2 = (ram.x - this.barnPos.x) ** 2 + (ram.z - this.barnPos.z) ** 2;
    const inside = dist2 < CONFIG.barnRadius * CONFIG.barnRadius;
    const now = this.now();
    ram.inBarn = inside;

    if (inside) {
      const offCooldown = now >= ram.barnReadyAt;
      if (offCooldown && ram.barnSafeRemaining > 0) {
        ram.barnSafeRemaining = Math.max(0, ram.barnSafeRemaining - dt);
        ram.barnSafe = true;
        // refresh invulnerability every frame so headbutts & the farmer can't touch us
        ram.invulnUntil = Math.max(ram.invulnUntil, now + 0.2);
        if (ram.barnSafeRemaining === 0) {
          // window just expired -> exposed, and locked out until cooldown clears
          ram.barnSafe = false;
          ram.barnReadyAt = now + CONFIG.barnCooldown;
          if (ram.isPlayer) this.setToast("Kicked out of the barn! No shelter for a bit");
        }
      } else {
        ram.barnSafe = false;
      }
    } else {
      // stepped out: if any shelter was spent, start the cooldown and refill the window
      if (ram.barnSafeRemaining < CONFIG.barnSafeTime) {
        ram.barnReadyAt = Math.max(ram.barnReadyAt, now + CONFIG.barnCooldown);
        ram.barnSafeRemaining = CONFIG.barnSafeTime;
      }
      ram.barnSafe = false;
    }
  }

  // ---------------------------------------------------------------- ram update
  private updateRam(ram: Ram, dt: number): void {
    if (!ram.alive) {
      if (ram.spawnFlash > 0) ram.spawnFlash -= dt;
      return;
    }

    if (ram.isBot) this.botBrain(ram, dt);

    this.updateBarnShelter(ram, dt);

    const speedMult = this.now() < ram.powerups.snowUntil ? CONFIG.snowSpeedMult : 1;

    // knockback arc — slide back, tip over once, settle, then get up (no cartwheels)
    if (ram.state === "ragdoll") {
      ram.ragdollTimer -= dt;
      ram.x += ram.vx * dt;
      ram.z += ram.vz * dt;
      ram.vy -= 30 * dt;
      ram.y += ram.vy * dt;
      const onGround = ram.y <= 0;
      // friction: airborne keeps momentum, grounded skids to a stop
      const fric = onGround ? 0.86 : 0.99;
      ram.vx *= fric;
      ram.vz *= fric;
      // tip onto the back while airborne, then rock back upright once landed
      const tipTarget = onGround ? 0 : Math.min(ram.spin + dt * 6, 2.1);
      ram.spin = onGround ? THREE.MathUtils.lerp(ram.spin, 0, 0.18) : tipTarget;
      if (onGround) {
        ram.y = 0;
        ram.vy = 0;
      }
      if (ram.ragdollTimer <= 0) {
        ram.state = "recovery";
        ram.recoveryTimer = CONFIG.postDashRecovery;
        ram.spin = 0;
        ram.vx = 0;
        ram.vz = 0;
      }
      this.syncRamMesh(ram);
      this.clampToWorld(ram);
      this.zoneDrain(ram, dt);
      return;
    }

    // popping a sheep (rooted)
    if (ram.state === "popping") {
      ram.popTimer -= dt;
      ram.vx = 0;
      ram.vz = 0;
      if (ram.popTimer <= 0) {
        ram.state = "idle";
      }
      this.syncRamMesh(ram);
      this.animateRamPop(ram);
      this.zoneDrain(ram, dt);
      return;
    }

    // recovery lockout
    if (ram.state === "recovery") {
      ram.recoveryTimer -= dt;
      if (ram.recoveryTimer <= 0) ram.state = "idle";
    }

    // dashing
    if (ram.state === "dashing") {
      ram.dashTimer -= dt;
      const v = CONFIG.dashTapSpeed + (CONFIG.dashFullSpeed - CONFIG.dashTapSpeed) * ram.dashStrength;
      ram.vx = Math.cos(ram.facing) * v;
      ram.vz = Math.sin(ram.facing) * v;
      ram.x += ram.vx * dt;
      ram.z += ram.vz * dt;
      ram.stats.activity += dt;
      if (ram.dashTimer <= 0) {
        ram.state = "recovery";
        ram.recoveryTimer = CONFIG.postDashRecovery;
      }
      this.syncRamMesh(ram);
      this.clampToWorld(ram);
      this.zoneDrain(ram, dt);
      return;
    }

    // charging / movement
    const wantCharge = ram.isPlayer ? this.input.charging : ram.charging;
    const canCharge = ram.state === "idle";

    if (wantCharge && (canCharge || ram.state === "charging")) {
      if (ram.state !== "charging") {
        ram.state = "charging";
        ram.charge = 0;
        if (ram.isPlayer) audio.charge();
      }
      ram.charge = Math.min(1, ram.charge + dt / CONFIG.chargeTime);
      // aim
      if (ram.isPlayer && this.input.hasAim) {
        ram.facing = Math.atan2(this.input.aimZ - ram.z, this.input.aimX - ram.x);
      } else if ((ram.isPlayer && (this.input.moveX || this.input.moveZ)) || ram.isBot) {
        const mx = ram.isPlayer ? this.input.moveX : Math.cos(ram.aim);
        const mz = ram.isPlayer ? this.input.moveZ : Math.sin(ram.aim);
        if (mx || mz) ram.facing = Math.atan2(mz, mx);
      }
      // creep forward slowly
      const mvx = ram.isPlayer ? this.input.moveX : 0;
      const mvz = ram.isPlayer ? this.input.moveZ : 0;
      const ml = Math.hypot(mvx, mvz) || 1;
      ram.x += (mvx / ml) * CONFIG.chargeMoveSpeed * dt * (mvx || mvz ? 1 : 0);
      ram.z += (mvz / ml) * CONFIG.chargeMoveSpeed * dt * (mvx || mvz ? 1 : 0);
    } else {
      if (ram.state === "charging") {
        // release -> dash
        ram.dashStrength = ram.charge;
        ram.state = "dashing";
        ram.dashTimer = CONFIG.dashHoldDuration + ram.charge * 0.2;
        if (ram.isPlayer) audio.dash();
        ram.charge = 0;
      } else {
        ram.state = "idle";
        // normal walk
        let mx: number;
        let mz: number;
        if (ram.isPlayer) {
          mx = this.input.moveX;
          mz = this.input.moveZ;
        } else {
          mx = Math.cos(ram.aim);
          mz = Math.sin(ram.aim);
          if (ram.botState === "wander" && ram.botTimer > 0) {
            mx *= 0.6;
            mz *= 0.6;
          }
        }
        const ml = Math.hypot(mx, mz);
        if (ml > 0.05) {
          ram.facing = Math.atan2(mz, mx);
          ram.vx = (mx / ml) * CONFIG.walkSpeed * speedMult;
          ram.vz = (mz / ml) * CONFIG.walkSpeed * speedMult;
          ram.x += ram.vx * dt;
          ram.z += ram.vz * dt;
          ram.stats.activity += dt * 0.3;
        } else {
          ram.vx = 0;
          ram.vz = 0;
        }
      }
    }

    // try to pop nearby sheep when idle & not the player charging
    if (ram.state === "idle") this.tryPopSheep(ram);

    this.syncRamMesh(ram);
    this.clampToWorld(ram);
    this.zoneDrain(ram, dt);
  }

  private tryPopSheep(ram: Ram): void {
    for (const s of this.sheep) {
      if (s.beingPopped) continue;
      if ((ram.x - s.x) ** 2 + (ram.z - s.z) ** 2 < 0.9 * 0.9) {
        s.beingPopped = true;
        s.popper = ram.id;
        ram.state = "popping";
        ram.popTimer = CONFIG.popTime;
        // mount from directly behind the sheep, both facing the same way (Sven gag)
        const approach = Math.atan2(ram.z - s.z, ram.x - s.x);
        s.facing = approach + Math.PI;
        ram.facing = approach + Math.PI;
        ram.x = s.x + Math.cos(approach) * 0.5;
        ram.z = s.z + Math.sin(approach) * 0.5;
        if (ram.isPlayer) audio.pop();
        window.setTimeout(() => this.finishPop(ram, s), CONFIG.popTime * 1000);
        break;
      }
    }
  }

  private finishPop(ram: Ram, s: Sheep): void {
    if (!ram.alive) {
      s.beingPopped = false;
      s.popper = null;
      return;
    }
    const love = this.now() < ram.powerups.loveUntil;
    const pts = love ? CONFIG.lovePillSheepPoints : CONFIG.sheepPoints;
    ram.score += pts;
    ram.stats.sheepPopped++;
    audio.pop();
    audio.bleat();
    // juicy pop — hearts/sparkle burst, shockwave, floating points
    this.spawnParticles(s.x, 1.1, s.z, love ? 0xff5d9e : 0xfff0a0, 14);
    this.spawnRing(s.x, s.z, love ? 0xff5d9e : 0xffe14d, 0.4);
    this.spawnFloater(s.x, 1.9, s.z, love ? `❤ +${pts}` : `+${pts}`, love ? 0xff7ab0 : 0x6dff7a);
    if (ram.isPlayer) this.setToast(`+${pts} pop!`);
    // respawn sheep elsewhere
    s.beingPopped = false;
    s.popper = null;
    const angle = Math.random() * Math.PI * 2;
    const r = this.zoneRadius * 0.85 * Math.random();
    s.x = Math.cos(angle) * r;
    s.z = Math.sin(angle) * r;
    s.mesh.position.set(s.x, 0, s.z);
  }

  private zoneDrain(ram: Ram, dt: number): void {
    // Zone removed: no point drain at the edges anymore.
    void ram;
    void dt;
  }

  private clampToWorld(ram: Ram): void {
    const lim = this.arenaHalf + 4;
    ram.x = Math.max(-lim, Math.min(lim, ram.x));
    ram.z = Math.max(-lim, Math.min(lim, ram.z));
  }

  private syncRamMesh(ram: Ram): void {
    ram.mesh.position.set(ram.x, ram.y, ram.z);
    ram.mesh.rotation.y = -ram.facing + Math.PI / 2;
    ram.mesh.rotation.z = ram.state === "ragdoll" ? ram.spin : 0;
    ram.mesh.rotation.x = ram.state === "ragdoll" ? ram.spin * 0.7 : 0;

    const visual = ram.mesh.getObjectByName("visual");
    if (visual) {
      const t = this.now();
      const speed = Math.hypot(ram.vx, ram.vz);
      const moving = speed > 0.5;
      // squash-and-stretch: crouch while charging, stretch on the dash
      if (ram.state === "charging") {
        const c = 0.12 * ram.charge;
        visual.scale.set(1 + c, 1 - c * 1.4, 1 + c);
      } else if (ram.state === "dashing") {
        visual.scale.set(0.9, 0.92, 1.18);
      } else {
        visual.scale.lerp(UNIT, 0.3);
      }
      // procedural gait — works on rigless generated models too:
      // bouncy hop + side-to-side waddle while walking, gentle idle breathing.
      if (ram.state === "dashing") {
        visual.position.y = 0.18 + Math.sin(t * 30) * 0.05; // low, fast gallop
        visual.rotation.x = 0.35; // lean into the charge
        visual.rotation.z = 0;
      } else if (moving) {
        const gait = t * 13;
        visual.position.y = Math.abs(Math.sin(gait)) * 0.16;
        visual.rotation.z = Math.sin(gait) * 0.1;
        visual.rotation.x = 0.12 + Math.sin(gait * 2) * 0.04; // slight forward bob
      } else {
        visual.position.y = THREE.MathUtils.lerp(visual.position.y, Math.sin(t * 2.4) * 0.03, 0.2);
        visual.rotation.z = THREE.MathUtils.lerp(visual.rotation.z, 0, 0.2);
        visual.rotation.x = THREE.MathUtils.lerp(visual.rotation.x, ram.state === "charging" ? 0.2 : 0, 0.2);
      }
    }

    // charge telegraph arrow grows + reddens with charge
    const arrow = ram.mesh.getObjectByName("chargeArrow") as THREE.Mesh | undefined;
    if (arrow) {
      if (ram.state === "charging") {
        arrow.visible = true;
        arrow.scale.set(0.7 + ram.charge * 0.7, 0.5 + ram.charge * 1.6, 1);
        const mat = arrow.material as THREE.MeshBasicMaterial;
        mat.color.setHex(ram.charge > 0.66 ? 0xff3b1f : ram.charge > 0.33 ? 0xff9d2e : 0xffe14d);
      } else {
        arrow.visible = false;
      }
    }

    // dash afterimage trail
    if (ram.state === "dashing" && visual) this.spawnTrail(ram);

    // blink invuln
    const blink = this.now() < ram.invulnUntil ? (Math.floor(this.now() * 10) % 2 === 0 ? 0.4 : 1) : 1;
    const ring = ram.mesh.getObjectByName("colorRing") as THREE.Mesh | undefined;
    if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = blink * 0.9;

    // articulated legs: diagonal-pair walk cycle, fast gallop on dash
    const legSpeed = Math.hypot(ram.vx, ram.vz);
    const legMoving = legSpeed > 0.5;
    let amp = 0;
    let phase = 0;
    if (ram.state === "dashing") {
      amp = 0.7;
      phase = this.now() * 32;
    } else if (legMoving) {
      amp = Math.min(0.65, 0.25 + legSpeed * 0.06);
      phase = this.now() * 13;
    } else {
      amp = 0.04;
      phase = this.now() * 2.2;
    }
    this.swingLegs(ram.mesh, phase, amp);

    // tail flick
    const tail = ram.mesh.getObjectByName("tail");
    if (tail) tail.rotation.x = Math.sin(this.now() * 6) * 0.25 + 0.1;

    // powerup horn FX: golden = big shiny gold horns, pepper = glowing fiery horns
    this.syncHornFX(ram);

    // update name + score tag
    const tag = this.tags.get(ram.id);
    if (tag) tag.update(ram.name, Math.floor(ram.score), ram.color, ram.isPlayer);
  }

  /**
   * Drives the visible horn/aura state from active powerups:
   * - Golden Horns: horns swell big and turn shiny gold while the mega-launch is armed.
   * - Pepper Horns: horns glow fiery red-orange while charges remain.
   * Reverts to normal horns once the powerup is gone.
   */
  private syncHornFX(ram: Ram): void {
    const horns = ram.mesh.getObjectByName("horns");
    if (!horns) return;
    const t = this.now();
    const golden = ram.powerups.golden;
    const pepper = ram.powerups.pepperHits > 0;

    // smooth target scale: big for golden, slightly enlarged + pulsing for pepper
    const pulse = pepper ? 1 + Math.sin(t * 14) * 0.08 : 1;
    const targetScale = golden ? 1.85 : pepper ? 1.28 * pulse : 1;
    const s = THREE.MathUtils.lerp(horns.scale.x, targetScale, 0.25);
    horns.scale.setScalar(s);

    // emissive glow target for the active state
    const goldHex = 0xffcf2e;
    const pepperHex = 0xff3b1f;
    const baseHex = 0xd9b886;
    for (const child of horns.children) {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshToonMaterial & { emissive?: THREE.Color; emissiveIntensity?: number };
      if (!mat || !mat.color) continue;
      if (golden) {
        mat.color.setHex(goldHex);
        if (mat.emissive) mat.emissive.setHex(goldHex);
        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0.6 + Math.sin(t * 6) * 0.25;
      } else if (pepper) {
        mat.color.setHex(pepperHex);
        if (mat.emissive) mat.emissive.setHex(pepperHex);
        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0.5 + Math.sin(t * 16) * 0.3;
      } else {
        mat.color.setHex(baseHex);
        if (mat.emissive) mat.emissive.setHex(0x000000);
        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0;
      }
      mat.needsUpdate = true;
    }

    // spark/ember puffs trailing the horns while a powerup is live
    if ((golden || pepper) && Math.random() < 0.25) {
      this.spawnParticles(ram.x, 1.3, ram.z, golden ? 0xffe14d : 0xff7a2e, 2);
    }
  }

  // ---------------------------------------------------------------- effects
  /** A flat expanding shockwave ring on the ground. */
  private spawnRing(x: number, z: number, color: number, ttl = 0.45): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.55, 28),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.08, z);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.rings.push({ mesh, life: ttl, ttl, grow: 8 });
  }

  /** A rising, fading callout (point gains, combat shouts). */
  private spawnFloater(
    x: number,
    y: number,
    z: number,
    text: string,
    color: number,
    scale = 1,
  ): void {
    const sprite = makeFloatingText(text, color);
    sprite.position.set(x, y, z);
    this.scene.add(sprite);
    this.floaters.push({ sprite, life: 1, ttl: 1, vy: 1.6 * scale, base: scale });
  }

  /** A short-lived ghost disc behind a dashing ram. */
  private spawnTrail(ram: Ram): void {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 16),
      new THREE.MeshBasicMaterial({
        color: ram.color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(ram.x, 0.05, ram.z);
    this.scene.add(mesh);
    this.trails.push({ mesh, life: 0.3, ttl: 0.3 });
  }

  private updateEffects(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.ttl;
      r.mesh.scale.setScalar(1 + k * r.grow);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.sprite.position.y += f.vy * dt;
      const k = f.life / f.ttl;
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 2);
      const s = (1 + (1 - k) * 0.4) * f.base;
      f.sprite.scale.set(2.4 * s, 1.2 * s, 1);
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        (f.sprite.material as THREE.SpriteMaterial).map?.dispose();
        (f.sprite.material as THREE.SpriteMaterial).dispose();
        this.floaters.splice(i, 1);
      }
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.life -= dt;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (t.life / t.ttl);
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        this.trails.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- sheep
  private updateSheep(s: Sheep, dt: number): void {
    if (s.beingPopped) {
      // bounce + wobble + squash so the pop reads clearly
      const t = this.now() * 22;
      s.mesh.position.y = Math.abs(Math.sin(t)) * 0.35;
      s.mesh.rotation.z = Math.sin(t * 0.7) * 0.4;
      const sq = 1 + Math.sin(t) * 0.18;
      s.mesh.scale.set(CONFIG.sheepScale * (2 - sq), CONFIG.sheepScale * sq, CONFIG.sheepScale * (2 - sq));
      return;
    }
    s.mesh.position.y = 0;
    s.mesh.rotation.z = 0;
    s.mesh.scale.setScalar(CONFIG.sheepScale);
    // flee nearest ram
    let fleeX = 0;
    let fleeZ = 0;
    let love: Ram | null = null;
    for (const r of this.rams) {
      if (!r.alive) continue;
      const dx = s.x - r.x;
      const dz = s.z - r.z;
      const d = Math.hypot(dx, dz);
      if (this.now() < r.powerups.loveUntil && d < 8) {
        love = r;
      } else if (d < CONFIG.sheepFleeRange && d > 0.01) {
        fleeX += dx / d;
        fleeZ += dz / d;
      }
    }
    let dirX = fleeX;
    let dirZ = fleeZ;
    if (love) {
      dirX = love.x - s.x;
      dirZ = love.z - s.z;
    }
    const dl = Math.hypot(dirX, dirZ);
    if (dl > 0.01) {
      s.facing = Math.atan2(dirZ, dirX);
      s.x += (dirX / dl) * CONFIG.sheepSpeed * dt;
      s.z += (dirZ / dl) * CONFIG.sheepSpeed * dt;
    } else {
      s.wanderTimer -= dt;
      if (s.wanderTimer <= 0) {
        s.wanderTimer = 1 + Math.random() * 2;
        s.facing = Math.random() * Math.PI * 2;
      }
      s.x += Math.cos(s.facing) * CONFIG.sheepSpeed * 0.4 * dt;
      s.z += Math.sin(s.facing) * CONFIG.sheepSpeed * 0.4 * dt;
    }
    const lim = this.zoneRadius * 0.95;
    const d = Math.hypot(s.x, s.z);
    if (d > lim) {
      s.x = (s.x / d) * lim;
      s.z = (s.z / d) * lim;
    }
    s.mesh.position.set(s.x, s.mesh.position.y, s.z);
    s.mesh.rotation.y = -s.facing + Math.PI / 2;

    // springy hop + idle nibble so sheep never look frozen
    const sv = s.mesh.getObjectByName("visual");
    if (sv) {
      const t = this.now();
      const moving = dl > 0.01;
      const head = s.mesh.getObjectByName("head");
      if (s.beingPopped) {
        // panic wiggle + squash + flailing legs while being popped
        sv.position.y = Math.abs(Math.sin(t * 26)) * 0.12;
        sv.rotation.z = Math.sin(t * 30) * 0.25;
        this.swingLegs(s.mesh, t * 34, 0.9);
        if (head) head.rotation.x = Math.sin(t * 30) * 0.3;
      } else if (moving) {
        const hop = t * 11 + s.id;
        sv.position.y = Math.abs(Math.sin(hop)) * 0.13;
        sv.rotation.z = Math.sin(hop) * 0.08;
        this.swingLegs(s.mesh, t * 12 + s.id, 0.5);
        if (head) head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, 0, 0.2);
      } else {
        // grazing: dips head down to nibble, legs settle
        sv.position.y = THREE.MathUtils.lerp(sv.position.y, 0, 0.15);
        sv.rotation.z = THREE.MathUtils.lerp(sv.rotation.z, 0, 0.15);
        this.swingLegs(s.mesh, t * 2 + s.id, 0.05);
        if (head) head.rotation.x = 0.5 + Math.sin(t * 1.6 + s.id) * 0.25;
      }
    }
  }

  // ---------------------------------------------------------------- collisions
  private handleCollisions(dt: number): void {
    void dt;
    for (let i = 0; i < this.rams.length; i++) {
      const a = this.rams[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.rams.length; j++) {
        const b = this.rams[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1.05 || dist < 0.0001) continue;

        const aDash = a.state === "dashing";
        const bDash = b.state === "dashing";

        if (aDash || bDash) {
          const attacker = aDash ? a : b;
          const victim = aDash ? b : a;
          if (this.now() < victim.invulnUntil && !(aDash && bDash)) {
            this.separate(a, b, dx, dz, dist);
            continue;
          }
          this.doHit(attacker, victim, aDash && bDash);
        } else {
          this.separate(a, b, dx, dz, dist);
        }
      }
    }
  }

  private separate(a: Ram, b: Ram, dx: number, dz: number, dist: number): void {
    if (a.state === "ragdoll" || b.state === "ragdoll") return;
    const overlap = (1.05 - dist) / 2;
    const nx = dx / (dist || 1);
    const nz = dz / (dist || 1);
    a.x -= nx * overlap;
    a.z -= nz * overlap;
    b.x += nx * overlap;
    b.z += nz * overlap;
  }

  private doHit(attacker: Ram, victim: Ram, duel: boolean): void {
    const res = resolveHit(attacker, victim);
    if (!res) {
      // wool armor popped
      audio.thunk(0.2);
      this.spawnParticles(victim.x, 1, victim.z, 0xffffff, 10);
      if (victim.isPlayer || attacker.isPlayer) this.setToast("WOOL ARMOR blocked it!");
      attacker.state = "recovery";
      attacker.recoveryTimer = CONFIG.postDashRecovery;
      return;
    }

    const { winner, loser, stolen, loserKnock, winnerKnock, angle } = res;

    // transfer points
    const actualSteal = Math.min(stolen, loser.score);
    loser.score = Math.max(0, loser.score - actualSteal);
    winner.score += actualSteal;
    winner.stats.pointsStolen += actualSteal;

    // knock loser
    this.knockRam(loser, angle, loserKnock);
    loser.stats.timesLaunched++;
    if (winnerKnock > 0) {
      this.knockRam(winner, angle + Math.PI, winnerKnock * 0.5, true);
    } else {
      winner.state = "recovery";
      winner.recoveryTimer = CONFIG.postDashRecovery;
    }

    // juice
    const power = Math.min(1, loserKnock / 20);
    audio.thunk(power);
    audio.bleat();
    this.hitStop = 0.06 + power * 0.06;
    this.spawnParticles(loser.x, 1, loser.z, 0xffe08a, 12 + Math.floor(power * 12));
    this.spawnRing(loser.x, loser.z, res.type === "duel" ? 0xff3b1f : 0xffe14d, 0.45);
    const involvesPlayer = winner.isPlayer || loser.isPlayer;
    const fScale = involvesPlayer ? 1 : 0.5;
    const shout = res.type === "duel" ? "DUEL!" : power > 0.7 ? "BAM!" : "POW!";
    this.spawnFloater(loser.x, 2.1, loser.z, shout, 0xffffff, fScale);
    if (actualSteal > 0)
      this.spawnFloater(winner.x, 2.1, winner.z, `+${Math.floor(actualSteal)}`, 0x6dff7a, fScale);
    if (winner.isPlayer || loser.isPlayer) this.shake = Math.max(this.shake, 0.35 + power * 0.45);

    winner.stats.activity += 1;
    if (res.type === "duel" && winner.isPlayer) this.setToast("DUEL WON!");
    else if (winner.isPlayer) this.setToast(`+${actualSteal} ${res.type.toUpperCase()}!`);

    // elimination check
    if (loser.score <= 0) {
      winner.stats.knockouts++;
      this.eliminate(loser, winner);
    }
  }

  private knockRam(ram: Ram, angle: number, speed: number, gentle = false): void {
    ram.state = "ragdoll";
    ram.ragdollTimer = gentle ? CONFIG.ragdollTime * 0.5 : CONFIG.ragdollTime;
    ram.vx = Math.cos(angle) * speed;
    ram.vz = Math.sin(angle) * speed;
    ram.vy = speed * CONFIG.verticalPop;
    ram.charge = 0;
  }

  // ---------------------------------------------------------------- elimination
  private eliminate(ram: Ram, by: Ram | null): void {
    const last45 = this.roundTime >= CONFIG.roundLength - CONFIG.hardElimLast;
    audio.eliminate();

    if (by && ram.isPlayer) {
      this.killcam = { attacker: by.name, victim: ram.name };
      this.killcamTimer = 3;
    }

    if (last45) {
      // hard elimination
      ram.alive = false;
      ram.state = "out";
      ram.mesh.visible = false;
      // hand the farmer to a freshly eliminated player
      if (ram.isPlayer && this.farmer.controlledBy === null) {
        this.farmer.controlledBy = ram.id;
        this.setToast("YOU'RE THE FARMER NOW — go wreck them");
      }
    } else {
      // soft elimination — respawn fresh after a beat
      ram.alive = false;
      ram.mesh.visible = false;
      ram.state = "out";
      window.setTimeout(() => this.respawn(ram), 1500);
    }
  }

  private respawn(ram: Ram): void {
    if (this.phase !== "playing") return;
    const living = this.rams.filter((r) => r.alive);
    const avg = living.length ? living.reduce((s, r) => s + r.score, 0) / living.length : CONFIG.startScore;
    ram.score = Math.max(CONFIG.startScore * 0.5, Math.floor(avg * CONFIG.joinBonusFactor));
    ram.alive = true;
    ram.state = "idle";
    ram.mesh.visible = true;
    ram.y = 0;
    ram.vx = 0;
    ram.vz = 0;
    ram.invulnUntil = this.now() + CONFIG.spawnInvuln;
    // safe corner
    const angle = Math.random() * Math.PI * 2;
    const r = this.zoneRadius * 0.6;
    ram.x = Math.cos(angle) * r;
    ram.z = Math.sin(angle) * r;
    ram.powerups = { snowUntil: 0, loveUntil: 0, woolArmor: false, pepperHits: 0, golden: false };
    ram.mesh.position.set(ram.x, 0, ram.z);
  }

  // ---------------------------------------------------------------- bots
  private botBrain(ram: Ram, dt: number): void {
    ram.botTimer -= dt;
    if (ram.botTimer > 0) {
      this.botAct(ram);
      return;
    }
    ram.botTimer = ram.reaction;

    // threat: incoming dasher or farmer
    let threat: Ram | null = null;
    let prey: Ram | null = null;
    let preyScore = -1;
    let nearestSheep: Sheep | null = null;
    let sheepDist = Infinity;

    for (const o of this.rams) {
      if (o === ram || !o.alive) continue;
      const d = Math.hypot(o.x - ram.x, o.z - ram.z);
      if (o.state === "dashing" && d < 4) threat = o;
      if (d < 7 && o.score > preyScore) {
        prey = o;
        preyScore = o.score;
      }
    }
    for (const s of this.sheep) {
      if (s.beingPopped) continue;
      const d = (s.x - ram.x) ** 2 + (s.z - ram.z) ** 2;
      if (d < sheepDist) {
        sheepDist = d;
        nearestSheep = s;
      }
    }

    const farmerNear = this.farmer.active && Math.hypot(this.farmer.x - ram.x, this.farmer.z - ram.z) < 4;

    if ((threat || farmerNear) && Math.random() < 0.5 + ram.skill * 0.4) {
      ram.botState = "flee";
    } else if (prey && Math.random() < ram.aggression * 0.8 && preyScore > ram.score * 0.6) {
      ram.botState = "hunt";
    } else if (nearestSheep) {
      ram.botState = "farm";
    } else {
      ram.botState = "wander";
    }

    if (ram.botState === "flee") {
      const src = threat ?? (farmerNear ? null : null);
      const fx = src ? ram.x - src.x : ram.x - this.farmer.x;
      const fz = src ? ram.z - src.z : ram.z - this.farmer.z;
      ram.aim = Math.atan2(fz, fx) + (Math.random() - 0.5) * 0.6;
      // dash away sometimes
      ram.charging = false;
      if (ram.state === "idle" && Math.random() < ram.skill * 0.3) {
        ram.facing = ram.aim;
        ram.charging = true;
        window.setTimeout(() => (ram.charging = false), 200 + ram.skill * 200);
      }
    } else if (ram.botState === "hunt" && prey) {
      ram.aim = Math.atan2(prey.z - ram.z, prey.x - ram.x);
      const d = Math.hypot(prey.x - ram.x, prey.z - ram.z);
      if (d < 5 && ram.state === "idle") {
        ram.facing = ram.aim;
        ram.charging = true;
        const hold = 400 + ram.skill * 700;
        window.setTimeout(() => (ram.charging = false), hold);
      }
    } else if (ram.botState === "farm" && nearestSheep) {
      ram.aim = Math.atan2(nearestSheep.z - ram.z, nearestSheep.x - ram.x);
      ram.charging = false;
    } else {
      if (Math.random() < 0.3) ram.aim = Math.random() * Math.PI * 2;
      // bias toward center if near edge
      if (Math.hypot(ram.x, ram.z) > this.zoneRadius * 0.8) {
        ram.aim = Math.atan2(-ram.z, -ram.x) + (Math.random() - 0.5);
      }
      ram.charging = false;
    }
    this.botAct(ram);
  }

  private botAct(ram: Ram): void {
    // movement handled in updateRam via ram.aim/charging
    void ram;
  }

  // ---------------------------------------------------------------- win check
  private checkWinConditions(): void {
    const living = this.rams.filter((r) => r.alive);
    const last45 = this.roundTime >= CONFIG.roundLength - CONFIG.hardElimLast;
    if (this.roundTime >= CONFIG.roundLength) {
      this.endRound();
    } else if (last45 && living.length <= 1) {
      this.endRound();
    }
  }

  private endRound(): void {
    this.phase = "podium";
    this.podiumTimer = CONFIG.podiumTime;
    audio.stopMusic();
    audio.fanfare();
    const titles = assignTitles(this.rams);
    const sorted = [...this.rams].sort((a, b) => b.score - a.score);
    this.podiumData = sorted.slice(0, 3).map((r) => ({
      name: r.name,
      score: Math.floor(r.score),
      isPlayer: r.isPlayer,
      color: r.color,
      title: titles.get(r.id) ?? "",
    }));
  }

  private stepPodium(dt: number): void {
    // winner does a goofy spin
    const sorted = [...this.rams].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    if (winner) {
      winner.mesh.visible = true;
      winner.mesh.position.set(0, Math.abs(Math.sin(this.now() * 6)) * 0.5, 0);
      winner.mesh.rotation.y += dt * 4;
      this.camera.position.lerp(new THREE.Vector3(0, 6, 9), 0.05);
      this.camera.lookAt(0, 1, 0);
    }
  }

  // ---------------------------------------------------------------- particles
  private spawnParticles(x: number, y: number, z: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color }),
      );
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 4;
      this.particles.push({
        mesh,
        vx: Math.cos(a) * sp,
        vy: 3 + Math.random() * 3,
        vz: Math.sin(a) * sp,
        life: 0.6,
      });
    }
  }

  /** A small floaty pink heart that rises and fades — used during the mating gag. */
  private spawnHeart(x: number, y: number, z: number, color: number): void {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.05);
    shape.bezierCurveTo(0, 0.12, 0.1, 0.16, 0.1, 0.08);
    shape.bezierCurveTo(0.1, 0.02, 0, -0.02, 0, -0.08);
    shape.bezierCurveTo(0, -0.02, -0.1, 0.02, -0.1, 0.08);
    shape.bezierCurveTo(-0.1, 0.16, 0, 0.12, 0, 0.05);
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true }),
    );
    const s = 0.6 + Math.random() * 0.5;
    mesh.scale.setScalar(s);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    this.particles.push({
      mesh,
      vx: Math.cos(a) * 0.5,
      vy: 1.4 + Math.random() * 0.8,
      vz: Math.sin(a) * 0.5,
      life: 0.9,
      heart: true,
    });
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy -= 18 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 8;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- render
  private render(frame: number): void {
    this.updateParticles(frame);
    this.updateEffects(frame);

    // player beacon
    if (this.phase === "playing" && this.player && this.player.alive) {
      this.beacon.visible = true;
      this.beacon.position.set(this.player.x, this.player.y, this.player.z);
      const chevron = this.beacon.getObjectByName("chevron");
      if (chevron) chevron.position.y = 2.9 + Math.sin(this.now() * 5) * 0.18;
      const bring = this.beacon.getObjectByName("ring") as THREE.Mesh | undefined;
      if (bring) {
        const pulse = 1 + Math.sin(this.now() * 4) * 0.08;
        bring.scale.setScalar(pulse);
      }
    } else {
      this.beacon.visible = false;
    }

    // crown over leader
    const living = this.rams.filter((r) => r.alive);
    if (living.length && this.phase === "playing") {
      const leader = living.reduce((a, b) => (b.score > a.score ? b : a));
      this.crown.visible = true;
      this.crown.position.set(leader.x, 1.9 + Math.sin(this.now() * 4) * 0.1, leader.z);
      this.crown.rotation.y += frame * 2;
    } else {
      this.crown.visible = false;
    }


    // camera follow (playing) — fully tracks the player so you're never off-screen,
    // with extra zoom-out on tall/narrow (mobile portrait) viewports to keep the
    // action comfortably in frame.
    if (this.phase === "playing" && this.player) {
      const aspect = this.camera.aspect || 1;
      // narrow screens see less horizontally → pull the camera back
      const portraitZoom = aspect < 0.85 ? (0.85 - aspect) * 26 : 0;
      const zoomOut = portraitZoom;
      const target = new THREE.Vector3(
        this.player.x,
        22 + zoomOut,
        this.player.z + 14 + zoomOut * 0.7,
      );
      this.camera.position.lerp(target, 0.1);
      const look = new THREE.Vector3(this.player.x, 0, this.player.z);
      this.camera.lookAt(look);
    }

    // screen shake
    if (this.shake > 0) {
      this.shake -= frame * 2;
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- helpers
  private now(): number {
    return this.roundTime;
  }

  private setToast(msg: string): void {
    this.toast = msg;
    this.toastTimer = 1.6;
  }

  /** Screen point (cursor) -> world XZ on ground plane, for aim. */
  setAimFromScreen(nx: number, ny: number): void {
    const ndc = new THREE.Vector3(nx, ny, 0.5);
    ndc.unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const t = -this.camera.position.y / dir.y;
    const x = this.camera.position.x + dir.x * t;
    const z = this.camera.position.z + dir.z * t;
    this.input.aimX = x;
    this.input.aimZ = z;
    this.input.hasAim = true;
  }

  // ---------------------------------------------------------------- HUD
  private emitHud(): void {
    const sorted = [...this.rams].sort((a, b) => b.score - a.score);
    const p = this.player;
    const rank = p ? sorted.findIndex((r) => r.id === p.id) + 1 : 0;
    const roundPhase: 1 | 2 | 3 =
      this.roundTime >= CONFIG.phase3Start ? 3 : this.roundTime >= CONFIG.phase2Start ? 2 : 1;
    const now = this.now();
    const inShop = !!p && p.alive && p.inBarn;
    const shopLocked = !!p && inShop && !p.barnSafe;
    const shopTime = p ? (p.barnSafe ? p.barnSafeRemaining : Math.max(0, p.barnReadyAt - now)) : 0;

    const hud: HudState = {
      phase: this.phase,
      timeLeft: Math.max(0, CONFIG.roundLength - this.roundTime),
      roundPhase,
      player: p
        ? {
            score: Math.floor(p.score),
            alive: p.alive,
            charge: p.state === "charging" ? p.charge : 0,
            charging: p.state === "charging",
            state: p.state,
            rank,
            snow: this.now() < p.powerups.snowUntil,
            love: this.now() < p.powerups.loveUntil,
            wool: p.powerups.woolArmor,
            pepper: p.powerups.pepperHits > 0,
            golden: p.powerups.golden,
            inShop,
            shopSafe: p.barnSafe,
            shopTime,
            shopLocked,
            canAfford: {
              snow: p.score >= CONFIG.priceSnow,
              love: p.score >= CONFIG.priceLovePill,
              wool: p.score >= CONFIG.priceWoolArmor,
            },
          }
        : {
            score: 0,
            alive: false,
            charge: 0,
            charging: false,
            state: "out",
            rank: 0,
            snow: false,
            love: false,
            wool: false,
            pepper: false,
            golden: false,
            inShop: false,
            shopSafe: false,
            shopTime: 0,
            shopLocked: false,
            canAfford: { snow: false, love: false, wool: false },
          },
      leaderboard: sorted.slice(0, 6).map((r) => ({
        id: r.id,
        name: r.name,
        score: Math.floor(r.score),
        isPlayer: r.isPlayer,
        isBot: r.isBot,
        color: r.color,
        alive: r.alive,
      })),
      podium: this.phase === "podium" ? this.podiumData : [],
      alivePlayers: this.rams.filter((r) => r.alive).length,
      killcam: this.killcam,
      toast: this.toast,
    };
    this.onHud(hud);
  }

  // ---------------------------------------------------------------- player charge control (mobile button + voice)
  setPlayerCharging(v: boolean): void {
    this.input.charging = v;
  }
}
