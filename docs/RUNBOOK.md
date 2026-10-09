# Local operations

Use `tools/start-local.ps1` and `tools/stop-local.ps1`. The owner account is independent from `tp_e2e_*` browser fixtures. Keep `.env`, `.local-credentials`, `.local-tools`, Mailpit data and backups out of Git. Local services bind to loopback; do not forward their ports.

## Account recovery

From `backend/`:

```powershell
.venv/Scripts/python.exe manage.py set_staff_password --username tanpoosh_admin
.venv/Scripts/python.exe manage.py reset_staff_mfa --username tanpoosh_admin --yes
```

Password rotation revokes sessions. When MFA is enabled, MFA reset requires enrolling a new Authenticator and storing recovery codes. Local development defaults to password-only login (`MFA_DEV_BYPASS=true`). Retain the original `MFA_ENCRYPTION_KEY` with encrypted database backups: regenerating it makes existing enrolled devices unreadable. Do not run recovery commands merely to bypass MFA.

## Scheduled work and troubleshooting

```powershell
.venv/Scripts/python.exe manage.py run_maintenance
```

This expires overdue reservations, reconciles uncertain payments and dispatches pending outbox events once. Normal worker/beat operation is preferable. Review `logs/worker.err.log` and `logs/beat.err.log`; email appears in Mailpit. Backend responses contain a request id for log correlation. Credentials, token fragments and payment secrets must not be pasted into issue reports.

For inventory inconsistencies, inspect the movement ledger and reservations; use inventory adjustment commands through the panel. Do not edit `on_hand`/`reserved` directly. Paid orders and audit events must be retained rather than deleted to hide tests.

## Backup and restore

The tested script uses PostgreSQL 18 clients in `.local-tools/pg-clients/pgsql/bin`. From the root:

```powershell
backend/.venv/Scripts/python.exe tools/backup_restore.py
```

It writes a custom-format dump under ignored `backend/backups/`, restores into a uniquely named scratch database, compares migration/catalogue/variant/stock/order/item counts, and drops only that scratch database. It never restores over the application database. Evidence is `logs/backup-restore.json`.

For a complete backup, retain the database dump, `backend/media/`, environment secrets and MFA encryption key separately. To recover the working database, stop web/worker/beat first, restore to a new database with `pg_restore --no-owner --no-acl --exit-on-error`, point the local environment at it, restore media, then run migrate/check before restarting. Preserve the previous database until recovery has been verified.

## Migrations and optional containers

Back up before schema changes. Run `manage.py migrate`; validate with `makemigrations --check` and tests. A rollback requires an explicitly reversible migration or restoration of the previous backup; don't guess a migration target or revert a paid-order schema without its data.

Docker is not installed on the tested Windows machine. The optional compose stack is for a separate local sandbox: `docker compose --env-file backend/.env --profile dev up --build`, then seed and bootstrap an owner explicitly inside its backend. It has separate volumes and uses mock payments. HTTPS Caddy and Dockerfiles are templates only; no public site or live gateway was deployed. HSTS subdomain/preload settings require ownership of every affected subdomain before activation.
