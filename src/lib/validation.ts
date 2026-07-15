import type { EvidenceEvent, JsonObject, JsonValue } from "@/lib/evidence";

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isObject(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isObject(value) && Object.values(value).every(isJsonValue);
}

export function isEvidenceEvent(value: unknown): value is EvidenceEvent {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.sessionId === "string" &&
    typeof value.sequence === "number" &&
    Number.isSafeInteger(value.sequence) &&
    value.sequence > 0 &&
    typeof value.clientMonotonicTime === "number" &&
    Number.isFinite(value.clientMonotonicTime) &&
    typeof value.type === "string" &&
    value.type.length > 0 &&
    value.type.length <= 80 &&
    isJsonObject(value.payload) &&
    typeof value.previousHash === "string" &&
    /^[a-f0-9]{64}$/.test(value.previousHash) &&
    typeof value.eventHash === "string" &&
    /^[a-f0-9]{64}$/.test(value.eventHash)
  );
}
