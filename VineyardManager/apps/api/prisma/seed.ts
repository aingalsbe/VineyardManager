import { hash } from "bcryptjs";
import {
  layoutFromDefaultGrid,
  rowLengthFromPlanting,
} from "@vineyard/shared";
import {
  ActivityType,
  Prisma,
  PrismaClient,
  RowStatus,
  TaskStatus,
  TaskType,
  UserRole,
  YieldUnit,
} from "@prisma/client";

const prisma = new PrismaClient();

const SEED_OWNER_EMAIL = "owner@vineyard.local";
const SEED_MANAGER_EMAIL = "manager@vineyard.local";
const SEED_PASSWORD = "VineyardDev1!";
const SEED_VINEYARD_NAME = "Abide in the Vine Vineyard";
const LEGACY_SEED_VINEYARD_NAME = "Cedar Ridge Vineyard";

/**
 * TaskStatus is notification-oriented. For field work in this seed:
 * pending       = not started
 * sent          = in progress
 * acknowledged  = completed
 */
const WORK = {
  pending: TaskStatus.pending,
  inProgress: TaskStatus.sent,
  completed: TaskStatus.acknowledged,
} as const;

const defaultPrefs = {
  emailEnabled: true,
  pushEnabled: true,
  frequency: "weekly" as const,
};

const defaultThresholds = {
  greenMin: 80,
  yellowMin: 70,
  orangeMin: 60,
};

const NS_NOTE = "N–S: 23 @ 7', 3.5' ends.";
const EW_NOTE = "E–W: 10 @ 7', 3.5' ends.";
const nsLength = rowLengthFromPlanting({ vineCount: 23 });
const ewLength = rowLengthFromPlanting({ vineCount: 10 });

const rows: {
  code: string;
  oldCode: string;
  name: string;
  variety: string;
  vineCount: number;
  plantedYear: number;
  status: RowStatus;
  notes: string;
  axis: "ns" | "ew";
}[] = [
  {
    code: "NS1",
    oldCode: "L1",
    name: "North South 1",
    variety: "Norton",
    vineCount: 23,
    plantedYear: 2014,
    status: RowStatus.active,
    notes: "Best sun. Primary red for the home crush.",
    axis: "ns",
  },
  {
    code: "NS2",
    oldCode: "L2",
    name: "North South 2",
    variety: "Chardonel",
    vineCount: 23,
    plantedYear: 2016,
    status: RowStatus.active,
    notes: "Cooler air drainage toward the creek. Watch late frost.",
    axis: "ns",
  },
  {
    code: "NS3",
    oldCode: "L3",
    name: "North South 3",
    variety: "Concord",
    vineCount: 23,
    plantedYear: 2008,
    status: RowStatus.fallow,
    notes: "Juice grapes. Resting a season after Japanese beetle pressure.",
    axis: "ns",
  },
  {
    code: "NS4",
    oldCode: "L4",
    name: "North South 4",
    variety: "Norton",
    vineCount: 23,
    plantedYear: 2014,
    status: RowStatus.active,
    notes: NS_NOTE,
    axis: "ns",
  },
  {
    code: "EW1",
    oldCode: "S1",
    name: "East West 1",
    variety: "Vignoles",
    vineCount: 10,
    plantedYear: 2018,
    status: RowStatus.active,
    notes: "Tight clusters — bunch rot scouting in wet weeks.",
    axis: "ew",
  },
  {
    code: "EW2",
    oldCode: "S2",
    name: "East West 2",
    variety: "Chambourcin",
    vineCount: 10,
    plantedYear: 2012,
    status: RowStatus.replanting,
    notes: "Crown gall took the west end. Replacing vines this spring.",
    axis: "ew",
  },
  {
    code: "EW3",
    oldCode: "S3",
    name: "East West 3",
    variety: "Traminette",
    vineCount: 10,
    plantedYear: 2019,
    status: RowStatus.active,
    notes: "Newest high cordon. Still filling the wire.",
    axis: "ew",
  },
  {
    code: "EW4",
    oldCode: "S4",
    name: "East West 4",
    variety: "Vignoles",
    vineCount: 10,
    plantedYear: 2020,
    status: RowStatus.active,
    notes: EW_NOTE,
    axis: "ew",
  },
  {
    code: "EW5",
    oldCode: "S5",
    name: "East West 5",
    variety: "Chardonel",
    vineCount: 10,
    plantedYear: 2020,
    status: RowStatus.active,
    notes: EW_NOTE,
    axis: "ew",
  },
  {
    code: "EW6",
    oldCode: "S6",
    name: "East West 6",
    variety: "Chambourcin",
    vineCount: 10,
    plantedYear: 2020,
    status: RowStatus.active,
    notes: EW_NOTE,
    axis: "ew",
  },
  {
    code: "EW7",
    oldCode: "S7",
    name: "East West 7",
    variety: "Traminette",
    vineCount: 10,
    plantedYear: 2020,
    status: RowStatus.active,
    notes: EW_NOTE,
    axis: "ew",
  },
  {
    code: "EW8",
    oldCode: "S8",
    name: "East West 8",
    variety: "Concord",
    vineCount: 10,
    plantedYear: 2020,
    status: RowStatus.active,
    notes: EW_NOTE,
    axis: "ew",
  },
  {
    code: "EW9",
    oldCode: "S9",
    name: "East West 9",
    variety: "Concord",
    vineCount: 10,
    plantedYear: 2020,
    status: RowStatus.active,
    notes: EW_NOTE,
    axis: "ew",
  },
  {
    code: "EW10",
    oldCode: "S10",
    name: "East West 10",
    variety: "Norton",
    vineCount: 10,
    plantedYear: 2020,
    status: RowStatus.active,
    notes: EW_NOTE,
    axis: "ew",
  },
  {
    code: "EW11",
    oldCode: "S11",
    name: "East West 11",
    variety: "Vignoles",
    vineCount: 10,
    plantedYear: 2020,
    status: RowStatus.active,
    notes: EW_NOTE,
    axis: "ew",
  },
];

