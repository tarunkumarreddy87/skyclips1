/** Model-authored scene data. No executable code is accepted from a model. */
export interface MotionKeyframe {
  timeMs: number;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  reveal?: number;
  value?: number;
}

export interface MotionSceneLayer {
  id: string;
  kind: "text" | "rectangle" | "ellipse" | "line" | "image" | "counter";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  src?: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: "sans" | "serif" | "mono";
  align: "left" | "center" | "right";
  radius: number;
  strokeWidth: number;
  strokeColor: string;
  shadow: number;
  startMs: number;
  endMs: number;
  easing: "linear" | "smooth" | "spring";
  keyframes: MotionKeyframe[];
  prefix?: string;
  suffix?: string;
}

export interface MotionScene {
  version: 1;
  title: string;
  durationMs: number;
  background: string;
  layers: MotionSceneLayer[];
  audio: Array<{ sound: "whoosh" | "impact" | "tick" | "rise" | "ambient"; startMs: number; volume: number }>;
}
