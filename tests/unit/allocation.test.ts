import { describe, expect, it } from "vitest";
import { allocateSplit } from "@/domain/expenses/allocation";

describe("equal allocation", () => {
  it("distributes residual minor units deterministically by participant ID", () => {
    const result = allocateSplit(10000n, {
      method: "EQUAL",
      participantIds: ["p-c", "p-a", "p-b"],
    });
    expect(result.allocations).toEqual([
      { participantId: "p-a", amountMinor: 3334n, method: "EQUAL", basisPoints: null, shares: null },
      { participantId: "p-b", amountMinor: 3333n, method: "EQUAL", basisPoints: null, shares: null },
      { participantId: "p-c", amountMinor: 3333n, method: "EQUAL", basisPoints: null, shares: null },
    ]);
    expect(result.residualMinor).toBe(1n);
    expect(result.residualRecipients).toEqual(["p-a"]);
    expect(result.allocations.reduce((acc, row) => acc + row.amountMinor, 0n)).toBe(10000n);
  });

  it("splits tiny totals predictably", () => {
    const result = allocateSplit(2n, { method: "EQUAL", participantIds: ["b", "a", "c"] });
    expect(result.allocations.map((row) => row.amountMinor)).toEqual([1n, 1n, 0n]);
    expect(result.residualMinor).toBe(2n);
  });

  it("is reproducible for the same IDs in any input order", () => {
    const first = allocateSplit(12345n, { method: "EQUAL", participantIds: ["z", "a", "m"] });
    const second = allocateSplit(12345n, { method: "EQUAL", participantIds: ["m", "z", "a"] });
    expect(first.allocations).toEqual(second.allocations);
  });

  it("rejects empty, duplicate, and invalid totals", () => {
    expect(() => allocateSplit(100n, { method: "EQUAL", participantIds: [] })).toThrow(/at least one/);
    expect(() => allocateSplit(100n, { method: "EQUAL", participantIds: ["a", "a"] })).toThrow(/only once/);
    expect(() => allocateSplit(0n, { method: "EQUAL", participantIds: ["a"] })).toThrow(/greater than zero/);
  });
});

describe("exact allocation", () => {
  it("accepts shares that sum exactly", () => {
    const result = allocateSplit(5000n, {
      method: "EXACT",
      entries: [
        { participantId: "a", amountMinor: 1500n },
        { participantId: "b", amountMinor: 3500n },
      ],
    });
    expect(result.allocations.map((row) => row.amountMinor)).toEqual([1500n, 3500n]);
  });

  it("rejects totals that exceed or fall short", () => {
    expect(() =>
      allocateSplit(5000n, {
        method: "EXACT",
        entries: [
          { participantId: "a", amountMinor: 1500n },
          { participantId: "b", amountMinor: 3600n },
        ],
      }),
    ).toThrow(/add up to/);
    expect(() =>
      allocateSplit(5000n, {
        method: "EXACT",
        entries: [
          { participantId: "a", amountMinor: 1500n },
          { participantId: "b", amountMinor: 3000n },
        ],
      }),
    ).toThrow(/add up to/);
  });
});

describe("percentage allocation", () => {
  it("handles an exact 100 percent split", () => {
    const result = allocateSplit(10000n, {
      method: "PERCENT",
      entries: [
        { participantId: "a", basisPoints: 3333 },
        { participantId: "b", basisPoints: 3333 },
        { participantId: "c", basisPoints: 3334 },
      ],
    });
    expect(result.allocations.map((row) => row.amountMinor)).toEqual([3333n, 3333n, 3334n]);
    expect(result.residualMinor).toBe(0n);
  });

  it("assigns residual units by largest remainder then participant ID", () => {
    const result = allocateSplit(100n, {
      method: "PERCENT",
      entries: [
        { participantId: "p-b", basisPoints: 3333 },
        { participantId: "p-a", basisPoints: 3333 },
        { participantId: "p-c", basisPoints: 3334 },
      ],
    });
    expect(result.allocations.map((row) => row.amountMinor)).toEqual([33n, 33n, 34n]);
    expect(result.residualMinor).toBe(1n);
    expect(result.residualRecipients).toEqual(["p-c"]);
  });

  it("requires exactly 10,000 basis points", () => {
    expect(() =>
      allocateSplit(100n, {
        method: "PERCENT",
        entries: [
          { participantId: "a", basisPoints: 5000 },
          { participantId: "b", basisPoints: 4999 },
        ],
      }),
    ).toThrow(/exactly 100%/);
  });
});

describe("shares allocation", () => {
  it("uses integer rational allocation with stable remainders", () => {
    const result = allocateSplit(10000n, {
      method: "SHARES",
      entries: [
        { participantId: "c", shares: 1 },
        { participantId: "a", shares: 2 },
        { participantId: "b", shares: 1 },
      ],
    });
    expect(result.allocations).toEqual([
      { participantId: "a", amountMinor: 5000n, method: "SHARES", basisPoints: null, shares: 2 },
      { participantId: "b", amountMinor: 2500n, method: "SHARES", basisPoints: null, shares: 1 },
      { participantId: "c", amountMinor: 2500n, method: "SHARES", basisPoints: null, shares: 1 },
    ]);
  });

  it("handles uneven weights and large amounts", () => {
    const result = allocateSplit(10_000_000_000n, {
      method: "SHARES",
      entries: [
        { participantId: "a", shares: 7 },
        { participantId: "b", shares: 11 },
      ],
    });
    expect(result.allocations.reduce((acc, row) => acc + row.amountMinor, 0n)).toBe(10_000_000_000n);
    expect(result.allocations.map((row) => row.amountMinor)).toEqual([3_888_888_889n, 6_111_111_111n]);
  });

  it("rejects zero and negative weights", () => {
    expect(() =>
      allocateSplit(100n, {
        method: "SHARES",
        entries: [{ participantId: "a", shares: 0 }],
      }),
    ).toThrow(/positive whole number/);
    expect(() =>
      allocateSplit(100n, {
        method: "SHARES",
        entries: [{ participantId: "a", shares: -1 }],
      }),
    ).toThrow(/positive whole number/);
  });
});
