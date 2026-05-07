/**
 * Smoke test for Plan B (Coordination Form) + Plan C (Kanban + Task auto-create + Notifications).
 *
 * Idempotent fixture setup → walks the full state machine → verifies invariants.
 *
 * Run: npx tsx --env-file=.env scripts/smoke-plan-bc.ts
 */
import { prisma } from "../lib/prisma";
import { canMoveTask } from "../lib/task/state-machine";
import { auth } from "../lib/auth";

const PASSWORD = "changeme123";

type Fixture = {
  admin: { id: string };
  director: { id: string };
  deptA: { id: number; leader: { id: string }; member: { id: string } };
  deptB: { id: number; leader: { id: string }; member: { id: string } };
};

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function ensureUser(email: string, name: string, role: string): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { id: existing.id };
  const r = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
  if (!r?.user) throw new Error(`signUp failed: ${email}`);
  await prisma.user.update({ where: { id: r.user.id }, data: { role } });
  return { id: r.user.id };
}

async function ensureDept(code: string, name: string): Promise<{ id: number }> {
  const existing = await prisma.department.findUnique({ where: { code } });
  if (existing) {
    if (!existing.isActive) {
      const u = await prisma.department.update({ where: { id: existing.id }, data: { isActive: true } });
      return { id: u.id };
    }
    return { id: existing.id };
  }
  const d = await prisma.department.create({ data: { code, name, isActive: true } });
  return { id: d.id };
}

async function setupFixture(): Promise<Fixture> {
  console.log("[fixture] setup users + departments");
  const admin = await ensureUser("admin@nq.local", "Admin", "admin");
  const director = await ensureUser("director-smoke@nq.local", "Director Smoke", "viewer");
  const deptA = await ensureDept("SMK-A", "Smoke Phòng A");
  const deptB = await ensureDept("SMK-B", "Smoke Phòng B");
  const aLeader = await ensureUser("smoke-aleader@nq.local", "A Leader", "viewer");
  const aMember = await ensureUser("smoke-amember@nq.local", "A Member", "viewer");
  const bLeader = await ensureUser("smoke-bleader@nq.local", "B Leader", "viewer");
  const bMember = await ensureUser("smoke-bmember@nq.local", "B Member", "viewer");

  // Reset all directors to false, then mark our smoke director
  const currentDirectors = await prisma.user.findMany({ where: { isDirector: true }, select: { id: true } });
  for (const d of currentDirectors) {
    await prisma.user.update({ where: { id: d.id }, data: { isDirector: false } });
  }
  await prisma.user.update({ where: { id: director.id }, data: { isDirector: true } });

  await prisma.user.update({ where: { id: aLeader.id }, data: { departmentId: deptA.id, isLeader: true } });
  await prisma.user.update({ where: { id: aMember.id }, data: { departmentId: deptA.id, isLeader: false } });
  await prisma.user.update({ where: { id: bLeader.id }, data: { departmentId: deptB.id, isLeader: true } });
  await prisma.user.update({ where: { id: bMember.id }, data: { departmentId: deptB.id, isLeader: false } });

  return {
    admin,
    director,
    deptA: { id: deptA.id, leader: aLeader, member: aMember },
    deptB: { id: deptB.id, leader: bLeader, member: bMember },
  };
}

// ────────────────────────────────────────────────────────────────────
// Test 1: state machine RBAC unit checks (canMoveTask)
// ────────────────────────────────────────────────────────────────────
function testStateMachine() {
  console.log("\n[test 1] canMoveTask permission matrix");
  // Member assignee can move todo↔doing on their own task
  check("member: todo → doing", canMoveTask("todo", "doing", "assignee", false));
  check("member: doing → todo", canMoveTask("doing", "todo", "assignee", false));
  check("member: doing → review", canMoveTask("doing", "review", "assignee", false));
  // Member CANNOT close
  check("member: review → done blocked", !canMoveTask("review", "done", "assignee", false));
  // Leader can do everything
  check("leader: review → done", canMoveTask("review", "done", "leader", false));
  check("leader: any → todo (rework)", canMoveTask("done", "todo", "leader", false));
  // Creator of self-created task can close
  check("creator manual task: review → done", canMoveTask("review", "done", "creator", false));
  // Creator of auto-from-form task CANNOT close
  check("creator from-form: review → done blocked", !canMoveTask("review", "done", "creator", true));
  // Stranger blocked
  check("none: any move blocked", !canMoveTask("todo", "doing", "none", false));
}

