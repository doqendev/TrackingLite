export default function Loading() {
  return (
    <div className="space-y-5">
      {/* Page header skeleton */}
      <div className="space-y-1.5">
        <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </div>

      {/* Filter bar skeleton */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* "Filter:" label */}
          <div className="h-4 w-12 animate-pulse rounded bg-muted" />

          {/* Event type pills — All + 5 event names */}
          {["w-20", "w-16", "w-24", "w-20", "w-28", "w-16"].map((w, i) => (
            <div key={i} className={`h-7 ${w} animate-pulse rounded-full bg-muted`} />
          ))}

          {/* Separator */}
          <div className="h-5 w-px bg-muted mx-1" />

          {/* Status pills — All + 4 statuses */}
          {["w-10", "w-12", "w-16", "w-14", "w-16"].map((w, i) => (
            <div key={i} className={`h-7 ${w} animate-pulse rounded-full bg-muted`} />
          ))}
        </div>
      </div>

      {/* Events table skeleton */}
      <div className="rounded-xl border border-white/[0.06] bg-card overflow-hidden">
        {/* Table header row */}
        <div className="grid grid-cols-6 gap-4 px-4 py-3 border-b border-white/[0.06]">
          {["w-10", "w-20", "w-24", "w-14", "w-28", "w-16"].map((w, i) => (
            <div key={i} className={`h-3 ${w} animate-pulse rounded bg-muted`} />
          ))}
        </div>

        {/* 8 skeleton body rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-6 gap-4 px-4 py-3.5 border-b border-white/[0.03] last:border-0"
          >
            <div className="h-3 w-10 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}

        {/* Pagination footer skeleton */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
          <div className="h-3 w-36 animate-pulse rounded bg-muted" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
