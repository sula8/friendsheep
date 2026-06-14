import { useCallback, useRef, useState } from "react";

interface Props {
  onMove: (x: number, z: number) => void;
}

/** Left-thumb virtual stick for touch. Emits normalized XZ (z negative = up). */
export function Joystick({ onMove }: Props): React.JSX.Element {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const active = useRef(false);
  const origin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handle = useCallback(
    (cx: number, cy: number) => {
      const dx = cx - origin.current.x;
      const dy = cy - origin.current.y;
      const max = 52;
      const d = Math.hypot(dx, dy);
      const clamped = Math.min(d, max);
      const a = Math.atan2(dy, dx);
      const kx = Math.cos(a) * clamped;
      const ky = Math.sin(a) * clamped;
      setKnob({ x: kx, y: ky });
      onMove(kx / max, ky / max);
    },
    [onMove],
  );

  const onStart = useCallback((e: React.TouchEvent) => {
    active.current = true;
    const t = e.touches[0];
    origin.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!active.current) return;
      const t = e.touches[0];
      handle(t.clientX, t.clientY);
    },
    [handle],
  );

  const onEnd = useCallback(() => {
    active.current = false;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  }, [onMove]);

  return (
    <div
      ref={baseRef}
      onTouchStart={onStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onEnd}
      className="pointer-events-auto absolute bottom-8 left-6 h-32 w-32 touch-none select-none rounded-full border-4 border-white/30 bg-black/25 backdrop-blur-sm"
    >
      <div
        className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-2 border-white/60 bg-white/80 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