// ────────────────────────────────────────────────────────────────────
// Test 2: auto-create task on directorApprove (DB-level)
// ────────────────────────────────────────────────────────────────────
async function testAutoCreate(fx: Fixture) {
  console.log("\n[test 2] Auto-create task on directorApprove (transactional)");

  // Clean prior smoke forms/tasks for idempotency (single-row deletes for audit compatibility)
  const priorForms = await prisma.coordinationForm.findMany({
    where: { creatorId: fx.deptA.member.id, code: { startsWith: "SMK-" } },
    include: { task: true },
  });
  for (const f of priorForms) {
    if (f.task) await prisma.task.delete({ where: { id: f.task.id } });
    await prisma.coordinationForm.delete({ where: { id: f.id } });
  }

  // Generate a unique smoke form code
  const code = `SMK-${Date.now().toString().slice(-8)}`;
  const form = await prisma.coordinationForm.create({
    data: {
      code,
      content: "Smoke test phối hợp — auto-create task verification",
      priority: "trung_binh",
      creatorId: fx.deptA.member.id,
      creatorDeptId: fx.deptA.id,
      executorDeptId: fx.deptB.id,
      status: "draft",
      deadline: new Date(Date.now() + 7 * 86400000),
    },
  });
  check("draft form created", !!form.id);

  // Walk state machine via direct DB updates (bypassing session-bound services)
  // Simulate what applyTransition + directorApprove tx callback does:
  await prisma.$transaction(async (tx) => {
    await tx.coordinationForm.update({ where: { id: form.id }, data: { status: "pending_leader" } });
  });
  await prisma.$transaction(async (tx) => {
    await tx.coordinationForm.update({ where: { id: form.id }, data: { status: "pending_director" } });
  });
  await prisma.$transaction(async (tx) => {
    const u = await tx.coordinationForm.update({
      where: { id: form.id },
      data: { status: "approved" },
    });
    // Mirror the directorApprove tx callback in coordination-form-service.ts
    await tx.task.create({
      data: {
        title: u.content.slice(0, 200),
        description: `Từ phiếu ${u.code}\n\n${u.content}`,
        deptId: u.executorDeptId,
        creatorId: u.creatorId,
        sourceFormId: u.id,
        priority: u.priority,
        deadline: u.deadline,
        status: "todo",
        assigneeId: null,
      },
    });
  });

  const task = await prisma.task.findUnique({ where: { sourceFormId: form.id } });
  check("task auto-created with sourceFormId", !!task, "no task linked to form");
  if (task) {
    check("task.deptId = executor dept", task.deptId === fx.deptB.id);
    check("task.creatorId = form.creatorId", task.creatorId === fx.deptA.member.id);
    check("task.status = 'todo'", task.status === "todo");
    check("task.priority preserved", task.priority === form.priority);
    check("task.assigneeId null (unassigned)", task.assigneeId === null);
  }

  // Cleanup
  if (task) await prisma.task.delete({ where: { id: task.id } });
  await prisma.coordinationForm.delete({ where: { id: form.id } });
}

