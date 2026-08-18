import { getProjectComparison } from "@/lib/reports/comparison";
import { ComparisonView } from "@/components/compare/comparison-view";

export default async function ComparePage() {
  const rows = await getProjectComparison();
  return <ComparisonView rows={rows} />;
}
