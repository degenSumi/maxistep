export function ThreadSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((row) => (
        <div key={row} className={row % 2 === 0 ? "flex justify-end" : "flex gap-3"}>
          {row % 2 === 1 && <div className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-surface-2" />}
          <div className={`space-y-2 ${row % 2 === 0 ? "w-1/3" : "w-2/3"}`}>
            <div className="h-9 animate-pulse rounded-xl bg-surface-2" />
            {row % 2 === 1 && <div className="h-16 animate-pulse rounded-xl bg-surface-2/70" />}
          </div>
        </div>
      ))}
    </div>
  );
}
