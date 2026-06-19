"use client";

import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

type CursorVariant = "default" | "link" | "image" | "drag";

interface CustomCursorProps {
  size?: number;
  color?: string;
}

const sizeFor: Record<CursorVariant, number> = {
  default: 12,
  link: 48,
  image: 80,
  drag: 96,
};

export function CustomCursor({ size = 12, color = "var(--color-ink)" }: CustomCursorProps): React.ReactElement | null {
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [variant, setVariant] = useState<CursorVariant>("default");
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 600, damping: 32, mass: 0.3 });
  const sy = useSpring(y, { stiffness: 600, damping: 32, mass: 0.3 });

  useEffect(() => {
    if (reduced) return;
    if (!matchMedia("(pointer: fine)").matches) return;
    setEnabled(true);
    const onMove = (e: PointerEvent): void => {
      x.set(e.clientX);
      y.set(e.clientY);
      const t = e.target as HTMLElement | null;
      const v = (t?.closest("[data-cursor]") as HTMLElement | null)?.dataset.cursor as CursorVariant | undefined;
      setVariant(v ?? "default");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.style.cursor = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.style.cursor = "";
    };
  }, [x, y, reduced]);

  if (!enabled) return null;
  const targetSize = sizeFor[variant] ?? size;

  return (
    <motion.div
      aria-hidden
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        x: sx,
        y: sy,
        translateX: "-50%",
        translateY: "-50%",
        pointerEvents: "none",
        zIndex: 9999,
        mixBlendMode: "difference",
      }}
      animate={{ width: targetSize, height: targetSize }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 999,
          background: color,
        }}
      />
    </motion.div>
  );
}
