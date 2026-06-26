export const CATEGORIES = {
  MODMAIL: "Modmail",
  PARTNERSHIP: "Partnerships",
  POJ: "Ping on Join",
  APPEALS: "Appeals",
  APPLY: "Applications",
} as const;

export type CategoryName = (typeof CATEGORIES)[keyof typeof CATEGORIES];

export const AUTO_CATEGORIES = [
  CATEGORIES.MODMAIL,
  CATEGORIES.PARTNERSHIP,
  CATEGORIES.POJ,
  CATEGORIES.APPEALS,
  CATEGORIES.APPLY,
];

export const MENU_OPTIONS: { label: string; emoji: string; value: string; description: string }[] = [
  { label: "General Support",   emoji: "📬", value: CATEGORIES.MODMAIL,      description: "Talk to staff about anything" },
  { label: "Partnership",       emoji: "🤝", value: CATEGORIES.PARTNERSHIP,  description: "Propose a partnership with us" },
  { label: "Ping on Join",      emoji: "📥", value: CATEGORIES.POJ,          description: "Request a ping-on-join setup" },
  { label: "Appeal",            emoji: "⚖️", value: CATEGORIES.APPEALS,      description: "Appeal a punishment or ban" },
  { label: "Apply",             emoji: "📝", value: CATEGORIES.APPLY,        description: "Apply for a staff or other role" },
];
