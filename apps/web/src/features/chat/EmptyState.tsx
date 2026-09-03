import { Logo } from "../../components/Logo.js";
import { AGENT_LEGEND, SUGGESTIONS } from "./constants.js";

interface EmptyStateProps {
  onPick: (text: string) => void;
  disabled: boolean;
  /** The widget has roughly a third of the height, so it shows a reduced version. */
  compact?: boolean;
}

export function EmptyState({ onPick, disabled, compact = false }: EmptyStateProps) {
  const suggestions = compact ? SUGGESTIONS.slice(0, 2) : SUGGESTIONS;

  return (
    <div className="flex w-full flex-col items-center text-center">
      <div
        className={`glow-brand flex items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-hi to-brand text-white ${
          compact ? "mb-4 h-12 w-12 rounded-[18px]" : "mb-5 h-16 w-16 md:mb-7 md:h-20 md:w-20 md:rounded-[26px]"
        }`}
      >
        <Logo className={compact ? "h-7 w-7" : "h-9 w-9 md:h-11 md:w-11"} />
      </div>

      <h1 className={`font-semibold tracking-tight ${compact ? "text-2xl" : "text-4xl md:text-5xl"}`}>
        MaxiStep
      </h1>
      <p
        className={`font-medium uppercase text-brand-soft ${
          compact
            ? "mt-1.5 text-[10px] tracking-[0.18em]"
            : "mt-2 text-[11px] tracking-[0.2em] md:mt-2.5 md:text-[12px] md:tracking-[0.3em]"
        }`}
      >
        Shoes for every step
      </p>

      {!compact && (
        <div className="mt-5 h-px w-20 bg-gradient-to-r from-transparent via-line to-transparent md:mt-6" />
      )}

      <h2 className={`font-medium text-ink/90 ${compact ? "mt-4 text-base" : "mt-5 text-lg md:mt-6"}`}>
        How can we help, Suz?
      </h2>
      <p
        className={`mx-auto text-muted ${
          compact ? "mt-1.5 max-w-xs text-[13px] leading-snug" : "mt-2 max-w-md text-sm leading-relaxed"
        }`}
      >
        {compact
          ? "Ask about sizing, an order or a charge — it routes itself to the right specialist."
          : "Ask about fit and sizing, track an order, swap a pair for another size, or query a charge. Every answer is looked up against real stock and order data — and you can watch it pick the right specialist as it goes."}
      </p>

      {!compact && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {AGENT_LEGEND.map(({ label, chip, dot }) => (
            <span
              key={label}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${chip}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
              {label}
            </span>
          ))}
        </div>
      )}

      <div
        className={`grid w-full gap-2.5 ${
          compact ? "mt-5 max-w-xs grid-cols-1" : "mt-6 max-w-lg grid-cols-1 sm:grid-cols-2 md:mt-8"
        }`}
      >
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onPick(suggestion)}
            className="lift flex items-center rounded-xl border border-line bg-surface/70 px-4 py-3 text-left text-[13px] text-ink/80 hover:border-brand/35 hover:bg-surface-2 disabled:opacity-40 disabled:hover:transform-none"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
