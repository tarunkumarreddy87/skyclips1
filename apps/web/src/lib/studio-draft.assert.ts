import assert from "node:assert/strict";

async function main() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  }});
  const { useStudioDraft } = await import("./studio-draft");
  const script = new File(["My script"], "story.txt", { type: "text/plain" });
  useStudioDraft.getState().patch({ prompt: "A story about oceans", title: "Blue planet", model: "skyclip-v1-pro", durationOverride: 3, scriptFile: script });
  const saved = values.get("skyclip-studio-draft")!;
  assert.equal(useStudioDraft.getState().scriptFile, script, "Attachments survive component unmount/navigation");
  assert.equal(JSON.parse(saved).state.scriptFile, undefined, "Attachments must not be serialized");
  useStudioDraft.getState().clear();
  values.set("skyclip-studio-draft", saved);
  await useStudioDraft.persist.rehydrate();
  assert.equal(useStudioDraft.getState().prompt, "A story about oceans");
  assert.equal(useStudioDraft.getState().title, "Blue planet");
  assert.equal(useStudioDraft.getState().model, "skyclip-v1-pro");
  assert.equal(useStudioDraft.getState().durationOverride, 3);
  useStudioDraft.getState().clear();
  assert.equal(JSON.parse(values.get("skyclip-studio-draft")!).state.prompt, "", "Sign out / successful submission clears the draft");
  console.log("Studio draft: navigation, reload, attachments, and clearing checks passed");
}
void main();
