# SAP BTP Deployment

Multi-module MTA deployment: AppRouter (auth gate) + FastAPI backend + React frontend.

---

## Prerequisites

| Tool | Install |
|------|---------|
| CF CLI v8+ | `brew install cloudfoundry/tap/cf-cli@8` |
| CF MultiApps plugin | `cf install-plugin multiapps` |
| Cloud MTA Build Tool | `npm install -g mbt` |
| Node.js 20+ | required for `mbt` and the frontend build |

---

## One-time space setup

Before deploying, your CF space needs:

1. **HANA Cloud service instance** named `itsm-hana-db`
   ```bash
   cf create-service hana-cloud hana itsm-hana-db
   ```
   If the instance already exists, note its exact name and update `mta.yaml` → `resources.itsm-hana.parameters.service-name`.

2. **CF login**
   ```bash
   cf login -a https://api.eu10.hana.ondemand.com   # adjust region
   cf target -o <YOUR_ORG> -s <YOUR_SPACE>
   ```

---

## Build & deploy

```bash
# 1. Build the .mtar archive (runs npm build + packages backend)
mbt build

# 2. Deploy (creates/updates all modules and resources)
cf deploy mta_archives/itsm_0.1.0.mtar -f
```

The `Procfile` runs `alembic upgrade head` automatically before uvicorn starts,
so the database schema is always up-to-date on every deploy.

---

## Post-deploy checklist

```bash
# Check all apps are running
cf apps

# Tail logs to confirm healthy startup
cf logs itsm-api --recent | grep -E "ITSM API|alembic|ERROR"

# Confirm health endpoint
curl https://<itsm-approuter-url>/api/health
```

Then in the SAP BTP Cockpit → Security → Role Collections:

- Assign **ITSM_Admin** to the first admin user
- Assign **ITSM_Agent / ITSM_Support / ITSM_Viewer** to other users

Open the AppRouter URL in a browser — it should redirect to the SAP login page.

---

## Restrict CORS after first deploy

Once you know the AppRouter URL, tighten the backend's CORS setting in `mta.yaml`:

```yaml
properties:
  CORS_ORIGINS: '["https://itsm-approuter.cfapps.eu10.hana.ondemand.com"]'
```

Then redeploy.

---

## Enable CF internal routing (optional, recommended for production)

By default the backend has a public CF route. To lock it down so only the
AppRouter can reach it:

```bash
# 1. Uncomment `no-route: true` in mta.yaml for itsm-api
# 2. Add a network policy
cf add-network-policy itsm-approuter --destination-app itsm-api --port 8080 --protocol tcp
# 3. Redeploy
cf deploy mta_archives/itsm_0.1.0.mtar -f
```

---

## Updating the version

Edit `mta.yaml` `version:` and the `cf deploy` path (`mta_archives/itsm_<version>.mtar`).

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| AppRouter 401/403 | Role Collections assigned in BTP Cockpit? |
| Backend 500 on startup | `cf logs itsm-api --recent` — look for import errors or DB connection issues |
| Migration failed | `cf run-task itsm-api --command "alembic upgrade head" --name manual-migrate` |
| HANA connection error | Verify `itsm-hana-db` service instance exists and is bound (`cf services`) |
| XSUAA token rejected | Check `xsappname` in xs-security.json matches the deployed XSUAA instance |
