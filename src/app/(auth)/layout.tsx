export const metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      {/* Cyan grid background */}
      <div className="bg-grid-cyan pointer-events-none absolute inset-0 opacity-40" />
      {/* Scanlines overlay */}
      <div className="scanlines pointer-events-none absolute inset-0" />
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(6,182,212,0.08) 0%, transparent 60%)',
        }}
      />
      <div className="relative z-10 w-full max-w-md animate-fade-in-up">{children}</div>
    </div>
  );
}
