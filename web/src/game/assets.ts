import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { TEMPLATES } from "./models";

/**
 * AI-generated cartoon model URLs (GLB). Filled in once generation completes;
 * an empty string means the game falls back to the procedural model, so the
 * arena always renders even if a download fails.
 *
 * `yawDeg` rotates the loaded model so its face points along local +z, which is
 * the ram/sheep/farmer forward direction the engine drives.
 */
interface ModelSpec {
  url: string;
  height: number;
  yawDeg: number;
}

/**
 * NOTE: the AI-generated GLBs are single static meshes with no skeleton, so
 * their legs/arms cannot articulate. We use the fully articulated procedural
 * models instead (separate, pivoting limbs the engine animates with real walk
 * cycles), so the URLs are intentionally blank to keep procedural in charge.
 */
export const MODEL_SPECS: Record<"ram" | "sheep" | "farmer", ModelSpec> = {
  ram: { url: "", height: 1.5, yawDeg: 0 },
  sheep: { url: "", height: 0.7, yawDeg: 0 },
  farmer: { url: "", height: 2.1, yawDeg: 0 },
};

/**
 * Wrap a loaded scene: scale so its height matches the gameplay size, center on
 * X/Z, ground it on Y, and apply a yaw so its face looks along +z. Static
 * (non-rigged) props, so a plain Box3 measure is correct here.
 */
function buildTemplate(scene: THREE.Object3D, spec: ModelSpec): THREE.Group {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    }
  });

  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const s = spec.height / (size.y || 1);
  scene.scale.setScalar(s);

  scene.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  box2.getCenter(center);
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box2.min.y;

  const wrap = new THREE.Group();
  wrap.rotation.y = THREE.MathUtils.degToRad(spec.yawDeg);
  wrap.add(scene);
  return wrap;
}

/**
 * Load whichever generated models have URLs and install them as templates.
 * Resolves quietly when no URLs are set or on per-model failure (procedural
 * fallback stays in place). Safe to await before booting the engine.
 */
export async function loadModels(): Promise<void> {
  const loader = new GLTFLoader();
  const jobs: Promise<void>[] = [];

  for (const key of ["ram", "sheep", "farmer"] as const) {
    const spec = MODEL_SPECS[key];
    if (!spec.url) continue;
    jobs.push(
      loader
        .loadAsync(spec.url)
        .then((gltf) => {
          TEMPLATES[key] = buildTemplate(gltf.scene, spec);
        })
        .catch((err) => {
          console.warn(`[assets] failed to load ${key} model, using fallback`, err);
        }),
    );
  }

  await Promise.all(jobs);
}
