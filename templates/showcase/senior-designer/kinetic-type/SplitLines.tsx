"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { type ReactNode, createElement } from "react";

interface SplitLinesProps {
  lines: ReactNode[];
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  delay?: number;
  stagger?: number;
}

const container: Variants = {
  hidden: {},
  show: (stagger: number) => ({ transition: { staggerChildren: stagger } }),
};

const line: Variants = {
  hidden: { y: "120%", opacity: 0 },
  show: {
    y: "0%",
    opacity: 1,
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
  },
};

export function SplitLines({
  lines,
  as = "h1",
  className,
  delay = 0,
  stagger = 0.08,
}: SplitLinesProps): React.ReactElement {
  const reduced = useReducedMotion();
  if (reduced) {
    return createElement(
      as,
      { className },
      lines.map((l, i) => (
        <span key={i} className="block">
          {l}
        </span>
      )),
    );
  }

  return createElement(
    as,
    { className },
    <motion.span
      variants={container}
      custom={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ delayChildren: delay }}
      className="block"
    >
      {lines.map((l, i) => (
        <span key={i} className="block overflow-hidden">
          <motion.span variants={line} className="block">
            {l}
          </motion.span>
        </span>
      ))}
    </motion.span>,
  );
}
