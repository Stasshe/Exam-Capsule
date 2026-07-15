import type { JsonObject } from "@/lib/evidence";

export type PressedKey = {
  key: string;
  code: string;
  location: number;
  startedAt: number;
  repeats: number;
};

export function keyIdentifier(event: KeyboardEvent): string {
  let identity = event.code;
  if (!identity) {
    identity = event.key;
  }
  return `${identity}:${event.location}`;
}

export function keyboardPayload(
  event: KeyboardEvent,
  pressedKeys: Map<string, PressedKey>,
): JsonObject {
  const heldKeys = Array.from(pressedKeys.values(), (pressed) => {
    if (pressed.code) {
      return pressed.code;
    }
    return pressed.key;
  });
  const currentKey = event.code || event.key;
  if (!heldKeys.includes(currentKey)) {
    heldKeys.push(currentKey);
  }

  const isModifier = ["Alt", "AltGraph", "Control", "Meta", "Shift"].includes(event.key);
  const shortcut = !isModifier && (event.ctrlKey || event.metaKey || event.altKey);

  return {
    key: event.key,
    code: event.code,
    location: event.location,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
    composing: event.isComposing,
    shortcut,
    heldKeys,
    combination: heldKeys.join("+"),
  };
}
