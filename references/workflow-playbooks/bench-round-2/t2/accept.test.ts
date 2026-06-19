import { test, expect } from "bun:test";
import { nextBillingDate as f } from "./SUT";
test("clamp feb", () => expect(f("2025-01-31",1)).toBe("2025-02-28"));
test("clamp leap", () => expect(f("2024-01-31",1)).toBe("2024-02-29"));
test("clamp apr30", () => expect(f("2025-03-31",1)).toBe("2025-04-30"));
test("normal", () => expect(f("2025-01-15",1)).toBe("2025-02-15"));
test("year rollover + clamp", () => expect(f("2025-11-30",3)).toBe("2026-02-28"));
test("year rollover", () => expect(f("2025-12-15",1)).toBe("2026-01-15"));
