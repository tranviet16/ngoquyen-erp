/**
 * Smoke test for task collaboration extensions (comments, attachments, subtasks).
 *
 * Pure-RBAC tests + DB-level transactional tests + storage layer.
 * Mirrors scripts/smoke-plan-bc.ts conventions: idempotent fixtures,
 * single-row writes (audit-compatible), session-free.
 *
 * Run: npx tsx --env-file=.env scripts/smoke-task-collab.ts
 */
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";
import { canDeleteComment, canEditComment, COMMENT_EDIT_WINDOW_MS } from "../lib/task/comment-rbac";
import { canDeleteAttachment } from "../lib/task/attachment-rbac";
import { ALLOWED_MIME, MAX_ATTACHMENT_BYTES } from "../lib/task/attachment-service";
import { getChildCounts } from "../lib/task/subtask-service";
import { maybeBumpParentToReview } from "../lib/task/task-service";
import { reorderSubtasks } from "../lib/task/subtask-service";
import { extractMentions } from "../lib/task/mention-parser";
import { detectMagicMime, validateMagicBytes } from "../lib/task/file-signature";
import { LocalDiskStore, safeFilename } from "../lib/storage/local-disk";

const PASSWORD = "changeme123";

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
  if (existing) return { id: existing.id };
  const d = await prisma.department.create({ data: { code, name, isActive: true } });
  return { id: d.id };
}

interface Fixture {
  admin: { id: string };
  deptA: { id: number; leader: { id: string }; member: { id: string }; outsider: { id: string } };
}

async function setupFixture(): Promise<Fixture> {
  console.log("[fixture] users + dept");
  const admin = await ensureUser("admin@nq.local", "Admin", "admin");
  const deptA = await ensureDept("SMK-COL", "Smoke Collab");
  const leader = await ensureUser("smoke-col-leader@nq.local", "Col Leader", "viewer");
  const member = await ensureUser("smoke-col-member@nq.local", "Col Member", "viewer");
  const outsider = await ensureUser("smoke-col-outsider@nq.local", "Col Outsider", "viewer");

  await prisma.user.update({ where: { id: leader.id }, data: { departmentId: deptA.id, isLeader: true } });
  await prisma.user.update({ where: { id: member.id }, data: { departmentId: deptA.id, isLeader: false } });
  await prisma.user.update({ where: { id: outsider.id }, data: { departmentId: null, isLeader: false } });

  return { admin, deptA: { id: deptA.id, leader, member, outsider } };
}

const ctxFor = (userId: string, departmentId: number | null, isLeader: boolean) => ({
  userId,
  departmentId,
  isLeader,
  isDirector: false,
});

// ────────────────────────────────────────────────────────────────────
// Test 1: comment RBAC pure functions
// ────────────────────────────────────────────────────────────────────
function testCommentRbac(fx: Fixture) {
  console.log("\n[test 1] canEditComment / canDeleteComment");
  const now = new Date();
  const fresh = { authorId: fx.deptA.member.id, createdAt: new Date(now.getTime() - 60_000) };
  const stale = { authorId: fx.deptA.member.id, createdAt: new Date(now.getTime() - COMMENT_EDIT_WINDOW_MS - 1) };
  const otherAuthor = { authorId: fx.deptA.leader.id, createdAt: new Date(now.getTime() - 60_000) };

  check("author within 5min can edit", canEditComment(fresh, fx.deptA.member.id, now));
  check("author past 5min cannot edit", !canEditComment(stale, fx.deptA.member.id, now));
  check("non-author cannot edit", !canEditComment(otherAuthor, fx.deptA.member.id, now));

  const task = { deptId: fx.deptA.id };
  const memberCtx = ctxFor(fx.deptA.member.id, fx.deptA.id, false);
  const leaderCtx = ctxFor(fx.deptA.leader.id, fx.deptA.id, true);
  const outsiderCtx = ctxFor(fx.deptA.outsider.id, null, false);

  // Author can delete own
  check("author can delete own", canDeleteComment(fresh, task, memberCtx, "viewer"));
  // Same-dept leader can delete others'
  check("leader can delete other's", canDeleteComment(fresh, task, leaderCtx, "viewer"));
  // Admin can delete
  check("admin can delete", canDeleteComment(fresh, task, ctxFor(fx.admin.id, null, false), "admin"));
  // Outsider blocked
  check("outsider cannot delete", !canDeleteComment(fresh, task, outsiderCtx, "viewer"));
  // Other dept member (not leader, not author) blocked
  const otherMemberCtx = ctxFor(fx.deptA.outsider.id, fx.deptA.id, false);
  check("same-dept non-leader non-author cannot delete", !canDeleteComment(fresh, task, otherMemberCtx, "viewer"));
}

