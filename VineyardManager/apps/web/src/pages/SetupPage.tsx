import { PageHeader } from "@/components/PageHeader";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const steps = [
  {
    title: "Varieties",
    body: "Add the grapes you grow. Lookup can fill water needs and prune windows later.",
  },
  {
    title: "Map rows",
    body: "Create rows (L1, S1, …), vine counts, spacing, orientation, and which block they belong to.",
  },
  {
    title: "Calendar",
    body: "Set the vineyard address so a typical Jan–Dec schedule can be seeded and then edited.",
  },
  {
    title: "Health colors",
    body: "Keep the default green / yellow / orange / red cutoffs or tighten how soon a missed task turns orange.",
  },
];

export function SetupPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Setup"
        description="Do this once: varieties, rows, calendar, and health thresholds. Then the dashboard has something to color."
      />
      <ol className="grid gap-4 md:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Card>
              <p className="text-sm font-medium text-primary">
                Step {index + 1}
              </p>
              <CardTitle className="mt-1">{step.title}</CardTitle>
              <CardDescription>{step.body}</CardDescription>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
