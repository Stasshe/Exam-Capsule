"use client";

import { useState } from "react";
import type { JsonObject } from "@/lib/evidence";

export type ExamReport = {
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
      integrityFailures: number;
    };
  };
  received: {
    sessionId: string;
    candidateName: string;
    startedAt: string;
    submittedAt: string | null;
    answers: Array<{
      questionId: string;
      prompt: string;
      optionId: string;
      selectedLabel: string;
      answeredAt: string;
      correct: boolean;
    }>;
    events: Array<{
      sequence: number;
      type: string;
      payload: JsonObject;
      receivedAt: string;
    }>;
  };
};

type ReportProps = {
  report: ExamReport | null;
  score: number | null | undefined;
  questionCount: number;
  busy: boolean;
  error: string;
  onRetry(): void;
};

export function Report({ report, score, questionCount, busy, error, onRetry }: ReportProps) {
  const [copyStatus, setCopyStatus] = useState("");
  let riskLevel = "低い";
  if (report?.risk.level === "medium") {
    riskLevel = "要確認";
  }
  if (report?.risk.level === "high") {
    riskLevel = "高い";
  }

  async function copyReceivedData(): Promise<void> {
    if (!report) {
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(report.received, null, 2));
      setCopyStatus("コピーしました");
    } catch {
      setCopyStatus("コピーできませんでした");
    }
  }

  return (
    <div className="w-full max-w-2xl border-t-4 border-emerald-600 bg-white p-10 shadow-sm">
      <p className="font-mono text-xs tracking-widest text-emerald-700">提出確定</p>
      <h2 className="mt-4 text-4xl font-semibold">試験レポート</h2>
      <p className="mt-4 text-slate-600">
        得点: {score} / {questionCount}
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
            <div className="bg-white p-3">
              <dt className="text-xs text-slate-500">表示改変</dt>
              <dd className="mt-1 font-mono">{report.risk.signals.integrityFailures}</dd>
            </div>
          </dl>
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">サーバーが受理したデータ</h3>
                <p className="mt-1 text-sm text-slate-600">
                  回答 {report.received.answers.length}件 · イベント {report.received.events.length}
                  件
                </p>
              </div>
              <div className="flex items-center gap-3">
                {copyStatus && <span className="text-xs text-slate-500">{copyStatus}</span>}
                <button
                  className="border border-slate-400 bg-white px-3 py-2 text-sm font-semibold hover:border-cyan-700 hover:text-cyan-800"
                  type="button"
                  onClick={() => void copyReceivedData()}
                >
                  一括コピー
                </button>
              </div>
            </div>
            <pre className="mt-3 max-h-[32rem] overflow-auto border border-slate-300 bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(report.received, null, 2)}
            </pre>
          </section>
        </div>
      )}
      <button
        className="mt-7 bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-40"
        type="button"
        disabled={busy}
        onClick={onRetry}
      >
        もう一度挑戦する
      </button>
      {error && <p className="mt-5 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
