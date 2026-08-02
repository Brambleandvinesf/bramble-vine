/**
 * In-app screenshot of the app's own rendered DOM (OO, 8/2).
 *
 * Deliberately dependency-free: the SVG <foreignObject> trick rather than
 * html2canvas or a CDN script. Three reasons —
 *   1. no new npm dependency, so it cannot break the Lovable build;
 *   2. no third-party JS is loaded into an app that renders client names,
 *      addresses and phone numbers;
 *   3. this app is styled almost entirely with inline style objects, which
 *      is exactly the case foreignObject reproduces faithfully (it is
 *      external stylesheets that it cannot see).
 *
 * If fidelity ever proves insufficient on a real screen, swapping in
 * html2canvas is a one-line package.json change — the caller contract
 * (returns base64 PNG, or null) does not change.
 *
 * Returns raw base64 (no data: prefix) or null. NEVER throws: a failed
 * capture must still let the report be filed.
 */
export async function captureScreenBase64(maxWidth = 900): Promise<string | null> {
  try {
    if (typeof document === "undefined") return null;
    const src = document.body;
    const rect = src.getBoundingClientRect();
    const w = Math.max(1, Math.min(Math.ceil(rect.width), 1400));
    // Cap the height so a long scrolling page can't produce a huge payload.
    const h = Math.max(1, Math.min(Math.ceil(rect.height), 2200));

    const clone = src.cloneNode(true) as HTMLElement;
    // Inputs don't serialise their live values via outerHTML.
    const srcFields = src.querySelectorAll("input, textarea");
    const cloneFields = clone.querySelectorAll("input, textarea");
    srcFields.forEach((el, i) => {
      const c = cloneFields[i] as HTMLInputElement | undefined;
      if (c && "value" in el) c.setAttribute("value", (el as HTMLInputElement).value ?? "");
    });
    // Drop anything that can't render inside foreignObject or would leak
    // a cross-origin fetch (which silently taints the canvas).
    clone.querySelectorAll("script, iframe, canvas, video").forEach((el) => el.remove());
    clone.querySelectorAll("img").forEach((el) => {
      const s = el.getAttribute("src") ?? "";
      if (!s.startsWith("data:")) el.remove();
    });

    const bg =
      getComputedStyle(src).backgroundColor && getComputedStyle(src).backgroundColor !== "rgba(0, 0, 0, 0)"
        ? getComputedStyle(src).backgroundColor
        : "#0a0a0a";

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<rect width="100%" height="100%" fill="${bg}"/>` +
      `<foreignObject width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;font-family:'Courier New',Courier,monospace">` +
      clone.innerHTML +
      `</div></foreignObject></svg>`;

    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    const img = new Image();
    img.decoding = "sync";
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
      // A malformed clone can leave onload/onerror unfired — don't hang.
      window.setTimeout(() => resolve(false), 4000);
    });
    if (!loaded) return null;

    const scale = Math.min(1, maxWidth / w);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    const comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : null;
  } catch {
    return null;
  }
}
