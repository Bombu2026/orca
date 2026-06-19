export function parsePrice(input: string): number {
  if (typeof input !== "string") return NaN;
  const s = input.trim();
  if (!/[0-9]/.test(s)) return NaN;
  const decPos = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  const intPart = decPos === -1 ? s : s.slice(0, decPos);
  const decPart = decPos === -1 ? "" : s.slice(decPos + 1);
  const sign = intPart.includes("-") ? -1 : 1;
  const di = intPart.replace(/[^0-9]/g, "");
  const dd = decPart.replace(/[^0-9]/g, "");
  if (di === "" && dd === "") return NaN;
  return sign * parseFloat((di || "0") + "." + (dd || "0"));
}
