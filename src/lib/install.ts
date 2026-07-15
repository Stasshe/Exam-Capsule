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

export function isInstalledDisplayMode(): boolean {
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const fullscreen = window.matchMedia("(display-mode: fullscreen)").matches;
  const iosStandalone = (navigator as StandaloneNavigator).standalone === true;
  return standalone || fullscreen || iosStandalone;
}
