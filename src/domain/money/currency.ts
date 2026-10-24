export type Currency = {
  code: string;
  name: string;
  precision: number;
  locale: string;
  symbol: string;
};

export const CURRENCIES = {
  INR: { code: "INR", name: "Indian rupee", precision: 2, locale: "en-IN", symbol: "₹" },
  USD: { code: "USD", name: "US dollar", precision: 2, locale: "en-US", symbol: "$" },
  EUR: { code: "EUR", name: "Euro", precision: 2, locale: "en-IE", symbol: "€" },
  GBP: { code: "GBP", name: "British pound", precision: 2, locale: "en-GB", symbol: "£" },
  JPY: { code: "JPY", name: "Japanese yen", precision: 0, locale: "ja-JP", symbol: "¥" },
  KWD: { code: "KWD", name: "Kuwaiti dinar", precision: 3, locale: "en-KW", symbol: "KD" },
} as const satisfies Record<string, Currency>;

export type CurrencyCode = keyof typeof CURRENCIES;

export const SUPPORTED_CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(CURRENCIES, value);
}

export function getCurrency(code: string): Currency {
  if (!isCurrencyCode(code)) {
    throw new Error(`Unsupported currency: ${code}`);
  }
  return CURRENCIES[code];
}

export const SPLIT_METHODS = ["EQUAL", "EXACT", "PERCENT", "SHARES"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

export const EXPENSE_CATEGORIES = [
  "GROCERIES",
  "DINING",
  "RENT",
  "UTILITIES",
  "TRAVEL",
  "TRANSPORT",
  "ENTERTAINMENT",
  "HEALTH",
  "SHOPPING",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  GROCERIES: "Groceries",
  DINING: "Dining",
  RENT: "Rent",
  UTILITIES: "Utilities",
  TRAVEL: "Travel",
  TRANSPORT: "Transport",
  ENTERTAINMENT: "Entertainment",
  HEALTH: "Health",
  SHOPPING: "Shopping",
  OTHER: "Other",
};

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}
