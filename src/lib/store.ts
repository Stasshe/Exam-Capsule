import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { type EvidenceEvent, serializeEvent } from "@/lib/evidence";
import { getQuestion, getQuestionCount, getQuestionDefinition } from "@/lib/questions";

type Answer = {
  questionId: string;
  optionId: string;
  answeredAt: string;
};

type ExamSession = {
  id: string;
  candidateName: string;
  tokenHash: string;
  challenge: string;
  status: "active" | "submitted";
  startedAt: string;
  submittedAt: string | null;
  answers: Answer[];
  events: Array<EvidenceEvent & { receivedAt: string }>;
};

type StoreRoot = typeof globalThis & {
  examCapsuleSessions?: Map<string, ExamSession>;
};

const storeRoot = globalThis as StoreRoot;
const sessions = storeRoot.examCapsuleSessions ?? new Map<string, ExamSession>();
storeRoot.examCapsuleSessions = sessions;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSession(candidateName: string) {
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  const challenge = randomBytes(32).toString("hex");
  const startedAt = new Date().toISOString();

  const session: ExamSession = {
    id,
    candidateName,
    tokenHash: digest(token),
    challenge,
    status: "active",
    startedAt,
    submittedAt: null,
    answers: [],
    events: [],
  };
  sessions.set(id, session);

  return {
    id,
    token,
    challenge,
    candidateName,
    status: session.status,
    question: getQuestion(0),
    questionNumber: 1,
    questionCount: getQuestionCount(),
  };
}

export function authenticateSession(sessionId: string, token: string): ExamSession | null {
  const session = sessions.get(sessionId);
  if (!session || !safeEqual(session.tokenHash, digest(token))) {
    return null;
  }
  return session;
}

export function getSessionState(session: ExamSession) {
  const question = getQuestion(session.answers.length);
  const correctAnswers = session.answers.filter((answer) => {
    const definition = getQuestionDefinition(answer.questionId);
    return definition?.correctOptionId === answer.optionId;
  }).length;

  let score: number | null = null;
  if (session.status === "submitted") {
    score = correctAnswers;
  }
  let questionNumber = session.answers.length + 1;
  if (question === null) {
    questionNumber = getQuestionCount();
  }

  return {
    id: session.id,
    candidateName: session.candidateName,
    status: session.status,
    question,
    questionNumber,
    questionCount: getQuestionCount(),
    answeredCount: session.answers.length,
    score,
  };
}

export function answerQuestion(session: ExamSession, questionId: string, optionId: string) {
  if (session.status !== "active") {
    throw new Error("この試験は提出済みです。");
  }

  const currentQuestion = getQuestion(session.answers.length);
  if (!currentQuestion || currentQuestion.id !== questionId) {
    throw new Error("現在の問題ではありません。");
  }
  if (!currentQuestion.options.some((option) => option.id === optionId)) {
    throw new Error("選択肢が存在しません。");
  }

  session.answers.push({
    questionId,
    optionId,
    answeredAt: new Date().toISOString(),
  });

  if (session.answers.length === getQuestionCount()) {
    session.status = "submitted";
    session.submittedAt = new Date().toISOString();
  }

  return getSessionState(session);
}

export function appendEvents(session: ExamSession, incomingEvents: EvidenceEvent[]) {
  let acceptedThrough = session.events.at(-1)?.sequence ?? 0;
  let previousHash = session.events.at(-1)?.eventHash ?? session.challenge;

  for (const event of incomingEvents) {
    if (event.sequence <= acceptedThrough) {
      const existing = session.events.find((stored) => stored.sequence === event.sequence);
      if (!existing || !safeEqual(existing.eventHash, event.eventHash)) {
        throw new Error(`Event ${event.sequence} conflicts with stored evidence.`);
      }
      continue;
    }

    if (event.sequence !== acceptedThrough + 1) {
      throw new Error(`Expected event ${acceptedThrough + 1}.`);
    }
    if (!safeEqual(event.previousHash, previousHash)) {
      throw new Error(`Event ${event.sequence} has an invalid previous hash.`);
    }

    const expectedHash = digest(serializeEvent(event));
    if (!safeEqual(event.eventHash, expectedHash)) {
      throw new Error(`Event ${event.sequence} has an invalid hash.`);
    }

    session.events.push({ ...event, receivedAt: new Date().toISOString() });
    acceptedThrough = event.sequence;
    previousHash = event.eventHash;
  }

  return acceptedThrough;
}

