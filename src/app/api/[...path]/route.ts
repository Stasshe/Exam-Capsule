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
  getSessionReport,
  getSessionState,
} from "@/lib/store";
import { candidateNameError, isEvidenceEvent, isObject } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function startSession(request: NextRequest): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (!isObject(body) || typeof body.candidateName !== "string") {
    return errorResponse("受験者名を入力してください。", 400);
  }

  const candidateName = body.candidateName.trim();
  const validationError = candidateNameError(candidateName);
  if (validationError) {
    return errorResponse(validationError, 400);
  }

  return Response.json(createSession(candidateName), { status: 201 });
}

function readExam(request: NextRequest): Response {
  const session = getAuthenticatedSession(request);
  if (!session) {
    return errorResponse("試験セッションを利用できません。", 401);
  }
  return Response.json(getSessionState(session));
}

function readReport(request: NextRequest): Response {
  const session = getAuthenticatedSession(request);
  if (!session) {
    return errorResponse("試験セッションを利用できません。", 401);
  }
  if (session.status !== "submitted") {
    return errorResponse("レポートは提出後に確認できます。", 409);
  }
  return Response.json(getSessionReport(session));
}

async function saveAnswer(request: NextRequest): Promise<Response> {
  const session = getAuthenticatedSession(request);
  if (!session) {
    return errorResponse("試験セッションを利用できません。", 401);
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isObject(body) || typeof body.questionId !== "string" || typeof body.optionId !== "string") {
    return errorResponse("問題と回答を指定してください。", 400);
  }

  try {
    return Response.json(answerQuestion(session, body.questionId, body.optionId));
  } catch (error) {
    return errorResponse(messageFromError(error, "回答を保存できませんでした。"), 409);
  }
}

async function saveEvents(request: NextRequest): Promise<Response> {
  const session = getAuthenticatedSession(request);
  if (!session) {
    return errorResponse("試験セッションを利用できません。", 401);
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isObject(body) || !Array.isArray(body.events) || body.events.length > 100) {
    return errorResponse("イベントは100件以内の配列で送信してください。", 400);
  }
  if (!body.events.every(isEvidenceEvent)) {
    return errorResponse("イベントデータが不正です。", 400);
  }

  const events: EvidenceEvent[] = body.events;
  if (events.some((event) => event.sessionId !== session.id)) {
    return errorResponse("イベントと認証セッションが一致しません。", 400);
  }

  try {
    return Response.json({ acceptedThrough: appendEvents(session, events) });
  } catch (error) {
    return errorResponse(messageFromError(error, "イベントを受理できませんでした。"), 409);
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
    return errorResponse("サーバーにREVIEWER_KEYが設定されていません。", 503);
  }
  if (authentication === "rejected") {
    return errorResponse("確認キーが正しくありません。", 401);
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
  if (path.length === 1 && path[0] === "report") {
    return readReport(request);
  }
  return errorResponse("API endpointが見つかりません。", 404);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  if (path.length !== 1) {
    return errorResponse("API endpointが見つかりません。", 404);
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
  return errorResponse("API endpointが見つかりません。", 404);
}
