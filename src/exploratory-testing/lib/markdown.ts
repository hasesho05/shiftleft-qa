/**
 * Escape a string for safe use in a Markdown table cell.
 * Replaces pipe characters and newlines so the cell content does not
 * break the table structure.
 */
export function escapePipe(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}
