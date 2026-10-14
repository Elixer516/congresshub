// Shown instantly while an admin page loads, so taps feel immediate.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-7 w-48 rounded-md bg-surface-2" />
      <div className="mb-6 h-4 w-72 max-w-full rounded-md bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <div className="mt-6 space-y-2 rounded-xl border border-border bg-surface p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-10 rounded-md bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
