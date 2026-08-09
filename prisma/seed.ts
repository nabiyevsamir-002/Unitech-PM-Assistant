import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Base "today" = 2026-08-06 (Baku). Helpers produce dates relative to it.
const TODAY = new Date("2026-08-06T09:00:00+04:00");
const day = 24 * 60 * 60 * 1000;
const rel = (days: number) => new Date(TODAY.getTime() + days * day);

async function main() {
  console.log("Seeding database…");

  // Wipe existing data (idempotent reseed).
  await prisma.auditLog.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.excelSource.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("demo1234", 10);

  // ---- Users ----
  const owner = await prisma.user.create({
    data: {
      name: "Aygün Məmmədova",
      email: "owner@unitech.az",
      passwordHash,
      role: "OWNER",
      weeklyCapacityHours: 40,
      skills: JSON.stringify(["strategiya", "idarəetmə"]),
    },
  });
  const deputy = await prisma.user.create({
    data: {
      name: "Rəşad Əliyev",
      email: "deputy@unitech.az",
      passwordHash,
      role: "DEPUTY_OWNER",
      weeklyCapacityHours: 40,
      skills: JSON.stringify(["arxitektura", "cloud"]),
    },
  });
  const pm = await prisma.user.create({
    data: {
      name: "Samir Nəbiyev",
      email: "pm@unitech.az",
      passwordHash,
      role: "PM",
      weeklyCapacityHours: 40,
      skills: JSON.stringify(["layihə idarəetmə", "backend"]),
    },
  });
  const nigar = await prisma.user.create({
    data: {
      name: "Nigar Hüseynova",
      email: "nigar@unitech.az",
      passwordHash,
      role: "MEMBER",
      weeklyCapacityHours: 40,
      skills: JSON.stringify(["frontend", "React"]),
    },
  });
  const elvin = await prisma.user.create({
    data: {
      name: "Elvin Quliyev",
      email: "elvin@unitech.az",
      passwordHash,
      role: "MEMBER",
      weeklyCapacityHours: 40,
      skills: JSON.stringify(["kibertəhlükəsizlik", "audit"]),
    },
  });
  const leyla = await prisma.user.create({
    data: {
      name: "Leyla Rəhimova",
      email: "leyla@unitech.az",
      passwordHash,
      role: "MEMBER",
      weeklyCapacityHours: 30,
      skills: JSON.stringify(["dizayn", "QA"]),
    },
  });

  // ---- Clients ----
  const azeriBank = await prisma.client.create({
    data: {
      name: "AzeriBank ASC",
      contactName: "Kamran Vəliyev",
      contactInfo: "kamran@azeribank.az",
    },
  });
  const municipality = await prisma.client.create({
    data: {
      name: "Bakı Şəhər Bələdiyyəsi",
      contactName: "Səbinə Quliyeva",
      contactInfo: "sabina@baku.gov.az",
    },
  });
  const megaMarket = await prisma.client.create({
    data: {
      name: "MegaMarket MMC",
      contactName: "Tural Əhmədov",
      contactInfo: "tural@megamarket.az",
    },
  });

  // ---- Projects ----
  const banking = await prisma.project.create({
    data: {
      name: "AzeriBank Mobil Bankçılıq",
      clientId: azeriBank.id,
      status: "ACTIVE",
      startDate: rel(-40),
      dueDate: rel(35),
      currency: "AZN",
      color: "#4f46e5",
    },
  });
  const cloud = await prisma.project.create({
    data: {
      name: "Bələdiyyə Bulud Miqrasiyası",
      clientId: municipality.id,
      status: "ACTIVE",
      startDate: rel(-20),
      dueDate: rel(50),
      currency: "AZN",
      color: "#0891b2",
    },
  });
  const security = await prisma.project.create({
    data: {
      name: "MegaMarket Kibertəhlükəsizlik Auditi",
      clientId: megaMarket.id,
      status: "ACTIVE",
      startDate: rel(-10),
      dueDate: rel(12),
      currency: "USD",
      color: "#dc2626",
    },
  });
  const crm = await prisma.project.create({
    data: {
      name: "UniTech Daxili CRM",
      status: "ON_HOLD",
      startDate: rel(-60),
      dueDate: rel(70),
      currency: "AZN",
      color: "#16a34a",
    },
  });

  // ---- Tasks ----
  type TaskSeed = {
    project: string;
    title: string;
    description?: string;
    status: string;
    assigneeId?: string;
    priority: string;
    dueOffset?: number;
    estimatedHours?: number;
    order: number;
  };

  const projectMap: Record<string, string> = {
    banking: banking.id,
    cloud: cloud.id,
    security: security.id,
    crm: crm.id,
  };

  const tasks: TaskSeed[] = [
    // Banking
    { project: "banking", title: "Tələblərin toplanması", status: "DONE", assigneeId: pm.id, priority: "HIGH", dueOffset: -30, estimatedHours: 16, order: 0 },
    { project: "banking", title: "UI/UX dizaynı", status: "DONE", assigneeId: leyla.id, priority: "MEDIUM", dueOffset: -15, estimatedHours: 24, order: 1 },
    { project: "banking", title: "Giriş və identifikasiya modulu", status: "IN_PROGRESS", assigneeId: nigar.id, priority: "HIGH", dueOffset: 3, estimatedHours: 20, order: 0 },
    { project: "banking", title: "Kart əməliyyatları API", status: "IN_PROGRESS", assigneeId: pm.id, priority: "URGENT", dueOffset: -1, estimatedHours: 30, order: 1 },
    { project: "banking", title: "Ödəniş inteqrasiyası testi", status: "REVIEW", assigneeId: elvin.id, priority: "HIGH", dueOffset: 5, estimatedHours: 12, order: 0 },
    { project: "banking", title: "Push bildiriş sistemi", status: "TODO", assigneeId: nigar.id, priority: "MEDIUM", dueOffset: 10, estimatedHours: 14, order: 0 },
    { project: "banking", title: "App Store yayımı", status: "TODO", priority: "LOW", dueOffset: 30, estimatedHours: 6, order: 1 },

    // Cloud
    { project: "cloud", title: "Mövcud infrastrukturun auditi", status: "DONE", assigneeId: deputy.id, priority: "HIGH", dueOffset: -12, estimatedHours: 10, order: 0 },
    { project: "cloud", title: "Miqrasiya planı", status: "IN_PROGRESS", assigneeId: deputy.id, priority: "HIGH", dueOffset: 0, estimatedHours: 16, order: 0 },
    { project: "cloud", title: "Verilənlər bazasının köçürülməsi", status: "TODO", assigneeId: pm.id, priority: "URGENT", dueOffset: 7, estimatedHours: 24, order: 0 },
    { project: "cloud", title: "Şəbəkə təhlükəsizliyi konfiqurasiyası", status: "TODO", assigneeId: elvin.id, priority: "MEDIUM", dueOffset: 14, estimatedHours: 12, order: 1 },
    { project: "cloud", title: "İstifadəçi təlimi", status: "TODO", priority: "LOW", dueOffset: 40, estimatedHours: 8, order: 2 },

    // Security
    { project: "security", title: "Zəiflik skanı (nüfuz testi)", status: "IN_PROGRESS", assigneeId: elvin.id, priority: "URGENT", dueOffset: 0, estimatedHours: 20, order: 0 },
    { project: "security", title: "Şəbəkə arxitekturasının təhlili", status: "IN_PROGRESS", assigneeId: elvin.id, priority: "HIGH", dueOffset: 2, estimatedHours: 16, order: 1 },
    { project: "security", title: "Sosial mühəndislik testi", status: "TODO", assigneeId: nigar.id, priority: "MEDIUM", dueOffset: 4, estimatedHours: 10, order: 0 },
    { project: "security", title: "Audit hesabatının hazırlanması", status: "TODO", assigneeId: pm.id, priority: "HIGH", dueOffset: 11, estimatedHours: 12, order: 1 },
    { project: "security", title: "Nəticələrin müştəriyə təqdimatı", status: "REVIEW", assigneeId: elvin.id, priority: "HIGH", dueOffset: -2, estimatedHours: 4, order: 0 },

    // CRM (on hold)
    { project: "crm", title: "Modul spesifikasiyası", status: "DONE", assigneeId: pm.id, priority: "MEDIUM", dueOffset: -50, estimatedHours: 12, order: 0 },
    { project: "crm", title: "Hesabat modulunun yenilənməsi", status: "TODO", assigneeId: leyla.id, priority: "LOW", dueOffset: 60, estimatedHours: 18, order: 0 },
  ];

  for (const t of tasks) {
    // Derive a start date so the Gantt view has real bars: roughly one working
    // day per 8 estimated hours, at least 2 days, ending on the due date.
    let startDate: Date | null = null;
    if (t.dueOffset !== undefined) {
      const durationDays = Math.max(2, Math.ceil((t.estimatedHours ?? 8) / 8));
      startDate = rel(t.dueOffset - durationDays);
    }
    await prisma.task.create({
      data: {
        projectId: projectMap[t.project],
        title: t.title,
        description: t.description,
        status: t.status,
        assigneeId: t.assigneeId,
        priority: t.priority,
        startDate,
        dueDate: t.dueOffset !== undefined ? rel(t.dueOffset) : null,
        estimatedHours: t.estimatedHours,
        orderIndex: t.order,
      },
    });
  }

  // ---- Task dependencies (for the Gantt view) ----
  const linkDeps = async (taskTitle: string, dependsOnTitles: string[]) => {
    const task = await prisma.task.findFirst({ where: { title: taskTitle } });
    if (!task) return;
    const deps = await prisma.task.findMany({
      where: { title: { in: dependsOnTitles } },
      select: { id: true },
    });
    await prisma.task.update({
      where: { id: task.id },
      data: { dependsOnTaskIds: JSON.stringify(deps.map((d) => d.id)) },
    });
  };
  await linkDeps("Kart əməliyyatları API", ["Giriş və identifikasiya modulu"]);
  await linkDeps("Ödəniş inteqrasiyası testi", ["Kart əməliyyatları API"]);
  await linkDeps("Push bildiriş sistemi", ["Giriş və identifikasiya modulu"]);
  await linkDeps("App Store yayımı", [
    "Push bildiriş sistemi",
    "Ödəniş inteqrasiyası testi",
  ]);
  await linkDeps("Verilənlər bazasının köçürülməsi", ["Miqrasiya planı"]);
  await linkDeps("Şəbəkə təhlükəsizliyi konfiqurasiyası", [
    "Verilənlər bazasının köçürülməsi",
  ]);

  // ---- Excel source (demo) — points to the generated ad-hoc sample file,
  // with the key anchors confirmed (as a human would on first connect). ----
  await prisma.excelSource.create({
    data: {
      projectId: banking.id,
      fileLocation: "sample-data/azeribank-mobil.xlsx",
      anchors: JSON.stringify({
        status: { sheet: "İzləmə", cell: "B7", label: "Layihə statusu" },
        progress: { sheet: "İzləmə", cell: "B10", label: "Ümumi irəliləyiş (%)" },
        lastUpdated: { sheet: "İzləmə", cell: "B11", label: "Son yenilənmə" },
        summaryTotal: { sheet: "Xülasə", cell: "B3", label: "Ümumi tapşırıq" },
        summaryDone: { sheet: "Xülasə", cell: "B4", label: "Tamamlanmış" },
        summaryInProgress: { sheet: "Xülasə", cell: "B5", label: "İcrada" },
        summaryOverdue: { sheet: "Xülasə", cell: "B6", label: "Gecikmiş" },
      }),
      confirmed: true,
    },
  });

  // ---- Pending approvals (proposed by agents) ----
  await prisma.approval.create({
    data: {
      type: "CHANGE_DEADLINE",
      proposedByAgent: "Monitoring",
      title: "«Kart əməliyyatları API» tapşırığının bitmə tarixini uzatmaq",
      summary:
        "Bu tapşırıq artıq gecikib və icradadır. Monitorinq agenti bitmə tarixini 4 gün irəli çəkməyi təklif edir ki, real qrafikə uyğun olsun.",
      payload: JSON.stringify({
        entity: "task",
        title: "Kart əməliyyatları API",
        field: "dueDate",
        from: rel(-1).toISOString(),
        to: rel(3).toISOString(),
      }),
      status: "PENDING",
      requestedAt: rel(0),
    },
  });
  await prisma.approval.create({
    data: {
      type: "ASSIGN_TASK",
      proposedByAgent: "Planning",
      title: "«Push bildiriş sistemi» tapşırığını Elvinə təyin etmək",
      summary:
        "Nigarın həftəlik yükü yüksəkdir. Planlama agenti balans üçün bu tapşırığı Elvin Quliyevə təyin etməyi təklif edir.",
      payload: JSON.stringify({
        entity: "task",
        title: "Push bildiriş sistemi",
        field: "assignee",
        from: "Nigar Hüseynova",
        to: "Elvin Quliyev",
      }),
      status: "PENDING",
      requestedAt: rel(0),
    },
  });
  await prisma.approval.create({
    data: {
      type: "SEND_MESSAGE",
      proposedByAgent: "Communication",
      title: "AzeriBank müştərisinə həftəlik status mesajı",
      summary:
        "Kommunikasiya agenti müştəriyə göndərilmək üçün həftəlik irəliləyiş mesajı hazırlayıb. Göndərilmədən əvvəl təsdiq tələb olunur.",
      payload: JSON.stringify({
        channel: "email",
        to: "kamran@azeribank.az",
        subject: "Həftəlik status: Mobil Bankçılıq layihəsi",
        body:
          "Hörmətli Kamran bəy,\n\nBu həftə giriş modulu və kart əməliyyatları API üzərində işlər davam edir. Ödəniş inteqrasiyası testi yoxlama mərhələsindədir. Növbəti həftə push bildiriş sisteminə başlayacağıq.\n\nHörmətlə,\nUniTech komandası",
      }),
      status: "PENDING",
      requestedAt: rel(0),
    },
  });

  // ---- Audit log samples ----
  await prisma.auditLog.create({
    data: {
      actor: `user:${pm.id}`,
      action: "TASK_STATUS_CHANGED",
      entity: "task:banking",
      before: JSON.stringify({ status: "TODO" }),
      after: JSON.stringify({ status: "IN_PROGRESS" }),
      timestamp: rel(-1),
    },
  });
  await prisma.auditLog.create({
    data: {
      actor: "agent:Monitoring",
      action: "RISK_DETECTED",
      entity: "project:security",
      after: JSON.stringify({ note: "2 tapşırıq təcili prioritetlə gecikir" }),
      timestamp: rel(0),
    },
  });

  console.log("Seed complete.");
  console.log("Demo login: owner@unitech.az / demo1234 (and deputy@, pm@, nigar@, elvin@, leyla@)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
