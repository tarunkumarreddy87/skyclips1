"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowUp, ArrowUpRight, FileText, Film, Plus, X } from "lucide-react";
import { landingMedia } from "./landing-media-data";

export { landingMedia } from "./landing-media-data";

export function LandingScrollStory() {
  const root = useRef<HTMLElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [activeSkill, setActiveSkill] = useState(0);
  const [prompt, setPrompt] = useState("");
  const typingTimer = useRef<number | null>(null);
  const stopTyping = () => { if (typingTimer.current !== null) window.clearInterval(typingTimer.current); typingTimer.current = null; };
  const [attachments, setAttachments] = useState<File[]>([]);

  function addAttachments(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    setAttachments(current => [...current, ...incoming].slice(0, 4));
    event.target.value = "";
  }

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams({ prompt: prompt.trim() });
    if (attachments.length) query.set("attachmentName", attachments.map(file => file.name).join(", "));
    window.location.assign(`/studio?${query.toString()}`);
  }
  useEffect(() => {
    const sample = "Create a cinematic story about the world we live in.";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPrompt(sample); return; }
    const textarea = root.current?.querySelector(".sc-journey-composer textarea");
    if (!textarea) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) return;
      observer.disconnect();
      let index = 0;
      typingTimer.current = window.setInterval(() => {
        index += 1;
        setPrompt(sample.slice(0, index));
        if (index >= sample.length) stopTyping();
      }, 45);
    }, { threshold: .4 });
    observer.observe(textarea);
    return () => { observer.disconnect(); stopTyping(); };
  }, []);
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add({ desktop: "(min-width: 701px)", mobile: "(max-width: 700px)", motion: "(prefers-reduced-motion: no-preference)" }, context => {
      if (!context.conditions?.motion) return;
      const desktop = context.conditions.desktop;
      const ctx = gsap.context(() => {
        const storyStage = root.current?.querySelector<HTMLElement>(".sc-journey-stage");
        const storyCards = gsap.utils.toArray<HTMLElement>(".sc-journey-card", root.current!);
        if (storyStage) {
          const timeline = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: storyStage, start: "top top", end: desktop ? "+=430%" : "+=300%", scrub: .65, pin: true, invalidateOnRefresh: true, anticipatePin: 1, onUpdate: self => { const prompt = storyStage.querySelector<HTMLElement>(".sc-journey-prompt"); const result = storyStage.querySelector<HTMLElement>(".sc-journey-result"); if (prompt) prompt.inert = self.progress > .2; if (result) result.inert = self.progress < .8; } } });
          timeline.to(".sc-journey-prompt", { opacity: 0, scale: .92, y: -55, duration: .8 }, .35)
            .to(".sc-journey-hint", { opacity: 0, duration: .3 }, .3);
          storyCards.forEach((card, i) => {
            timeline.fromTo(card, { y: () => window.innerHeight * 1.15 }, { y: 0, duration: 1.25 }, .8 + (i % 3) * .12);
          });
          timeline.to(".sc-journey-wall", { y: () => -window.innerHeight * .62, scale: 1.12, duration: 2 }, 2.3)
            .to(".sc-journey-card:nth-child(3n+2)", { y: () => -window.innerHeight * .14, duration: 2 }, 2.3)
            .to(".sc-journey-card", { x: (i: number) => i % 3 === 0 ? -window.innerWidth * .12 : i % 3 === 2 ? window.innerWidth * .12 : 0, opacity: .55, duration: .9 }, 4.1)
            .to(".sc-journey-card:nth-child(3n+2)", { y: (i: number) => (i < 2 ? -1 : 1) * window.innerHeight, duration: .9 }, 4.1)
            .fromTo(".sc-journey-result", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .8 }, 4.3)
            .to({}, { duration: .8 });
        }
        const skillStage = root.current?.querySelector<HTMLElement>(".sc-skills-stage");
        if (skillStage && desktop) {
          gsap.fromTo(".sc-skill-list", { y: 48 }, { y: -48, ease: "none", scrollTrigger: { trigger: skillStage, start: "top top", end: "+=200%", scrub: .5, pin: true, invalidateOnRefresh: true, onUpdate: self => setActiveSkill(Math.min(3, Math.floor(self.progress * 4))) } });
        }

      }, root);
      return () => { ctx.revert(); root.current?.querySelectorAll<HTMLElement>(".sc-journey-prompt, .sc-journey-result").forEach(element => { element.inert = false; }); };
    });
    return () => mm.revert();
  }, []);
  return <section className="sc-scroll-experience" ref={root} aria-label="From prompt to cinematic stories">
    <div className="sc-journey-stage">
      <div className="sc-journey-prompt"><h2>One prompt in.</h2><form className="sc-journey-composer" onSubmit={submitPrompt}>
        <div className="sc-journey-files">
          {attachments.map((file, index) => <span className="sc-journey-file" key={`${file.name}-${index}`}><FileText /><span title={file.name}>{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments(current => current.filter((_, fileIndex) => fileIndex !== index))}><X /></button></span>)}
        </div>
        <textarea value={prompt} onFocus={stopTyping} onChange={event => { stopTyping(); setPrompt(event.target.value); }} maxLength={3600} aria-label="Describe the video you want to create" placeholder="What shall we create together?" />
        <input ref={uploadInput} className="sc-journey-upload" type="file" multiple accept="image/*,video/*,text/plain,.md,application/pdf" onChange={addAttachments} />
        <div className="sc-journey-composer-actions"><button className="sc-journey-attach" type="button" aria-label="Attach reference files" onClick={() => uploadInput.current?.click()}><Plus /></button><span className="sc-journey-composer-note">{attachments.length ? `${attachments.length} reference${attachments.length === 1 ? "" : "s"} selected` : "Add a prompt or attach references"}</span><button className="sc-journey-submit" type="submit" aria-label="Continue to create video" disabled={!prompt.trim()}><ArrowUp /></button></div>
      </form></div>
      <div className="sc-journey-wall" aria-label="The thumbnails you provided">{landingMedia.map(item=><div className="sc-journey-card" key={item.label}><img src={item.image} alt={item.label} loading="lazy" /></div>)}</div>
      <div className="sc-journey-result"><h2>A whole story out.</h2><p>Scenes, narration, captions, and motion.<br />One idea, brought together in your timeline.</p><a className="sc-text-link" href="/studio">Create your story <ArrowUpRight /></a></div>
      <span className="sc-journey-hint">Keep scrolling</span>
    </div>
    <section className="sc-skills-stage" aria-label="Creative editing capabilities"><div className="sc-skills-heading"><p className="sc-eyebrow">CREATIVE TOOLS</p><h2>A new direction for<br />every creative task.</h2></div><div className="sc-skill-gallery">{[0,1,2,3].map(index=><div className={`sc-skill-scene ${activeSkill===index ? "is-active" : ""}`} aria-hidden={activeSkill!==index} key={index}>{[0,1,2,3].map(offset=>{const item=landingMedia[(index*2+offset)%landingMedia.length];return <div className={`sc-skill-visual sc-skill-visual-${offset}`} key={offset}><img src={item.image} alt="" loading="lazy" /></div>})}</div>)}<div className="sc-skill-list">{["story-direction","scene-editing","motion-design","captions-and-sound"].map((label,index)=><a href={`/studio?prompt=${encodeURIComponent(`Create a cinematic video with ${label.replaceAll("-"," ")}.`)}`} className={activeSkill===index?"is-active":""} key={label} onFocus={()=>setActiveSkill(index)} onMouseEnter={()=>setActiveSkill(index)}><span>/{label}</span><ArrowUpRight /></a>)}</div></div></section>
  </section>;
}