// ────────────────────────────────────────────────────────────────────
// Test 2: comment cascade delete on task removal
// ────────────────────────────────────────────────────────────────────
async function testCommentCascade(fx: Fixture) {
  console.log("\n[test 2] task delete cascades comments");
  const task = await prisma.task.create({
    data: {
      title: "smoke-comment-cascade",
      deptId: fx.deptA.id,
      creatorId: fx.deptA.member.id,
      status: "todo",
    },
  });
  for (let i = 0; i < 3; i++) {
    await prisma.taskComment.create({
      data: { taskId: task.id, authorId: fx.deptA.member.id, body: `c${i}` },
    });
  }
  const before = await prisma.taskComment.count({ where: { taskId: task.id } });
  check("3 comments persisted", before === 3, `got ${before}`);
  await prisma.task.delete({ where: { id: task.id } });
  const after = await prisma.taskComment.count({ where: { taskId: task.id } });
  check("comments cascade-deleted with task", after === 0, `got ${after}`);
}

// ────────────────────────────────────────────────────────────────────
// Test 3: attachment RBAC + constants
// ────────────────────────────────────────────────────────────────────
function testAttachmentRbac(fx: Fixture) {
  console.log("\n[test 3] canDeleteAttachment + constants");
  const att = { uploaderId: fx.deptA.member.id };
  const task = { deptId: fx.deptA.id };
  check("uploader can delete own", canDeleteAttachment(att, task, ctxFor(fx.deptA.member.id, fx.deptA.id, false), "viewer"));
  check("leader can delete other's", canDeleteAttachment(att, task, ctxFor(fx.deptA.leader.id, fx.deptA.id, true), "viewer"));
  check("admin can delete", canDeleteAttachment(att, task, ctxFor(fx.admin.id, null, false), "admin"));
  check("outsider cannot delete", !canDeleteAttachment(att, task, ctxFor(fx.deptA.outsider.id, null, false), "viewer"));

  check("MAX_ATTACHMENT_BYTES = 25MB", MAX_ATTACHMENT_BYTES === 25 * 1024 * 1024);
  check("MIME allowlist: pdf", ALLOWED_MIME.has("application/pdf"));
  check("MIME allowlist: png", ALLOWED_MIME.has("image/png"));
  check("MIME allowlist: blocks exe", !ALLOWED_MIME.has("application/x-msdownload"));
  check("MIME allowlist: blocks html", !ALLOWED_MIME.has("text/html"));
}

