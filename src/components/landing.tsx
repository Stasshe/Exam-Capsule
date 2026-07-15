import Link from "next/link";

type LandingProps = {
  candidateName: string;
  error: string;
  busy: boolean;
  installMode: "checking" | "browser" | "installed";
  installAvailable: boolean;
  installMessage: string;
  onCandidateNameChange(value: string): void;
  onInstall(): void;
  onStart(): void;
};

export function Landing({
  candidateName,
  error,
  busy,
  installMode,
  installAvailable,
  installMessage,
  onCandidateNameChange,
  onInstall,
  onStart,
}: LandingProps) {
  let startButtonLabel = "試験を開始";
  if (busy) {
    startButtonLabel = "試験環境を準備中…";
  }
  let installButtonLabel = "インストール方法を表示";
  if (installAvailable) {
    installButtonLabel = "Exam Capsuleをインストール";
  }

  let actionPanel = (
    <div className="border border-slate-700 bg-slate-900 p-7">
      <p className="text-sm text-slate-400">起動モードを確認しています…</p>
    </div>
  );
  if (installMode === "browser") {
    actionPanel = (
      <div className="border border-slate-700 bg-slate-900 p-7 shadow-2xl shadow-black/30">
        <p className="font-mono text-xs tracking-widest text-amber-400">インストールが必要です</p>
        <h2 className="mt-3 text-2xl font-semibold">ブラウザでは受験できません</h2>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Exam
          Capsuleをインストールし、OSのアプリアイコンから起動してください。受験画面は独立したアプリウィンドウで開きます。
        </p>
        <button
          className="mt-6 w-full bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={onInstall}
          disabled={busy}
        >
          {installButtonLabel}
        </button>
        {installMessage && (
          <p className="mt-4 border-l-2 border-cyan-500 pl-3 text-sm leading-6 text-slate-300">
            {installMessage}
          </p>
        )}
      </div>
    );
  }
  if (installMode === "installed") {
    actionPanel = (
      <div className="border border-slate-700 bg-slate-900 p-7 shadow-2xl shadow-black/30">
        <p className="font-mono text-xs tracking-widest text-emerald-400">アプリモード</p>
        <label className="mt-4 block text-sm font-medium text-slate-300" htmlFor="candidate-name">
          受験者名
        </label>
        <input
          id="candidate-name"
          className="mt-3 w-full border border-slate-600 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-400"
          maxLength={80}
          value={candidateName}
          onChange={(event) => onCandidateNameChange(event.target.value)}
          disabled={busy}
        />
        <button
          className="mt-5 w-full bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={onStart}
          disabled={busy}
        >
          {startButtonLabel}
        </button>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          開始時にフルスクリーンを要求し、対応ブラウザではKeyboard Lockも使用します。
        </p>
        {error && (
          <p className="mt-4 border-l-2 border-rose-400 pl-3 text-sm text-rose-300">{error}</p>
        )}
      </div>
    );
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
          {actionPanel}
        </section>
      </div>
    </main>
  );
}
