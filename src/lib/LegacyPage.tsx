import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Mounts a legacy vanilla-HTML/JS page inside the React tree.
 *
 * We keep the original HTML source in `src/legacy/*.html` (imported via `?raw`)
 * so the pages stay 1:1 with the working versions the user provided — same
 * DOM, same styles, same fetch calls to Apps Script / Make webhooks /
 * Google Calendar. Only the shell around them is React.
 *
 * SSR: renders nothing (returns a blank container) — legacy scripts touch
 * `window`/`document` directly and would crash server-side. The real content
 * appears after hydration on the client.
 */
export function LegacyPage({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const { styleCss, bodyHtml, scriptSrc } = useMemo(() => parseHtml(html), [html]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;
    // Update <title> to match the legacy page.
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const prevTitle = document.title;
    if (titleMatch) document.title = decodeEntities(titleMatch[1].trim());

    // Inject the page's stylesheet, scoped to a stable id so navigation replaces it.
    const STYLE_ID = "legacy-page-style";
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = styleCss;

    // Set body HTML.
    containerRef.current.innerHTML = bodyHtml;

    // Execute each <script>. Wrap in an IIFE so top-level `const`/`let`
    // declarations don't collide across page navigations.
    const cleanups: Array<() => void> = [];
    for (const src of scriptSrc) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        new Function(`"use strict";(function(){\n${src}\n})();`)();
      } catch (err) {
        console.error("[legacy-page] script error", err);
      }
    }

    return () => {
      document.title = prevTitle;
      cleanups.forEach((fn) => fn());
    };
  }, [mounted, styleCss, bodyHtml, scriptSrc, html]);

  return <div ref={containerRef} />;
}

function parseHtml(html: string): {
  styleCss: string;
  bodyHtml: string;
  scriptSrc: string[];
} {
  const styles: string[] = [];
  const scripts: string[] = [];

  // Extract <style>…</style>
  let bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : html;

  // Pull all <style> blocks from anywhere in the source
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRegex.exec(html)) !== null) styles.push(m[1]);

  // Pull all inline <script> blocks from the body (skip external src)
  const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = scriptRegex.exec(body)) !== null) scripts.push(m[1]);

  // Strip <script> from body HTML so they don't render as raw text
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "");

  return { styleCss: styles.join("\n"), bodyHtml: body, scriptSrc: scripts };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
