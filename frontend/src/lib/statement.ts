/**
 * Strips identifying numbers from statement text before it leaves the
 * browser. Holdings need tickers, share counts and prices, none of which
 * look like these, so nothing useful is lost.
 */
export function scrubStatement(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b\d{5}-\d{7}-\d\b/g, "[id]") // CNIC
    .replace(/\+?\d[\d -]{10,}\d/g, (run) => (run.replace(/\D/g, "").length >= 11 ? "[number]" : run)) // phones
    .replace(/\d{9,}/g, "[number]") // account, CDC and other long numbers
    .replace(/[ \t]+/g, " ")
    .trim();
}
