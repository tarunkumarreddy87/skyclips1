# timeline.v1 transition → Remotion presentation map

| HANUMAN `type` | Remotion | Kind |
|----------------|----------|------|
| `cut` | (none) | cut |
| `fade` / `dissolve` | `fade()` | builtin |
| `wipe*` | `wipe({direction})` | builtin |
| `slide*` / `slide-pan` | `slide({direction})` | builtin |
| `circleopen` / `circleclose` | `iris()` | builtin / approx |
| `zoom` | `zoomPresentation()` (scale crossfade) | custom |
| `pixelize` | `pixelizePresentation()` | custom |
| `film-burn` | `filmBurnPresentation()` (flicker+grain+scratch) | custom |
| `glitch` | `glitchPresentation()` | custom |

Timing: always `secToFrames(transition.duration_sec, fps)` at the TransitionSeries call site — no local recomputation.
