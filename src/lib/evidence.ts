export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export type JsonObject = {
  [key: string]: JsonValue;
};

export type EvidenceEvent = {
  sessionId: string;
  sequence: number;
  clientMonotonicTime: number;
  type: string;
  payload: JsonObject;
  previousHash: string;
  eventHash: string;
};

export type UnsignedEvidenceEvent = Omit<EvidenceEvent, "eventHash">;

export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  const properties = entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`);
  return `{${properties.join(",")}}`;
}

export function serializeEvent(event: UnsignedEvidenceEvent): string {
  return canonicalize({
    clientMonotonicTime: event.clientMonotonicTime,
    payload: event.payload,
    previousHash: event.previousHash,
    sequence: event.sequence,
    sessionId: event.sessionId,
    type: event.type,
  });
}
