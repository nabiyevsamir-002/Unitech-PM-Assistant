import { ExcelOrganizeView } from "@/components/excel/excel-organize-view";

// Excel → AI → Copy: upload the company workbook, the AI organizes it into a
// clean table + Azerbaijani PM analysis, then the user copies it back by hand.
export default function ExcelPage() {
  return <ExcelOrganizeView />;
}
