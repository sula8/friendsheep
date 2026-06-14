import { Crown, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { audio } from "./audio";
import { CONFIG } from "./config";
import { Joystick } from "./Joystick";
import { useEngine } from "./useEngine";
import { VoiceCharge } from "./voice";

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const isTouch = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

export function GameView(): React.JSX.Element {
  const { canvasRef, engineRef, hud, loading } = useEngine(true);
  const [muted, setMuted] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const voiceRef = useRef<VoiceCharge | null>(null);

  const setMove = useCallback(
    (x: number, z: number) => {
      const e = engineRef.current;
      if (e) {
        e.input.moveX = x;
        e.input.moveZ = z;
      }
    },
    [engineRef],
  );

  const chargeDown = useCallback(() => engineRef.current?.setPlayerCharging(true), [engineRef]);
  const chargeUp = useCallback(() => engineRef.current?.setPlayerCharging(false), [engineRef]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      audio.setMuted(!m);
      return !m;
    });
  }, []);

  const toggleVoice = useCallback(async () => {
    if (voiceOn) {
      voiceRef.current?.disable();
      voiceRef.current = null;
      setVoiceOn(false);
      return;
    }
    const v = new VoiceCharge();
    v.onCharge = (on) => engineRef.current?.setPlayerCharging(on);
    v.onLevel = (l) => setVoiceLevel(l);
    const ok = await v.enable();
    if (ok) {
      setTimeout(() => v.calibrate(), 400);
      voiceRef.current = v;
      setVoiceOn(true);
    }
  }, [voiceOn, engineRef]);

  useEffect(() => {
    return () => voiceRef.current?.disable();
  }, []);

  const buy = useCallback(
    (kind: "snow" | "lovePill" | "woolArmor") => engineRef.current?.buyShop(kind),
    [engineRef],
  );

  const share = useCallback(() => {
    const url = window.location.href;
    const text = "I'm headbutting fools in RAM ROYALE 🐏 come get launched:";
    if (navigator.share) {
      void navigator.share({ title: "RAM ROYALE", text, url });
    } else {
      void navigator.clipboard?.writeText(`${text} ${url}`);
    }
  }, []);

  const p = hud.player;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#88c070] font-sans">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#8fd16a]">
          <div className="animate-bounce text-6xl">🐏</div>
          <div className="mt-4 text-2xl font-black uppercase tracking-widest text-white drop-shadow">
            RAM ROYALE
          </div>
          <div className="mt-1 text-sm font-bold text-white/80">rounding up the flock…</div>
        </div>
      )}

      {/* ---------- TOP BAR ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        {/* score + rank */}
        <div className="rounded-2xl bg-black/45 px-4 py-2 backdrop-blur-md">
          <div className="flex items-center gap-2">
            {p.rank === 1 && <Crown className="h-5 w-5 text-yellow-300" />}
            <span className="text-3xl font-black tabular-nums text-white drop-shadow">{p.score}</span>
          </div>
          <div className="text-xs font-bold uppercase tracking-wide text-white/70">
            Rank #{p.rank} · {hud.alivePlayers} alive
          </div>
        </div>

        {/* timer */}
        <div className="flex flex-col items-center rounded-2xl bg-black/45 px-4 py-2 backdrop-blur-md">
          <span
            className={`text-3xl font-black tabular-nums drop-shadow ${
              hud.roundPhase === 3 ? "text-red-400" : "text-white"
            }`}
          >
            {fmtTime(hud.timeLeft)}
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-white/70">
            {hud.roundPhase === 1 ? "open" : hud.roundPhase === 2 ? "zone closing" : "FINAL CHAOS"}
          </span>
        </div>

        {/* leaderboard */}
        <div className="pointer-events-none w-40 rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-md">
          {hud.leaderboard.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2 text-sm leading-tight">
              <span className="w-3 text-white/50">{i + 1}</span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: `#${r.color.toString(16).padStart(6, "0")}` }}
              />
              <span
                className={`flex-1 truncate font-bold ${
                  r.isPlayer ? "text-yellow-300" : r.alive ? "text-white" : "text-white/30 line-through"
                }`}
              >
                {r.name}
              </span>
              <span className="tabular-nums text-white/80">{r.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- ACTIVE POWERUPS ---------- */}
      <div className="pointer-events-none absolute left-3 top-24 flex flex-col gap-1">
        {p.snow && <Badge label="❄️ SNOW" />}
        {p.love && <Badge label="💊 LOVE" />}
        {p.wool && <Badge label="🧶 ARMOR" />}
        {p.pepper && <Badge label="🌶️ PEPPER" />}
        {p.golden && <Badge label="👑 GOLDEN" />}
      </div>

      {/* ---------- TOAST ---------- */}
      {hud.toast && (
        <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 animate-bounce text-center text-2xl font-black text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">
          {hud.toast}
        </div>
      )}

      {/* ---------- KILLCAM ---------- */}
      {hud.killcam && hud.phase === "playing" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/40">
          <div className="text-sm font-black uppercase tracking-[0.3em] text-red-400">Killcam</div>
          <div className="mt-2 text-4xl font-black text-white drop-shadow">
            {hud.killcam.attacker} yeeted you
          </div>
          <div className="mt-1 text-lg text-white/70">respawning fresh…</div>
        </div>
      )}

      {/* ---------- DEAD (final phase, no respawn) ---------- */}
      {!p.alive && hud.phase === "playing" && !hud.killcam && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/40">
          <div className="text-4xl font-black text-white">YOU'RE OUT</div>
          <div className="mt-1 text-lg text-white/70">spectating the carnage…</div>
        </div>
      )}

      {/* ---------- SHOP (in barn) ---------- */}
      {p.inShop && p.alive && hud.phase === "playing" && (
        <div className="pointer-events-auto absolute bottom-44 left-1/2 w-72 -translate-x-1/2 rounded-2xl bg-black/75 p-3 backdrop-blur-md">
          {p.shopLocked ? (
            <div className="text-center">
              <div className="text-xs font-black uppercase tracking-widest text-red-400">
                🚪 Barn locked · exposed!
              </div>
              <div className="mt-1 text-[11px] text-white/60">
                Shelter again in {Math.ceil(p.shopTime)}s
              </div>
            </div>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-yellow-300">
                  🛒 Barn Shop · 🛡️ safe
                </span>
                <span className="text-xs font-black tabular-nums text-emerald-300">
                  {Math.ceil(p.shopTime)}s
                </span>
              </div>
              {/* protection countdown */}
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-yellow-300 transition-[width] duration-100"
                  style={{ width: `${Math.min(100, (p.shopTime / CONFIG.barnSafeTime) * 100)}%` }}
                />
              </div>
              <div className="flex gap-2">
                <ShopBtn label="❄️ Snow" price={CONFIG.priceSnow} ok={p.canAfford.snow} onClick={() => buy("snow")} />
                <ShopBtn label="💊 Love" price={CONFIG.priceLovePill} ok={p.canAfford.love} onClick={() => buy("lovePill")} />
                <ShopBtn label="🧶 Armor" price={CONFIG.priceWoolArmor} ok={p.canAfford.wool} onClick={() => buy("woolArmor")} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------- PODIUM ---------- */}
      {hud.phase === "podium" && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="mb-1 text-sm font-black uppercase tracking-[0.4em] text-yellow-300">Round over</div>
          <div className="mb-4 flex items-end gap-3">
            {hud.podium.map((e, i) => (
              <div
                key={i}
                className={`flex flex-col items-center rounded-2xl px-4 pt-3 ${
                  i === 0 ? "pb-8" : i === 1 ? "pb-5" : "pb-3"
                } ${e.isPlayer ? "bg-yellow-400/20 ring-2 ring-yellow-300" : "bg-white/10"}`}
              >
                <div className="text-2xl">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</div>
                <div
                  className="my-1 h-8 w-8 rounded-full"
                  style={{ background: `#${e.color.toString(16).padStart(6, "0")}` }}
                />
                <div className="max-w-[6rem] truncate text-sm font-black text-white">{e.name}</div>
                <div className="text-xs font-bold text-yellow-300">{e.title}</div>
                <div className="text-lg font-black tabular-nums text-white">{e.score}</div>
              </div>
            ))}
          </div>
          <button
            onClick={share}
            className="pointer-events-auto rounded-full bg-yellow-400 px-8 py-3 text-lg font-black uppercase tracking-wide text-black shadow-lg transition active:scale-95"
          >
            📲 Share the chaos
          </button>
          <div className="mt-3 text-sm text-white/60">next round starting…</div>
        </div>
      )}

      {/* ---------- MOBILE CONTROLS ---------- */}
      {isTouch && p.alive && hud.phase === "playing" && (
        <>
          <Joystick onMove={setMove} />
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              chargeDown();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              chargeUp();
            }}
            className="pointer-events-auto absolute bottom-10 right-6 flex h-28 w-28 select-none items-center justify-center rounded-full border-4 border-white/40 bg-red-500/80 text-center text-lg font-black uppercase text-white shadow-xl active:scale-95"
          >
            {p.charging ? "🔥" : "RAM"}
          </button>
        </>
      )}

      {/* ---------- CHARGE METER ---------- */}
      {p.charging && (
        <div className="pointer-events-none absolute bottom-44 left-1/2 h-3 w-56 -translate-x-1/2 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-red-500 transition-[width] duration-75"
            style={{ width: `${p.charge * 100}%` }}
          />
        </div>
      )}

      {/* ---------- BOTTOM-RIGHT BUTTONS ---------- */}
      {/* on touch, sit clear above the big RAM button so nothing overlaps */}
      <div
        className={`absolute right-3 flex flex-col items-end gap-2 ${
          isTouch && p.alive && hud.phase === "playing" ? "bottom-44" : "bottom-3"
        }`}
      >
        <button
          onClick={toggleVoice}
          className={`pointer-events-auto flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black uppercase backdrop-blur-md transition ${
            voiceOn ? "bg-green-500/80 text-white" : "bg-black/45 text-white/80"
          }`}
        >
          📢 BAAA
          {voiceOn && (
            <span className="ml-1 h-2 w-10 overflow-hidden rounded-full bg-white/20">
              <span className="block h-full bg-green-300" style={{ width: `${voiceLevel * 100}%` }} />
            </span>
          )}
        </button>
        <button
          onClick={toggleMute}
          className="pointer-events-auto rounded-full bg-black/45 p-2 text-white/80 backdrop-blur-md"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {/* ---------- DESKTOP HINT ---------- */}
      {!isTouch && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-4 py-1.5 text-xs font-bold text-white/70 backdrop-blur-md">
          WASD / arrows to move · hold SPACE to charge & aim where you're heading
        </div>
      )}
    </div>
  );
}

function Badge({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="rounded-full bg-black/50 px-2.5 py-1 text-xs font-black text-white backdrop-blur-md">
      {label}
    </div>
  );
}

function ShopBtn({
  label,
  price,
  ok,
  onClick,
}: {
  label: string;
  price: number;
  ok: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={!ok}
      className={`flex flex-col items-center rounded-xl px-3 py-2 text-sm font-black transition active:scale-95 ${
        ok ? "bg-white text-black" : "cursor-not-allowed bg-white/20 text-white/40"
      }`}
    >
      <span>{label}</span>
      <span className="text-xs">{price}</span>
    </button>
  );
}
