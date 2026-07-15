"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { messageFromError } from "@/lib/errors";
import type { EvidenceEvent, JsonObject } from "@/lib/evidence";
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

type ExamReport = {
  risk: {
    score: number;
    level: "low" | "medium" | "high";
    signals: {
      fullscreenExits: number;
      hiddenEvents: number;
      hiddenDurationSeconds: number;
      clipboardAttempts: number;
      focusLosses: number;
      resizeEvents: number;
      shortcutEvents: number;
    };
  };
  received: {
    answerCount: number;
    eventCount: number;
    acceptedThrough: number;
    answers: Array<{
      questionId: string;
      prompt: string;
      optionId: string;
      selectedLabel: string;
      answeredAt: string;
      correct: boolean;
    }>;
    events: Array<EvidenceEvent & { receivedAt: string }>;
  };
};

type KeyboardNavigator = Navigator & {
  keyboard?: {
    lock(keys?: string[]): Promise<void>;
    unlock?: () => void;
  };
};

const sessionStorageKey = "exam-capsule-session";
const launchCandidateKey = "exam-capsule-launch-candidate";

function hasDockedDeveloperTools(): boolean {
  const widthDifference = Math.max(0, window.outerWidth - window.innerWidth);
  const heightDifference = Math.max(0, window.outerHeight - window.innerHeight);
  return widthDifference > 200 || heightDifference > 250;
}

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null && "error" in body) {
    const message = Reflect.get(body, "error");
    if (typeof message === "string") {
      return message;
    }
  }
  return `通信に失敗しました（status ${response.status}）。`;
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

