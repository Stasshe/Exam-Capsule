import { useEffect, useRef, useState } from "react";

import { type IntegrityFailure, inspectQuestion } from "@/lib/integrity";
import type { Question } from "@/lib/questions";

type IntegrityOptions = {
  sessionId: string | null;
  question: Question | null;
  active: boolean;
  onFailure(failure: IntegrityFailure): void;
};

export function useIntegrity({
  sessionId,
  question,
  active,
  onFailure,
}: IntegrityOptions): IntegrityFailure | null {
  const [failure, setFailure] = useState<IntegrityFailure | null>(null);
  const reported = useRef(new Set<string>());
  const previousSession = useRef(sessionId);

  useEffect(() => {
    if (previousSession.current === sessionId) {
      return;
    }
    previousSession.current = sessionId;
    setFailure(null);
    reported.current.clear();
  }, [sessionId]);

  useEffect(() => {
    if (!active || !question || !sessionId || failure) {
      return;
    }

    const inspect = () => {
      const detected = inspectQuestion(question);
      if (!detected) {
        return;
      }

      setFailure(detected);
      const signature = `${question.id}:${detected.kind}:${detected.target}`;
      if (reported.current.has(signature)) {
        return;
      }
      reported.current.add(signature);
      onFailure(detected);
    };

    const interval = window.setInterval(inspect, 750);
    return () => window.clearInterval(interval);
  }, [active, failure, onFailure, question, sessionId]);

  return failure;
}
