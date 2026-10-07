const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const now = new Date();
  const rows = await prisma.row.updateMany({
    where: { code: { startsWith: "QA-TEMP" }, deletedAt: null },
    data: { deletedAt: now },
  });
  const tasks = await prisma.task.updateMany({
    where: { title: { startsWith: "QA-TEMP" }, deletedAt: null },
    data: { deletedAt: now },
  });
  const acts = await prisma.activity.updateMany({
    where: { deletedAt: null, details: { path: ["notes"], string_starts_with: "QA-TEMP" } },
    data: { deletedAt: now },
  }).catch(async (e) => {
    // fallback: fetch and filter
    const all = await prisma.activity.findMany({ where: { deletedAt: null } });
    let n = 0;
    for (const a of all) {
      const notes = a.details && a.details.notes;
      if (typeof notes === "string" && notes.startsWith("QA-TEMP")) {
        await prisma.activity.update({ where: { id: a.id }, data: { deletedAt: now } });
        n++;
      }
    }
    return { count: n, fallback: true, err: String(e.message||e) };
  });
  console.log(JSON.stringify({ rows, tasks, acts }));
}
main().finally(() => prisma.$disconnect());
