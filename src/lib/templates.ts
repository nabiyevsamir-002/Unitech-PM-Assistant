import type { Priority } from "@/lib/constants";

export type TemplateTask = {
  title: string;
  priority: Priority;
  estimatedHours: number;
  offsetDays: number; // start = project start + offsetDays
  durationDays: number; // due = start + durationDays
};

export type ProjectTemplate = {
  id: string;
  name: string;
  description: string;
  color: string;
  currency: string;
  tasks: TemplateTask[];
};

// Predefined templates for UniTech's recurring project types. Titles are in
// Azerbaijani (user-facing); dates are relative offsets so a project can be
// spun up instantly from a chosen start date.
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "security-audit",
    name: "Kibertəhlükəsizlik auditi",
    description: "Nüfuz testi, zəiflik təhlili və audit hesabatı.",
    color: "#dc2626",
    currency: "USD",
    tasks: [
      { title: "Əhatə dairəsinin müəyyənləşdirilməsi", priority: "HIGH", estimatedHours: 8, offsetDays: 0, durationDays: 2 },
      { title: "Zəiflik skanı (nüfuz testi)", priority: "URGENT", estimatedHours: 24, offsetDays: 2, durationDays: 4 },
      { title: "Şəbəkə arxitekturasının təhlili", priority: "HIGH", estimatedHours: 16, offsetDays: 3, durationDays: 3 },
      { title: "Sosial mühəndislik testi", priority: "MEDIUM", estimatedHours: 10, offsetDays: 6, durationDays: 2 },
      { title: "Audit hesabatının hazırlanması", priority: "HIGH", estimatedHours: 12, offsetDays: 10, durationDays: 3 },
      { title: "Nəticələrin müştəriyə təqdimatı", priority: "MEDIUM", estimatedHours: 4, offsetDays: 13, durationDays: 1 },
    ],
  },
  {
    id: "mobile-app",
    name: "Mobil tətbiq",
    description: "Tələblərdən mağaza yayımınadək tam mobil tətbiq axını.",
    color: "#4f46e5",
    currency: "AZN",
    tasks: [
      { title: "Tələblərin toplanması", priority: "HIGH", estimatedHours: 16, offsetDays: 0, durationDays: 3 },
      { title: "UI/UX dizaynı", priority: "MEDIUM", estimatedHours: 24, offsetDays: 3, durationDays: 5 },
      { title: "Backend və API", priority: "HIGH", estimatedHours: 40, offsetDays: 8, durationDays: 8 },
      { title: "Frontend inteqrasiyası", priority: "HIGH", estimatedHours: 32, offsetDays: 10, durationDays: 8 },
      { title: "Test və QA", priority: "MEDIUM", estimatedHours: 16, offsetDays: 18, durationDays: 4 },
      { title: "App Store yayımı", priority: "LOW", estimatedHours: 6, offsetDays: 22, durationDays: 2 },
    ],
  },
  {
    id: "cloud-migration",
    name: "Bulud miqrasiyası",
    description: "İnfrastruktur auditi, planlaşdırma və təhlükəsiz köçürmə.",
    color: "#0891b2",
    currency: "AZN",
    tasks: [
      { title: "Mövcud infrastrukturun auditi", priority: "HIGH", estimatedHours: 10, offsetDays: 0, durationDays: 3 },
      { title: "Miqrasiya planı", priority: "HIGH", estimatedHours: 16, offsetDays: 3, durationDays: 4 },
      { title: "Verilənlər bazasının köçürülməsi", priority: "URGENT", estimatedHours: 24, offsetDays: 7, durationDays: 5 },
      { title: "Şəbəkə təhlükəsizliyi konfiqurasiyası", priority: "MEDIUM", estimatedHours: 12, offsetDays: 12, durationDays: 3 },
      { title: "İstifadəçi təlimi", priority: "LOW", estimatedHours: 8, offsetDays: 15, durationDays: 2 },
    ],
  },
  {
    id: "web-portal",
    name: "Veb portal / sayt",
    description: "Korporativ veb portal — dizayndan yayımadək.",
    color: "#16a34a",
    currency: "AZN",
    tasks: [
      { title: "Tələblər və konsepsiya", priority: "HIGH", estimatedHours: 12, offsetDays: 0, durationDays: 2 },
      { title: "Dizayn", priority: "MEDIUM", estimatedHours: 20, offsetDays: 2, durationDays: 4 },
      { title: "Frontend", priority: "HIGH", estimatedHours: 30, offsetDays: 6, durationDays: 6 },
      { title: "Backend və CMS", priority: "HIGH", estimatedHours: 36, offsetDays: 6, durationDays: 8 },
      { title: "Test", priority: "MEDIUM", estimatedHours: 14, offsetDays: 14, durationDays: 3 },
      { title: "Yayım", priority: "LOW", estimatedHours: 6, offsetDays: 17, durationDays: 1 },
    ],
  },
];

export function getTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.id === id);
}
