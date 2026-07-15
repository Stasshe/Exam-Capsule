import type { Question } from "@/lib/questions";

export type IntegrityFailure = {
  kind: "missing" | "modified" | "hidden" | "covered";
  target: string;
};

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number.parseFloat(style.opacity) >= 0.5 &&
    bounds.width >= 1 &&
    bounds.height >= 1
  );
}

function isCovered(element: HTMLElement): boolean {
  const bounds = element.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) {
    return false;
  }
  const topElement = document.elementsFromPoint(x, y)[0];
  if (!topElement) {
    return true;
  }
  return !element.contains(topElement) && !topElement.contains(element);
}

function inspectElement(
  element: HTMLElement | null,
  expectedText: string,
  target: string,
): IntegrityFailure | null {
  if (!element) {
    return { kind: "missing", target };
  }
  if (element.textContent?.trim() !== expectedText.trim()) {
    return { kind: "modified", target };
  }
  if (!isVisible(element)) {
    return { kind: "hidden", target };
  }
  if (isCovered(element)) {
    return { kind: "covered", target };
  }
  return null;
}

export function inspectQuestion(question: Question): IntegrityFailure | null {
  const root = document.querySelector<HTMLElement>(`[data-question-id="${question.id}"]`);
  if (!root) {
    return { kind: "missing", target: "question.root" };
  }

  const promptFailure = inspectElement(
    root.querySelector<HTMLElement>("[data-question-prompt]"),
    question.prompt,
    "question.prompt",
  );
  if (promptFailure) {
    return promptFailure;
  }

  for (const option of question.options) {
    const optionElement = root.querySelector<HTMLElement>(`[data-option-id="${option.id}"]`);
    const optionFailure = inspectElement(
      optionElement,
      option.label,
      `question.option.${option.id}`,
    );
    if (optionFailure) {
      return optionFailure;
    }
  }
  return null;
}
