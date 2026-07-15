import type { ReactNode } from "react";

interface FinanceSectionCardProps {
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
}

export function FinanceSectionCard({ title, description, aside, children }: FinanceSectionCardProps) {
  return (
    <section className="nq-card overflow-hidden">
      <div className="nq-card-head flex-col items-start sm:flex-row">
        <div className="min-w-0">
          <h2 className="nq-card-title">{title}</h2>
          {description && <p className="nq-card-sub">{description}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