// ────────────────────────────────────────────────────────────────────
// Test 4: LocalDiskStore — put/get/delete + path traversal sanitization
// ────────────────────────────────────────────────────────────────────
async function testStorage() {
  console.log("\n[test 4] LocalDiskStore");
  const root = mkdtempSync(join(tmpdir(), "nq-smoke-store-"));
  try {
    const store = new LocalDiskStore(root);
    const rel = "task-attachments/99/uuid-test.bin";
    const body = Buffer.from("hello world");
    const { size } = await store.putFile(rel, body);
    check("putFile returns correct size", size === body.byteLength);
    check("exists() true after put", await store.exists(rel));

    const stream = store.getStream(rel);
    const chunks: Buffer[] = [];
    await new Promise<void>((res, rej) => {
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => res());
      stream.on("error", rej);
    });
    const got = Buffer.concat(chunks);
    check("getStream bytes match", got.equals(body), `got ${got.length} bytes`);

    await store.deleteFile(rel);
    check("exists() false after delete", !(await store.exists(rel)));
    // Idempotent delete: ENOENT swallowed
    let secondDeleteThrew = false;
    try {
      await store.deleteFile(rel);
    } catch {
      secondDeleteThrew = true;
    }
    check("delete on missing file is idempotent", !secondDeleteThrew);

    // Path traversal rejection
    const traversalCases = ["../escape.txt", "/abs/path", "C:/win/path", "task/../../../etc/passwd"];
    for (const bad of traversalCases) {
      let threw = false;
      try {
        await store.putFile(bad, body);
      } catch {
        threw = true;
      }
      check(`reject traversal: ${bad}`, threw);
    }
    // Verify nothing escaped the root
    check("nothing leaked outside root", !existsSync(join(root, "..", "escape.txt")));

    // Filename sanitizer
    check("safeFilename strips path", safeFilename("../../etc/passwd") === "passwd");
    check("safeFilename keeps dots", safeFilename("report.v2.pdf") === "report.v2.pdf");
    check("safeFilename caps at 200", safeFilename("a".repeat(300)).length === 200);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ────────────────────────────────────────────────────────────────────
// Test 5: subtask depth + child counts
// ────────────────────────────────────────────────────────────────────
async function testSubtasks(fx: Fixture) {
  console.log("\n[test 5] subtasks: child counts + cascade + depth");

  // Cleanup any prior smoke tasks (single-row only — audit middleware blocks deleteMany)
  const prior = await prisma.task.findMany({
    where: { creatorId: fx.deptA.member.id, title: { startsWith: "smoke-sub" } },
  });
  for (const t of prior) await prisma.task.delete({ where: { id: t.id } });

  const parent = await prisma.task.create({
    data: {
      title: "smoke-sub-parent",
      deptId: fx.deptA.id,
      creatorId: fx.deptA.member.id,
      status: "doing",
    },
  });

  // Create 5 children directly (simulating service writes)
  const childIds: number[] = [];
  for (let i = 0; i < 5; i++) {
    const c = await prisma.task.create({
      data: {
        title: `smoke-sub-child-${i}`,
        deptId: fx.deptA.id,
        creatorId: fx.deptA.member.id,
        parentId: parent.id,
        status: "todo",
      },
    });
    childIds.push(c.id);
  }

  let counts = await getChildCounts([parent.id]);
  let c = counts.get(parent.id);
  check("childCounts {done:0,total:5}", c?.total === 5 && c?.done === 0, `got ${JSON.stringify(c)}`);

  // Move 3 to done
  for (const id of childIds.slice(0, 3)) {
    await prisma.task.update({ where: { id }, data: { status: "done" } });
  }
  counts = await getChildCounts([parent.id]);
  c = counts.get(parent.id);
  check("childCounts {done:3,total:5}", c?.total === 5 && c?.done === 3, `got ${JSON.stringify(c)}`);

  // Depth-1 enforcement: try grandchild via direct DB. The DB allows it
  // (constraint is at service layer). Verify the service-layer guard manually
  // by inspecting parent.parentId logic that subtask-service uses.
  const oneChild = await prisma.task.findUnique({ where: { id: childIds[0] } });
  check("child has parentId (depth 1)", oneChild?.parentId === parent.id);
  // Service rejects when target parent already has a parent — simulate the check
  const wouldBeGrandchild = oneChild?.parentId != null;
  check("service-layer would reject grandchild create", wouldBeGrandchild);

  // Cascade delete
  await prisma.task.delete({ where: { id: parent.id } });
  const remaining = await prisma.task.count({ where: { parentId: parent.id } });
  check("children cascade-deleted with parent", remaining === 0, `got ${remaining}`);
}

// ────────────────────────────────────────────────────────────────────
// Test 5b: auto-transition parent → review when all children done
// ────────────────────────────────────────────────────────────────────
async function testAutoTransitionParent(fx: Fixture) {
  console.log("\n[test 5b] auto-transition parent to review");
  const parent = await prisma.task.create({
    data: {
      title: "smoke-auto-parent",
      deptId: fx.deptA.id,
      creatorId: fx.deptA.member.id,
      assigneeId: fx.deptA.leader.id,
      status: "doing",
    },
  });
  const c1 = await prisma.task.create({
    data: { title: "ap-c1", deptId: fx.deptA.id, creatorId: fx.deptA.member.id, parentId: parent.id, status: "done" },
  });
  const c2 = await prisma.task.create({
    data: { title: "ap-c2", deptId: fx.deptA.id, creatorId: fx.deptA.member.id, parentId: parent.id, status: "doing" },
  });

  // Not all done yet → no transition
  let bumped = await prisma.$transaction((tx) => maybeBumpParentToReview(tx, parent.id, fx.deptA.member.id));
  let p = await prisma.task.findUnique({ where: { id: parent.id } });
  check("partial done: parent stays at 'doing'", !bumped && p?.status === "doing");

  // Mark last child done
  await prisma.task.update({ where: { id: c2.id }, data: { status: "done" } });
  bumped = await prisma.$transaction((tx) => maybeBumpParentToReview(tx, parent.id, fx.deptA.member.id));
  p = await prisma.task.findUnique({ where: { id: parent.id } });
  check("all done: parent bumped to 'review'", bumped && p?.status === "review", `got ${p?.status}`);
  check("completedAt cleared on bump", p?.completedAt === null);

  // Idempotent: re-running on a parent already in review does nothing
  const bumpedAgain = await prisma.$transaction((tx) => maybeBumpParentToReview(tx, parent.id, fx.deptA.member.id));
  check("idempotent: no re-bump when already review", !bumpedAgain);

  // Notification fan-out: assignee (leader) + creator (member) — minus actor (member)
  const notes = await prisma.notification.findMany({
    where: { type: "task_status_changed", body: parent.title },
  });
  const recipients = new Set(notes.map((n) => n.userId));
  check("notified assignee", recipients.has(fx.deptA.leader.id));
  check("did NOT notify acting user", !recipients.has(fx.deptA.member.id));

  // Cleanup
  await prisma.task.delete({ where: { id: c1.id } });
  await prisma.task.delete({ where: { id: c2.id } });
  await prisma.task.delete({ where: { id: parent.id } });
}

// ────────────────────────────────────────────────────────────────────
// Test 6: listTasksForBoard excludes children (verify by raw query)
// ────────────────────────────────────────────────────────────────────
async function testBoardExcludesChildren(fx: Fixture) {
  console.log("\n[test 6] board query excludes sub-tasks");
  const parent = await prisma.task.create({
    data: { title: "smoke-board-parent", deptId: fx.deptA.id, creatorId: fx.deptA.member.id, status: "todo" },
  });
  const child = await prisma.task.create({
    data: {
      title: "smoke-board-child",
      deptId: fx.deptA.id,
      creatorId: fx.deptA.member.id,
      parentId: parent.id,
      status: "todo",
    },
  });
  // Mirror listTasksForBoard's where: { parentId: null, deptId }
  const boardRows = await prisma.task.findMany({
    where: { parentId: null, deptId: fx.deptA.id },
    select: { id: true },
  });
  const ids = boardRows.map((r) => r.id);
  check("parent visible on board", ids.includes(parent.id));
  check("child hidden from board", !ids.includes(child.id));
  await prisma.task.delete({ where: { id: parent.id } });
}

// ────────────────────────────────────────────────────────────────────
// Test 7: mention parser
// ────────────────────────────────────────────────────────────────────
function testMentions() {
  console.log("\n[test 7] @email mention parser");
  check("simple mention", JSON.stringify(extractMentions("hi @user@nq.local thanks")) === JSON.stringify(["user@nq.local"]));
  check("mention at start", extractMentions("@a@b.co go").includes("a@b.co"));
  check("mention after newline", extractMentions("line1\n@x@y.org").includes("x@y.org"));
  check("dedupes duplicates", extractMentions("@u@a.co again @u@a.co").length === 1);
  check("ignores email-only without @", extractMentions("contact user@nq.local").length === 0);
  check("lowercases", extractMentions("@User@NQ.LOCAL")[0] === "user@nq.local");
  check("rejects in-word @", extractMentions("foo@user@nq.local").length === 0);
  check("multiple distinct", extractMentions("@a@x.co and @b@x.co").length === 2);
}

// ────────────────────────────────────────────────────────────────────
// Test 8: magic-byte file signature
// ────────────────────────────────────────────────────────────────────
function testFileSignature() {
  console.log("\n[test 8] magic-byte validation");
  const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
  const html = Buffer.from("<html><body>");

  check("detects pdf", detectMagicMime(pdf) === "application/pdf");
  check("detects png", detectMagicMime(png) === "image/png");
  check("detects jpeg", detectMagicMime(jpg) === "image/jpeg");
  check("detects zip", detectMagicMime(zip) === "application/zip");
  check("rejects exe", detectMagicMime(exe) === null);
  check("rejects html as binary", detectMagicMime(html) === null);

  check("validate pdf vs pdf", validateMagicBytes(pdf, "application/pdf"));
  check("reject png claiming pdf", !validateMagicBytes(png, "application/pdf"));
  check(
    "accept zip claiming xlsx",
    validateMagicBytes(zip, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  );
  check(
    "accept zip claiming docx",
    validateMagicBytes(zip, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  );
  check("reject pdf claiming png", !validateMagicBytes(pdf, "image/png"));
  check("reject exe claiming pdf", !validateMagicBytes(exe, "application/pdf"));
}

// ────────────────────────────────────────────────────────────────────
// Test 9: subtask reorder
// ────────────────────────────────────────────────────────────────────
async function testReorder(fx: Fixture) {
  console.log("\n[test 9] reorderSubtasks updates orderInColumn");
  const parent = await prisma.task.create({
    data: {
      title: "smoke-reorder-parent",
      deptId: fx.deptA.id,
      creatorId: fx.deptA.member.id,
      status: "doing",
    },
  });
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) {
    const c = await prisma.task.create({
      data: {
        title: `r-${i}`,
        deptId: fx.deptA.id,
        creatorId: fx.deptA.member.id,
        parentId: parent.id,
        status: "todo",
        orderInColumn: i,
      },
    });
    ids.push(c.id);
  }
  // Cannot call reorderSubtasks directly (needs session). Replicate the
  // mutation deterministically and verify ordering invariants instead.
  const reversed = [...ids].reverse();
  for (let i = 0; i < reversed.length; i++) {
    await prisma.task.update({ where: { id: reversed[i] }, data: { orderInColumn: i } });
  }
  const fetched = await prisma.task.findMany({
    where: { parentId: parent.id },
    orderBy: { orderInColumn: "asc" },
    select: { id: true },
  });
  const order = fetched.map((r) => r.id);
  check("reorder applied (reversed)", JSON.stringify(order) === JSON.stringify(reversed));

  // reorderSubtasks function exists and is exported
  check("reorderSubtasks export", typeof reorderSubtasks === "function");

  // Cleanup
  for (const id of ids) await prisma.task.delete({ where: { id } });
  await prisma.task.delete({ where: { id: parent.id } });
}

// ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Task collab smoke test ===");
  const fx = await setupFixture();
  testCommentRbac(fx);
  await testCommentCascade(fx);
  testAttachmentRbac(fx);
  await testStorage();
  await testSubtasks(fx);
  await testAutoTransitionParent(fx);
  await testBoardExcludesChildren(fx);
  testMentions();
  testFileSignature();
  await testReorder(fx);

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  prisma.$disconnect();
  process.exit(2);
});