export function getReviewSessions() {
  return Array.from(sessions.values())
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .map((session) => ({
      id: session.id,
      candidateName: session.candidateName,
      status: session.status,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      answers: session.answers,
      events: session.events,
    }));
}

export function getSessionReport(session: ExamSession) {
  const signals = {
    fullscreenExits: 0,
    hiddenEvents: 0,
    hiddenDurationSeconds: 0,
    clipboardAttempts: 0,
    focusLosses: 0,
    resizeEvents: 0,
    shortcutEvents: 0,
    integrityFailures: 0,
  };
  let hiddenAt: number | null = null;

  for (const event of session.events) {
    if (event.type === "fullscreen.exit") {
      signals.fullscreenExits += 1;
    }
    if (event.type === "document.hidden") {
      signals.hiddenEvents += 1;
      hiddenAt = event.clientMonotonicTime;
    }
    if (event.type === "document.visible" && hiddenAt !== null) {
      const duration = Math.max(0, event.clientMonotonicTime - hiddenAt) / 1000;
      signals.hiddenDurationSeconds += duration;
      hiddenAt = null;
    }
    if (event.type.startsWith("clipboard.")) {
      signals.clipboardAttempts += 1;
    }
    if (event.type === "window.blur") {
      signals.focusLosses += 1;
    }
    if (event.type === "viewport.resize") {
      signals.resizeEvents += 1;
    }
    if (event.type === "keyboard.input" && event.payload.category === "shortcut") {
      signals.shortcutEvents += 1;
    }
    if (event.type === "content.integrity_failure") {
      signals.integrityFailures += 1;
    }
  }

  const hiddenDurationRisk = Math.min(30, signals.hiddenDurationSeconds);
  const shortcutRisk = Math.min(10, signals.shortcutEvents);
  const rawScore =
    signals.fullscreenExits * 20 +
    signals.hiddenEvents * 10 +
    hiddenDurationRisk +
    signals.clipboardAttempts * 15 +
    signals.focusLosses * 5 +
    signals.resizeEvents * 2 +
    shortcutRisk +
    signals.integrityFailures * 50;
  const score = Math.min(100, Math.round(rawScore));
  let level: "low" | "medium" | "high" = "low";
  if (score >= 60) {
    level = "high";
  } else if (score >= 25) {
    level = "medium";
  }

  const answers = session.answers.map((answer) => {
    const question = getQuestionDefinition(answer.questionId);
    const selectedOption = question?.options.find((option) => option.id === answer.optionId);
    return {
      questionId: answer.questionId,
      prompt: question?.prompt ?? answer.questionId,
      optionId: answer.optionId,
      selectedLabel: selectedOption?.label ?? answer.optionId,
      answeredAt: answer.answeredAt,
      correct: question?.correctOptionId === answer.optionId,
    };
  });

  return {
    sessionId: session.id,
    candidateName: session.candidateName,
    status: session.status,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    risk: { score, level, signals },
    received: {
      answerCount: answers.length,
      eventCount: session.events.length,
      acceptedThrough: session.events.at(-1)?.sequence ?? 0,
      answers,
      events: session.events,
    },
  };
}

export function authenticateReviewer(providedKey: string): "unavailable" | "accepted" | "rejected" {
  const reviewerKey = process.env.REVIEWER_KEY;
  if (!reviewerKey) {
    return "unavailable";
  }
  if (safeEqual(reviewerKey, providedKey)) {
    return "accepted";
  }
  return "rejected";
}
