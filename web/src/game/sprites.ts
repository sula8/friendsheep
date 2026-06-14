import * as THREE from "three";

/**
 * Billboard sprite helpers for in-world UI: per-ram name/score tags and
 * short-lived floating combat text ("+25", "DUEL!", "POW!"). Canvas textures
 * keep everything crisp and cheap — one texture per tag, redrawn only when the
 * displayed value actually changes.
 */

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Floating tag that hovers over a ram showing its name + score. */
export class NameTag {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private last = "";

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 320;
    this.canvas.height = 130;
    this.ctx = this.canvas.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(2.6, 1.06, 1);
    this.sprite.renderOrder = 10;
  }

  update(name: string, score: number, color: number, isPlayer: boolean): void {
    const key = `${name}|${score}|${isPlayer}`;
    if (key === this.last) return;
    this.last = key;
    const ctx = this.ctx;
    const w = this.canvas.width;
    ctx.clearRect(0, 0, w, this.canvas.height);

    // pill background
    const pad = 8;
    const bg = isPlayer ? "rgba(20,20,24,0.82)" : "rgba(20,20,24,0.62)";
    roundRect(ctx, pad, 8, w - pad * 2, 56, 18);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = isPlayer ? 7 : 4;
    ctx.strokeStyle = isPlayer ? "#ffe14d" : hex(color);
    ctx.stroke();

    // name
    ctx.font = "800 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isPlayer ? "#ffe14d" : "#ffffff";
    ctx.fillText(name.slice(0, 12), w / 2, 36);

    // score chip
    ctx.font = "900 40px system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 6;
    ctx.strokeText(String(score), w / 2, 100);
    ctx.fillStyle = "#ffd000";
    ctx.fillText(String(score), w / 2, 100);

    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A one-shot floating text sprite (combat callouts, point gains). */
export function makeFloatingText(text: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "900 72px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 14;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(text, 128, 64);
  ctx.fillStyle = hex(color);
  ctx.fillText(text, 128, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 1.2, 1);
  sprite.renderOrder = 20;
  return sprite;
}
