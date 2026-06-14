import type * as THREE from "three";

export type RamState =
  | "idle"
  | "charging"
  | "dashing"
  | "recovery"
  | "ragdoll"
  | "popping"
  | "out";

export type PowerupKind =
  | "snow"
  | "lovePill"
  | "woolArmor"
  | "pepper"
  | "golden";

export interface ActivePowerups {
  snowUntil: number;
  loveUntil: number;
  woolArmor: boolean;
  pepperHits: number;
  golden: boolean;
}

export interface RoundStats {
  sheepPopped: number;
  pointsStolen: number;
  farmerHits: number;
  knockouts: number;
  timesLaunched: number;
  activity: number;
}

export interface Ram {
  id: number;
  name: string;
  isPlayer: boolean;
  isBot: boolean;
  color: number;
  hat: number; // cosmetic index
  mesh: THREE.Group;

  // physics (XZ plane)
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number; // radians, 0 = +x
  y: number; // vertical for ragdoll arc
  vy: number;
  spin: number; // ragdoll tumble

  state: RamState;
  score: number;
  alive: boolean;

  // charge
  charge: number; // 0..1
  charging: boolean;
  aim: number; // radians

  // timers
  dashTimer: number; // remaining full-speed dash time
  dashStrength: number; // c at release
  recoveryTimer: number;
  ragdollTimer: number;
  popTimer: number;
  invulnUntil: number;
  spawnFlash: number;

  // barn shelter
  barnSafeRemaining: number; // seconds of barn protection left this visit
  barnReadyAt: number; // earliest time barn can shelter this ram again
  inBarn: boolean;
  barnSafe: boolean; // currently sheltered (in barn + time left + off cooldown)

  powerups: ActivePowerups;
  stats: RoundStats;

  // bot brain
  aggression: number;
  skill: number;
  reaction: number;
  botTimer: number;
  botState: "wander" | "farm" | "hunt" | "flee";
  wanderX: number;
  wanderZ: number;
}

export interface Sheep {
  id: number;
  mesh: THREE.Group;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  wanderTimer: number;
  beingPopped: boolean;
  popper: number | null;
}

export interface FarmerEntity {
  mesh: THREE.Group;
  x: number;
  z: number;
  facing: number;
  active: boolean;
  swingTimer: number;
  cooldown: number; // until next emerge
  outTimer: number; // how long out this trip
  controlledBy: number | null; // eliminated player id
  swungAt: number;
  swingTarget: Ram | null;
}

export interface FoundPowerup {
  id: number;
  kind: PowerupKind;
  mesh: THREE.Group;
  x: number;
  z: number;
}

export type GamePhase = "playing" | "podium";

export interface HudRam {
  id: number;
  name: string;
  score: number;
  isPlayer: boolean;
  isBot: boolean;
  color: number;
  alive: boolean;
}

export interface PodiumEntry {
  name: string;
  score: number;
  isPlayer: boolean;
  color: number;
  title: string;
}

export interface HudState {
  phase: GamePhase;
  timeLeft: number;
  roundPhase: 1 | 2 | 3;
  player: {
    score: number;
    alive: boolean;
    charge: number;
    charging: boolean;
    state: RamState;
    rank: number;
    snow: boolean;
    love: boolean;
    wool: boolean;
    pepper: boolean;
    golden: boolean;
    inShop: boolean;
    shopSafe: boolean; // protected inside the barn right now
    shopTime: number; // seconds of protection left, or cooldown remaining when locked
    shopLocked: boolean; // inside barn but on cooldown (no protection / shopping)
    canAfford: { snow: boolean; love: boolean; wool: boolean };
  };
  leaderboard: HudRam[];
  podium: PodiumEntry[];
  alivePlayers: number;
  killcam: { attacker: string; victim: string } | null;
  toast: string | null;
}
