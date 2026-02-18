export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      {/* Dot grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(20,184,166,0.06) 0%, transparent 60%)',
        }}
      />
      <div className="relative z-10 w-full max-w-md animate-fade-in-up">{children}</div>
    </div>
  );
}
