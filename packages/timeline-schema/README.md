# Timeline Schema

JSON Schema and validators for the orchestrator → media worker render contract.

- Schema: `schema/timeline.v1.json` (live)
- Motion fields: optional `transform` / `animation` on video, broll, captions, overlays; expanded `transitions[].type` (ADR 0007)
- Preset → FFmpeg hints: `src/motion.ts` (Phase 5 implements filters)
- Fixtures: `fixtures/` (`documentary-motion-v1.json` exercises motion fields)
- Validate fixtures: `pnpm validate-fixtures`
