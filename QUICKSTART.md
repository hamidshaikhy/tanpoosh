# Local Windows quickstart

## This machine

Double-click `START_TANPOOSH.cmd`, or run from the project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/start-local.ps1 -OpenBrowser
```

Store/studio: **http://localhost:8088** and **/studio**. Management: **/manage/login**. Email inbox: **http://127.0.0.1:8025**. Port 8080 belongs to an unrelated Adobe application on this machine; the shop deliberately uses 8088.

Owner username: `tanpoosh_admin`. Open `backend/.local-credentials/owner.txt` locally to read the password. Local development uses password-only staff login (`MFA_DEV_BYPASS=true`). Set it to `false` to require an Authenticator app. Production always requires MFA. Browser tests use separate `tp_e2e_*` identities. Credentials are ignored by Git and never stored in these docs.

The launcher starts PostgreSQL, Redis, Mailpit, Django, Next, Celery worker/beat, and Caddy in hidden windows. Inspect `logs/*.err.log` if startup fails. It does not stop unrelated processes. After backend code changes, restart the services because Django runs with `--noreload`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/stop-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/start-local.ps1
```

Payments are **mock**: choose success, failure or cancel on the Persian test gateway. No money is transferred. All emails stay in Mailpit. Generated catalogue data is fictional.

## Fresh setup

Install Python 3.12, Node 24, PostgreSQL 18, Redis and Mailpit. Portable binaries on this machine live in `.local-tools/` and are intentionally excluded from source control. The launcher expects the paths shown in `tools/start-local.ps1`; adapt those paths if using system installations.

Create database `tanpoosh` owned by login role `tanpoosh`. For pytest, that local role also needs `CREATEDB`. Keep PostgreSQL and Redis bound to loopback. Store the role password only in `.local-tools/pg-app-password.txt`, or supply it interactively through your database tooling. Start PostgreSQL/Redis and Mailpit (SMTP 2525, UI 8025).

```powershell
py -3.12 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
backend/.venv/Scripts/python.exe backend/scripts/init_local_env.py
backend/.venv/Scripts/python.exe backend/scripts/sync_frontend_env.py
backend/.venv/Scripts/python.exe backend/manage.py migrate
backend/.venv/Scripts/python.exe backend/manage.py seed_store
backend/.venv/Scripts/python.exe backend/manage.py refresh_demo_catalog
backend/.venv/Scripts/python.exe backend/manage.py bootstrap_owner --generate
cd frontend
npm ci
cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File tools/start-local.ps1 -OpenBrowser
```

`bootstrap_owner` refuses to overwrite an existing owner. It displays a newly generated password once in your terminal and saves the ignored local credentials file. Never regenerate `.env` over existing data without retaining the MFA encryption key. Product photos, prepared studio WebP layers and the font are already included; no Blender, 3D model or online image API is needed to run the project.

## Verification

Run backend commands **from backend/** and frontend commands **from frontend/**:

```powershell
# backend/
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check apps tests config scripts
.venv/Scripts/python.exe manage.py makemigrations --check --dry-run
.venv/Scripts/python.exe manage.py spectacular --file ../frontend/src/lib/api/openapi.yaml --validate
# frontend/
npm run api:types
npm run api:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Start the complete stack before E2E. Playwright uses installed Google Chrome and prepares dedicated test users. It adds simulated orders/products and replenishes the specific demo SKUs it exercises through the inventory ledger. Test reports, local credentials and screenshots are ignored. Keep auth traces disabled.

Stop the development server before a production build on this machine. To keep the build output separate, use `$env:NEXT_BUILD_DIR='.next-production'` before `npm run build`, then clear it with `$env:NEXT_BUILD_DIR=$null` before starting development again. Docker/CI files are optional artifacts and were not executed on this Windows machine.

The photo studio supports 17 products and 31 colour choices across tops, trousers, shoes and sunglasses, covering 2,520 combinations. Outerwear is available in the shop. Registration and image details are in [docs/STUDIO_IMAGES.md](docs/STUDIO_IMAGES.md). Redis snapshots stay in ignored `.local-tools/redis-data/cache.rdb`.
