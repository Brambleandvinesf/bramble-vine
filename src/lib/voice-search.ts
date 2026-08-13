/* CC-56 Item 37 — speech capture + catalog matching for the ADD ITEM search field.
 *
 * WHY THIS IS A SEPARATE MODULE: ItemPicker is already the most-reused component in
 * the app (Projects, Confirm Load, Future Projects, the debrief). Six interaction
 * states and a Web Speech lifecycle inlined there would bury the picker's own logic.
 *
 * ⚠ THE MATCHING IS DELIBERATELY NOT DONE HERE. The Anthropic key lives in Script
 * Properties; doing this in the browser would ship that key inside a published PWA
 * where anyone can read it. So this captures speech, sends TEXT to the backend
 * `matchItemVoice` action, and receives ranked names back. The key never leaves the
 * server. See CC-54.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SCRIPT_URL } from "../routes/confirm";

export type VoiceMatch = { name: string; why: string };

/* The six states the UI has to express. `thinking` is separate from `listening`
 * because the round trip is a real wait — the crew must not think it is still
 * being heard. */
export type VoiceState =
  | "idle"
  | "listening"
  | "thinking"
  | "nospeech"
  | "denied"
  | "error"
  | "done";

/* Minimal shape of the Web Speech API — it is not in TS's DOM lib. */
type SpeechEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechErr = { error?: string };
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErr) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Capability check. The mic must NOT render at all where this is false — a dead
 *  control is worse than no control, and there is nothing the crew could do about
 *  it. Chrome-family only, which matches the crew's Android devices. */
export function voiceSupported(): boolean {
  return recognitionCtor() !== null;
}

export function useVoiceSearch() {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [matches, setMatches] = useState<VoiceMatch[]>([]);
  const [note, setNote] = useState("");
  const recRef = useRef<Recognition | null>(null);
  /* Guards a late callback from a recognition the user already dismissed. */
  const liveRef = useRef(false);

  useEffect(() => {
    return () => {
      liveRef.current = false;
      try { recRef.current?.abort(); } catch { /* already gone */ }
    };
  }, []);

  const reset = useCallback(() => {
    liveRef.current = false;
    try { recRef.current?.abort(); } catch { /* already gone */ }
    recRef.current = null;
    setState("idle");
    setTranscript("");
    setMatches([]);
    setNote("");
  }, []);

  const match = useCallback(async (said: string) => {
    setState("thinking");
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "matchItemVoice", transcript: said, limit: 5 }),
      });
      const j = (await res.json()) as { matches?: VoiceMatch[]; note?: string };
      if (!liveRef.current) return;
      setMatches(Array.isArray(j.matches) ? j.matches : []);
      setNote(String(j.note ?? ""));
      setState("done");
    } catch {
      if (!liveRef.current) return;
      /* Never an error the crew has to clear — typing was available throughout. */
      setMatches([]);
      setState("error");
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    try { recRef.current?.abort(); } catch { /* none yet */ }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    recRef.current = rec;
    liveRef.current = true;
    setMatches([]);
    setNote("");
    setTranscript("");

    let heard = "";
    rec.onresult = (e) => {
      heard = String(e.results?.[0]?.[0]?.transcript ?? "").trim();
      if (heard && liveRef.current) setTranscript(heard);
    };
    rec.onerror = (e) => {
      if (!liveRef.current) return;
      const kind = String(e?.error ?? "");
      /* 'not-allowed' and 'service-not-allowed' are the permission denials. They are
         terminal for this attempt — the browser will not re-prompt — so the UI has to
         say so rather than look like it is still listening. */
      if (kind === "not-allowed" || kind === "service-not-allowed") setState("denied");
      else if (kind === "no-speech") setState("nospeech");
      else setState("error");
    };
    rec.onend = () => {
      if (!liveRef.current) return;
      /* onend fires after onerror too, so only advance from a state that is still
         waiting — otherwise a denial would be overwritten by "no speech". */
      setState((s) => {
        if (s !== "listening") return s;
        if (!heard) return "nospeech";
        void match(heard);
        return "thinking";
      });
    };

    setState("listening");
    try { rec.start(); } catch { setState("error"); }
  }, [match]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  return { state, transcript, matches, note, start, stop, reset };
}