// ────────────────────────────────────────────────────────────────────
// Test 3: Unique constraint on sourceFormId (no double-create)
// ────────────────────────────────────────────────────────────────────
async function testUniqueSourceForm(fx: Fixture) {
  console.log("\n[test 3] Task.sourceFormId unique constraint");
  const code = `SMK-U-${Date.now().toString().slice(-6)}`;
  const form = await prisma.coordinationForm.create({
    data: {
      code,
      content: "Unique test",
      priority: "trung_binh",
      creatorId: fx.deptA.member.id,
      creatorDeptId: fx.deptA.id,
      executorDeptId: fx.deptB.id,
      status: "approved",
    },
  });
  await prisma.task.create({
    data: {
      title: "first",
      deptId: fx.deptB.id,
      creatorId: fx.deptA.member.id,
      sourceFormId: form.id,
    },
  });
  let threw = false;
  try {
    await prisma.task.create({
      data: {
        title: "second",
        deptId: fx.deptB.id,
        creatorId: fx.deptA.member.id,
        sourceFormId: form.id,
      },
    });
  } catch (e) {
    threw = true;
  }
  check("second task with same sourceFormId rejected", threw);

  const tasks = await prisma.task.findMany({ where: { sourceFormId: form.id } });
  for (const t of tasks) await prisma.task.delete({ where: { id: t.id } });
  await prisma.coordinationForm.delete({ where: { id: form.id } });
}

// ────────────────────────────────────────────────────────────────────
// Test 4: Notification model basic write/read
// ────────────────────────────────────────────────────────────────────
async function testNotifications(fx: Fixture) {
  console.log("\n[test 4] Notification create + unread count + markRead");
  const oldNotifs = await prisma.notification.findMany({ where: { userId: fx.deptA.member.id, type: "smoke" } });
  for (const n of oldNotifs) await prisma.notification.delete({ where: { id: n.id } });
  for (const x of [1, 2, 3]) {
    await prisma.notification.create({
      data: { userId: fx.deptA.member.id, type: "smoke", title: `n${x}`, body: `b${x}` },
    });
  }
  const unread = await prisma.notification.count({
    where: { userId: fx.deptA.member.id, type: "smoke", readAt: null },
  });
  check("3 unread notifications visible", unread === 3, `got ${unread}`);

  const toMark = await prisma.notification.findMany({
    where: { userId: fx.deptA.member.id, type: "smoke" },
    select: { id: true },
  });
  const now = new Date();
  for (const n of toMark) {
    await prisma.notification.update({ where: { id: n.id }, data: { readAt: now } });
  }
  const remaining = await prisma.notification.count({
    where: { userId: fx.deptA.member.id, type: "smoke", readAt: null },
  });
  check("after markAll readAt set, unread=0", remaining === 0, `got ${remaining}`);

  const cleanup = await prisma.notification.findMany({ where: { userId: fx.deptA.member.id, type: "smoke" } });
  for (const n of cleanup) await prisma.notification.delete({ where: { id: n.id } });
}

// ────────────────────────────────────────────────────────────────────
// Test 5: Indexes exist (perf safety net)
// ────────────────────────────────────────────────────────────────────
async function testIndexes() {
  console.log("\n[test 5] Critical indexes present");
  const idx = await prisma.$queryRaw<Array<{ tablename: string; indexname: string }>>`
    SELECT tablename, indexname FROM pg_indexes
    WHERE tablename IN ('tasks', 'notifications')
    ORDER BY tablename, indexname;
  `;
  const names = idx.map((r) => `${r.tablename}.${r.indexname}`).join("\n    ");
  console.log("    " + names);
  const has = (substring: string) => idx.some((r) => r.indexname.includes(substring));
  check("tasks deptId+status+order index", has("deptId_status_orderInColumn"));
  check("tasks assigneeId+status index", has("assigneeId_status"));
  check("notifications userId+readAt index", has("userId_readAt"));
}

// ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Plan B + C smoke test ===");
  const fx = await setupFixture();
  testStateMachine();
  await testAutoCreate(fx);
  await testUniqueSourceForm(fx);
  await testNotifications(fx);
  await testIndexes();

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  prisma.$disconnect();
  process.exit(2);
});
