// A prompt the app itself puts to a worker, the question about the tabs it holds (tab-idle.ts). Its
// turn is not the worker's work: session-requests.ts keeps the report it ended its last turn with,
// main's notice of that stop and whose turn it was on, so `pane report` never prints "Closed tab 4."
// and main still hears the worker finished. The opening line tells it apart, the way asksForReport
// tells main's prompts apart.
export const APP_QUESTION_OPENING = 'The Dashboard app asks:';

export function isAppQuestion(prompt: string): boolean {
  return prompt.trimStart().startsWith(APP_QUESTION_OPENING);
}
