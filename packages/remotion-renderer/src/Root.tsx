import React from "react";
import { Composition } from "remotion";
import { TimelineComposition } from "./compositions/TimelineComposition";
import type { TimelineCompositionProps, TimelineManifestV1 } from "./lib/types";
import { transitionSeriesDurationFrames } from "./lib/timing";
import proofManifest from "../fixtures/phase1-proof.json";

const defaultManifest = proofManifest as TimelineManifestV1;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TimelineComposition"
        component={TimelineComposition as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={transitionSeriesDurationFrames(
          defaultManifest,
          defaultManifest.metadata.fps,
        )}
        fps={defaultManifest.metadata.fps}
        width={defaultManifest.metadata.resolution.width}
        height={defaultManifest.metadata.resolution.height}
        defaultProps={
          {
            manifest: defaultManifest,
          } satisfies TimelineCompositionProps as unknown as Record<string, unknown>
        }
        calculateMetadata={async ({ props }) => {
          const p = props as unknown as TimelineCompositionProps;
          const m = p.manifest ?? defaultManifest;
          return {
            durationInFrames: transitionSeriesDurationFrames(m, m.metadata.fps),
            fps: m.metadata.fps,
            width: m.metadata.resolution.width,
            height: m.metadata.resolution.height,
          };
        }}
      />
    </>
  );
};
