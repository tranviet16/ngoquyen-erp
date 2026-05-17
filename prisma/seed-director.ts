import "dotenv/config";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

const DIRECTOR = {
  email: "giamdoc@nq.local",
  name: "Giám đốc",
  password: "changeme123",
};

async function main() {
  let user = await prisma.user.findUnique({ where: { email: DIRECTOR.email } });
  if (!user) {
    const result = await auth.api.signUpEmail({
      body: { email: DIRECTOR.email, password: DIRECTOR.password, name: DIRECTOR.name },
    });
    if (!result?.user) throw new Error(`Failed to create ${DIRECTOR.email}`);
    user = await prisma.user.findUnique({ where: { id: result.user.id } });
  }
  if (!user) throw new Error("director user missing after upsert");

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "chihuy_ct", isDirector: true },
  });
  console.log(`OK ${DIRECTOR.email} role=chihuy_ct isDirector=true password=${DIRECTOR.password}`);

  const all = await prisma.user.findMany({
    select: { email: true, role: true, isDirector: true, isLeader: true },
    orderBy: { email: "asc" },
  });
  console.table(all);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
