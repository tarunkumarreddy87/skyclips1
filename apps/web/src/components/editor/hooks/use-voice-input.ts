"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

/** Voice supplies the same editable prompt as typing; only Send applies operations. */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const recognitionRef = useRef<Recognition | null>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    const host = window as VoiceWindow;
    setSupported(Boolean(host.SpeechRecognition || host.webkitSpeechRecognition));
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      }
    };
  }, []);
  const stop = useCallback(() => recognitionRef.current?.stop(), []);
  const start = useCallback(() => {
    const host = window as VoiceWindow;
    const Constructor = host.SpeechRecognition || host.webkitSpeechRecognition;
    if (!Constructor || recognitionRef.current) return;
    // Browser speech recognition may use the browser vendor's online service.
    toast.message("Voice input", { description: "Your browser may process speech online. Review the transcript before sending an edit." });
    const recognition = new Constructor();
    recognitionRef.current = recognition;
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (text) callbackRef.current(text);
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") toast.error(event.error === "not-allowed"
        ? "Microphone permission was denied. You can still type your edit."
        : "Speech recognition failed. Please retry or type your edit.");
    };
    recognition.onend = () => { recognitionRef.current = null; setListening(false); };
    try { recognition.start(); setListening(true); }
    catch { recognitionRef.current = null; setListening(false); toast.error("Voice input could not start."); }
  }, []);
  return { supported, listening, start, stop };
}
