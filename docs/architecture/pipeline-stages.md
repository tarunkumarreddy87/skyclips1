# Pipeline Stages

## Workflow

**Name:** `VideoGenerationWorkflow`  
**Workflow ID:** `video-gen-{project_id}` (idempotent)  
**Task queue:** `orchestrator`  
**Render task queue:** `media`

## Stage sequence

```
ValidateBrief
  → RunResearch          (skipped in script-first if research not needed)
  → GenerateScript       (skipped in script-first; replaced by ParseScript)
  → GenerateVoice
  → PlanScenes
  → BuildTimeline
  → EnqueueRender        (activity on media task queue)
```

## Stage reference

### 1. ValidateBrief

| | |
|---|---|
| **Input** | Project brief, approved quote |
| **Output** | Validation result (no artifact) |
| **Timeout** | 30s |
| **Retries** | 2 |

Confirms brief content exists, quote is approved, format mode is supported, and required env/config is present. Fails fast before any external API calls.

---

### 2. RunResearch

| | |
|---|---|
| **Input** | Brief prompt text, format mode |
| **Output** | `research.json` artifact |
| **Timeout** | 10 min |
| **Retries** | 3 |

Gathers factual context via search API and LLM synthesis. For script-first with comprehensive scripts, this stage may run in lightweight mode (fact-check only) or be skipped via workflow branch.

**Progress label:** "Researching the topic"

---

### 3. GenerateScript / ParseScript

| | |
|---|---|
| **Input** | Brief, research artifact (prompt-first) OR script text/file (script-first) |
| **Output** | `script.json` artifact |
| **Timeout** | 10 min |
| **Retries** | 3 |

- **GenerateScript** (prompt-first): LLM produces structured sections using mode-specific templates.
- **ParseScript** (script-first): Parses and normalizes user script into the same `script.json` schema.

**Progress label:** "Writing the script" / "Processing your script"

---

### 4. GenerateVoice

| | |
|---|---|
| **Input** | `script.json`, quote voice_id |
| **Output** | Per-section WAV files + combined `narration.wav` |
| **Timeout** | 15 min |
| **Retries** | 3 |

Generates TTS per section to capture accurate durations. Combined narration is used for final render. **Actual audio durations** drive timeline timing — never estimated text length.

**Progress label:** "Creating the voiceover"

---

### 5. PlanScenes

| | |
|---|---|
| **Input** | `script.json`, `research.json`, format mode |
| **Output** | `scenes.json` + scene asset files in S3 |
| **Timeout** | 15 min |
| **Retries** | 3 |

Maps each section to one or more scenes with visual intent. Sources stock images/video via API. Downloads and stores assets in S3 with license metadata.

MVP: static images or short stock clips per scene. No motion graphics generation.

**Progress label:** "Planning visuals"

---

### 6. BuildTimeline

| | |
|---|---|
| **Input** | `script.json`, narration segments, `scenes.json` |
| **Output** | `timeline.v1.json` artifact |
| **Timeout** | 5 min |
| **Retries** | 3 |

Assembles the render manifest. Validates against `packages/timeline-schema`. This is the contract handoff to the media worker.

**Progress label:** "Building timeline"

---

### 7. EnqueueRender

| | |
|---|---|
| **Input** | `timeline.v1.json` S3 reference, project/run IDs |
| **Output** | `final.mp4` artifact |
| **Timeout** | 30 min |
| **Retries** | 2 |
| **Task queue** | `media` |

Temporal activity executed by the media worker. Reads manifest, runs FFmpeg, uploads output. Workflow awaits completion signal or activity result.

**Progress label:** "Rendering your video"

---

## Format mode differences

| Aspect | Documentary | Listicle |
|--------|-------------|----------|
| Section structure | Intro → body sections → conclusion | Numbered items (e.g. "10 things...") |
| Script prompt template | Narrative arc, pacing | List format, per-item hooks |
| Scene planning | B-roll matching narrative beats | Visual per list item |
| Quote inference | Infers from topic prompt | Detects list patterns in prompt/script |

Both modes use the same workflow definition with strategy parameters passed at start.

## Entry path branching

```
                    ┌─ prompt_first → GenerateScript
ValidateBrief ──────┤
                    └─ script_first → ParseScript
```

`RunResearch` runs for prompt-first always. For script-first, configurable: full research, light fact-check, or skip (MVP default: skip).

## Retry and failure policy

| Failure type | Behavior |
|--------------|----------|
| Transient (API timeout, rate limit) | Activity retry with exponential backoff |
| Permanent (invalid script, no footage found) | Fail activity → workflow fails → project status `failed` |
| Render failure | Retry render once; then fail with error surfaced in UI |

Workflow does not partially compensate (no automatic refunds — billing is out of MVP scope). Failed runs retain artifacts from completed stages for debugging.

## Progress percent mapping (approximate)

| Stage | Percent range |
|-------|---------------|
| ValidateBrief | 0–5 |
| RunResearch | 5–20 |
| GenerateScript / ParseScript | 20–35 |
| GenerateVoice | 35–50 |
| PlanScenes | 50–75 |
| BuildTimeline | 75–80 |
| EnqueueRender | 80–100 |

Percents are indicative for UI; stage `started` / `completed` events are authoritative.

## Temporal configuration notes

- Workflows must be deterministic (no I/O, no `datetime.now()` without workflow-side timers).
- All external calls live in activities.
- Activity heartbeats every 30s for stages exceeding 1 min.
- Use `project_id` and `run_id` as search attributes for Temporal UI debugging.

## Related documents

- [timeline-manifest.md](./timeline-manifest.md)
- [progress-events.md](./progress-events.md)
- [data-model.md](./data-model.md)
