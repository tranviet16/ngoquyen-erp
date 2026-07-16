import "dotenv/config";
import { userProvisioningAuth } from "../lib/auth";
import { prisma } from "../lib/prisma";

const DIRECTOR = {
  email: "giamdoc@nq.local",
  name: "Giám đốc",
};

async function main() {
  const password = process.env.SEED_DIRECTOR_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("SEED_DIRECTOR_PASSWORD must be set to at least 12 characters");
  }
  let user = await prisma.user.findUnique({ where: { email: DIRECTOR.email } });
  if (!user) {
    const result = await userProvisioningAuth.api.signUpEmail({
      body: { email: DIRECTOR.email, password, name: DIRECTOR.name },
    });
    if (!result?.user) throw new Error(`Failed to create ${DIRECTOR.email}`);
    user = await prisma.user.findUnique({ where: { id: result.user.id } });
  }
  if (!user) throw new Error("director user missing after upsert");

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "chihuy_ct", isDirector: true },
  });
  console.log(`OK ${DIRECTOR.email} role=chihuy_ct isDirector=true`);

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
