export const AGENT_LEGEND = [
  { label: "Support", dot: "bg-emerald-400", chip: "border-emerald-500/25 text-emerald-300" },
  { label: "Order", dot: "bg-sky-400", chip: "border-sky-500/25 text-sky-300" },
  { label: "Billing", dot: "bg-violet-400", chip: "border-violet-500/25 text-violet-300" },
];

// One per specialist, and each answerable from the seeded data — a starter
// that returns "no such order" teaches the visitor nothing. Kept short on
// purpose: these buttons size to their text, and anything that wraps to two
// lines makes the empty state look heavy. All four are read-only.
export const SUGGESTIONS = [
  "Recommend a running shoe",
  "Do you have Oxyfit in UK 8.5?",
  "Where is ORD-1042?",
  "Was I charged twice?",
];
