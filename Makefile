.PHONY: help up down logs backend frontend simulate test lint seed migrate reset-db

help:
	@echo "up        - start backend + frontend in docker"
	@echo "down      - stop everything"
	@echo "backend   - run FastAPI locally (no docker)"
	@echo "frontend  - run Vite locally (no docker)"
	@echo "simulate  - stream synthetic attacks into the backend"
	@echo "test      - run backend tests"
	@echo "lint      - ruff + tsc"
	@echo "seed      - load data/assets.json into the database"
	@echo "migrate   - apply alembic migrations"
	@echo "reset-db  - delete the SQLite database (next start recreates it)"

up:
	cd infra && docker compose up --build

down:
	cd infra && docker compose down

logs:
	cd infra && docker compose logs -f --tail=100

backend:
	cd backend && uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

simulate:
	python3 simulator/simulate.py --rate 2

test:
	cd backend && python3 -m pytest -q

lint:
	cd backend && ruff check .
	cd frontend && npm run typecheck

seed:
	cd backend && python3 -m app.core.seed

migrate:
	cd backend && python3 -m alembic upgrade head

reset-db:
	rm -f backend/data/threatscope.db backend/data/threatscope.db-wal backend/data/threatscope.db-shm
	@echo "database reset"
