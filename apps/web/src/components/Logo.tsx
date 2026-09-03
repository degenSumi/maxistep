interface LogoProps {
  className?: string;
}

/**
 * Side-profile mid-top sneaker. Drawn large and scaled down rather than
 * authored at 24x24 — at icon size the toe box flattens out and the shape
 * stops reading as a shoe.
 */
export function Logo({ className = "h-4 w-4" }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g transform="translate(1.1 4.1) scale(0.196)" fill="currentColor">
        <path d="M12 52V24C12 11 20 3 33 3h6c5 0 9 3 10 8l6 16c2 7 8 12 16 13l30 4c14 2 21 5 22 12v2H12z" />
        <rect x="2" y="58" width="107" height="14" rx="7" />
      </g>
    </svg>
  );
}