const SEED_CREW = "Seed history";
const HARVEST_YEARS = [2022, 2023, 2024, 2025] as const;
const ACTIVITY_YEARS = [2022, 2023, 2024, 2025, 2026] as const;
const LB_PER_VINE: Record<string, number> = {
  Norton: 36,
  Chardonel: 20,
  Concord: 30,
  Vignoles: 31,
  Chambourcin: 26,
  Traminette: 22,
};
const HARVEST_MD: Record<string, string> = {
  Norton: "09-18",
  Chardonel: "08-22",
  Concord: "09-02",
  Vignoles: "09-06",
  Chambourcin: "09-12",
  Traminette: "09-10",
};

function withPlantingNote(existing: string | null, tag: string): string {
  if (existing?.includes("@ 7'")) return existing;
  if (existing?.trim()) return `${existing.trim()} ${tag}`;
  return tag;
}

async function findLiveRow(vineyardId: string, code: string) {
  return prisma.row.findFirst({
    where: { vineyardId, code, deletedAt: null },
  });
}

async function vacateCode(
  vineyardId: string,
  code: string,
  keepId?: string,
) {
  const blockers = await prisma.row.findMany({
    where: {
      vineyardId,
      code,
      ...(keepId ? { id: { not: keepId } } : {}),
    },
  });
  for (const blocker of blockers) {
    await prisma.row.update({
      where: { id: blocker.id },
      data: {
        code: `${code}__old_${blocker.id.slice(0, 8)}`,
        deletedAt: blocker.deletedAt ?? new Date(),
      },
    });
  }
}

