export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="space-y-1.5">
        <div className="h-7 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>

      <div className="space-y-8">
        {/* 1. Meta Credentials card */}
        <div className="rounded-xl border border-white/[0.06] bg-card">
          <div className="px-6 py-4 border-b border-white/[0.06] space-y-1.5">
            <div className="h-5 w-36 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-72 animate-pulse rounded bg-muted" />
          </div>
          <div className="p-6 space-y-4">
            {/* Pixel ID field */}
            <div className="space-y-1.5">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
            </div>
            {/* Access Token field */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-72 animate-pulse rounded bg-muted" />
            </div>
            {/* Test Event Code field */}
            <div className="space-y-1.5">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-80 animate-pulse rounded bg-muted" />
            </div>
            {/* Save button */}
            <div className="flex justify-end pt-1">
              <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        </div>

        {/* 2. Event Toggles card */}
        <div className="rounded-xl border border-white/[0.06] bg-card">
          <div className="px-6 py-4 border-b border-white/[0.06] space-y-1.5">
            <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-60 animate-pulse rounded bg-muted" />
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                      <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="h-3 w-44 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        </div>

        {/* 3. Consent Mode card */}
        <div className="rounded-xl border border-white/[0.06] bg-card">
          <div className="px-6 py-4 border-b border-white/[0.06] space-y-1.5">
            <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-80 animate-pulse rounded bg-muted" />
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {/* Strict option */}
              <div className="flex items-start gap-3 p-3 rounded-lg border-2 border-white/[0.06]">
                <div className="h-4 w-4 mt-0.5 animate-pulse rounded-full bg-muted flex-shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                </div>
              </div>
              {/* Lax option */}
              <div className="flex items-start gap-3 p-3 rounded-lg border-2 border-white/[0.06]">
                <div className="h-4 w-4 mt-0.5 animate-pulse rounded-full bg-muted flex-shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        </div>

        {/* 4. JS Snippet card */}
        <div className="rounded-xl border border-white/[0.06] bg-card">
          <div className="px-6 py-4 border-b border-white/[0.06] flex flex-row items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-5 w-24 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="p-6 space-y-3">
            {/* Code block skeleton */}
            <div className="bg-black/40 rounded-lg p-4 border border-white/[0.06] space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted/60" />
            </div>
            {/* Help text */}
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>

        {/* 5. Danger Zone card */}
        <div className="rounded-xl border border-red-500/10 border-l-2 border-l-red-500/30 bg-card">
          <div className="px-6 py-4 border-b border-red-500/10 space-y-1.5">
            <div className="h-5 w-28 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-72 animate-pulse rounded bg-muted" />
          </div>
          <div className="p-6 space-y-4">
            {/* Rotate API Key row */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-80 animate-pulse rounded bg-muted" />
                <div className="h-3 w-64 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-8 w-24 flex-shrink-0 animate-pulse rounded-md bg-muted" />
            </div>
            {/* Separator */}
            <div className="h-px w-full bg-white/[0.06]" />
            {/* Deactivate Workspace row */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-3 w-72 animate-pulse rounded bg-muted" />
                <div className="h-3 w-56 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-8 w-24 flex-shrink-0 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
