/** Fonts are local assets shared with the cloud rasterizer, never a network CSS dependency. */
export function ensureEngineFontsLoaded(): void {
  if (typeof document === "undefined" || document.getElementById("hanuman-engine-fonts")) return;
  const style = document.createElement("style");
  style.id = "hanuman-engine-fonts";
  style.textContent = `
    @font-face{font-family:Lato;src:url('/fonts/engine/Lato-Regular.ttf') format('truetype');font-weight:400;font-display:block}
    @font-face{font-family:Lato;src:url('/fonts/engine/Lato-Bold.ttf') format('truetype');font-weight:500 900;font-display:block}
    @font-face{font-family:'Instrument Serif';src:url('/fonts/engine/InstrumentSerif-Regular.ttf') format('truetype');font-weight:400 900;font-display:block}
  `;
  const families = [
    ["Inter", "Inter"], ["Montserrat", "Montserrat"], ["Oswald", "Oswald"],
    ["Roboto Condensed", "RobotoCondensed"], ["Playfair Display", "PlayfairDisplay"],
    ["Lora", "Lora"], ["Space Grotesk", "SpaceGrotesk"],
  ];
  for (const [family, file] of families) {
    style.textContent += `@font-face{font-family:'${family}';src:url('/fonts/engine/${file}-Regular.ttf') format('truetype');font-weight:400;font-display:block}`;
    style.textContent += `@font-face{font-family:'${family}';src:url('/fonts/engine/${file}-Bold.ttf') format('truetype');font-weight:700;font-display:block}`;
  }
  style.textContent += `@font-face{font-family:'Bebas Neue';src:url('/fonts/engine/BebasNeue-Regular.ttf') format('truetype');font-weight:400 900;font-display:block}`;
  for (const script of ["Devanagari", "Telugu", "Tamil", "Kannada", "Malayalam", "Bengali", "Gujarati", "Gurmukhi"]) {
    for (const [fileWeight, weight] of [["Regular", 400], ["Bold", 700]]) {
      style.textContent += `@font-face{font-family:'Noto Sans ${script}';src:url('/fonts/engine/NotoSans${script}-${fileWeight}.ttf') format('truetype');font-weight:${weight};font-display:block}`;
    }
  }
  document.head.appendChild(style);
}
