import type { Ram, RoundStats } from "./types";

/** Silly English ram names, mixed in so you can't tell bots from humans. */
const NAMES: string[] = [
  "Gary",
  "WOOLY GRANDPA",
  "Chad",
  "Sir Bleats-a-lot",
  "Mutton Hands",
  "Big Lamb",
  "Ramsey",
  "Fleecewood",
  "Baa-bara",
  "Hoofer",
  "Lord Curls",
  "Ewe-genius",
  "Sheep Daddy",
  "Crash Test Ram",
  "Tony Bleats",
  "Wool Street",
  "Headbutt Harry",
  "Captain Chaos",
  "The Gravy",
  "Knuckles",
  "Mr. Fluff",
  "Disco Ram",
  "Beef Wellington",
  "Yeeted",
  "Ram Solo",
  "Bork",
  "Cottonball",
  "Nugget",
];

let pool: string[] = [];

export function resetNamePool(): void {
  pool = [...NAMES].sort(() => Math.random() - 0.5);
}

export function nextName(): string {
  if (pool.length === 0) resetNamePool();
  return pool.pop() ?? "Ram";
}

/** Bold flat ram colors — readable from top-down. */
export const RAM_COLORS: number[] = [
  0xff5a5f, 0x2ec4b6, 0xffb703, 0x8338ec, 0x3a86ff, 0xfb5607, 0x06d6a0,
  0xef476f, 0x118ab2, 0xf15bb5, 0x9b5de5, 0x00bbf9, 0xff9f1c, 0x52b788,
];

export const HAT_COLORS: number[] = [
  0x222222, 0xffd000, 0xff006e, 0x00f5d4, 0xffffff, 0x7209b7,
];

interface TitleDef {
  id: string;
  label: string;
  score: (s: RoundStats) => number;
}

/** Dumb post-round titles, made to be screenshotted. */
const TITLES: TitleDef[] = [
  { id: "lover", label: "THE LOVER", score: (s) => s.sheepPopped },
  { id: "robber", label: "THE ROBBER", score: (s) => s.pointsStolen },
  { id: "punchbag", label: "FARMER'S PUNCHBAG", score: (s) => s.farmerHits },
  { id: "rambo", label: "RAM-BO", score: (s) => s.knockouts },
  { id: "roadkill", label: "ROADKILL", score: (s) => s.timesLaunched },
];

/**
 * Assigns one funny title per ram. Each title goes to whoever maxed that stat;
 * leftovers get WALLFLOWER (least active) or a generic flavor tag.
 */
export function assignTitles(rams: Ram[]): Map<number, string> {
  const out = new Map<number, string>();
  const taken = new Set<number>();

  for (const t of TITLES) {
    let best: Ram | null = null;
    let bestVal = 0;
    for (const r of rams) {
      if (taken.has(r.id)) continue;
      const v = t.score(r.stats);
      if (v > bestVal) {
        bestVal = v;
        best = r;
      }
    }
    if (best && bestVal > 0) {
      out.set(best.id, t.label);
      taken.add(best.id);
    }
  }

  // Least active leftover -> WALLFLOWER
  let least: Ram | null = null;
  let leastVal = Infinity;
  for (const r of rams) {
    if (taken.has(r.id)) continue;
    if (r.stats.activity < leastVal) {
      leastVal = r.stats.activity;
      least = r;
    }
  }
  if (least) {
    out.set(least.id, "WALLFLOWER");
    taken.add(least.id);
  }

  const fallback = ["JUST VIBING", "MID", "A SHEEP", "PARTICIPANT"];
  let fi = 0;
  for (const r of rams) {
    if (!out.has(r.id)) {
      out.set(r.id, fallback[fi % fallback.length]);
      fi++;
    }
  }
  return out;
}
