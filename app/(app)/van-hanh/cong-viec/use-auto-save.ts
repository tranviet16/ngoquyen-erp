"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutoSave<T>(
  value: T,
  saver: (v: T) => Promise<void>,
  delay = 800,
): { status: AutoSaveStatus; retry: () => void; flush: () => Promise<void> } {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const lastSavedRef = useRef<T>(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T>(value);
  const saverRef = useRef(saver);
  saverRef.current = saver;

  const doSave = useCallback(async (v: T) => {
    setStatus("saving");
    try {
      await saverRef.current(v);
      lastSavedRef.current = v;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    pendingRef.current = value;
    if (JSON.stringify(value) === JSON.stringify(lastSavedRef.current)) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      void doSave(value);
    }, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, delay, doSave]);

  const retry = useCallback(() => {
    void doSave(pendingRef.current);
  }, [doSave]);

  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (JSON.stringify(pendingRef.current) !== JSON.stringify(lastSavedRef.current)) {
      await doSave(pendingRef.current);
    }
  }, [doSave]);

  return { status, retry, flush };
}