async function main() {
  const passwordHash = await hash(SEED_PASSWORD, 10);

  const owner = await prisma.user.upsert({
    where: { email: SEED_OWNER_EMAIL },
    update: {
      displayName: "Aaron Ingalsbe",
      role: UserRole.power_user,
      passwordHash,
      deletedAt: null,
    },
    create: {
      email: SEED_OWNER_EMAIL,
      passwordHash,
      displayName: "Aaron Ingalsbe",
      role: UserRole.power_user,
      notificationPrefs: defaultPrefs,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: SEED_MANAGER_EMAIL },
    update: {
      displayName: "Maya Chen",
      role: UserRole.manager,
      passwordHash,
      deletedAt: null,
    },
    create: {
      email: SEED_MANAGER_EMAIL,
      passwordHash,
      displayName: "Maya Chen",
      role: UserRole.manager,
      notificationPrefs: {
        ...defaultPrefs,
        frequency: "as_needed",
      },
    },
  });

  const existingVineyard = await prisma.vineyard.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { name: SEED_VINEYARD_NAME },
        { name: LEGACY_SEED_VINEYARD_NAME },
        { ownerId: owner.id },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const vineyard =
    existingVineyard === null
      ? await prisma.vineyard.create({
          data: {
            ownerId: owner.id,
            name: SEED_VINEYARD_NAME,
            address: "21480 Moonlight Rd, Spring Hill, KS 66083",
            lat: 38.7432,
            lng: -94.8251,
            timezone: "America/Chicago",
            healthThresholds: defaultThresholds,
          },
        })
      : await prisma.vineyard.update({
          where: { id: existingVineyard.id },
          data: { name: SEED_VINEYARD_NAME, deletedAt: null },
        });

  const createdRows: Awaited<ReturnType<typeof prisma.row.create>>[] = [];
  for (const spec of rows) {
    const length = spec.axis === "ns" ? nsLength : ewLength;
    const tag = spec.axis === "ns" ? NS_NOTE : EW_NOTE;
    const liveNew = await findLiveRow(vineyard.id, spec.code);
    const liveOld = liveNew
      ? null
      : await findLiveRow(vineyard.id, spec.oldCode);
    const existing = liveNew ?? liveOld;

    if (existing) {
      await vacateCode(vineyard.id, spec.code, existing.id);
      createdRows.push(
        await prisma.row.update({
          where: { id: existing.id },
          data: {
            code: spec.code,
            name: spec.name,
            variety: spec.variety,
            vineCount: spec.vineCount,
            lengthFeet: length.lengthFeet,
            lengthInches: length.lengthInches,
            notes: withPlantingNote(existing.notes, tag),
            deletedAt: null,
          },
        }),
      );
    } else {
      await vacateCode(vineyard.id, spec.code);
      createdRows.push(
        await prisma.row.create({
          data: {
            vineyardId: vineyard.id,
            code: spec.code,
            name: spec.name,
            variety: spec.variety,
            vineCount: spec.vineCount,
            lengthFeet: length.lengthFeet,
            lengthInches: length.lengthInches,
            plantedYear: spec.plantedYear,
            status: spec.status,
            notes: spec.notes,
          },
        }),
      );
    }
  }

  const keepCodes = rows.map((spec) => spec.code);
  await prisma.row.updateMany({
    where: {
      vineyardId: vineyard.id,
      deletedAt: null,
      code: { notIn: keepCodes },
    },
    data: { deletedAt: new Date() },
  });

  const catalog = [
    ...new Set(
      createdRows
        .map((row) => row.variety.trim())
        .filter((name) => name.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b));

  await prisma.vineyard.update({
    where: { id: vineyard.id },
    data: {
      rowLayout: layoutFromDefaultGrid(
        createdRows.map((row) => ({ id: row.id, code: row.code })),
      ) as unknown as Prisma.InputJsonValue,
      varietyCatalog: catalog as unknown as Prisma.InputJsonValue,
    },
  });

  const byCode = new Map(createdRows.map((row) => [row.code, row]));

  const rowId = (code: string): string => {
    const row = byCode.get(code);
    if (!row) {
      throw new Error(`Seed is missing row ${code}`);
    }
    return row.id;
  };

  const due = (isoDate: string) => new Date(`${isoDate}T14:00:00-05:00`);

  const existingTaskCount = await prisma.task.count({
    where: { vineyardId: vineyard.id },
  });
  if (existingTaskCount === 0) {

  await prisma.task.createMany({
    data: [
      {
        vineyardId: vineyard.id,
        rowId: rowId("NS1"),
        userId: owner.id,
        type: TaskType.maintenance,
        relatedActivityType: ActivityType.pruning,
        title: "Dormant prune North Slope Norton",
        body: "Spur prune to 4–5 buds. Leave renewal spurs on the west end where last year’s wood was weak.",
        dueAt: due("2026-03-08"),
        status: WORK.pending,
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("NS2"),
        userId: manager.id,
        type: TaskType.maintenance,
        relatedActivityType: ActivityType.pest_prevention,
        title: "Japanese beetle spray — Creek Bench",
        body: "In progress: first Surround pass on Chardonel. Recheck undersides of leaves after the next rain.",
        dueAt: due("2026-07-12"),
        status: WORK.inProgress,
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("EW1"),
        userId: manager.id,
        type: TaskType.maintenance,
        relatedActivityType: ActivityType.watering,
        title: "Drip cycle Hilltop East",
        body: "Vignoles showing midday wilt. 45 minutes drip, then probe 8 inches down.",
        dueAt: due("2026-08-16"),
        status: WORK.pending,
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("EW2"),
        userId: owner.id,
        type: TaskType.maintenance,
        relatedActivityType: ActivityType.vine_replacement,
        title: "Replace Chambourcin vines on Road Front",
        body: "Holes dug on the west end. Grafted vines in the cooler. Finish planting and water in.",
        dueAt: due("2026-04-20"),
        status: WORK.inProgress,
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("EW3"),
        userId: manager.id,
        type: TaskType.maintenance,
        relatedActivityType: ActivityType.fertilization,
        title: "Spring feed West Trellis Traminette",
        body: "0.5 lb 10-10-10 per vine after bud break. Skip the two weak end vines.",
        dueAt: due("2026-04-28"),
        status: WORK.pending,
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("EW3"),
        userId: manager.id,
        type: TaskType.maintenance,
        relatedActivityType: ActivityType.weed_prevention,
        title: "Strip spray West Trellis",
        body: "Keep a 2-foot weed-free strip. Avoid drift onto new shoots.",
        dueAt: due("2026-05-18"),
        status: WORK.pending,
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("NS2"),
        userId: owner.id,
        type: TaskType.maintenance,
        relatedActivityType: ActivityType.winterization,
        title: "Hill up Creek Bench for winter",
        body: "Completed Nov 2025. Graft unions covered; drip lines blown out.",
        dueAt: due("2025-11-15"),
        status: WORK.completed,
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("NS1"),
        userId: owner.id,
        type: TaskType.maintenance,
        relatedActivityType: ActivityType.harvest,
        title: "2025 Norton harvest — North Slope",
        body: "Picked 18 Sep 2025. 842 lb, mostly best/better. Held for the home red.",
        dueAt: due("2025-09-18"),
        status: WORK.completed,
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("EW1"),
        userId: manager.id,
        type: TaskType.maintenance,
        relatedActivityType: ActivityType.harvest,
        title: "2025 Vignoles harvest — Hilltop East",
        body: "Picked 6 Sep 2025. 310 lb. Some bunch rot on the lower wires; sorted in the barn.",
        dueAt: due("2025-09-06"),
        status: WORK.completed,
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("NS2"),
        userId: owner.id,
        type: TaskType.maintenance,
        relatedActivityType: ActivityType.harvest,
        title: "2025 Chardonel harvest — Creek Bench",
        body: "Picked 22 Aug 2025. 468 lb, good condition. Pressed the same afternoon.",
        dueAt: due("2025-08-22"),
        status: WORK.completed,
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("NS2"),
        userId: manager.id,
        type: TaskType.weather,
        title: "Late frost watch — Creek Bench",
        body: "Forecast 29°F Thursday night. Covers staged. In progress: checking the low end first.",
        dueAt: due("2026-04-09"),
        status: WORK.inProgress,
      },
      {
        vineyardId: vineyard.id,
        rowId: null,
        userId: owner.id,
        type: TaskType.health_summary,
        title: "Weekly vineyard health digest",
        body: "Whole-property summary for the growing season. No row scope.",
        dueAt: due("2026-08-17"),
        status: WORK.pending,
      },
    ],
  });
  }

  await seedMetricsHistory({
    vineyardId: vineyard.id,
    ownerId: owner.id,
    rows: createdRows,
    due,
  });

  const [rowCount, taskCount, harvestCount, activityCount] = await Promise.all([
    prisma.row.count({
      where: { vineyardId: vineyard.id, deletedAt: null },
    }),
    prisma.task.count({ where: { vineyardId: vineyard.id } }),
    prisma.harvest.count({ where: { vineyardId: vineyard.id } }),
    prisma.activity.count({ where: { vineyardId: vineyard.id } }),
  ]);

  console.log(
    `Seeded ${SEED_VINEYARD_NAME}: 2 users, 1 vineyard, ${rowCount} rows, ${taskCount} tasks, ${harvestCount} harvests, ${activityCount} activities.`,
  );
}

function harvestAmountLb(
  row: { code: string; variety: string; vineCount: number },
  year: number,
): number {
  const perVine = LB_PER_VINE[row.variety] ?? 22;
  const yearNudge = 1 + (year - 2023) * 0.05;
  const last = row.code.charCodeAt(row.code.length - 1) || 0;
  const codeNudge = 1 + ((last % 5) - 2) * 0.04;
  return Math.round(row.vineCount * perVine * yearNudge * codeNudge);
}

function skipHarvestYear(
  row: { status: RowStatus },
  year: number,
): boolean {
  if (row.status === RowStatus.fallow && year >= 2025) return true;
  if (row.status === RowStatus.replanting && year >= 2025) return true;
  return false;
}

async function seedMetricsHistory({
  vineyardId,
  ownerId,
  rows,
  due,
}: {
  vineyardId: string;
  ownerId: string;
  rows: Array<{
    id: string;
    code: string;
    variety: string;
    vineCount: number;
    status: RowStatus;
  }>;
  due: (isoDate: string) => Date;
}) {
  await prisma.harvest.deleteMany({
    where: {
      vineyardId,
      OR: [
        { crew: SEED_CREW },
        {
          crew: { in: ["Aaron + Maya", "Aaron", "Maya Chen", "Family"] },
        },
      ],
    },
  });

  await prisma.activity.deleteMany({
    where: {
      vineyardId,
      OR: [
        { source: "imported" },
        {
          source: "manual",
          performedAt: {
            in: [
              due("2026-08-10"),
              due("2026-03-08"),
              due("2026-07-12"),
            ],
          },
        },
      ],
    },
  });

  const harvests: Prisma.HarvestCreateManyInput[] = [];
  for (const row of rows) {
    for (const year of HARVEST_YEARS) {
      if (skipHarvestYear(row, year)) continue;
      const md = HARVEST_MD[row.variety] ?? "09-10";
      harvests.push({
        vineyardId,
        rowId: row.id,
        harvestedAt: due(`${year}-${md}`),
        yieldAmount: harvestAmountLb(row, year),
        yieldUnit: YieldUnit.lb,
        notes: `${year} ${row.variety} pick on ${row.code}.`,
        crew: SEED_CREW,
      });
    }
  }
  if (harvests.length > 0) {
    await prisma.harvest.createMany({ data: harvests });
  }

  const activities: Prisma.ActivityCreateManyInput[] = [];
  for (const year of ACTIVITY_YEARS) {
    const waterMonths = year === 2026 ? [5, 6, 7, 8] : [5, 6, 7, 8, 9];
    for (const month of waterMonths) {
      activities.push({
        vineyardId,
        rowId: null,
        scopeType: "vineyard",
        scopeId: vineyardId,
        activityType: ActivityType.watering,
        performedAt: due(`${year}-${String(month).padStart(2, "0")}-15`),
        performedBy: ownerId,
        details: {
          notes: "Whole-property drip cycle.",
          durationMin: 45,
          method: "drip",
        },
        source: "imported",
      });
    }
  }

  const rowWork: Array<{
    type: ActivityType;
    monthDay: string;
    throughYear: number;
    details: Prisma.InputJsonValue;
  }> = [
    {
      type: ActivityType.pruning,
      monthDay: "03-08",
      throughYear: 2026,
      details: { notes: "Dormant prune." },
    },
    {
      type: ActivityType.fertilization,
      monthDay: "04-20",
      throughYear: 2026,
      details: { product: "10-10-10", amountPerVine: 0.5, unit: "lb" },
    },
    {
      type: ActivityType.weed_prevention,
      monthDay: "05-18",
      throughYear: 2026,
      details: { method: "spray" },
    },
    {
      type: ActivityType.pest_prevention,
      monthDay: "06-12",
      throughYear: 2026,
      details: { method: "spray", targetPests: ["Japanese beetle"] },
    },
    {
      type: ActivityType.winterization,
      monthDay: "11-15",
      throughYear: 2025,
      details: { notes: "Hill up graft unions." },
    },
  ];

  for (const row of rows) {
    for (const work of rowWork) {
      for (const year of ACTIVITY_YEARS) {
        if (year > work.throughYear) continue;
        activities.push({
          vineyardId,
          rowId: row.id,
          scopeType: "row",
          scopeId: row.id,
          activityType: work.type,
          performedAt: due(`${year}-${work.monthDay}`),
          performedBy: ownerId,
          details: work.details,
          source: "imported",
        });
      }
    }
  }

  activities.push({
    vineyardId,
    rowId: rows.find((row) => row.code === "NS2")?.id ?? null,
    scopeType: "row",
    scopeId: rows.find((row) => row.code === "NS2")?.id ?? vineyardId,
    activityType: ActivityType.health_observation,
    performedAt: due("2026-07-12"),
    performedBy: ownerId,
    details: { notes: "Japanese beetles on Chardonel. Surround already on." },
    source: "imported",
  });

  if (activities.length > 0) {
    await prisma.activity.createMany({ data: activities });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
