import {
  ActivityType,
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
const SEED_VINEYARD_NAME = "Cedar Ridge Vineyard";

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

const rows: {
  code: string;
  name: string;
  variety: string;
  lengthFeet: number;
  lengthInches: number;
  vineCount: number;
  plantedYear: number;
  status: RowStatus;
  notes: string;
}[] = [
  {
    code: "L1",
    name: "North Slope",
    variety: "Norton",
    lengthFeet: 180,
    lengthInches: 0,
    vineCount: 20,
    plantedYear: 2014,
    status: RowStatus.active,
    notes: "Best sun. Primary red for the home crush.",
  },
  {
    code: "L2",
    name: "Creek Bench",
    variety: "Chardonel",
    lengthFeet: 156,
    lengthInches: 6,
    vineCount: 18,
    plantedYear: 2016,
    status: RowStatus.active,
    notes: "Cooler air drainage toward the creek. Watch late frost.",
  },
  {
    code: "S1",
    name: "Hilltop East",
    variety: "Vignoles",
    lengthFeet: 92,
    lengthInches: 3,
    vineCount: 11,
    plantedYear: 2018,
    status: RowStatus.active,
    notes: "Tight clusters — bunch rot scouting in wet weeks.",
  },
  {
    code: "S2",
    name: "Road Front",
    variety: "Chambourcin",
    lengthFeet: 148,
    lengthInches: 0,
    vineCount: 16,
    plantedYear: 2012,
    status: RowStatus.replanting,
    notes: "Crown gall took the west end. Replacing vines this spring.",
  },
  {
    code: "S3",
    name: "West Trellis",
    variety: "Traminette",
    lengthFeet: 88,
    lengthInches: 9,
    vineCount: 11,
    plantedYear: 2019,
    status: RowStatus.active,
    notes: "Newest high cordon. Still filling the wire.",
  },
  {
    code: "L3",
    name: "Old Home Row",
    variety: "Concord",
    lengthFeet: 120,
    lengthInches: 6,
    vineCount: 18,
    plantedYear: 2008,
    status: RowStatus.fallow,
    notes: "Juice grapes. Resting a season after Japanese beetle pressure.",
  },
];

async function resetSeededRows() {
  const users = await prisma.user.findMany({
    where: { email: { in: [SEED_OWNER_EMAIL, SEED_MANAGER_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  const vineyards = await prisma.vineyard.findMany({
    where: {
      OR: [{ name: SEED_VINEYARD_NAME }, { ownerId: { in: userIds } }],
    },
    select: { id: true },
  });
  const vineyardIds = vineyards.map((vineyard) => vineyard.id);

  if (vineyardIds.length > 0) {
    await prisma.harvest.deleteMany({
      where: { vineyardId: { in: vineyardIds } },
    });
    await prisma.task.deleteMany({ where: { vineyardId: { in: vineyardIds } } });
    await prisma.row.deleteMany({ where: { vineyardId: { in: vineyardIds } } });
    await prisma.vineyard.deleteMany({ where: { id: { in: vineyardIds } } });
  }
}

async function main() {
  await resetSeededRows();

  const owner = await prisma.user.upsert({
    where: { email: SEED_OWNER_EMAIL },
    update: {
      displayName: "Aaron Ingalsbe",
      role: UserRole.power_user,
      deletedAt: null,
    },
    create: {
      email: SEED_OWNER_EMAIL,
      passwordHash: "seed-only-not-for-login",
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
      deletedAt: null,
    },
    create: {
      email: SEED_MANAGER_EMAIL,
      passwordHash: "seed-only-not-for-login",
      displayName: "Maya Chen",
      role: UserRole.manager,
      notificationPrefs: {
        ...defaultPrefs,
        frequency: "as_needed",
      },
    },
  });

  const vineyard = await prisma.vineyard.create({
    data: {
      ownerId: owner.id,
      name: SEED_VINEYARD_NAME,
      address: "21480 Moonlight Rd, Spring Hill, KS 66083",
      lat: 38.7432,
      lng: -94.8251,
      timezone: "America/Chicago",
      healthThresholds: defaultThresholds,
    },
  });

  const createdRows = await Promise.all(
    rows.map((row) =>
      prisma.row.create({
        data: {
          vineyardId: vineyard.id,
          ...row,
        },
      }),
    ),
  );

  const byCode = new Map(createdRows.map((row) => [row.code, row]));

  const rowId = (code: string): string => {
    const row = byCode.get(code);
    if (!row) {
      throw new Error(`Seed is missing row ${code}`);
    }
    return row.id;
  };

  const due = (isoDate: string) => new Date(`${isoDate}T14:00:00-05:00`);

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

  const [rowCount, taskCount, harvestCount] = await Promise.all([
    prisma.row.count({ where: { vineyardId: vineyard.id } }),
    prisma.task.count({ where: { vineyardId: vineyard.id } }),
    prisma.harvest.count({ where: { vineyardId: vineyard.id } }),
  ]);

  console.log(
    `Seeded ${SEED_VINEYARD_NAME}: 2 users, 1 vineyard, ${rowCount} rows, ${taskCount} tasks, ${harvestCount} harvests.`,
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
