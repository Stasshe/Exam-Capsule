export type Question = {
  id: string;
  prompt: string;
  options: Array<{
    id: string;
    label: string;
  }>;
};

type QuestionDefinition = Question & {
  correctOptionId: string;
};

const questions: QuestionDefinition[] = [
  {
    id: "arithmetic",
    prompt: "What is 12 + 8?",
    options: [
      { id: "a", label: "18" },
      { id: "b", label: "20" },
      { id: "c", label: "22" },
      { id: "d", label: "24" },
    ],
    correctOptionId: "b",
  },
  {
    id: "capital",
    prompt: "What is the capital of Japan?",
    options: [
      { id: "a", label: "Kyoto" },
      { id: "b", label: "Osaka" },
      { id: "c", label: "Tokyo" },
      { id: "d", label: "Sapporo" },
    ],
    correctOptionId: "c",
  },
  {
    id: "web",
    prompt: "Which protocol encrypts ordinary web traffic in transit?",
    options: [
      { id: "a", label: "HTTP" },
      { id: "b", label: "FTP" },
      { id: "c", label: "HTTPS" },
      { id: "d", label: "DNS" },
    ],
    correctOptionId: "c",
  },
];

export function getQuestion(index: number): Question | null {
  const question = questions[index];
  if (!question) {
    return null;
  }

  return {
    id: question.id,
    prompt: question.prompt,
    options: question.options,
  };
}

export function getQuestionDefinition(questionId: string): QuestionDefinition | null {
  return questions.find((question) => question.id === questionId) ?? null;
}

export function getQuestionCount(): number {
  return questions.length;
}
