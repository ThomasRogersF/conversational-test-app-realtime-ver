// ---------------------------------------------------------------------------
// Tool stubs — executed server-side when OpenAI invokes a function call.
// Replace these with real implementations later.
// ---------------------------------------------------------------------------

export interface ToolResult {
  ok: boolean;
  [key: string]: unknown;
}

/**
 * Grade the student's lesson performance.
 * TODO: Persist to a datastore, compute aggregate scores, etc.
 */
export function gradeLesson(args: Record<string, unknown>): ToolResult {
  const vocabScore = typeof args.vocabulary_score === "number" ? args.vocabulary_score : 0;
  const grammarScore = typeof args.grammar_score === "number" ? args.grammar_score : 0;
  const fluencyScore = typeof args.fluency_score === "number" ? args.fluency_score : 0;
  const average = (vocabScore + grammarScore + fluencyScore) / 3;

  return {
    ok: true,
    score: Math.round(average * 100) / 100,
    vocabulary_score: vocabScore,
    grammar_score: grammarScore,
    fluency_score: fluencyScore,
    notes: typeof args.notes === "string" ? args.notes : "stub",
  };
}

/**
 * Trigger a quiz for the student.
 * TODO: Generate real quiz questions from a question bank.
 */
export function triggerQuiz(
  args: Record<string, unknown>,
  scenarioId: string,
): ToolResult {
  return {
    ok: true,
    quiz: {
      lesson_id: typeof args.lesson_id === "string" ? args.lesson_id : scenarioId,
      focus: typeof args.focus === "string" ? args.focus : "vocabulary",
    },
  };
}

/**
 * Dispatch a tool call by name and return the JSON output string.
 */
export function executeTool(
  name: string,
  args: Record<string, unknown>,
  scenarioId: string,
): string {
  let result: ToolResult;

  switch (name) {
    case "grade_lesson":
      result = gradeLesson(args);
      break;
    case "trigger_quiz":
      result = triggerQuiz(args, scenarioId);
      break;
    default:
      result = { ok: false, error: `Unknown tool: ${name}` };
  }

  return JSON.stringify(result);
}
