// Internal "standard model" the app maps any ad-hoc project Excel into.

export type ExcelCellValue = string | number | boolean | null;

/** A system-owned cell location. Write-back only ever touches anchored cells. */
export type Anchor = { sheet: string; cell: string; label: string };
export type AnchorMap = Record<string, Anchor>;

export type ExcelSheet = { name: string; rows: ExcelCellValue[][] };

export type ParsedTask = {
  index: number;
  sheet: string; // source worksheet name (a multi-sheet workbook = several projects)
  id: string; // source "ID" (e.g. "P1-01", "T-001"); "" if none
  subId: string; // source "Alt-ID"; "" if none (used to spot group-header rows)
  title: string;
  costCenter: string; // "Xərc Mərkəzi" — e.g. İnfrastruktur / Dev / Design; "" if none
  assignee: string; // primary responsible person
  assignee2: string; // secondary assignee ("İkinci İcraçı"); "" if none
  dependsOn: string; // raw dependency id(s) ("Asılılıq (ID)"); "" if none
  status: string;
  priority: string;
  start: string | null; // effective start: actual ?? expected ?? single
  end: string | null; // effective deadline: expected ?? single (used for overdue)
  expectedStart: string | null;
  actualStart: string | null;
  expectedEnd: string | null;
  actualEnd: string | null;
  hours: number | null; // estimated hours
  actualHours: number | null; // actual / logged hours
  hourlyRate: number | null; // "Saatlıq Ödəniş" — lets us derive actual cost
  budget: number | null; // effective/current budget: updated ?? initial ?? single
  initialBudget: number | null; // separate initial budget if the file had one
  note: string;
};

export type ExcelModel = {
  sheets: ExcelSheet[];
  meta: Record<string, ExcelCellValue>;
  tasks: ParsedTask[];
};

/** One field of a proposed write-back: current cell value → new value. */
export type WritebackItem = {
  field: string;
  label: string;
  sheet: string;
  cell: string;
  current: ExcelCellValue;
  next: ExcelCellValue;
  changed: boolean;
};
