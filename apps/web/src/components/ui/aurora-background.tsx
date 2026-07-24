"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface AuroraBackgroundProps {
  /** Extra wrapper classes */
  className?: string;
  /** Content to render on top of the background */
  children?: React.ReactNode;
  /** Number of star points */
  starCount?: number;
  /** Two CSS-variable backed colors for the radial overlays */
  gradientColors?: [string, string];
  /** Pulse animation duration in seconds */
  pulseDuration?: number;
  /** ARIA label for the animated background */
  ariaLabel?: string;
}

type StarSpec = {
  id: number;
  x: number;
  y: number;
  opacityPeak: number;
  duration: number;
  delay: number;
};

/** Deterministic positions — avoids SSR/client hydration mismatch from Math.random(). */
function buildStars(count: number): StarSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const s = Math.sin(i * 12.9898) * 43758.5453;
    const t = s - Math.floor(s);
    const u = Math.sin((i + 1) * 78.233) * 43758.5453;
    const v = u - Math.floor(u);
    return {
      id: i,
      x: t * 100,
      y: v * 100,
      opacityPeak: 0.25 + t * 0.55,
      duration: 2 + v * 3,
      delay: t * 5,
    };
  });
}

export function AuroraBackground({
  className,
  children,
  starCount = 50,
  gradientColors = [
    "var(--aurora-color1, rgba(99,102,241,0.2))",
    "var(--aurora-color2, rgba(139,92,246,0.2))",
  ],
  pulseDuration = 10,
  ariaLabel = "Animated aurora background",
}: AuroraBackgroundProps) {
  const [colorA, colorB] = gradientColors;
  const stars = useMemo(() => buildStars(starCount), [starCount]);

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn(
        "relative isolate flex w-full flex-col overflow-hidden bg-[#050508] text-slate-50",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-50 motion-reduce:opacity-40"
          style={{
            backgroundImage: `
              radial-gradient(circle at 20% 20%, ${colorA} 0%, transparent 55%),
              radial-gradient(circle at 80% 70%, ${colorB} 0%, transparent 55%)
            `,
            backgroundSize: "100% 100%",
            animation: `aurora-pulse ${pulseDuration}s ease-in-out infinite`,
          }}
        />

        <motion.div
          className="absolute inset-0 mix-blend-screen motion-reduce:opacity-60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, ease: "easeInOut" }}
        >
          <motion.div
            className="absolute -top-1/4 -left-1/4 h-1/2 w-1/2 rounded-full bg-indigo-600 opacity-40 blur-3xl filter motion-reduce:animate-none"
            animate={{
              x: [-50, 50, -50],
              y: [-20, 20, -20],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 30,
              repeat: Infinity,
              repeatType: "mirror",
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute -bottom-1/4 -right-1/4 h-1/2 w-1/2 rounded-full bg-violet-600 opacity-40 blur-3xl filter motion-reduce:animate-none"
            animate={{
              x: [50, -50, 50],
              y: [20, -20, 20],
              scale: [1, 1.3, 1],
            }}
            transition={{
              duration: 40,
              repeat: Infinity,
              repeatType: "mirror",
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute left-1/3 top-1/3 h-1/3 w-1/3 rounded-full bg-blue-700 opacity-30 blur-3xl filter motion-reduce:animate-none"
            animate={{
              x: [20, -20, 20],
              y: [-30, 30, -30],
              rotate: [0, 360, 0],
            }}
            transition={{
              duration: 50,
              repeat: Infinity,
              repeatType: "mirror",
              ease: "easeInOut",
            }}
          />
        </motion.div>

        {stars.map((star) => (
          <motion.div
            key={star.id}
            className="absolute h-0.5 w-0.5 rounded-full bg-white motion-reduce:hidden"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, star.opacityPeak, 0] }}
            transition={{
              duration: star.duration,
              repeat: Infinity,
              delay: star.delay,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}
