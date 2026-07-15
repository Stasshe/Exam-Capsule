"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { JsonObject } from "@/lib/evidence";
import { messageFromError } from "@/lib/errors";
import { appendEvidence, countPending, flushEvidence, initializeOutbox } from "@/lib/outbox";
import type { Question } from "@/lib/questions";

type ExamState = {
  id: string;
  candidateName: string;
  status: "active" | "submitted";
  question: Question | null;
  questionNumber: number;
  questionCount: number;
  answeredCount?: number;
  score?: number | null;
};

type SessionCredentials = {
  sessionId: string;
  token: string;
  challenge: string;
  candidateName: string;
};

type KeyboardNavigator = Navigator & {
  keyboard?: {
    lock(keys?: string[]): Promise<void>;
  };
};

const sessionStorageKey = "exam-capsule-session";

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null && "error" in body) {
    const message = Reflect.get(body, "error");
    if (typeof message === "string") {
      return message;
    }
  }
  return `Request failed with status ${response.status}.`;
}

function sessionHeaders(credentials: SessionCredentials): HeadersInit {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${credentials.token}`,
    "x-exam-session": credentials.sessionId,
  };
}

function parseStoredCredentials(): SessionCredentials | null {
  const stored = sessionStorage.getItem(sessionStorageKey);
  if (!stored) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(stored);
    if (
      typeof value === "object" &&
      value !== null &&
      "sessionId" in value &&
      "token" in value &&
      "challenge" in value &&
      "candidateName" in value
    ) {
      const sessionId = Reflect.get(value, "sessionId");
      const token = Reflect.get(value, "token");
      const challenge = Reflect.get(value, "challenge");
      const candidateName = Reflect.get(value, "candidateName");
      if (
        typeof sessionId === "string" &&
        typeof token === "string" &&
        typeof challenge === "string" &&
        typeof candidateName === "string"
      ) {
        return { sessionId, token, challenge, candidateName };
      }
    }
  } catch {
    sessionStorage.removeItem(sessionStorageKey);
  }
  return null;
}

export default function Home() {
  const [candidateName, setCandidateName] = useState("");
  const [credentials, setCredentials] = useState<SessionCredentials | null>(null);
  const [exam, setExam] = useState<ExamState | null>(null);
  const [selectedOption, setSelectedOption] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingEvents, setPendingEvents] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [keyboardLocked, setKeyboardLocked] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const resizeTimer = useRef<number | null>(null);

  const refreshPending = useCallback(async (sessionId: string) => {
    setPendingEvents(await countPending(sessionId));
  }, []);

  const record = useCallback(
    async (type: string, payload: JsonObject = {}) => {
      if (!credentials) {
        return;
      }
      try {
        await appendEvidence(credentials.sessionId, type, payload);
        await refreshPending(credentials.sessionId);
      } catch (recordError) {
        setError(messageFromError(recordError, "Evidence recording failed."));
      }
    },
    [credentials, refreshPending],
  );

  const flush = useCallback(async () => {
    if (!credentials) {
      return;
    }
    try {
      await flushEvidence(credentials);
      await refreshPending(credentials.sessionId);
    } catch (flushError) {
      setError(messageFromError(flushError, "Evidence delivery failed."));
    }
  }, [credentials, refreshPending]);

  useEffect(() => {
    const stored = parseStoredCredentials();
    if (!stored) {
      return;
    }

    const restore = async () => {
      setBusy(true);
      try {
        await initializeOutbox(stored.sessionId, stored.challenge);
        const response = await fetch("/api/exam", { headers: sessionHeaders(stored) });
        if (!response.ok) {
          throw new Error(await readError(response));
        }
        const restoredExam = (await response.json()) as ExamState;
        setCredentials(stored);
        setCandidateName(stored.candidateName);
        setExam(restoredExam);
        await refreshPending(stored.sessionId);
      } catch (restoreError) {
        sessionStorage.removeItem(sessionStorageKey);
        setError(messageFromError(restoreError, "Session restoration failed."));
      } finally {
        setBusy(false);
      }
    };
    void restore();
  }, [refreshPending]);

  useEffect(() => {
    if (!credentials || exam?.status !== "active") {
      return;
    }

    const interval = window.setInterval(() => void flush(), 2000);
    return () => window.clearInterval(interval);
  }, [credentials, exam?.status, flush]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!credentials || exam?.status !== "active") {
      return;
    }

    const onVisibility = () => {
      let type = "document.visible";
      if (document.hidden) {
        type = "document.hidden";
      }
      void record(type);
    };
    const onFullscreen = () => {
      const active = document.fullscreenElement !== null;
      setFullscreen(active);
      if (active) {
        void record("fullscreen.enter");
        return;
      }
      void record("fullscreen.exit");
    };
    const onBlur = () => void record("window.blur");
    const onFocus = () => void record("window.focus");
    const onResize = () => {
      if (resizeTimer.current) {
        window.clearTimeout(resizeTimer.current);
      }
      resizeTimer.current = window.setTimeout(() => {
        void record("viewport.resize", { width: window.innerWidth, height: window.innerHeight });
      }, 250);
    };
    const blockClipboard = (event: ClipboardEvent) => {
      event.preventDefault();
      void record(`clipboard.${event.type}_attempt`);
    };
    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      void record("context_menu.attempt");
    };
    const blockSelection = (event: Event) => {
      event.preventDefault();
      void record("selection.attempt");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      let category = "character";
      if (event.ctrlKey || event.metaKey || event.altKey) {
        category = "shortcut";
      } else if (event.key.length > 1) {
        category = "control";
      }
      void record("keyboard.input", {
        category,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        shift: event.shiftKey,
        repeat: event.repeat,
      });
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("resize", onResize);
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("cut", blockClipboard);
    document.addEventListener("paste", blockClipboard);
    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("selectstart", blockSelection);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("selectstart", blockSelection);
      document.removeEventListener("keydown", onKeyDown);
      if (resizeTimer.current) {
        window.clearTimeout(resizeTimer.current);
      }
    };
  }, [credentials, exam?.status, record]);

  async function enterProtectedMode(): Promise<{ fullscreen: boolean; keyboard: boolean }> {
    let enteredFullscreen = false;
    let lockedKeyboard = false;
    try {
      await document.documentElement.requestFullscreen();
      enteredFullscreen = true;
      setFullscreen(true);
    } catch {
      setError("Fullscreen was denied. The attempt will be recorded after the session starts.");
    }

    const keyboard = (navigator as KeyboardNavigator).keyboard;
    if (keyboard && enteredFullscreen) {
      try {
        await keyboard.lock();
        lockedKeyboard = true;
        setKeyboardLocked(true);
      } catch {
        setError("Keyboard Lock is unavailable. Fullscreen monitoring remains active.");
      }
    }
    return { fullscreen: enteredFullscreen, keyboard: lockedKeyboard };
  }

  async function startExam() {
    if (!candidateName.trim()) {
      setError("Enter a candidate name.");
      return;
    }

    setBusy(true);
    setError("");
    const protectedMode = await enterProtectedMode();
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateName }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const body = (await response.json()) as ExamState & { token: string; challenge: string };
      const nextCredentials: SessionCredentials = {
        sessionId: body.id,
        token: body.token,
        challenge: body.challenge,
        candidateName: body.candidateName,
      };
      await initializeOutbox(body.id, body.challenge);
      sessionStorage.setItem(sessionStorageKey, JSON.stringify(nextCredentials));
      setCredentials(nextCredentials);
      setExam(body);
      await appendEvidence(body.id, "session.start", protectedMode);
      await appendEvidence(body.id, "question.open", { questionId: body.question?.id ?? "" });
      await refreshPending(body.id);
    } catch (startError) {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      setError(messageFromError(startError, "The exam could not be started."));
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer() {
    if (!credentials || !exam?.question || !selectedOption) {
      setError("Select an answer before continuing.");
      return;
    }

    setBusy(true);
    setError("");
    const questionId = exam.question.id;
    try {
      await record("answer.select", { questionId, optionId: selectedOption });
      const response = await fetch("/api/answers", {
        method: "POST",
        headers: sessionHeaders(credentials),
        body: JSON.stringify({ questionId, optionId: selectedOption }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const nextExam = (await response.json()) as ExamState;
      await record("answer.submit", { questionId });
      if (nextExam.question) {
        await record("question.open", { questionId: nextExam.question.id });
      } else {
        await record("session.submit", { answeredCount: nextExam.answeredCount ?? 0 });
      }
      setExam(nextExam);
      setSelectedOption("");
      await flush();
    } catch (submitError) {
      setError(messageFromError(submitError, "The answer could not be submitted."));
    } finally {
      setBusy(false);
    }
  }

  async function returnToFullscreen() {
    const protectedMode = await enterProtectedMode();
    await record("protected_mode.request", protectedMode);
  }

  if (!exam) {
    let startButtonLabel = "Enter exam";
    if (busy) {
      startButtonLabel = "Preparing environment…";
    }
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col">
          <header className="flex items-center justify-between border-b border-slate-800 pb-5">
            <div>
              <p className="font-mono text-xs tracking-[0.22em] text-cyan-400">EXAM CAPSULE</p>
              <h1 className="mt-2 text-xl font-semibold">Controlled assessment environment</h1>
            </div>
            <Link className="text-sm text-slate-400 hover:text-white" href="/review">
              Evidence review
            </Link>
          </header>

          <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
                A browser exam with a verifiable interaction trail.
              </p>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">
                The demo monitors focus, fullscreen, keyboard categories, clipboard attempts, and
                answer progression. Events are chained locally before delivery.
              </p>
            </div>

            <div className="border border-slate-700 bg-slate-900 p-7 shadow-2xl shadow-black/30">
              <label className="text-sm font-medium text-slate-300" htmlFor="candidate-name">
                Candidate name
              </label>
              <input
                id="candidate-name"
                className="mt-3 w-full border border-slate-600 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-400"
                maxLength={80}
                value={candidateName}
                onChange={(event) => setCandidateName(event.target.value)}
                disabled={busy}
              />
              <button
                className="mt-5 w-full bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={() => void startExam()}
                disabled={busy}
              >
                {startButtonLabel}
              </button>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Starting requests fullscreen and Keyboard Lock where the browser supports it.
              </p>
              {error && (
                <p className="mt-4 border-l-2 border-rose-400 pl-3 text-sm text-rose-300">
                  {error}
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }

  const watermark = `${exam.candidateName} · ${exam.id.slice(0, 8)} · ${now.toLocaleTimeString()}`;
  let fullscreenClass = "text-rose-700";
  let fullscreenLabel = "FULLSCREEN EXITED";
  if (fullscreen) {
    fullscreenClass = "text-emerald-700";
    fullscreenLabel = "FULLSCREEN";
  }
  let keyboardClass = "text-amber-700";
  let keyboardLabel = "KEYS MONITORED";
  if (keyboardLocked) {
    keyboardClass = "text-emerald-700";
    keyboardLabel = "KEYS LOCKED";
  }
  let evidenceClass = "text-amber-700";
  let evidenceLabel = `${pendingEvents} PENDING`;
  if (pendingEvents === 0) {
    evidenceClass = "text-emerald-700";
    evidenceLabel = "EVIDENCE SYNCED";
  }
  let submitButtonLabel = "Submit answer";
  if (busy) {
    submitButtonLabel = "Submitting…";
  }

  let examPanel = (
    <div className="w-full max-w-2xl border-t-4 border-emerald-600 bg-white p-10 shadow-sm">
      <p className="font-mono text-xs tracking-widest text-emerald-700">SUBMISSION SEALED</p>
      <h2 className="mt-4 text-4xl font-semibold">Exam complete</h2>
      <p className="mt-4 text-slate-600">
        Score: {exam.score} / {exam.questionCount}. Pending evidence remains in this browser until
        acknowledged.
      </p>
      {error && <p className="mt-5 text-sm text-rose-700">{error}</p>}
    </div>
  );
  if (exam.status === "active") {
    examPanel = (
      <div className="w-full max-w-3xl bg-white p-7 shadow-sm sm:p-10">
        <p className="font-mono text-xs tracking-widest text-cyan-700">
          QUESTION {exam.questionNumber}
        </p>
        <h2 className="mt-5 text-2xl font-semibold leading-relaxed sm:text-3xl">
          {exam.question?.prompt}
        </h2>
        <div className="mt-8 space-y-3">
          {exam.question?.options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-4 border border-slate-300 px-5 py-4 transition hover:border-cyan-600 has-[:checked]:border-cyan-700 has-[:checked]:bg-cyan-50"
            >
              <input
                type="radio"
                name="answer"
                value={option.id}
                checked={selectedOption === option.id}
                onChange={() => setSelectedOption(option.id)}
              />
              <span className="font-mono text-xs text-slate-500">{option.id.toUpperCase()}</span>
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
          <p className="text-xs text-slate-500">Answers are final after submission.</p>
          <button
            className="bg-slate-950 px-6 py-3 font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            disabled={busy || !selectedOption}
            onClick={() => void submitAnswer()}
          >
            {submitButtonLabel}
          </button>
        </div>
        {error && (
          <p className="mt-5 border-l-2 border-rose-500 pl-3 text-sm text-rose-700">{error}</p>
        )}
      </div>
    );
  }

  return (
    <main className="exam-surface min-h-screen select-none bg-slate-100 text-slate-950">
      <div className="pointer-events-none fixed inset-0 z-10 grid grid-cols-2 grid-rows-4 overflow-hidden opacity-[0.055]">
        {[
          "north-west",
          "north-east",
          "west",
          "east",
          "south-west",
          "south-east",
          "low-west",
          "low-east",
        ].map((position) => (
          <span
            key={position}
            className="flex -rotate-12 items-center justify-center whitespace-nowrap font-mono text-sm"
          >
            {watermark}
          </span>
        ))}
      </div>

      <header className="relative z-20 flex items-center justify-between border-b border-slate-300 bg-white px-5 py-3">
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs font-bold tracking-[0.2em]">EXAM CAPSULE</span>
          <span className="hidden text-sm text-slate-500 sm:inline">{exam.candidateName}</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs">
          <span className={fullscreenClass}>{fullscreenLabel}</span>
          <span className={keyboardClass}>{keyboardLabel}</span>
          <span className={evidenceClass}>{evidenceLabel}</span>
        </div>
      </header>

      {!fullscreen && exam.status === "active" && (
        <div className="relative z-30 flex items-center justify-between bg-rose-700 px-5 py-3 text-sm text-white">
          <span>Fullscreen was exited. This event has been recorded.</span>
          <button
            className="border border-white px-3 py-1 font-semibold"
            type="button"
            onClick={() => void returnToFullscreen()}
          >
            Return to fullscreen
          </button>
        </div>
      )}

      <section className="relative z-20 mx-auto grid min-h-[calc(100vh-53px)] max-w-7xl lg:grid-cols-[240px_1fr]">
        <aside className="border-r border-slate-300 bg-slate-200/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Progress</p>
          <p className="mt-3 text-3xl font-semibold">
            {exam.questionNumber}
            <span className="text-base text-slate-400"> / {exam.questionCount}</span>
          </p>
          <div className="mt-4 h-1.5 bg-slate-300">
            <div
              className="h-full bg-cyan-600 transition-all"
              style={{ width: `${(exam.questionNumber / exam.questionCount) * 100}%` }}
            />
          </div>
          <dl className="mt-10 space-y-4 text-xs">
            <div>
              <dt className="text-slate-500">Session</dt>
              <dd className="mt-1 font-mono">{exam.id.slice(0, 13)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Local time</dt>
              <dd className="mt-1 font-mono">{now.toLocaleTimeString()}</dd>
            </div>
          </dl>
        </aside>

        <div className="flex items-center justify-center p-6 sm:p-12">{examPanel}</div>
      </section>
    </main>
  );
}
