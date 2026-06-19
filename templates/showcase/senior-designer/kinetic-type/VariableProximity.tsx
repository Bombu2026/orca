"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

interface VariableProximityProps {
  text: string;
  className?: string;
  radius?: number;
  minWeight?: number;
  maxWeight?: number;
  fontFeatureSettings?: string;
}

export function VariableProximity({
  text,
  className,
  radius = 140,
  minWeight = 300,
  maxWeight = 900,
  fontFeatureSettings,
}: VariableProximityProps): React.ReactElement {
  const reduced = useReducedMotion();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced) return;
    const el = root.current;
    if (!el) return;
    if (!matchMedia("(pointer: fine)").matches) return;

    const chars = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-char]"));
    const onMove = (e: PointerEvent): void => {
      for (const c of chars) {
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const k = Math.max(0, 1 - dist / radius);
        const wght = Math.round(minWeight + (maxWeight - minWeight) * k);
        c.style.fontVariationSettings = `"wght" ${wght}${fontFeatureSettings ? `, ${fontFeatureSettings}` : ""}`;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [radius, minWeight, maxWeight, fontFeatureSettings, reduced]);

  const chars = Array.from(text);
  return (
    <span ref={root} className={className} aria-label={text}>
      {chars.map((c, i) => (
        <span key={i} data-char aria-hidden style={{ display: "inline-block", willChange: "font-variation-settings" }}>
          {c === " " ? " " : c}
        </span>
      ))}
    </span>
  );
}
