// Internal "standard model" the app maps any ad-hoc project Excel into.

export type ExcelCellValue = string | number | boolean | null;

/** A system-owned cell location. Write-back only ever touches anchored cells. */
export type Anchor = { sheet: string; cell: string; label: string };
export type AnchorMap = Record<string, Anchor>;

export type ExcelSheet = { name: string; rows: ExcelCellValue[][] };

export type ParsedTask = {
  index: number;
  title: string;
  assignee: string;
  status: string;
  priority: string;
  start: string | null;
  end: string | null;
  hours: number | null; // estimated hours
  actualHours: number | null; // actual / logged hours
  budget: number | null;
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
