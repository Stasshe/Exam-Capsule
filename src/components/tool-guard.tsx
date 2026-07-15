"use client";

import { useEffect, useState } from "react";
import { hasDockedDeveloperTools, isDeveloperToolsShortcut } from "@/lib/devtools";

export function ToolGuard() {
  const [developerToolsDetected, setDeveloperToolsDetected] = useState(false);

  useEffect(() => {
    const blockContextMenu = (event: MouseEvent) => event.preventDefault();
    const blockShortcut = (event: KeyboardEvent) => {
      if (isDeveloperToolsShortcut(event)) {
        event.preventDefault();
      }
    };
    const inspectWindow = () => setDeveloperToolsDetected(hasDockedDeveloperTools());

    inspectWindow();
    const interval = window.setInterval(inspectWindow, 750);
    window.addEventListener("resize", inspectWindow);
    window.addEventListener("keydown", blockShortcut, true);
    document.addEventListener("contextmenu", blockContextMenu);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", inspectWindow);
      window.removeEventListener("keydown", blockShortcut, true);
      document.removeEventListener("contextmenu", blockContextMenu);
    };
  }, []);

  if (!developerToolsDetected) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950 p-8 text-center text-white"
      role="alert"
    >
      <div>
        <p className="font-mono text-xs tracking-[0.24em] text-rose-400">操作を停止しました</p>
        <p className="mt-4 text-2xl font-semibold">開発者ツールを閉じてください</p>
        <p className="mt-3 text-sm text-slate-400">閉じると自動的に試験画面へ戻ります。</p>
      </div>
    </div>
  );
}
