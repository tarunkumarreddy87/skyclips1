"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowUp, ArrowUpRight, Check, Film, Menu, Play, Plus, Scissors, Sparkles, X } from "lucide-react";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { LandingScrollStory } from "./landing-scroll-story";
import { LandingFeatures } from "./landing-features";
import { LandingMediaGallery } from "./landing-media-gallery";
import { landingMedia } from "./landing-media-data";
import "./landing-studio.css";

type Page = "home" | "tools" | "explore" | "pricing";
const stories = [
  { category: "History", title: "The Maratha story.", image: landingMedia[10].image, prompt: landingMedia[10].prompt, tone: "history", caption: "A KINGDOM THAT CHANGED HISTORY" },
  { category: "Art & science", title: "Leonardo’s curious mind.", image: landingMedia[13].image, prompt: landingMedia[13].prompt, tone: "ideas", caption: "ART. SCIENCE. IMAGINATION." },
  { category: "Psychology", title: "A mindset can change.", image: landingMedia[8].image, prompt: landingMedia[8].prompt, tone: "design", caption: "A DIFFERENT WAY FORWARD" },
];
const tools = [
  { name: "Story generation", description: "Turn your brief into a structured video story, with narration and scenes.", icon: Sparkles, image: landingMedia[1].image, prompt: landingMedia[1].prompt },
  { name: "Agent editing", description: "Describe a change. Review the plan, then apply it to your timeline.", icon: Scissors, image: landingMedia[10].image, prompt: landingMedia[10].prompt },
  { name: "Motion & titles", description: "Give your ideas a visual voice with editable animated typography.", icon: Film, image: landingMedia[15].image, prompt: landingMedia[15].prompt },
  { name: "Captions & narration", description: "Build a story people can follow, with voice, captions, and sound.", icon: Play, image: landingMedia[2].image, prompt: landingMedia[2].prompt },
];
const categories = ["All", ...new Set(landingMedia.map(item => item.kind))];
const faq = [
  ["What can I create with SkyClip?", "Start with a documentary or listicle, then refine clips, narration, captions, and motion in the studio."],
  ["Can I edit the generated video?", "Yes. Use the multi-track timeline or ask the agent to make a change. Plan mode lets you review proposed edits before applying them."],
  ["Are these examples real projects?", "The examples use the thumbnails you provided as inspiration. Your own projects open in the studio."],
  ["How do plans work?", "Monthly plans include a credit allowance. Review the current plan details and checkout availability in your account before subscribing."],
];
const createHref = (prompt: string) => `/studio?prompt=${encodeURIComponent(prompt)}`;

function SkyClipLogo({ footer = false }: { footer?: boolean }) {
  return <span className={`sc-logo-lockup${footer ? " sc-logo-footer" : ""}`}>
    <svg viewBox="0 0 52 52" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M12 3.5a4.5 4.5 0 0 0-6.8 3.9v17.4c0 2 1 3.7 2.8 4.7l14.1 8.1-5.4-10.1c-2.1-4-.2-8.7 4.1-9.4 1.8-.3 3.3.1 5.1 1.1L46 30v-7.2c0-2.1-1.1-4-2.9-5.1L12 3.5Z" />
      <path d="m20.1 24.5 22.8 10.3a4.7 4.7 0 0 1 0 8.5L8.2 50a4.5 4.5 0 0 1-4.7-4.5v-4.4l21-9.1-4.4-7.5Z" />
    </svg><span>skyclip</span>
  </span>;
}

