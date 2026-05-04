/**
 * Seed master data from Excel SOP files.
 * Idempotent: findFirst by name → create if missing.
 * Does NOT use bulk ops (blocked by audit middleware).
 *
 * Sources:
 *  - Quản Lý Công Nợ Vật Tư.xlsx / Cài Đặt: Suppliers, Projects, Entities
 *  - Quản Lý Dự Án Xây Dựng.xlsx / Cài Đặt: Items, Contractors, Project categories
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import * as path from "path";
import { prisma } from "../lib/prisma";

const SOP_DIR = path.join(process.cwd(), "SOP");

function readSheet(fileName: string, sheetName: string): unknown[][] {
  const wb = XLSX.readFile(path.join(SOP_DIR, fileName));
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found in ${fileName}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
}

function nonEmpty(val: unknown): string | null {
  const s = String(val ?? "").trim();
  return s.length > 0 ? s : null;
}

async function upsertSupplier(name: string): Promise<"created" | "exists"> {
  const existing = await prisma.supplier.findFirst({ where: { name } });
  if (existing) return "exists";
  await prisma.supplier.create({ data: { name } });
  return "created";
}

async function upsertContractor(name: string): Promise<"created" | "exists"> {
  const existing = await prisma.contractor.findFirst({ where: { name } });
  if (existing) return "exists";
  await prisma.contractor.create({ data: { name } });
  return "created";
}

async function upsertProject(code: string, name: string): Promise<{ id: number; status: "created" | "exists" }> {
  const existing = await prisma.project.findFirst({ where: { code } });
  if (existing) return { id: existing.id, status: "exists" };
  const p = await prisma.project.create({ data: { code, name } });
  return { id: p.id, status: "created" };
}

async function upsertEntity(name: string, type: "company" | "person"): Promise<"created" | "exists"> {
  const existing = await prisma.entity.findFirst({ where: { name } });
  if (existing) return "exists";
  await prisma.entity.create({ data: { name, type } });
  return "created";
}

function inferItemType(name: string): "material" | "labor" | "machine" {
  const lower = name.toLowerCase();
  if (lower.includes("nhân công") || lower.includes("thi công")) return "labor";
  if (lower.includes("máy") || lower.includes("cẩu") || lower.includes("lu") || lower.includes("đào")) return "machine";
  return "material";
}

async function upsertItem(code: string, name: string, unit: string, type: "material" | "labor" | "machine"): Promise<"created" | "exists"> {
  const existing = await prisma.item.findFirst({ where: { code } });
  if (existing) return "exists";
  await prisma.item.create({ data: { code, name, unit, type } });
  return "created";
}

async function upsertCategory(projectId: number, code: string, name: string, sortOrder: number): Promise<"created" | "exists"> {
  const existing = await prisma.projectCategory.findFirst({ where: { projectId, code } });
  if (existing) return "exists";
  await prisma.projectCategory.create({ data: { projectId, code, name, sortOrder } });
  return "created";
}

function slugifyCode(name: string, prefix: string): string {
  return prefix + "-" + name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12)
    .toUpperCase();
}

async function seedFromCongNoVatTu() {
  console.log("\n=== Quản Lý Công Nợ Vật Tư.xlsx / Cài Đặt ===");
  const rows = readSheet("Quản Lý Công Nợ Vật Tư.xlsx", "Cài Đặt");

  let supplierCreated = 0, supplierExist = 0;
  let projectCreated = 0, projectExist = 0;
  let entityCreated = 0, entityExist = 0;

  for (const row of rows.slice(1)) {
    const arr = row as string[];
    const supplierName = nonEmpty(arr[0]);
    const projectName = nonEmpty(arr[2]);
    const entityName = nonEmpty(arr[6]);

    if (supplierName) {
      const s = await upsertSupplier(supplierName);
      if (s === "created") supplierCreated++;
      else supplierExist++;
    }

    if (projectName) {
      const code = slugifyCode(projectName, "DA");
      const { status } = await upsertProject(code, projectName);
      if (status === "created") projectCreated++;
      else projectExist++;
    }

    if (entityName) {
      // Determine type: "Công Ty" → company, else person
      const type = entityName.toLowerCase().includes("công ty") ? "company" : "person";
      const s = await upsertEntity(entityName, type);
      if (s === "created") entityCreated++;
      else entityExist++;
    }
  }

  console.log(`Suppliers: ${supplierCreated} created, ${supplierExist} already exist`);
  console.log(`Projects: ${projectCreated} created, ${projectExist} already exist`);
  console.log(`Entities: ${entityCreated} created, ${entityExist} already exist`);
}

async function seedFromDuAnXayDung() {
  console.log("\n=== Quản Lý Dự Án Xây Dựng.xlsx / Cài Đặt ===");
  const rows = readSheet("Quản Lý Dự Án Xây Dựng.xlsx", "Cài Đặt");

  let supplierCreated = 0, supplierExist = 0;
  let contractorCreated = 0, contractorExist = 0;
  let itemCreated = 0, itemExist = 0;
  let categoryCreated = 0, categoryExist = 0;

  // Row index 0 = section header, index 1 = column headers, data starts at index 2
  for (const row of rows.slice(2)) {
    const arr = row as string[];
    const nccName = nonEmpty(arr[0]);
    const nccType = nonEmpty(arr[1]);
    const categoryName = nonEmpty(arr[3]);
    const itemName = nonEmpty(arr[13]);

    if (nccName) {
      // Classify: Nhân công / Máy móc → Contractor, Vật liệu / empty → Supplier
      const isContractor = nccType === "Nhân công" || nccType === "Máy móc";
      if (isContractor) {
        const s = await upsertContractor(nccName);
        if (s === "created") contractorCreated++;
        else contractorExist++;
      } else {
        const s = await upsertSupplier(nccName);
        if (s === "created") supplierCreated++;
        else supplierExist++;
      }
    }

    if (categoryName) {
      // Categories belong to the sample project in the Excel (Nhà ở 5 Tầng)
      // Seed into a placeholder project from the info sheet
      const projectCode = "DA-NHAOTANG";
      const { id: projectId } = await upsertProject(projectCode, "Nhà ở 5 Tầng – Số 25 Nguyễn Trãi");
      const sortOrder = parseInt(categoryName.charAt(0)) || 99;
      const s = await upsertCategory(projectId, categoryName, categoryName, sortOrder);
      if (s === "created") categoryCreated++;
      else categoryExist++;
    }

    if (itemName) {
      const type = inferItemType(itemName);
      const code = slugifyCode(itemName, type === "labor" ? "LAB" : type === "machine" ? "MAC" : "MAT");
      const unit = "";
      const s = await upsertItem(code, itemName, unit, type);
      if (s === "created") itemCreated++;
      else itemExist++;
    }
  }

  console.log(`Suppliers (from DuAn): ${supplierCreated} created, ${supplierExist} already exist`);
  console.log(`Contractors: ${contractorCreated} created, ${contractorExist} already exist`);
  console.log(`Items: ${itemCreated} created, ${itemExist} already exist`);
  console.log(`Categories: ${categoryCreated} created, ${categoryExist} already exist`);
}

async function printSummary() {
  const [suppliers, contractors, projects, entities, items] = await Promise.all([
    prisma.supplier.count({ where: { deletedAt: null } }),
    prisma.contractor.count({ where: { deletedAt: null } }),
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.entity.count({ where: { deletedAt: null } }),
    prisma.item.count({ where: { deletedAt: null } }),
  ]);
  console.log("\n=== Final DB Counts ===");
  console.log(`Suppliers: ${suppliers}`);
  console.log(`Contractors: ${contractors}`);
  console.log(`Projects: ${projects}`);
  console.log(`Entities: ${entities}`);
  console.log(`Items: ${items}`);
}

async function main() {
  console.log("Starting master data seed...");
  await seedFromCongNoVatTu();
  await seedFromDuAnXayDung();
  await printSummary();
  console.log("\nSeed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect());
