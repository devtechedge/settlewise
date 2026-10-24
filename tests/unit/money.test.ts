import { describe, expect, it } from "vitest";
import {
  formatMinor,
  formatMinorSigned,
  minorToPlainString,
  parseMinorDigits,
  parseMoneyToMinor,
  parsePercentToBasisPoints,
  parsePositiveMoneyToMinor,
} from "@/domain/money/money";
import { getCurrency } from "@/domain/money/currency";

describe("money parsing", () => {
  it("parses two-decimal currencies exactly", () => {
    expect(parseMoneyToMinor("123.45", "INR")).toBe(12345n);
    expect(parseMoneyToMinor("0.01", "USD")).toBe(1n);
    expect(parseMoneyToMinor("12", "EUR")).toBe(1200n);
    expect(parseMoneyToMinor("12.5", "GBP")).toBe(1250n);
  });

  it("respects currencies without two decimal places", () => {
    expect(parseMoneyToMinor("1234", "JPY")).toBe(1234n);
    expect(parseMoneyToMinor("1.234", "KWD")).toBe(1234n);
    expect(() => parseMoneyToMinor("12.34", "JPY")).toThrow(/whole-number/);
    expect(() => parseMoneyToMinor("1.2345", "KWD")).toThrow(/at most 3/);
  });

  it("rejects ambiguous and unsafe inputs", () => {
    expect(() => parseMoneyToMinor("1,000.00", "USD")).toThrow(/digits only/);
    expect(() => parseMoneyToMinor("1e3", "USD")).toThrow(/digits only/);
    expect(() => parseMoneyToMinor("-5.00", "USD")).toThrow(/digits only/);
    expect(() => parseMoneyToMinor("  ", "USD")).toThrow(/Enter an amount/);
    expect(() => parseMoneyToMinor("9999999999999.99", "USD")).toThrow(/larger than the supported limit/);
    expect(() => parseMoneyToMinor("0.001", "USD")).toThrow(/at most 2/);
  });

  it("allows zero only for non-positive checks", () => {
    expect(parseMinorDigits("0", 2)).toBe(0n);
    expect(() => parsePositiveMoneyToMinor("0", "USD")).toThrow(/greater than zero/);
  });

  it("formats minor units without floating point arithmetic for display values", () => {
    expect(minorToPlainString(12345n, getCurrency("INR"))).toBe("123.45");
    expect(minorToPlainString(1234n, getCurrency("JPY"))).toBe("1234");
    expect(minorToPlainString(1234n, getCurrency("KWD"))).toBe("1.234");
    expect(formatMinor(12345n, "USD").replace(/\u00a0/g, " ")).toContain("123.45");
    expect(formatMinorSigned(12345n, "USD")).toMatch(/^\+/);
    expect(formatMinorSigned(-12345n, "USD")).toMatch(/^-/);
    expect(formatMinorSigned(0n, "USD")).not.toMatch(/^[+-]/);
  });

  it("parses percentages into integer basis points", () => {
    expect(parsePercentToBasisPoints("33.33")).toBe(3333);
    expect(parsePercentToBasisPoints("100")).toBe(10000);
    expect(parsePercentToBasisPoints("0.5")).toBe(50);
    expect(() => parsePercentToBasisPoints("33.333")).toThrow(/two decimal/);
    expect(() => parsePercentToBasisPoints("100.01")).toThrow(/between 0 and 100/);
  });
});