async function playExitAlert(): Promise<void> {
  const audioContext = new AudioContext();
  await audioContext.resume();

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
  gain.gain.setValueAtTime(0.12, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.6);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.6);

  await new Promise<void>((resolve) => {
    oscillator.onended = () => resolve();
  });
  await audioContext.close();
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
  const [report, setReport] = useState<ExamReport | null>(null);
  const [capsuleWindow, setCapsuleWindow] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const resizeTimer = useRef<number | null>(null);
  const intentionalFullscreenExit = useRef(false);
  const lastSelectionEvidence = useRef(Number.NEGATIVE_INFINITY);

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
        setError(messageFromError(recordError, "操作証跡を保存できませんでした。"));
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
      setError(messageFromError(flushError, "操作証跡を送信できませんでした。"));
    }
  }, [credentials, refreshPending]);

  const loadReport = useCallback(async (session: SessionCredentials) => {
    const response = await fetch("/api/report", { headers: sessionHeaders(session) });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    setReport((await response.json()) as ExamReport);
  }, []);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get("capsule") !== "1") {
      return;
    }
    setCapsuleWindow(true);
    const launchCandidate = sessionStorage.getItem(launchCandidateKey);
    if (launchCandidate) {
      setCandidateName(launchCandidate);
      sessionStorage.removeItem(launchCandidateKey);
    }
  }, []);

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
        if (restoredExam.status === "submitted") {
          await loadReport(stored);
        }
      } catch (restoreError) {
        sessionStorage.removeItem(sessionStorageKey);
        setError(messageFromError(restoreError, "セッションを復元できませんでした。"));
      } finally {
        setBusy(false);
      }
    };
    void restore();
  }, [loadReport, refreshPending]);

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
      if (intentionalFullscreenExit.current) {
        intentionalFullscreenExit.current = false;
        return;
      }
      void record("fullscreen.exit");
      void playExitAlert().catch((audioError) => {
        setError(
          messageFromError(audioError, "フルスクリーン離脱の警告音を再生できませんでした。"),
        );
      });
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
      const now = performance.now();
      if (now - lastSelectionEvidence.current < 5000) {
        return;
      }
      lastSelectionEvidence.current = now;
      void record("selection.attempt");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
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
      setError("フルスクリーンが拒否されました。開始後の状態を記録します。");
    }

    const keyboard = (navigator as KeyboardNavigator).keyboard;
    if (keyboard && enteredFullscreen) {
      try {
        await keyboard.lock();
        lockedKeyboard = true;
        setKeyboardLocked(true);
      } catch {
        setError("Keyboard Lockを利用できません。フルスクリーン監視は継続します。");
      }
    }
    return { fullscreen: enteredFullscreen, keyboard: lockedKeyboard };
  }

  async function exitProtectedMode(): Promise<void> {
    const keyboard = (navigator as KeyboardNavigator).keyboard;
    if (keyboard?.unlock) {
      keyboard.unlock();
    }
    setKeyboardLocked(false);

    if (document.fullscreenElement) {
      intentionalFullscreenExit.current = true;
      await document.exitFullscreen();
    }
    setFullscreen(false);
  }

  async function startExam() {
    if (!candidateName.trim()) {
      setError("受験者名を入力してください。");
      return;
    }
    if (hasDockedDeveloperTools()) {
      setError("開発者ツールを閉じてから試験を開始してください。");
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
      setReport(null);
      setSelectedOption("");
      setPendingEvents(0);
      setCredentials(nextCredentials);
      setExam(body);
      await appendEvidence(body.id, "session.start", protectedMode);
      await appendEvidence(body.id, "question.open", { questionId: body.question?.id ?? "" });
      await refreshPending(body.id);
    } catch (startError) {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      setError(messageFromError(startError, "試験を開始できませんでした。"));
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer() {
    if (!credentials || !exam?.question || !selectedOption) {
      setError("回答を選択してください。");
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
      if (nextExam.status === "submitted") {
        await exitProtectedMode();
        await loadReport(credentials);
      }
    } catch (submitError) {
      setError(messageFromError(submitError, "回答を送信できませんでした。"));
    } finally {
      setBusy(false);
    }
  }

  async function returnToFullscreen() {
    const protectedMode = await enterProtectedMode();
    await record("protected_mode.request", protectedMode);
  }

  async function retryExam() {
    setError("");
    await startExam();
  }

  function launchCapsuleWindow() {
    if (!candidateName.trim()) {
      setError("受験者名を入力してください。");
      return;
    }
    if (hasDockedDeveloperTools()) {
      setError("開発者ツールを閉じてから専用ウィンドウを開いてください。");
      return;
    }

    const width = Math.min(1280, window.screen.availWidth);
    const height = Math.min(900, window.screen.availHeight);
    const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
    const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
    const popup = window.open("about:blank", "_blank", features);
    if (!popup) {
      setError("専用ウィンドウを開けません。popupを許可してください。");
      return;
    }

    try {
      popup.sessionStorage.setItem(launchCandidateKey, candidateName.trim());
      popup.opener = null;
      popup.location.href = "/?capsule=1";
      popup.focus();
      setError("");
    } catch {
      popup.close();
      setError("専用ウィンドウを初期化できませんでした。");
    }
  }

  if (!exam) {
    let startButtonLabel = "専用ウィンドウを開く";
    if (capsuleWindow) {
      startButtonLabel = "試験を開始";
    }
    if (busy) {
      startButtonLabel = "試験環境を準備中…";
    }
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col">
          <header className="flex items-center justify-between border-b border-slate-800 pb-5">
            <div>
              <p className="font-mono text-xs tracking-[0.22em] text-cyan-400">EXAM CAPSULE</p>
              <h1 className="mt-2 text-xl font-semibold">操作証跡付きブラウザ試験</h1>
            </div>
            <Link className="text-sm text-slate-400 hover:text-white" href="/review">
              証跡を確認
            </Link>
          </header>

          <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
                できるだけ不正をしてみろ（パソコン１台の使用のみとする）
              </p>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">
                フォーカス、フルスクリーン、キー種別、クリップボード操作、回答進行を監視します。
                イベントは送信前に端末内でハッシュチェーンへ保存されます。
              </p>
            </div>

            <div className="border border-slate-700 bg-slate-900 p-7 shadow-2xl shadow-black/30">
              <label className="text-sm font-medium text-slate-300" htmlFor="candidate-name">
                受験者名
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
                onClick={() => {
                  if (capsuleWindow) {
                    void startExam();
                    return;
                  }
                  launchCapsuleWindow();
                }}
                disabled={busy}
              >
                {startButtonLabel}
              </button>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                {capsuleWindow &&
                  "開始時にフルスクリーンを要求し、対応ブラウザではKeyboard Lockも使用します。"}
                {!capsuleWindow && "試験は通常の画面から分離した専用ウィンドウで実行します。"}
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
  let fullscreenLabel = "全画面を離脱";
  if (fullscreen) {
    fullscreenClass = "text-emerald-700";
    fullscreenLabel = "全画面";
  }
  let keyboardClass = "text-amber-700";
  let keyboardLabel = "キー監視中";
  if (keyboardLocked) {
    keyboardClass = "text-emerald-700";
    keyboardLabel = "キー固定中";
  }
  let evidenceClass = "text-amber-700";
  let evidenceLabel = `未送信 ${pendingEvents}件`;
  if (pendingEvents === 0) {
    evidenceClass = "text-emerald-700";
    evidenceLabel = "証跡同期済み";
  }
  let submitButtonLabel = "回答を確定";
  if (busy) {
    submitButtonLabel = "送信中…";
  }

  let riskLevel = "低い";
  if (report?.risk.level === "medium") {
    riskLevel = "要確認";
  }
  if (report?.risk.level === "high") {
    riskLevel = "高い";
  }

  let examPanel = (
    <div className="w-full max-w-2xl border-t-4 border-emerald-600 bg-white p-10 shadow-sm">
      <p className="font-mono text-xs tracking-widest text-emerald-700">提出確定</p>
      <h2 className="mt-4 text-4xl font-semibold">試験レポート</h2>
      <p className="mt-4 text-slate-600">
        得点: {exam.score} / {exam.questionCount}
      </p>
      {!report && <p className="mt-8 text-sm text-slate-500">サーバー受理データを集計中…</p>}
      {report && (
        <div className="mt-8 space-y-6">
          <section className="border border-slate-300 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              不審度の概算
            </p>
            <div className="mt-2 flex items-end gap-3">
              <strong className="font-mono text-5xl">{report.risk.score}</strong>
              <span className="pb-1 text-sm text-slate-500">/ 100 · {riskLevel}</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              不正の証明ではありません。確認対象を選ぶための参考値です。
            </p>
          </section>
          <dl className="grid grid-cols-2 gap-px bg-slate-300 text-sm sm:grid-cols-4">
            <div className="bg-white p-3">
              <dt className="text-xs text-slate-500">全画面離脱</dt>
              <dd className="mt-1 font-mono">{report.risk.signals.fullscreenExits}</dd>
            </div>
            <div className="bg-white p-3">
              <dt className="text-xs text-slate-500">非表示</dt>
              <dd className="mt-1 font-mono">{report.risk.signals.hiddenEvents}</dd>
            </div>
            <div className="bg-white p-3">
              <dt className="text-xs text-slate-500">Clipboard試行</dt>
              <dd className="mt-1 font-mono">{report.risk.signals.clipboardAttempts}</dd>
            </div>
            <div className="bg-white p-3">
              <dt className="text-xs text-slate-500">Focus離脱</dt>
              <dd className="mt-1 font-mono">{report.risk.signals.focusLosses}</dd>
            </div>
          </dl>
          <section>
            <h3 className="font-semibold">サーバーが受理したデータ</h3>
            <p className="mt-2 text-sm text-slate-600">
              回答 {report.received.answerCount}件 · イベント {report.received.eventCount}件 ·
              最終連番 {report.received.acceptedThrough}
            </p>
            <details className="mt-3 border border-slate-300">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                受理データの全文を表示
              </summary>
              <pre className="max-h-80 overflow-auto border-t border-slate-300 bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(report.received, null, 2)}
              </pre>
            </details>
          </section>
        </div>
      )}
      <button
        className="mt-7 bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-40"
        type="button"
        disabled={busy}
        onClick={() => void retryExam()}
      >
        もう一度挑戦する
      </button>
      {error && <p className="mt-5 text-sm text-rose-700">{error}</p>}
    </div>
  );
  if (exam.status === "active") {
    examPanel = (
      <div className="w-full max-w-3xl bg-white p-7 shadow-sm sm:p-10">
        <p className="font-mono text-xs tracking-widest text-cyan-700">
          問題 {exam.questionNumber}
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
          <p className="text-xs text-slate-500">確定した回答は変更できません。</p>
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
          <span>フルスクリーンを離脱しました。この操作は記録されています。</span>
          <button
            className="border border-white px-3 py-1 font-semibold"
            type="button"
            onClick={() => void returnToFullscreen()}
          >
            フルスクリーンへ戻る
          </button>
        </div>
      )}

      <section className="relative z-20 mx-auto grid min-h-[calc(100vh-53px)] max-w-7xl lg:grid-cols-[240px_1fr]">
        <aside className="border-r border-slate-300 bg-slate-200/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">進行状況</p>
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
              <dt className="text-slate-500">セッション</dt>
              <dd className="mt-1 font-mono">{exam.id.slice(0, 13)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">端末時刻</dt>
              <dd className="mt-1 font-mono">{now.toLocaleTimeString()}</dd>
            </div>
          </dl>
        </aside>

        <div className="flex items-center justify-center p-6 sm:p-12">{examPanel}</div>
      </section>
    </main>
  );
}
