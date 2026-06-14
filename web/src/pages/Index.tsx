import type React from "react";
import { useState } from "react";

import { audio } from "@/game/audio";
import { GameView } from "@/game/GameView";

export default function Index(): React.JSX.Element {
  const [started, setStarted] = useState(false);

  if (started) return <GameView />;

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#7ab861] text-center">
      {/* playful backdrop */}
      <div className="pointer-events-none absolute inset-0 opacity-20">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="absolute text-5xl"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              transform: `rotate(${i * 24}deg)`,
            }}
          >
            🐑
          </span>
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center px-6">
        <div className="text-7xl">🐏</div>
        <h1 className="mt-2 text-6xl font-black uppercase tracking-tighter text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.3)] sm:text-7xl">
          FriendSheep
        </h1>
        <p className="mt-2 max-w-md text-lg font-bold text-white/90">
          Charge. Headbutt. Steal their points. Pop sheep. Dodge the farmer. Be
          the last ram standing — or the richest.
        </p>

        <button
          onClick={() => {
            audio.unlock();
            audio.fanfare();
            setStarted(true);
          }}
          className="mt-8 rounded-full bg-yellow-400 px-12 py-4 text-2xl font-black uppercase tracking-wide text-black shadow-[0_6px_0_rgba(0,0,0,0.25)] transition active:translate-y-1 active:shadow-[0_3px_0_rgba(0,0,0,0.25)]"
        >
          🔥 Smash in
        </button>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm font-bold text-white/70">
          <span>WASD / stick to move</span>
          <span>·</span>
          <span>hold to charge a ram</span>
          <span>·</span>
          <span>yell “BAAA” (opt-in)</span>
        </div>
      </div>
    </div>
  );
}
