# NgọQuý Yên ERP

Construction management ERP: projects, materials, labor, finance — built on Next.js 16, PostgreSQL, Prisma.

## Getting Started (Development)

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your local DB credentials

npx prisma migrate dev
npm run db:seed

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run db:migrate` | Run Prisma migrations (dev) |
| `npm run db:seed` | Seed initial data |
| `npm run db:seed:master` | Seed master data |
| `npm run db:studio` | Open Prisma Studio |

## Production Deployment

See **[docs/operations/deploy.md](docs/operations/deploy.md)** for the full deployment runbook including:
- Prerequisites and VPS setup
- Docker Compose configuration
- First-time migrations and admin seeding
- SSL setup with Let's Encrypt
- Backup and monitoring configuration

## Documentation

### User Guides (Vietnamese)

| Role | Guide |
|------|-------|
| Admin | [docs/user-guide/admin.md](docs/user-guide/admin.md) |
| Kế Toán | [docs/user-guide/ke-toan.md](docs/user-guide/ke-toan.md) |
| Cán Bộ Vật Tư | [docs/user-guide/can-bo-vat-tu.md](docs/user-guide/can-bo-vat-tu.md) |
| Chỉ Huy Công Trường | [docs/user-guide/chi-huy-cong-truong.md](docs/user-guide/chi-huy-cong-truong.md) |
| Viewer | [docs/user-guide/viewer.md](docs/user-guide/viewer.md) |

### Operations

| Document | Description |
|----------|-------------|
| [docs/operations/deploy.md](docs/operations/deploy.md) | Full deployment runbook |
| [docs/operations/backup-restore.md](docs/operations/backup-restore.md) | Backup mechanism and restore procedure |
| [docs/operations/monitoring.md](docs/operations/monitoring.md) | Uptime Kuma + GlitchTip setup |
| [docs/operations/troubleshooting.md](docs/operations/troubleshooting.md) | Common errors and fixes |

### UAT Test Cases

| Module | File |
|--------|------|
| Master Data | [tests/uat/master-data.test-cases.md](tests/uat/master-data.test-cases.md) |
| Dự Án | [tests/uat/du-an.test-cases.md](tests/uat/du-an.test-cases.md) |
| Vật Tư NCC | [tests/uat/vat-tu-ncc.test-cases.md](tests/uat/vat-tu-ncc.test-cases.md) |
| Công Nợ | [tests/uat/cong-no.test-cases.md](tests/uat/cong-no.test-cases.md) |
| SL/DT | [tests/uat/sl-dt.test-cases.md](tests/uat/sl-dt.test-cases.md) |
| Tài Chính | [tests/uat/tai-chinh.test-cases.md](tests/uat/tai-chinh.test-cases.md) |
| Import/Export | [tests/uat/import-export.test-cases.md](tests/uat/import-export.test-cases.md) |

## Architecture

- **Frontend:** Next.js 16 App Router, React 19, TailwindCSS v4, AG Grid
- **Auth:** Better Auth (credential provider, role-based)
- **Database:** PostgreSQL 16 via Prisma 7 + pg adapter
- **Import:** 6 Excel adapters (xlsx parsing, idempotent, preview/commit)
- **Export:** 4 Excel templates via xlsx library
- **Audit:** Automatic audit log via Prisma $extends (all create/update/delete)
- **Deployment:** Docker Compose (nginx + nextjs + postgres + uptime-kuma)
