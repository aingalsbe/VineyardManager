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
  name: string;
  variety: string;
  vineCount: number;
  plantedYear: number;
  status: RowStatus;
  notes: string;
  axis: "ns" | "ew";
  updateExisting: boolean;
}[] = [
  {
    code: "L1",
    name: "North Slope",
    variety: "Norton",
    vineCount: 23,
    plantedYear: 2014,
    status: RowStatus.active,
    notes: "Best sun. Primary red for the home crush.",
    axis: "ns",
    updateExisting: true,
  },
  {
    code: "L2",
    name: "Creek Bench",
    variety: "Chardonel",
    vineCount: 23,
    plantedYear: 2016,
    status: RowStatus.active,
    notes: "Cooler air drainage toward the creek. Watch late frost.",
    axis: "ns",
    updateExisting: true,
  },
  {
    code: "L3",
    name: "Old Home Row",
    variety: "Concord",
    vineCount: 23,
    plantedYear: 2008,
    status: RowStatus.fallow,
    notes: "Juice grapes. Resting a season after Japanese beetle pressure.",
    axis: "ns",
    updateExisting: true,
  },
  {
    code: "L4",
    name: "North South 4",
    variety: "Norton",
    vineCount: 23,
    plantedYear: 2014,
    status: RowStatus.active,
    notes: NS_NOTE,
    axis: "ns",
    updateExisting: false,
  },
  {
    code: "S1",
    name: "Hilltop East",
    variety: "Vignoles",
    vineCount: 10,
    plantedYear: 2018,
    status: RowStatus.active,
    notes: "Tight clusters — bunch rot scouting in wet weeks.",
    axis: "ew",
    updateExisting: true,
  },
  {
    code: "S2",
    name: "Road Front",
    variety: "Chambourcin",
    vineCount: 10,
    plantedYear: 2012,
    status: RowStatus.replanting,
    notes: "Crown gall took the west end. Replacing vines this spring.",
    axis: "ew",
    updateExisting: true,
  },
  {
    code: "S3",
    name: "West Trellis",
    variety: "Traminette",
    vineCount: 10,
    plantedYear: 2019,
    status: RowStatus.active,
    notes: "Newest high cordon. Still filling the wire.",
    axis: "ew",
    updateExisting: true,
  },
  ...Array.from({ length: 8 }, (_, index) => {
    const n = index + 4;
    return {
      code: `S${n}`,
      name: `East West ${n}`,
      variety: "TBD",
      vineCount: 10,
      plantedYear: 2020,
      status: RowStatus.active,
      notes: EW_NOTE,
      axis: "ew" as const,
      updateExisting: false,
    };
  }),
];

function withPlantingNote(existing: string | null, tag: string): string {
  if (existing?.includes("@ 7'")) return existing;
  if (existing?.trim()) return `${existing.trim()} ${tag}`;
  return tag;
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
    const existing = await prisma.row.findUnique({
      where: {
        vineyardId_code: { vineyardId: vineyard.id, code: spec.code },
      },
    });

    if (existing) {
      createdRows.push(
        await prisma.row.update({
          where: { id: existing.id },
          data: {
            vineCount: spec.vineCount,
            lengthFeet: length.lengthFeet,
            lengthInches: length.lengthInches,
            notes: withPlantingNote(existing.notes, tag),
            deletedAt: null,
          },
        }),
      );
    } else {
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
            notes: spec.updateExisting
              ? withPlantingNote(spec.notes, tag)
              : spec.notes,
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

  await prisma.vineyard.update({
    where: { id: vineyard.id },
    data: {
      rowLayout: layoutFromDefaultGrid(
        createdRows.map((row) => ({ id: row.id, code: row.code })),
      ) as unknown as Prisma.InputJsonValue,
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
  if (existingTaskCount > 0) {
    const [rowCount, taskCount, harvestCount, activityCount] =
      await Promise.all([
        prisma.row.count({
          where: { vineyardId: vineyard.id, deletedAt: null },
        }),
        prisma.task.count({ where: { vineyardId: vineyard.id } }),
        prisma.harvest.count({ where: { vineyardId: vineyard.id } }),
        prisma.activity.count({ where: { vineyardId: vineyard.id } }),
      ]);
    console.log(
      `Updated ${SEED_VINEYARD_NAME}: ${rowCount} rows (kept ${taskCount} tasks, ${harvestCount} harvests, ${activityCount} activities).`,
    );
    return;
  }

  await prisma.task.createMany({
    data: [
      {
        vineyardId: vineyard.id,
        rowId: rowId("L1"),
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
        rowId: rowId("L2"),
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
        rowId: rowId("S1"),
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
        rowId: rowId("S2"),
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
        rowId: rowId("S3"),
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
        rowId: rowId("S3"),
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
        rowId: rowId("L2"),
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
        rowId: rowId("L1"),
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
        rowId: rowId("S1"),
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
        rowId: rowId("L2"),
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
        rowId: rowId("L2"),
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

  await prisma.harvest.createMany({
    data: [
      {
        vineyardId: vineyard.id,
        rowId: rowId("L1"),
        harvestedAt: due("2025-09-18"),
        yieldAmount: 842,
        yieldUnit: YieldUnit.lb,
        notes: "Mostly best/better clusters. Held for the home red.",
        crew: "Aaron + Maya",
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("L2"),
        harvestedAt: due("2025-08-22"),
        yieldAmount: 12,
        yieldUnit: YieldUnit.lug,
        notes: "Pressed the same afternoon.",
        crew: "Aaron",
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("S1"),
        harvestedAt: due("2025-09-06"),
        yieldAmount: 310,
        yieldUnit: YieldUnit.lb,
        notes: "Sorted bunch rot on the lower wires in the barn.",
        crew: "Maya Chen",
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("L3"),
        harvestedAt: due("2024-09-02"),
        yieldAmount: 6.5,
        yieldUnit: YieldUnit.bushel,
        notes: "Last Concord pick before the rest year.",
        crew: "Family",
      },
    ],
  });

  await prisma.activity.createMany({
    data: [
      {
        vineyardId: vineyard.id,
        rowId: null,
        scopeType: "vineyard",
        scopeId: vineyard.id,
        activityType: ActivityType.watering,
        performedAt: due("2026-08-10"),
        details: {
          notes: "Whole-property drip cycle after a dry week.",
          durationMin: 45,
          method: "drip",
        },
        source: "manual",
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("L1"),
        scopeType: "row",
        scopeId: rowId("L1"),
        activityType: ActivityType.pruning,
        performedAt: due("2026-03-08"),
        details: { notes: "Spur prune Norton on North Slope." },
        source: "manual",
      },
      {
        vineyardId: vineyard.id,
        rowId: rowId("L2"),
        scopeType: "row",
        scopeId: rowId("L2"),
        activityType: ActivityType.health_observation,
        performedAt: due("2026-07-12"),
        details: { notes: "Japanese beetles on Chardonel. Surround already on." },
        source: "manual",
      },
    ],
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

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
