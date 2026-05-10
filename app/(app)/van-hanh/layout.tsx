/**
 * Van-hanh group layout — no module guard at group level.
 * Each child route enforces its own moduleKey via layout guard.
 */
export default function VanHanhLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
