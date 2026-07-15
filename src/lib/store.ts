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
    throw new Error("This exam has already been submitted.");
  }

  const currentQuestion = getQuestion(session.answers.length);
  if (!currentQuestion || currentQuestion.id !== questionId) {
    throw new Error("The question is not the current question.");
  }
  if (!currentQuestion.options.some((option) => option.id === optionId)) {
    throw new Error("The selected option does not exist.");
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
