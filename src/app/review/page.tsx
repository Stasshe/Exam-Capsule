"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { messageFromError } from "@/lib/errors";
import type { EvidenceEvent, JsonValue } from "@/lib/evidence";

type ReviewEvent = EvidenceEvent & {
  receivedAt: string;
};

type ReviewSession = {
  id: string;
  candidateName: string;
  status: "active" | "submitted";
  startedAt: string;
  submittedAt: string | null;
  answers: Array<{
    questionId: string;
    optionId: string;
    answeredAt: string;
  }>;
  events: ReviewEvent[];
};

function formatPayload(payload: { [key: string]: JsonValue }): string {
  if (Object.keys(payload).length === 0) {
    return "—";
  }
  return JSON.stringify(payload);
}

function sessionButtonClass(selected: boolean): string {
  const base = "w-full border-b border-slate-800 px-5 py-4 text-left transition ";
  if (selected) {
    return `${base}bg-cyan-950/60`;
  }
  return `${base}hover:bg-slate-800`;
}

function sessionStatusClass(status: ReviewSession["status"]): string {
  if (status === "active") {
    return "text-amber-400";
  }
  return "text-emerald-400";
}

function sessionStatusLabel(status: ReviewSession["status"]): string {
  if (status === "active") {
    return "受験中";
  }
  return "提出済み";
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

export default function ReviewPage() {
  const [reviewerKey, setReviewerKey] = useState("");
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!reviewerKey) {
      return;
    }
    try {
      const response = await fetch("/api/review", {
        headers: { authorization: `Bearer ${reviewerKey}` },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const body = (await response.json()) as { sessions: ReviewSession[] };
      setSessions(body.sessions);
      setConnected(true);
      setError("");
      if (!selectedId && body.sessions[0]) {
        setSelectedId(body.sessions[0].id);
      }
    } catch (refreshError) {
      setConnected(false);
      setError(messageFromError(refreshError, "証跡を更新できませんでした。"));
    }
  }, [reviewerKey, selectedId]);

  useEffect(() => {
    if (!connected) {
      return;
    }
    const interval = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(interval);
  }, [connected, refresh]);

  const selected = sessions.find((session) => session.id === selectedId) ?? null;
  let selectedPanel = (
    <p className="text-sm text-slate-500">このサーバーインスタンスにセッションはありません。</p>
  );
  if (selected) {
    selectedPanel = (
      <>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <p className="font-mono text-xs text-slate-500">{selected.id}</p>
            <h2 className="mt-2 text-2xl font-semibold">{selected.candidateName}</h2>
          </div>
          <div className="text-right text-xs text-slate-400">
            <p>回答 {selected.answers.length}件</p>
            <p className="mt-1">受理イベント {selected.events.length}件</p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto border border-slate-800">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-900 font-mono text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3">SEQ</th>
                <th className="px-4 py-3">受理時刻</th>
                <th className="px-4 py-3">イベント</th>
                <th className="px-4 py-3">データ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {selected.events.map((event) => (
                <tr key={event.sequence} className="align-top hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-cyan-400">{event.sequence}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {new Date(event.receivedAt).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3 font-medium">{event.type}</td>
                  <td className="max-w-md px-4 py-3 font-mono text-xs text-slate-400">
                    {formatPayload(event.payload)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected.events.length === 0 && (
            <p className="px-4 py-12 text-center text-sm text-slate-500">
              受理済みの証跡はありません。
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-cyan-400">EXAM CAPSULE</p>
          <h1 className="mt-1 text-lg font-semibold">証跡確認</h1>
        </div>
        <Link className="text-sm text-slate-400 hover:text-white" href="/">
          受験画面
        </Link>
      </header>

      {!connected && (
        <section className="mx-auto max-w-md px-6 py-24">
          <label className="text-sm text-slate-300" htmlFor="reviewer-key">
            確認キー
          </label>
          <input
            id="reviewer-key"
            type="password"
            className="mt-3 w-full border border-slate-600 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-400"
            value={reviewerKey}
            onChange={(event) => setReviewerKey(event.target.value)}
          />
          <button
            className="mt-4 w-full bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50"
            type="button"
            disabled={!reviewerKey}
            onClick={() => void refresh()}
          >
            証跡を開く
          </button>
          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        </section>
      )}

      {connected && (
        <div className="grid min-h-[calc(100vh-73px)] lg:grid-cols-[320px_1fr]">
          <aside className="border-r border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-xs text-slate-500">2秒ごとに自動更新</p>
              <p className="mt-1 text-sm">このインスタンスに {sessions.length} セッション</p>
            </div>
            <div>
              {sessions.map((session) => (
                <button
                  key={session.id}
                  className={sessionButtonClass(selectedId === session.id)}
                  type="button"
                  onClick={() => setSelectedId(session.id)}
                >
                  <span className="flex items-center justify-between gap-3">
                    <strong className="truncate text-sm">{session.candidateName}</strong>
                    <span className={sessionStatusClass(session.status)}>
                      {sessionStatusLabel(session.status)}
                    </span>
                  </span>
                  <span className="mt-2 block font-mono text-xs text-slate-500">
                    {session.id.slice(0, 18)}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 p-5 sm:p-8">{selectedPanel}</section>
        </div>
      )}
    </main>
  );
}