export function LandingStudio({ page = "home" }: { page?: Page }) {
  const root = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState("All");
  const [prompt, setPrompt] = useState("");
  const scene = stories[selected];
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const headerTrigger = ScrollTrigger.create({ start: 80, end: "max", onUpdate: self => setCompactHeader(self.scroll() > 80) });
    setCompactHeader(window.scrollY > 80);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        gsap.from(".sc-hero-reveal", { y: 22, stagger: .12, duration: .9, ease: "power3.out" });
        gsap.utils.toArray<HTMLElement>(".sc-reveal").forEach(element => gsap.from(element, { y: 36, opacity: 0, duration: .8, ease: "power2.out", scrollTrigger: { trigger: element, start: "top 92%", once: true } }));
        gsap.from(".sc-demo-chat > *", { y: 14, opacity: 0, stagger: .13, duration: .65, ease: "power2.out", scrollTrigger: { trigger: ".sc-showcase", start: "top 80%", once: true } });
        gsap.to(".sc-orbit-one", { y: -18, rotation: 3, repeat: -1, yoyo: true, duration: 4, ease: "sine.inOut" });
        gsap.to(".sc-orbit-two", { y: 16, rotation: -3, repeat: -1, yoyo: true, duration: 5, ease: "sine.inOut" });
      }, root);
      return () => ctx.revert();
    });
    return () => { headerTrigger.kill(); mm.revert(); };
  }, [page]);
  useEffect(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => { gsap.from(".sc-scene-image", { opacity: .2, scale: 1.025, duration: .6, ease: "power2.out" }); }, root);
    return () => ctx.revert();
  }, [selected]);
  const nav = (["home", "tools", "explore", "pricing"] as Page[]).map(item => <Link key={item} href={item === "home" ? "/" : `/${item}`} aria-current={page === item ? "page" : undefined} onClick={() => setMobile(false)}>{item[0].toUpperCase() + item.slice(1)}</Link>);
  return <div ref={root} className="sc-site" data-theme="dark">
    <div className="sc-nav-shell"><header className={`sc-nav ${compactHeader ? "sc-nav-compact" : ""}`}><Link href="/" aria-label="SkyClip home"><SkyClipLogo /></Link><nav aria-label="Main navigation">{nav}</nav><div className="sc-nav-actions"><Link className="sc-button sc-small" href="/studio">Get started <ArrowUpRight /></Link><button className="sc-icon sc-mobile-toggle" onClick={() => setMobile(!mobile)} aria-expanded={mobile} aria-controls="sc-mobile-nav" aria-label={mobile ? "Close navigation" : "Open navigation"}>{mobile ? <X /> : <Menu />}</button></div>{mobile && <nav id="sc-mobile-nav" aria-label="Mobile navigation">{nav}</nav>}</header></div>
    <main>
      <section className={`sc-hero ${page !== "home" ? "sc-inner-hero" : ""}`}>
        <p className="sc-eyebrow sc-hero-reveal">{page === "home" ? "YOUR AI VIDEO PARTNER" : page === "tools" ? "YOUR CREATIVE TOOLKIT" : page === "explore" ? "A LITTLE INSPIRATION" : "MORE ROOM TO CREATE"}</p>
        <h1 className="sc-hero-reveal">{page === "home" ? <>Your AI video partner.<br /><em>Just create.</em></> : page === "tools" ? <>Less busywork.<br /><em>More creative possibility.</em></> : page === "explore" ? <>Your next story<br /><em>starts here.</em></> : <>Big ideas.<br /><em>A plan to match.</em></>}</h1>
        <p className="sc-hero-copy sc-hero-reveal">{page === "home" ? <>Turn your ideas into videos worth watching.<br />Imagine, create, and edit. All in one place.</> : page === "tools" ? "Everything you need to take a story from its first spark to the final cut." : page === "explore" ? "Explore sample briefs, cinematic directions, and motion made for your story." : "Choose your creative capacity. Simple monthly plans, with room to grow."}</p>
        {page === "home" && <Link href="/studio" className="sc-button sc-hero-reveal">Create your story <ArrowUpRight /></Link>}
      </section>
      {page === "home" && <>
        <section className={`sc-showcase-wrap ${scene.tone}`} aria-label="Interactive studio preview">
          <div className="sc-showcase sc-reveal"><div className="sc-showcase-top"><span><Film /> {scene.title}</span><span className="sc-preview-label">YOUR THUMBNAILS · INTERACTIVE PREVIEW</span></div>
            <div className="sc-showcase-body"><aside className="sc-demo-chat"><span className="sc-demo-agent"><img src="/agent/creative-companion.gif" alt="" />SkyClip Agent</span><p className="sc-demo-request">{scene.prompt}</p><div className="sc-demo-steps"><span><Check /> Story direction</span><span><Check /> Visual atmosphere</span><span><Check /> Timeline & captions</span></div><p className="sc-demo-answer">A story with a strong opening, a clear narrative, and room for your own finishing touch.</p><form onSubmit={event => { event.preventDefault(); window.location.assign(createHref(prompt || scene.prompt)); }} className="sc-demo-input"><input value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="What shall we create?" aria-label="Your video idea" maxLength={3600} /><div><span>16:9 · Video</span><button aria-label="Create this video"><ArrowUp /></button></div></form></aside>
            <div className="sc-demo-canvas"><div className="sc-scene"><img key={scene.image} className="sc-scene-image" src={scene.image} alt={scene.title} fetchPriority="high" /><div className="sc-scene-overlay"><small>SKYCLIP ORIGINALS / 0{selected + 1}</small><h2>{scene.caption}</h2><span>Every great story starts with a spark.</span></div><span className="sc-ratio">16:9</span></div><div className="sc-demo-timeline" aria-hidden="true">{Array.from({length:8},(_,index)=><span key={index} style={{backgroundImage:`url(${scene.image})`}} />)}<div className="sc-wave" /></div><div className="sc-tabs" role="group" aria-label="Sample story category">{stories.map((story,index)=><button key={story.category} aria-pressed={selected===index} onClick={()=>setSelected(index)}>{story.category}<span /></button>)}</div></div>
          </div></div>
        </section>
        <div className="sc-creator-note"><div aria-hidden="true"><Film /><Sparkles /><Scissors /><Check /></div><p>For curious minds, independent creators, and stories that deserve to be told.</p></div>
        <LandingScrollStory />
        <LandingFeatures />
        <LandingMediaGallery />
      </>}
      {page === "tools" && <section className="sc-section sc-reveal" id="tools"><div className="sc-section-heading"><p className="sc-eyebrow">THE CREATIVE TOOLKIT</p><h2>Creation, <em>beyond generation.</em></h2><p>Go from “what if” to the final frame, with control at every step.</p></div><div className="sc-tools-grid">{tools.map(tool=><article className="sc-tool-card" key={tool.name}><div className="sc-media"><img src={tool.image} alt={`${tool.name} sample thumbnail`} loading="lazy" /></div><div className="sc-tool-info"><tool.icon /><h3>{tool.name}</h3><p>{tool.description}</p><Link href={createHref(tool.prompt)}>Open studio <ArrowUpRight /></Link></div></article>)}</div></section>}
      {page === "explore" && <section className="sc-section sc-reveal" id="explore"><div className="sc-section-heading sc-heading-row"><div><p className="sc-eyebrow">MADE FOR YOUR IMAGINATION</p><h2>A direction for <em>every story.</em></h2></div></div><div className="sc-filter" aria-label="Filter examples">{categories.map(category=><button key={category} aria-pressed={filter===category} onClick={()=>setFilter(category)}>{category}</button>)}</div><div className="sc-explore-grid">{landingMedia.filter(story=>filter==="All"||filter===story.kind).map(story=><Link href={createHref(story.prompt)} className="sc-explore-card" key={story.label}><div className="sc-media"><img src={story.image} alt={story.label} loading="lazy" /><span className="sc-card-arrow"><ArrowUpRight /></span></div><div><small>{story.kind.toUpperCase()} · YOUR THUMBNAIL · 16:9</small><h3>{story.label}</h3></div></Link>)}</div></section>}
      {page === "pricing" && <section className="sc-section sc-pricing-section sc-reveal" id="pricing"><div className="sc-section-heading"><p className="sc-eyebrow">YOUR NEXT CHAPTER</p><h2>Creative freedom.<br /><em>Room to grow.</em></h2><p>Monthly plans for every stage of your creative journey.</p></div><div className="sc-pricing-grid">{BILLING_PLANS.map(plan=><article key={plan.id} className={`sc-plan ${plan.id==="creator"?"sc-plan-featured":""}`}>{plan.id==="creator" && <span className="sc-popular">FOR REGULAR CREATORS</span>}<h3>{plan.name}</h3><p>{plan.description}</p><div className="sc-price">${plan.price}<small>/ month</small></div><Link href="/settings/billing" className="sc-button">View {plan.name} plan <ArrowUpRight /></Link><ul><li><Check />{plan.credits.toLocaleString("en-US")} credits per month</li><li><Check />Story generation</li><li><Check />Multi-track timeline editor</li><li><Check />Agent-assisted edits</li></ul></article>)}</div><p className="sc-billing-note">Plan availability and checkout details are shown in your account.</p></section>}
      <section className="sc-section sc-faq sc-reveal"><h2>Frequently asked questions.</h2><div>{faq.map(([question,answer])=><details key={question}><summary>{question}<Plus /></summary><p>{answer}</p></details>)}</div></section>
      <section className={`sc-final sc-reveal ${page === "home" ? "sc-final-visual" : ""} ${page === "tools" ? "sc-final-tools" : ""}`}>
        {page === "home" && <img className="sc-final-bg-image" src={landingMedia[13].image} alt="" aria-hidden="true" loading="lazy" />}
        <div className="sc-final-content"><span className="sc-final-symbol" aria-hidden="true"><Sparkles /></span><h2>Make something<br /><em>worth watching.</em></h2><p>Your next story starts with SkyClip.</p><Link href="/studio" className="sc-button">Start creating <ArrowUpRight /></Link></div>
      </section>
    </main>
    <footer className="sc-footer"><div><Link href="/" aria-label="SkyClip home"><SkyClipLogo footer /></Link><p>A little imagination.<br />A whole new perspective.</p></div><div><span>CREATE</span><Link href="/studio">Studio</Link><Link href="/tools">Tools</Link><Link href="/explore">Explore</Link></div><div><span>SKYCLIP</span><Link href="/pricing">Pricing</Link><Link href="/terms">Terms of service</Link><Link href="/privacy">Privacy policy</Link></div><div className="sc-footer-bottom"><small>© SkyClip. Made for stories.</small></div></footer>
  </div>;
}
