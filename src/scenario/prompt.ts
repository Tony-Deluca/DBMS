/** Estrae il testo del prompt (il primo blocco ```text o ````text) da PROMPT_GENERATORE.md. */
export function estraiPrompt(markdown: string): string {
  const m = /(`{3,})text\n([\s\S]*?)\n\1/.exec(markdown);
  return m ? m[2] : markdown;
}
