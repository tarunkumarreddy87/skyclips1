# HANUMAN native media worker

The Temporal activity host preserves render-job/artifact contracts and calls the
native cloud service by default. Set `RENDER_ENGINE=native-local` to run the same
pipeline inside this worker. Install workspace Node dependencies plus `uv sync`,
ensure FFmpeg/ffprobe are on PATH, then run `uv run python -m src.worker`.

Absolute timeline timestamps determine source trims, captions, object animation,
music, original footage audio and SFX. Transitions replace the outgoing tail with
a held first-frame handle from the next clip; export duration never contracts.
Main video overlaps are rejected; layered media belongs on the b-roll track.

`RENDER_ENCODER=auto` tests NVIDIA encoding and selects software if it fails.
`RENDER_PARALLEL_SECTIONS` bounds independent clip jobs. Optional `RENDER_CACHE_DIR`
reuses completed sections keyed by media, graphics, fonts, settings and encoder.
Captions and vector graphics use the exact SVG scene function used by preview;
missing Node graphics dependencies cause a visible export error.

Run real export proofs with `uv run pytest tests/test_native_export.py`. Tests use
local synthetic footage and cover timing, original audio mute/trim, animated
captions/charts, cache reuse, cancellation and hardware capability fallback.

Cloud GPU throughput, full-length exports, HDR workflows and complete media-effect
preview parity still require production validation. No measured superiority over
other editors is claimed.
