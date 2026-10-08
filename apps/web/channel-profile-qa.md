# Channel profiles, Studio and Projects — 2026-09-20

Implemented:
- Channel profiles naming, readable language/duration/format labels, save without forced navigation.
- Supported narration language choices; Odia and regional code normalization; explicit rejection of unsupported speech languages instead of default-English fallback.
- Studio waits for stored profile hydration and rejects unsupported languages before creating a project. Duplicate submission guard.
- Voice catalog uses supported Sarvam speaker IDs; removed misleading ElevenLabs labels, browser-speech previews, and fake history/community filters.
- Motion cards use available rendered samples and hover lighting with reduced-motion support; removed unshipped template placeholders and duplicate card titles.
- Blocked-domain entry preserves newlines; removed nested checkbox/button interaction.
- General web crawling and CC/public-domain controls marked unavailable: API stores these flags but generation workers do not consume them. No crawler was added.
- Profile limit now preserves existing profiles instead of deleting the oldest.
- Studio selector uses a nonmodal menu and mounts the creation dialog only when needed.
- Projects: visible New video action, retry on load failure, accurate search-empty state, ID deduplication. Removed fabricated credit counts from Projects and recent generations.
- Recent-generation API errors are handled instead of becoming unhandled promise rejections.

Validation:
- TypeScript passed.
- 15 Python language/speaker tests passed.
- Channel state assertions passed: Telugu reaches generation payload; creating a profile beyond the limit does not delete saved profiles. Node has no browser storage; this is a state/payload check, not a persistence test.
- Browser verified channel form, Telugu selection, voice catalog and Studio menu. Unsaved test language selection was discarded.

Limits:
- No paid generation, speech preview request or user-project regeneration was started. End-to-end generated narration is not verified.
- Speech resolver changes require the orchestrator process to load the updated Python code.
- Channel profiles currently use browser-local persistence; no cross-device synchronization was added.
- Hover treatments are UI enhancements, not new rendered video effects.
