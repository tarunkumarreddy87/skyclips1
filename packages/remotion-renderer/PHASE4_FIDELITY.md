# Phase 4 — Autosave / history clarity

## Problem

Generic “Saved” didn’t mean “what Render exports.” History looked like the export source.
Autosave wrote a new S3 snapshot on every debounce even when content was identical → noise.

## Fix

| Change | Detail |
|--------|--------|
| Toolbar badge | **Render-ready** when flushed; **Unsaved edits** when dirty (tooltips explain Render path) |
| Render toast | States export = current live timeline after flush |
| History panel | Notes that Render uses live editor, not the highlighted row |
| Fingerprint skip | Skip remote autosave when `editorContentFingerprint` unchanged |
| Debounce | 2.5s (was 2s) |
| Load/restore | `markEditorFlushed` so reopen doesn’t re-upload identical docs |

Restore/history remain fully available.
