// Paper grain and worn-ink speckle, made once at start-up with a canvas (no image files to download).
// Exposed as CSS variables: --grain (overlay for posters and passport pages) and --speckle (stamp mask).
export function installTextures() {
  try {
    const size = 160;
    const make = (paint: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d");
      if (!g) return null;
      paint(g);
      return c.toDataURL("image/png");
    };
    const grain = make((g) => {
      const img = g.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 18 + Math.random() * 26;
      }
      g.putImageData(img, 0, 0);
    });
    const speckle = make((g) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, size, size);
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 900; i++) {
        g.globalAlpha = 0.25 + Math.random() * 0.6;
        g.beginPath();
        g.arc(Math.random() * size, Math.random() * size, Math.random() * 1.6 + 0.3, 0, Math.PI * 2);
        g.fill();
      }
    });
    const root = document.documentElement.style;
    if (grain) root.setProperty("--grain", `url(${grain})`);
    if (speckle) root.setProperty("--speckle", `url(${speckle})`);
  } catch {
    // no canvas (very old browser or a test runner): flat colours are fine
  }
}
