export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="space-y-1.5">
        <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted" />
      </div>

      {/* Current plan summary card */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="h-6 w-28 animate-pulse rounded-md bg-muted" />
              <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="text-right space-y-1.5">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>

      {/* Order usage card */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-5 w-5 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-80 animate-pulse rounded bg-muted" />
        </div>
      </div>

      {/* Plan cards section */}
      <div>
        <div className="h-6 w-40 animate-pulse rounded-md bg-muted mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-card p-5">
              <div className="h-5 w-24 animate-pulse rounded-md bg-muted mb-2" />
              <div className="h-8 w-16 animate-pulse rounded-md bg-muted mb-3" />
              <div className="space-y-2 mb-4">
                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {/* FAQ card */}
      <div className="rounded-xl border border-white/[0.06] bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-b border-white/[0.06] pb-4 last:border-0 last:pb-0">
              <div className="h-4 w-56 animate-pulse rounded bg-muted mb-2" />
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
