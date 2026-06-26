export const CATEGORIES = {
  MODMAIL: "Modmail",
  PARTNERSHIP: "Partnerships",
  POJ: "Ping on Join",
  APPEALS: "Appeals",
} as const;

export type CategoryName = (typeof CATEGORIES)[keyof typeof CATEGORIES];

export const AUTO_CATEGORIES = [
  CATEGORIES.MODMAIL,
  CATEGORIES.PARTNERSHIP,
  CATEGORIES.POJ,
  CATEGORIES.APPEALS,
];
