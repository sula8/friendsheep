import { useEffect, useRef, useState } from "react";

import { loadModels } from "./assets";
import { audio } from "./audio";
import { SAMPLE_URLS } from "./audioAssets";
import { Engine } from "./engine";
import type { HudState } from "./types";

const EMPTY_HUD: HudState = {
  phase: "playing",
  timeLeft: 180,
  roundPhase: 1,
  player: {
    score: 100,
    alive: true,
    charge: 0,
    charging: false,
    state: "idle",
    rank: 1,
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
  leaderboard: [],
  podium: [],
  alivePlayers: 0,
  killcam: null,
  toast: null,
};

interface UseEngine {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  engineRef: React.RefObject<Engine | null>;
  hud: HudState;
  loading: boolean;
}

/** Boots the three.js engine, wires keyboard input only (desktop), streams HUD state. */
export function useEngine(started: boolean): UseEngine {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!started || !canvasRef.current) return;
    let engine: Engine | null = null;
    let disposed = false;
    const keys = new Set<string>();

    void loadModels().finally(() => {
      if (disposed || !canvasRef.current) return;
      engine = new Engine(canvasRef.current);
      engineRef.current = engine;
      engine.onHud = setHud;
      engine.start();
      audio.unlock();
      void audio.loadSamples(SAMPLE_URLS);
      setLoading(false);
    });

    const applyMove = (): void => {
      if (!engine) return;
      let x = 0;
      let z = 0;
      if (keys.has("w") || keys.has("arrowup")) z -= 1;
      if (keys.has("s") || keys.has("arrowdown")) z += 1;
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      engine.input.moveX = x;
      engine.input.moveZ = z;
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase();
      keys.add(k);
      if (k === " ") {
        e.preventDefault();
        engine?.setPlayerCharging(true);
      }
      applyMove();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase();
      keys.delete(k);
      if (k === " ") engine?.setPlayerCharging(false);
      applyMove();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      engine?.dispose();
      engineRef.current = null;
    };
  }, [started]);

  return { canvasRef, engineRef, hud, loading };
}
