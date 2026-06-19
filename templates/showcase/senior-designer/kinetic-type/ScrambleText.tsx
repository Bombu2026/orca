"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

interface ScrambleTextProps {
  text: string;
  className?: string;
  duration?: number;
  startOnView?: boolean;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ01!@#$%&*";

function randChar(): string {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
}

export function ScrambleText({
  text,
  className,
  duration = 1100,
  startOnView = true,
}: ScrambleTextProps): React.ReactElement {
  const reduced = useReducedMotion();
  const [output, setOutput] = useState(reduced ? text : "");
  const ref = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (reduced || startedRef.current) return;
    const el = ref.current;
    if (!el) return;

    const start = (): void => {
      if (startedRef.current) return;
      startedRef.current = true;
      const t0 = performance.now();
      const tick = (): void => {
        const t = performance.now() - t0;
        const progress = Math.min(1, t / duration);
        const revealed = Math.floor(progress * text.length);
        let next = "";
        for (let i = 0; i < text.length; i++) {
          if (i < revealed) next += text[i];
          else if (text[i] === " ") next += " ";
          else next += randChar();
        }
        setOutput(next);
        if (progress < 1) requestAnimationFrame(tick);
        else setOutput(text);
      };
      requestAnimationFrame(tick);
    };

    if (!startOnView) {
      start();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) start();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [text, duration, reduced, startOnView]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      <span aria-hidden>{output}</span>
    </span>
  );
}
