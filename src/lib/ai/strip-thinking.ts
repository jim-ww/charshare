/** Some models emit their reasoning as literal <think>...</think> (or
 *  <think:id>...</think:id>) tags inside the content string instead of a
 *  separate field. Strip those out so raw chain-of-thought never reaches
 *  the chat UI or gets saved into history. */
export function stripThinking(text: string): string {
	const withoutClosed = text.replace(/<think[^>]*>[\s\S]*?<\/think[^>]*>/gi, '');
	return withoutClosed.replace(/<think[^>]*>[\s\S]*$/i, '');
}
