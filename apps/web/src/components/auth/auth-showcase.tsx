"use client";

import { useEffect, useState } from "react";
import { ShowcaseScene, AbsoluteFill, useCurrentFrame } from "@/lib/editor/showcase-motion";
import { useReducedMotion } from "motion/react";
import { Pause, Play, Film, Captions, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlinePillTakeover } from "@/components/remocn/inline-pill-takeover";
import { CenteredWordBuild } from "@/components/remocn/centered-word-build";
import { TypeFossil } from "@/components/remocn/type-fossil";

const slides = [
  { title: "A spark. A story. A SkyClip.", description: "Bring your next big idea to the screen.", label: "Imagine" },
  { title: "Make every word move.", description: "Captions and motion that give your story a voice.", label: "Create" },
  { title: "From first thought to final cut.", description: "Shape every detail in your own creative studio.", label: "Make it yours" },
];

const COMP_W = 800;
const COMP_H = 450;

function BrandFilm({ slide }: { slide: number }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: "#e0eedc", color: "#15231a" }}>
    {slide === 0 && <InlinePillTakeover before="An idea." insert="SkyClip" after="A whole story." fontSize={42} fontWeight={600} color="#15231a" pillColor="#15231a" pillTextColor="#e0eedc" pillWidth={210} takeoverScale={1.7} speed={0.45}/>}
    {slide === 1 && <CenteredWordBuild text="Make every word move." fontSize={48} fontWeight={600} color="#15231a" exitAt={180} wordGap={16}/>}
    {slide === 2 && <TypeFossil text="SkyClip" drafts="Imagine | Create | Refine" color="#15231a" accentColor="#476847" backgroundColor="#e0eedc" layers={10} speed={0.65}/>}
  </AbsoluteFill>;
}

export function AuthShowcase() {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const reduced = useReducedMotion();
  const stopped = paused || !!reduced || hidden;
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (stopped) return;
    const timer = window.setInterval(() => setSlide((value) => (value + 1) % slides.length), 7000);
    return () => window.clearInterval(timer);
  }, [stopped, slide]);
  return <div className="auth-showcase" role="region" aria-roledescription="carousel" aria-label="SkyClip creative possibilities">
    <div className="auth-showcase-top"><span>MADE OF POSSIBILITIES</span><span>0{slide + 1} / 03</span></div>
    <div className="auth-film">
      <ShowcaseScene key={slide} stopped={stopped} width={COMP_W} height={COMP_H}><BrandFilm slide={slide}/></ShowcaseScene>
    </div>
    <div className="auth-slide-copy"><h2>{slides[slide].title}</h2><p>{slides[slide].description}</p></div>
    <div className="auth-slide-controls">
      <div className="flex gap-3">{slides.map((item, index) => <button key={item.label} type="button" className="auth-slide-dot" aria-label={"Show slide " + (index + 1) + ": " + item.label} aria-current={slide === index ? "true" : undefined} onClick={() => { setSlide(index); setPaused(true); }}><span /></button>)}</div>
      <Button variant="ghost" size="icon-sm" aria-label={paused ? "Play showcase" : "Pause showcase"} onClick={() => setPaused(!paused)}>{paused ? <Play/> : <Pause/>}</Button>
    </div>
    <div className="auth-benefits"><div><Sparkles/><span>Start with<br/>an idea</span></div><div><Captions/><span>Tell it in<br/>your voice</span></div><div><Film/><span>Make the<br/>final cut yours</span></div></div>
  </div>;
}
