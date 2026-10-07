import type { ReactNode, Ref } from "react";

export function PageHeader({
  title,
  description,
  actions,
  headingRef,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  /** Lets pages move focus to the h1 (e.g. after deleting the focused item). */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-2xl">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere] outline-none"
        >
          {title}
        </h1>
        <p className="mt-2 text-lg [overflow-wrap:anywhere] text-muted">{description}</p>
      </div>
      {actions}
    </header>
  );
}
