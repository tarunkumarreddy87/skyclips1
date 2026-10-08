"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectDetail, Quote, ThemeId } from "@hanuman/shared-types";
import { THEME_LIST, resolveThemeId } from "@hanuman/shared-types";
import { GenerationPanel } from "@/components/GenerationPanel";
import { approveQuote, generateQuote, updateQuote } from "@/lib/api-client";

interface QuoteReviewProps {
  project: ProjectDetail;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function QuoteReview({ project }: QuoteReviewProps) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(project.activeQuote);
  const [durationSec, setDurationSec] = useState(String(project.activeQuote?.durationSec ?? ""));
  const [voiceId, setVoiceId] = useState(project.activeQuote?.voiceId ?? "");
  const [themeId, setThemeId] = useState<ThemeId>(
    resolveThemeId(project.activeQuote?.brandProfileId),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(false);

  const canGenerate = project.status === "draft" || project.status === "quoted";
  const canEdit = project.status === "quoted" && quote?.status === "pending_approval";
  const canApprove = canEdit;
  const isApproved =
    project.status === "approved" ||
    project.status === "running" ||
    project.status === "queued" ||
    project.status === "completed" ||
    quote?.status === "approved";
  const showGeneration =
    isApproved ||
    project.status === "running" ||
    project.status === "queued" ||
    project.status === "completed" ||
    project.status === "failed";

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const newQuote = await generateQuote(project.id);
      setQuote(newQuote);
      setDurationSec(String(newQuote.durationSec));
      setVoiceId(newQuote.voiceId);
      setThemeId(resolveThemeId(newQuote.brandProfileId));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate quote");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!quote) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await updateQuote(project.id, {
        durationSec: Number(durationSec),
        voiceId,
        brandProfileId: themeId,
      });
      setQuote(updated);
      setThemeId(resolveThemeId(updated.brandProfileId));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update quote");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!quote) return;
    setLoading(true);
    setError(null);
    try {
      let quoteToApprove = quote;
      if (canEdit) {
        quoteToApprove = await updateQuote(project.id, {
          durationSec: Number(durationSec),
          voiceId,
          brandProfileId: themeId,
        });
      }
      const approved = await approveQuote(project.id, quoteToApprove.id);
      setQuote(approved);
      setAutoGenerate(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve quote");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section>
        <h2>Quote statement</h2>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          Review how SkyClip understood your brief before generation starts.
        </p>

        {!quote && canGenerate && (
          <button type="button" onClick={handleGenerate} disabled={loading} style={{ marginTop: "1rem" }}>
            {loading ? "Generating…" : "Generate quote"}
          </button>
        )}

        {quote && (
          <div
            style={{
              marginTop: "1rem",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <dl style={{ display: "grid", gap: "0.75rem", margin: 0 }}>
              <div>
                <dt style={{ fontSize: "0.75rem", color: "#6b7280" }}>Format</dt>
                <dd style={{ margin: 0 }}>{quote.formatMode}</dd>
              </div>
              <div>
                <dt style={{ fontSize: "0.75rem", color: "#6b7280" }}>Duration</dt>
                <dd style={{ margin: 0 }}>
                  {canEdit ? (
                    <input
                      type="number"
                      min={30}
                      max={3600}
                      value={durationSec}
                      onChange={(e) => setDurationSec(e.target.value)}
                      style={{ width: 120 }}
                    />
                  ) : (
                    formatDuration(quote.durationSec)
                  )}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "0.75rem", color: "#6b7280" }}>Voice (Sarvam speaker)</dt>
                <dd style={{ margin: 0 }}>
                  {canEdit ? (
                    <input
                      type="text"
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      placeholder="shubh, anushka, vidya…"
                      style={{ width: "100%", maxWidth: 320 }}
                    />
                  ) : (
                    quote.voiceId
                  )}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "0.75rem", color: "#6b7280" }}>Visual theme (brand profile)</dt>
                <dd style={{ margin: 0 }}>
                  {canEdit ? (
                    <select
                      value={themeId}
                      onChange={(e) => setThemeId(e.target.value as ThemeId)}
                      style={{ width: "100%", maxWidth: 420, padding: "0.35rem" }}
                    >
                      {THEME_LIST.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.description}
                        </option>
                      ))}
                    </select>
                  ) : (
                    THEME_LIST.find((t) => t.id === resolveThemeId(quote.brandProfileId))?.name ??
                    quote.brandProfileId
                  )}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "0.75rem", color: "#6b7280" }}>Output</dt>
                <dd style={{ margin: 0 }}>
                  {quote.resolution} · {quote.aspectRatio}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "0.75rem", color: "#6b7280" }}>Credits used when generation starts</dt>
                <dd style={{ margin: 0 }}>{quote.creditEstimate} credits · about {Math.ceil(quote.durationSec / 60)} video minutes</dd>
              </div>
              {quote.warnings && quote.warnings.length > 0 ? (
                <div>
                  <dt style={{ fontSize: "0.75rem", color: "#b45309" }}>Content density</dt>
                  <dd style={{ margin: 0, color: "#92400e", fontSize: "0.875rem" }}>
                    {quote.warnings.join(" ")}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt style={{ fontSize: "0.75rem", color: "#6b7280" }}>Status</dt>
                <dd style={{ margin: 0 }}>{quote.status}</dd>
              </div>
            </dl>

            <h3 style={{ fontSize: "0.875rem", marginTop: "1.25rem" }}>Section outline</h3>
            <ol style={{ paddingLeft: "1.25rem" }}>
              {quote.sectionOutline.map((section, i) => (
                <li key={i} style={{ marginBottom: "0.5rem" }}>
                  <strong>{section.title}</strong>
                  <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>{section.summary}</div>
                </li>
              ))}
            </ol>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
              {canEdit && (
                <>
                  <button type="button" onClick={handleSave} disabled={loading}>
                    Save changes
                  </button>
                  <button type="button" onClick={handleApprove} disabled={loading}>
                    Approve &amp; generate
                  </button>
                  <button type="button" onClick={handleGenerate} disabled={loading}>
                    Regenerate quote
                  </button>
                </>
              )}
              {isApproved && !canEdit && (
                <p style={{ color: "#15803d", margin: 0 }}>Quote approved — video generation below.</p>
              )}
            </div>
          </div>
        )}

        {error && <p style={{ color: "#b91c1c", marginTop: "1rem" }}>{error}</p>}
      </section>

      {showGeneration && (
        <GenerationPanel
          projectId={project.id}
          projectStatus={project.status}
          entryPath={project.entryPath}
          autoStart={autoGenerate}
        />
      )}
    </>
  );
}
