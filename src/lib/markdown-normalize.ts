function stripFenceWrapper(input: string): string {
  const text = input.trim();
  const tripleBacktick = /^```(?:markdown|md|mdx|text|txt)?\s*[\r\n]+([\s\S]*?)[\r\n]*```$/i;
  const tripleQuote = /^'''(?:markdown|md|text|txt)?\s*[\r\n]+([\s\S]*?)[\r\n]*'''$/i;
  const backtickMatch = text.match(tripleBacktick);
  if (backtickMatch) return backtickMatch[1] ?? "";
  const quoteMatch = text.match(tripleQuote);
  if (quoteMatch) return quoteMatch[1] ?? "";
  return text;
}

export function normalizeMarkdownOutput(raw: string): string {
  if (!raw) return "";

  let result = raw.replace(/^\uFEFF/, "");
  result = stripFenceWrapper(result);
  result = result.replace(/\r\n/g, "\n");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/[ \t]+\n/g, "\n");
  result = result.replace(/\n{3,}$/g, "\n\n");

  return result.trim();
}

