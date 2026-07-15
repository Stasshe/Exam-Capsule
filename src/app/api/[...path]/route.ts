import type { NextRequest } from "next/server";

import { messageFromError } from "@/lib/errors";
import type { EvidenceEvent } from "@/lib/evidence";
import { errorResponse, getAuthenticatedSession } from "@/lib/http";
import {
  answerQuestion,
  appendEvents,
  authenticateReviewer,
  createSession,
  getReviewSessions,
  getSessionState,
} from "@/lib/store";
import { isEvidenceEvent, isObject } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function startSession(request: NextRequest): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (!isObject(body) || typeof body.candidateName !== "string") {
    return errorResponse("Candidate name is required.", 400);
  }

  const candidateName = body.candidateName.trim();
  if (candidateName.length < 1 || candidateName.length > 80) {
    return errorResponse("Candidate name must be between 1 and 80 characters.", 400);
  }

  return Response.json(createSession(candidateName), { status: 201 });
}

function readExam(request: NextRequest): Response {
  const session = getAuthenticatedSession(request);
  if (!session) {
    return errorResponse("The exam session is not available.", 401);
  }
  return Response.json(getSessionState(session));
}

async function saveAnswer(request: NextRequest): Promise<Response> {
  const session = getAuthenticatedSession(request);
  if (!session) {
    return errorResponse("The exam session is not available.", 401);
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isObject(body) || typeof body.questionId !== "string" || typeof body.optionId !== "string") {
    return errorResponse("Question and option are required.", 400);
  }

  try {
    return Response.json(answerQuestion(session, body.questionId, body.optionId));
  } catch (error) {
    return errorResponse(messageFromError(error, "The answer could not be saved."), 409);
  }
}

async function saveEvents(request: NextRequest): Promise<Response> {
  const session = getAuthenticatedSession(request);
  if (!session) {
    return errorResponse("The exam session is not available.", 401);
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isObject(body) || !Array.isArray(body.events) || body.events.length > 100) {
    return errorResponse("An event batch of at most 100 items is required.", 400);
  }
  if (!body.events.every(isEvidenceEvent)) {
    return errorResponse("The event batch is invalid.", 400);
  }

  const events: EvidenceEvent[] = body.events;
  if (events.some((event) => event.sessionId !== session.id)) {
    return errorResponse("The event session does not match the authenticated session.", 400);
  }

  try {
    return Response.json({ acceptedThrough: appendEvents(session, events) });
  } catch (error) {
    return errorResponse(messageFromError(error, "The event batch was rejected."), 409);
  }
}

function reviewSessions(request: NextRequest): Response {
  const authorization = request.headers.get("authorization") ?? "";
  let reviewerKey = "";
  if (authorization.startsWith("Bearer ")) {
    reviewerKey = authorization.slice(7);
  }

  const authentication = authenticateReviewer(reviewerKey);
  if (authentication === "unavailable") {
    return errorResponse("REVIEWER_KEY is not configured on the server.", 503);
  }
  if (authentication === "rejected") {
    return errorResponse("The reviewer key is invalid.", 401);
  }
  return Response.json({ sessions: getReviewSessions() });
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  if (path.length === 1 && path[0] === "exam") {
    return readExam(request);
  }
  if (path.length === 1 && path[0] === "review") {
    return reviewSessions(request);
  }
  return errorResponse("API endpoint not found.", 404);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  if (path.length !== 1) {
    return errorResponse("API endpoint not found.", 404);
  }
  if (path[0] === "sessions") {
    return startSession(request);
  }
  if (path[0] === "answers") {
    return saveAnswer(request);
  }
  if (path[0] === "events") {
    return saveEvents(request);
  }
  return errorResponse("API endpoint not found.", 404);
}
