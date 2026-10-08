"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { landingMedia } from "./landing-scroll-story";

const gallery = landingMedia;

export function LandingMediaGallery() {
  const root = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 701px) and (prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        const cards = gsap.utils.toArray<HTMLElement>(".sc-medium-card");
        const position = { value: 0 };
        const draw = () => {
          setActive(Math.round(position.value));
          cards.forEach((card, index) => {
            const distance = index - position.value;
            const depth = Math.min(Math.abs(distance), 4);
            gsap.set(card, {
              x: distance * (card.offsetWidth * .94),
              yPercent: -50,
              scale: Math.pow(.76, depth),
              opacity: depth > 3 ? 0 : 1,
              zIndex: Math.round(20 - depth * 3),
            });
            card.inert = depth > 2.8;
          });
        };
        draw();
        gsap.to(position, {
          value: cards.length - 1, ease: "none", onUpdate: draw,
          scrollTrigger: { trigger: root.current, start: "top top", end: "+=240%", pin: true, scrub: .65, invalidateOnRefresh: true },
        });
      }, root);
      return () => {
        ctx.revert();
        root.current?.querySelectorAll<HTMLElement>(".sc-medium-card").forEach(card => { card.inert = false; card.removeAttribute("style"); });
      };
    });
    return () => mm.revert();
  }, []);

  function step(direction: number) {
    const next = Math.max(0, Math.min(gallery.length - 1, active + direction));
    rail.current?.children[next]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setActive(next);
  }

  function syncVisibleCard() {
    const element = rail.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;
    const center = element.getBoundingClientRect().left + element.clientWidth / 2;
    let closest = 0;
    let distance = Infinity;
    Array.from(element.children).forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const delta = Math.abs(rect.left + rect.width / 2 - center);
      if (delta < distance) { distance = delta; closest = index; }
    });
    setActive(closest);
  }

  return <section className="sc-medium-section" ref={root} aria-label="Your video thumbnail gallery">
    <div className="sc-section-heading">
      <p className="sc-eyebrow">21 THUMBNAILS · YOUR CREATIVE STARTING POINT</p>
      <h2>Start with an image.<br />Find the story inside.</h2>
      <p>Every thumbnail you shared, ready to inspire your next documentary,<br />explainer, biography, or creative video.</p>
    </div>
    <div className="sc-medium-rail" ref={rail} onScroll={syncVisibleCard}>
      {gallery.map((item, index) => <a
        className={`sc-medium-card ${index === active ? "is-active" : ""}`}
        key={item.label}
        href={`/studio?prompt=${encodeURIComponent(item.prompt)}`}
        onFocus={() => setActive(index)}
      >
        <div><img src={item.image} alt={item.label} loading="lazy" /><span><ArrowUpRight /></span></div>
        <p>{item.label}<small>{item.kind}</small></p>
      </a>)}
    </div>
    <p className="sc-medium-caption">Create with <strong>{gallery[active].kind}</strong> on SkyClip</p>
    <div className="sc-medium-controls"><button aria-label="Previous example" onClick={() => step(-1)} disabled={active === 0}><ArrowLeft /></button><button aria-label="Next example" onClick={() => step(1)} disabled={active === gallery.length - 1}><ArrowRight /></button></div>
  </section>;
}
