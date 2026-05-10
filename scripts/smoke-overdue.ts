import { getOverdueLabel, countByLabel, type OverdueLabel } from "../lib/task/overdue";

type Case = {
  name: string;
  deadline: Date | null;
  completedAt: Date | null;
  now: Date;
  soonDays?: number;
  expect: OverdueLabel;
};

const NOW = new Date("2026-05-10T12:00:00Z");
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000);

const cases: Case[] = [
  { name: "no deadline", deadline: null, completedAt: null, now: NOW, expect: "no_deadline" },
  { name: "no deadline + completed", deadline: null, completedAt: day(-1), now: NOW, expect: "no_deadline" },
  { name: "on_track far future", deadline: day(10), completedAt: null, now: NOW, expect: "on_track" },
  { name: "due_soon edge (3 days)", deadline: day(3), completedAt: null, now: NOW, expect: "due_soon" },
  { name: "due_soon today", deadline: day(0.5), completedAt: null, now: NOW, expect: "due_soon" },
  { name: "due_soon just past 3 days → on_track", deadline: day(3.5), completedAt: null, now: NOW, expect: "on_track" },
  { name: "overdue not completed", deadline: day(-1), completedAt: null, now: NOW, expect: "overdue" },
  { name: "completed late persists overdue", deadline: day(-5), completedAt: day(-2), now: NOW, expect: "overdue" },
  { name: "completed on time → on_track", deadline: day(2), completedAt: day(1), now: NOW, expect: "on_track" },
  { name: "completed exactly at deadline → on_track", deadline: day(0), completedAt: day(0), now: NOW, expect: "on_track" },
  { name: "custom soonDays=1 not yet soon", deadline: day(2), completedAt: null, now: NOW, soonDays: 1, expect: "on_track" },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = getOverdueLabel({ deadline: c.deadline, completedAt: c.completedAt }, c.now, c.soonDays);
  if (got === c.expect) {
    pass++;
    console.log(`✓ ${c.name}`);
  } else {
    fail++;
    console.error(`✗ ${c.name} — expected ${c.expect}, got ${got}`);
  }
}

const counts = countByLabel(
  cases.map((c) => ({ deadline: c.deadline, completedAt: c.completedAt })),
  NOW,
);
console.log("\ncountByLabel:", counts);
const expectedOverdue = cases.filter((c) => (c.soonDays ?? 3) === 3 && c.expect === "overdue").length;
if (counts.overdue !== expectedOverdue) {
  fail++;
  console.error(`✗ countByLabel.overdue mismatch: expected ${expectedOverdue}, got ${counts.overdue}`);
} else {
  pass++;
  console.log(`✓ countByLabel.overdue = ${counts.overdue}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
