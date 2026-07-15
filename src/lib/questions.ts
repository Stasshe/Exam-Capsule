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
    prompt: "12 + 8 はいくつですか？",
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
    prompt: "日本の首都はどこですか？",
    options: [
      { id: "a", label: "京都" },
      { id: "b", label: "大阪" },
      { id: "c", label: "東京" },
      { id: "d", label: "札幌" },
    ],
    correctOptionId: "c",
  },
  {
    id: "web",
    prompt: "通常のWeb通信を暗号化するプロトコルはどれですか？",
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
