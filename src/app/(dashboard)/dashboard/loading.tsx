export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Stats cards — 4-column grid matching StatsCards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-9 w-20 animate-pulse rounded-md bg-muted mb-1" />
            <div className="h-3 w-36 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Quick info row — 3-column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-card p-4">
            <div className="h-3 w-16 animate-pulse rounded bg-muted mb-2" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Recent events card */}
      <div className="rounded-xl border border-white/[0.06] bg-card overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted" />
        </div>

        {/* Table header row */}
        <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-white/[0.04]">
          {["w-10", "w-16", "w-20", "w-12", "w-16"].map((w, i) => (
            <div key={i} className={`h-3 ${w} animate-pulse rounded bg-muted`} />
          ))}
        </div>

        {/* 5 skeleton rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-4 px-5 py-3.5 border-b border-white/[0.03] last:border-0"
          >
            <div className="h-3 w-10 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
