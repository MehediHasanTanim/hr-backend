up:
	docker compose up -d

down:
	docker compose down

reset:
	docker compose down -v --remove-orphans

dlogs:
	docker compose logs -f

logs: dlogs
