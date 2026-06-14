import { CONFIG } from "./config";
import type { Ram } from "./types";

export interface HitResult {
  type: "flank" | "front" | "duel";
  winner: Ram;
  loser: Ram;
  stolen: number;
  loserKnock: number; // speed magnitude applied to loser
  winnerKnock: number;
  angle: number; // direction loser is launched (radians)
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Angle between victim's facing and the direction the hit comes from. */
function impactAngle(attacker: Ram, victim: Ram): number {
  const dx = attacker.x - victim.x;
  const dz = attacker.z - victim.z;
  const toAttacker = Math.atan2(dz, dx);
  let diff = toAttacker - victim.facing;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

function effectivePower(ram: Ram): number {
  const fudge = 1 + (Math.random() * 2 - 1) * CONFIG.duelFudge;
  return ram.dashStrength * fudge;
}

function stealAmount(victim: Ram, pct: number, min: number): number {
  return Math.max(min, Math.floor(victim.score * pct));
}

/**
 * Resolves a dash impact. `attacker` is mid-dash; `victim` may or may not be.
 * Returns null when the wool armor soaks the hit. Mutates pepper counters.
 */
export function resolveHit(attacker: Ram, victim: Ram): HitResult | null {
  const phi = impactAngle(attacker, victim);
  const isFront = phi <= deg2rad(CONFIG.frontConeDeg);
  const victimDashing = victim.state === "dashing";

  // Wool armor blocks the next knockback entirely.
  if (victim.powerups.woolArmor) {
    victim.powerups.woolArmor = false;
    return null;
  }

  let pepperMult = 1;
  if (attacker.powerups.pepperHits > 0) {
    pepperMult = CONFIG.pepperMult;
    attacker.powerups.pepperHits -= 1;
  }
  if (attacker.powerups.golden) {
    pepperMult = 4;
    attacker.powerups.golden = false;
  }

  const launchDir = Math.atan2(victim.z - attacker.z, victim.x - attacker.x);
  const jitter = deg2rad((Math.random() * 2 - 1) * CONFIG.hitAngleJitter);
  const angle = launchDir + jitter;

  // DUEL: both charging head-on.
  if (isFront && victimDashing) {
    const pa = effectivePower(attacker);
    const pv = effectivePower(victim);
    const attackerWins = pa >= pv;
    const winner = attackerWins ? attacker : victim;
    const loser = attackerWins ? victim : attacker;
    const wp = attackerWins ? pa : pv;
    const lp = attackerWins ? pv : pa;
    const stolen = stealAmount(loser, CONFIG.duelStealPct, CONFIG.flankStealMin);
    const loserKnock = CONFIG.knockback * (wp + 0.5 * lp) * 8 * pepperMult;
    const winnerKnock = CONFIG.knockback * 0.3 * lp * 8;
    const ld = attackerWins
      ? angle
      : Math.atan2(attacker.z - victim.z, attacker.x - victim.x) + jitter;
    return {
      type: "duel",
      winner,
      loser,
      stolen,
      loserKnock,
      winnerKnock,
      angle: ld,
    };
  }

  // FLANK: side/back — max grab.
  if (!isFront) {
    const stolen = stealAmount(victim, CONFIG.flankStealPct, CONFIG.flankStealMin);
    const knock = CONFIG.knockback * (CONFIG.dashTapSpeed + attacker.dashStrength * 8) * pepperMult;
    return {
      type: "flank",
      winner: attacker,
      loser: victim,
      stolen,
      loserKnock: knock,
      winnerKnock: 0,
      angle,
    };
  }

  // FRONT, victim not dashing — clean front hit, smaller grab.
  const stolen = stealAmount(victim, CONFIG.frontStealPct, CONFIG.flankStealMin);
  const knock = CONFIG.knockback * (CONFIG.dashTapSpeed + attacker.dashStrength * 8) * 0.85 * pepperMult;
  return {
    type: "front",
    winner: attacker,
    loser: victim,
    stolen,
    loserKnock: knock,
    winnerKnock: 0,
    angle,
  };
}
