import {
  type EvidenceEvent,
  type JsonObject,
  serializeEvent,
  type UnsignedEvidenceEvent,
} from "@/lib/evidence";

const databaseName = "exam-capsule";
const databaseVersion = 1;

type ChainState = {
  sessionId: string;
  sequence: number;
  lastHash: string;
};

type SessionCredentials = {
  sessionId: string;
  token: string;
};

let appendTail: Promise<void> = Promise.resolve();

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("events")) {
        const events = database.createObjectStore("events", {
          keyPath: ["sessionId", "sequence"],
        });
        events.createIndex("sessionId", "sessionId");
      }
      if (!database.objectStoreNames.contains("chains")) {
        database.createObjectStore("chains", { keyPath: "sessionId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getChain(database: IDBDatabase, sessionId: string): Promise<ChainState | null> {
  const transaction = database.transaction("chains", "readonly");
  const result = await requestResult(transaction.objectStore("chains").get(sessionId));
  return (result as ChainState | undefined) ?? null;
}

export async function initializeOutbox(sessionId: string, challenge: string): Promise<void> {
  const database = await openDatabase();
  try {
    const existing = await getChain(database, sessionId);
    if (existing) {
      return;
    }
    const transaction = database.transaction("chains", "readwrite");
    transaction.objectStore("chains").put({ sessionId, sequence: 0, lastHash: challenge });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

async function appendInternal(
  sessionId: string,
  type: string,
  payload: JsonObject,
): Promise<EvidenceEvent> {
  const database = await openDatabase();
  try {
    const chain = await getChain(database, sessionId);
    if (!chain) {
      throw new Error("The local evidence chain is not initialized.");
    }

    const unsignedEvent: UnsignedEvidenceEvent = {
      sessionId,
      sequence: chain.sequence + 1,
      clientMonotonicTime: performance.now(),
      type,
      payload,
      previousHash: chain.lastHash,
    };
    const event: EvidenceEvent = {
      ...unsignedEvent,
      eventHash: await sha256(serializeEvent(unsignedEvent)),
    };

    const transaction = database.transaction(["events", "chains"], "readwrite");
    transaction.objectStore("events").put(event);
    transaction.objectStore("chains").put({
      sessionId,
      sequence: event.sequence,
      lastHash: event.eventHash,
    });
    await transactionDone(transaction);
    return event;
  } finally {
    database.close();
  }
}

export function appendEvidence(
  sessionId: string,
  type: string,
  payload: JsonObject = {},
): Promise<EvidenceEvent> {
  const operation = appendTail.then(() => appendInternal(sessionId, type, payload));
  appendTail = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

async function readPending(database: IDBDatabase, sessionId: string): Promise<EvidenceEvent[]> {
  const transaction = database.transaction("events", "readonly");
  const index = transaction.objectStore("events").index("sessionId");
  const events = await requestResult(index.getAll(IDBKeyRange.only(sessionId), 100));
  return (events as EvidenceEvent[]).sort((left, right) => left.sequence - right.sequence);
}

async function removeAccepted(
  database: IDBDatabase,
  events: EvidenceEvent[],
  acceptedThrough: number,
): Promise<void> {
  const transaction = database.transaction("events", "readwrite");
  const store = transaction.objectStore("events");
  for (const event of events) {
    if (event.sequence <= acceptedThrough) {
      store.delete([event.sessionId, event.sequence]);
    }
  }
  await transactionDone(transaction);
}

export async function flushEvidence(credentials: SessionCredentials): Promise<number> {
  await appendTail;
  const database = await openDatabase();
  try {
    const events = await readPending(database, credentials.sessionId);
    if (events.length === 0) {
      return 0;
    }

    const response = await fetch("/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${credentials.token}`,
        "x-exam-session": credentials.sessionId,
      },
      body: JSON.stringify({ events }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || typeof body !== "object" || body === null || !("acceptedThrough" in body)) {
      throw new Error("The evidence server rejected the pending event batch.");
    }

    const acceptedThrough = Reflect.get(body, "acceptedThrough");
    if (typeof acceptedThrough !== "number") {
      throw new Error("The evidence server returned an invalid acknowledgement.");
    }
    await removeAccepted(database, events, acceptedThrough);
    return events.filter((event) => event.sequence > acceptedThrough).length;
  } finally {
    database.close();
  }
}

export async function countPending(sessionId: string): Promise<number> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("events", "readonly");
    const index = transaction.objectStore("events").index("sessionId");
    return await requestResult(index.count(IDBKeyRange.only(sessionId)));
  } finally {
    database.close();
  }
}
