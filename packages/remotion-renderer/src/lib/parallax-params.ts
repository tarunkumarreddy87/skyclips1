/** Shared parallax pan configuration (timeline loop.params). */
export type ParallaxDirection = "left-right" | "right-left" | "top-bottom" | "bottom-top";

export interface ParallaxPanParams {
  direction?: ParallaxDirection;
  /** Overscale so pan edges stay covered (default 1.2). */
  scale?: number;
  foreground_speed?: number;
  background_speed?: number;
}
