import { test, expect } from "bun:test";
import { parsePrice } from "./SUT";
const C: [string, number][] = [["1234.56",1234.56],["1,234.56",1234.56],["$1,234.56",1234.56],["€1 234,56",1234.56],["1.000,50",1000.5],["-12.50",-12.5],["12,50",12.5],["99",99]];
for (const [i,o] of C) test("ok "+i, () => expect(parsePrice(i)).toBeCloseTo(o,2));
for (const bad of ["abc",""]) test("nan "+JSON.stringify(bad), () => expect(Number.isNaN(parsePrice(bad))).toBe(true));
