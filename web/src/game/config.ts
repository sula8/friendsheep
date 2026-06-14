/**
 * RAM ROYALE — central tuning config.
 *
 * Every "feel" number lives here so the headbutt can be dialed in by playtest
 * without hunting through engine code. Units are abstract: a ram is ~1 unit tall.
 */
export const CONFIG = {
  // --- Movement ---
  walkSpeed: 4,
  chargeMoveSpeed: 2, // slowed while winding up (telegraph)
  dashTapSpeed: 6, // weakest dash
  dashFullSpeed: 14, // fully charged rocket
  chargeTime: 1.2, // seconds to full charge
  dashHoldDuration: 0.5, // seconds dash holds full speed
  dashDecay: 0.3, // seconds dash fades to walk
  postDashRecovery: 0.4, // anti-spam lockout before next charge

  // --- Knockback ---
  knockback: 1.6, // K — chaos amplifier (>1 for juicy launches)
  verticalPop: 0.3, // fraction of horizontal turned into upward arc
  hitAngleJitter: 10, // +/- degrees of random spread per hit
  frontConeDeg: 50, // phi <= this = FRONT, else FLANK
  duelFudge: 0.15, // +/-15% random on duel impulses (drama)
  ragdollTime: 0.8, // seconds of helpless tumble before standing

  // --- Entities ---
  sheepSpeed: 2.5,
  sheepFleeRange: 3.5,
  sheepScale: 1.35, // visual size multiplier (sheep were too small)
  farmerSpeed: 5,
  popTime: 1.5, // seconds rooted while popping a sheep
  botReactionMin: 0.3,
  botReactionMax: 0.6,

  // --- Points economy ---
  startScore: 100,
  sheepPoints: 10,
  lovePillSheepPoints: 25,
  flankStealPct: 0.3, // % of victim score stolen on flank
  flankStealMin: 15,
  frontStealPct: 0.2,
  duelStealPct: 0.2,
  farmerHit: 40, // fixed points evaporated by the stick
  zoneDrainPerSec: 10,

  // --- Spawn / drop-in ---
  joinBonusFactor: 0.5, // start score = avg living * this
  spawnInvuln: 2, // seconds of blinking invincibility

  // --- Barn shop / safe zone ---
  barnRadius: 3.2, // how close to the barn counts as "inside the shop"
  barnSafeTime: 6, // seconds of protection + shopping per visit
  barnCooldown: 15, // must stay out this long before the barn shelters you again

  // --- Shop prices ---
  priceSnow: 50,
  priceLovePill: 80,
  priceWoolArmor: 60,

  // --- Powerup durations ---
  snowDuration: 8,
  snowSpeedMult: 1.5,
  lovePillDuration: 12,
  pepperDuration: 15,
  pepperHits: 3,
  pepperMult: 2,

  // --- Found powerup scarcity ---
  foundCap: 2,
  foundRespawn: 18,
  goldenCap: 1,
  goldenRespawn: 60,

  // --- Arena / zone ---
  entityTarget: 10, // people + bots topped up to this
  areaPerEntity: 100, // sq units -> arena size
  minArenaHalf: 14,

  // --- Round timing (seconds) ---
  roundLength: 180,
  phase2Start: 90, // zone starts shrinking
  phase3Start: 150, // final clamp + farmer stays
  hardElimLast: 45, // last N seconds = no respawn
  podiumTime: 15,

  // --- Ticks ---
  fixedDt: 1 / 60,
} as const;

export type GameConfig = typeof CONFIG;
