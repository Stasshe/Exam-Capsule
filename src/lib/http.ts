import type { NextRequest } from "next/server";

import { authenticateSession } from "@/lib/store";

export function getAuthenticatedSession(request: NextRequest) {
  const sessionId = request.headers.get("x-exam-session") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  let token = "";
  if (authorization.startsWith("Bearer ")) {
    token = authorization.slice(7);
  }
  return authenticateSession(sessionId, token);
}

export function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
