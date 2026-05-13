up:
	docker compose up -d

down:
	docker compose down

reset:
	docker compose down -v --remove-orphans

dlogs:
	docker compose logs -f

logs: dlogs

test-unit:
	COREPACK_HOME=/private/tmp/corepack corepack pnpm test

test-regression-prepare:
	docker compose up -d postgres redis mailhog
	docker compose exec -T postgres sh -lc 'until pg_isready -U hr_user; do sleep 1; done'
	docker compose exec -T postgres createdb -U hr_user hr_test || true
	COREPACK_HOME=/private/tmp/corepack DATABASE_URL=postgresql://hr_user:hr_secret@localhost:5434/hr_test corepack pnpm --filter @hr/prisma exec prisma db push --schema schema.prisma

test-regression:
	COREPACK_HOME=/private/tmp/corepack DATABASE_URL=postgresql://hr_user:hr_secret@localhost:5434/hr_test REDIS_URL=redis://:redis_secret@localhost:6380/1 corepack pnpm --filter @hr/api test:regression
