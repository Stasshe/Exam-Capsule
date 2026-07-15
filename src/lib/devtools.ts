export function hasDockedDeveloperTools(): boolean {
  const widthDifference = Math.max(0, window.outerWidth - window.innerWidth);
  const heightDifference = Math.max(0, window.outerHeight - window.innerHeight);
  return widthDifference > 200 || heightDifference > 250;
}

export function isDeveloperToolsShortcut(event: KeyboardEvent): boolean {
  if (typeof event.key !== "string") {
    return false;
  }

  if (event.key === "F12") {
    return true;
  }

  const key = event.key.toLowerCase();
  const controlTool = event.ctrlKey && event.shiftKey && ["c", "i", "j", "k"].includes(key);
  const macTool = event.metaKey && event.altKey && ["c", "i", "j", "u"].includes(key);
  const viewSource = event.ctrlKey && key === "u";
  return controlTool || macTool || viewSource;
}
