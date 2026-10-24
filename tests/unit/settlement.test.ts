import { describe, expect, it } from "vitest";
import {
  computeNetBalances,
  computeSettlementPlan,
  generateSettlementPlan,
} from "@/domain/settlement/settlement";

const dinner = {
  payerParticipantId: "maya",
  amountMinor: 300000n,
  splits: [
    { participantId: "maya", allocatedMinor: 100000n },
    { participantId: "arjun", allocatedMinor: 100000n },
    { participantId: "leela", allocatedMinor: 100000n },
  ],
};

describe("net balances", () => {
  it("computes signed positions that sum to zero", () => {
    const balances = computeNetBalances({ expenses: [dinner], participantIds: ["maya", "arjun", "leela"] });
    expect(balances).toEqual([
      { participantId: "arjun", netMinor: -100000n },
      { participantId: "leela", netMinor: -100000n },
      { participantId: "maya", netMinor: 200000n },
    ]);
    expect(balances.reduce((acc, row) => acc + row.netMinor, 0n)).toBe(0n);
  });

  it("applies recorded payments as equal and opposite movements", () => {
    const balances = computeNetBalances({
      expenses: [dinner],
      payments: [{ senderParticipantId: "arjun", recipientParticipantId: "maya", amountMinor: 40000n }],
    });
    expect(balances.find((row) => row.participantId === "arjun")?.netMinor).toBe(-60000n);
    expect(balances.find((row) => row.participantId === "maya")?.netMinor).toBe(160000n);
  });

  it("rejects a ledger whose splits do not sum to the expense", () => {
    expect(() =>
      computeNetBalances({
        expenses: [
          {
            payerParticipantId: "a",
            amountMinor: 100n,
            splits: [{ participantId: "a", allocatedMinor: 99n }],
          },
        ],
      }),
    ).toThrow(/do not sum/);
  });

  it("rejects negative payments", () => {
    expect(() =>
      computeNetBalances({
        expenses: [],
        payments: [{ senderParticipantId: "a", recipientParticipantId: "b", amountMinor: -1n }],
      }),
    ).toThrow(/non-positive payment/);
  });
});

describe("settlement planning", () => {
  it("reconciles transfer totals with both sides of the ledger", () => {
    const plan = computeSettlementPlan({
      expenses: [dinner],
      participantIds: ["maya", "arjun", "leela"],
    });
    expect(plan.transfers).toEqual([
      { fromParticipantId: "arjun", toParticipantId: "maya", amountMinor: 100000n, fromBalanceBefore: -100000n, toBalanceBefore: 200000n },
      { fromParticipantId: "leela", toParticipantId: "maya", amountMinor: 100000n, fromBalanceBefore: -100000n, toBalanceBefore: 100000n },
    ]);
    expect(plan.totalMinor).toBe(200000n);
    expect(plan.debtorTotalMinor).toBe(200000n);
    expect(plan.creditorTotalMinor).toBe(200000n);
  });

  it("consolidates a chain of obligations", () => {
    const plan = computeSettlementPlan({
      expenses: [
        { payerParticipantId: "a", amountMinor: 1000n, splits: [{ participantId: "b", allocatedMinor: 1000n }] },
        { payerParticipantId: "b", amountMinor: 1000n, splits: [{ participantId: "c", allocatedMinor: 1000n }] },
      ],
    });
    expect(plan.transfers).toEqual([
      { fromParticipantId: "c", toParticipantId: "a", amountMinor: 1000n, fromBalanceBefore: -1000n, toBalanceBefore: 1000n },
    ]);
  });

  it("matches multiple debtors and creditors deterministically", () => {
    const balances = [
      { participantId: "d1", netMinor: -700n },
      { participantId: "d2", netMinor: -300n },
      { participantId: "c1", netMinor: 500n },
      { participantId: "c2", netMinor: 500n },
    ];
    const first = generateSettlementPlan(balances);
    const second = generateSettlementPlan([...balances].reverse());
    expect(first.transfers).toEqual(second.transfers);
    expect(first.totalMinor).toBe(1000n);
    expect(first.transfers).toEqual([
      { fromParticipantId: "d1", toParticipantId: "c1", amountMinor: 500n, fromBalanceBefore: -700n, toBalanceBefore: 500n },
      { fromParticipantId: "d1", toParticipantId: "c2", amountMinor: 200n, fromBalanceBefore: -200n, toBalanceBefore: 500n },
      { fromParticipantId: "d2", toParticipantId: "c2", amountMinor: 300n, fromBalanceBefore: -300n, toBalanceBefore: 300n },
    ]);
  });

  it("returns an empty plan when everyone is settled", () => {
    const plan = generateSettlementPlan([
      { participantId: "a", netMinor: 0n },
      { participantId: "b", netMinor: 0n },
    ]);
    expect(plan.transfers).toEqual([]);
    expect(plan.isSettled).toBe(true);
    expect(plan.totalMinor).toBe(0n);
  });

  it("refuses unbalanced input", () => {
    expect(() => generateSettlementPlan([{ participantId: "a", netMinor: 1n }])).toThrow(/sum to zero/);
  });

  it("keeps minor units exact for large ledgers", () => {
    const plan = computeSettlementPlan({
      expenses: [
        {
          payerParticipantId: "a",
          amountMinor: 999_999_999_999n,
          splits: [
            { participantId: "a", allocatedMinor: 333_333_333_333n },
            { participantId: "b", allocatedMinor: 333_333_333_333n },
            { participantId: "c", allocatedMinor: 333_333_333_333n },
          ],
        },
      ],
    });
    expect(plan.totalMinor).toBe(666_666_666_666n);
  });
});
