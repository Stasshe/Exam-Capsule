export type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type StandaloneNavigator = Navigator & {
  standalone?: boolean;
};

type RelatedAppsNavigator = Navigator & {
  getInstalledRelatedApps?: () => Promise<Array<{ platform: string }>>;
};

export function isInstalledDisplayMode(): boolean {
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const fullscreen = window.matchMedia("(display-mode: fullscreen)").matches;
  const iosStandalone = (navigator as StandaloneNavigator).standalone === true;
  return standalone || fullscreen || iosStandalone;
}

export async function registerInstallWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("このブラウザはアプリのインストールに対応していません。");
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
}

export async function isAppInstalled(): Promise<boolean> {
  if (isInstalledDisplayMode()) {
    return true;
  }
  const getInstalledRelatedApps = (navigator as RelatedAppsNavigator).getInstalledRelatedApps;
  if (!getInstalledRelatedApps) {
    return false;
  }
  const apps = await getInstalledRelatedApps.call(navigator);
  return apps.some((app) => app.platform === "webapp");
}
