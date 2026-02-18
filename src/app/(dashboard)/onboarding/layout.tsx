// Minimal pass-through layout for the onboarding route.
// The onboarding page renders as a fixed full-screen overlay
// so the dashboard sidebar is visually hidden beneath it.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
