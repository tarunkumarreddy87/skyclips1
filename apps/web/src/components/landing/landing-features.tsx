"use client";

import { useRef } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, Captions, Film, Layers3, Music2, Scissors, Sparkles } from "lucide-react";
import { landingMedia } from "./landing-media-data";

const features = [
  { title: "Edit with a conversation.", text: "Ask for a new opening, a different pace, or a stronger ending. Review the agent’s plan and shape the story together.", image: landingMedia[10].image, kind: "agent", prompt: landingMedia[10].prompt },
  { title: "Every scene, in your hands.", text: "Move, trim, and arrange clips on a multi-track timeline. Build the rhythm of your story, one moment at a time.", image: landingMedia[20].image, kind: "timeline", prompt: landingMedia[20].prompt },
  { title: "Give your words a voice.", text: "Bring narration and captions into the same workflow. Fine-tune the words and keep the story easy to follow.", image: landingMedia[2].image, kind: "captions", prompt: landingMedia[2].prompt },
  { title: "Make the details move.", text: "Add editable titles, callouts, and animated graphics. Give every scene a visual language that belongs to your story.", image: landingMedia[13].image, kind: "motion", prompt: landingMedia[13].prompt },
];
const toolkit = [
  { title: "Story generation", text: "Start with a brief. Build a narrative with scenes and narration.", icon: Sparkles },
  { title: "Timeline editing", text: "Trim and arrange every moment of your video.", icon: Scissors },
  { title: "Motion templates", text: "Give titles, facts, and ideas their own movement.", icon: Layers3 },
  { title: "Captions", text: "Make the story clear, even when the sound is off.", icon: Captions },
  { title: "Sound & narration", text: "Bring voice and music together on your timeline.", icon: Music2 },
  { title: "Scene direction", text: "Shape the mood and visual language of your video.", icon: Film },
];

export function LandingFeatures() {
  const rail = useRef<HTMLDivElement>(null);
  return <>
    <section className="sc-feature-section" id="features">
      <div className="sc-section-heading sc-reveal"><p className="sc-eyebrow">FEATURES</p><h2>Creation, beyond generation.</h2></div>
      <div className="sc-feature-grid">{features.map(feature => <article className="sc-feature sc-reveal" key={feature.kind}>
        <a className={`sc-feature-demo sc-feature-${feature.kind}`} href={`/studio?prompt=${encodeURIComponent(feature.prompt)}`} aria-label={`Try ${feature.title}`}>
          <div className="sc-feature-art"><img src={feature.image} alt="" loading="lazy" /></div>
          {feature.kind === "agent" && <div className="sc-feature-chat"><span><Sparkles /> SkyClip Agent</span><p>Give the opening a cinematic feel.</p><div><Check /> A stronger opening, ready for review.</div><span className="sc-feature-send"><ArrowUp /></span></div>}
          {feature.kind === "timeline" && <div className="sc-feature-tracks"><div>{[0,1,2,3,4].map(i => <span key={i} style={{ backgroundImage: `url(${feature.image})` }} />)}</div><div className="sc-feature-audio" /><i /></div>}
          {feature.kind === "captions" && <div className="sc-feature-caption"><span>Every story</span> deserves to be heard.<i /></div>}
          {feature.kind === "motion" && <><div className="sc-feature-bounds"><i /><i /><i /><i /></div><span className="sc-feature-pill"><Layers3 /> Editable motion</span></>}
        </a>
        <h3>{feature.title}</h3><p>{feature.text}</p>
      </article>)}</div>
      <a className="sc-button sc-feature-cta" href="/tools">Explore all tools <ArrowUpRight /></a>
    </section>
    <section className="sc-extra-tools">
      <div className="sc-extra-heading"><h2>More ways to<br />make it your own.</h2><div><button aria-label="Previous tools" onClick={() => rail.current?.scrollBy({ left: -350, behavior: "smooth" })}><ArrowLeft /></button><button aria-label="Next tools" onClick={() => rail.current?.scrollBy({ left: 350, behavior: "smooth" })}><ArrowRight /></button></div></div>
      <div className="sc-extra-rail" ref={rail}>{toolkit.map((tool, index) => <a href="/studio" className="sc-extra-card" key={tool.title}><div><tool.icon /><span>0{index+1}</span></div><h3>{tool.title}</h3><p>{tool.text}</p><ArrowUpRight /></a>)}</div>
    </section>
  </>;
}
