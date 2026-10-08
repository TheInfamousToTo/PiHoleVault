# End-to-end test

`full.e2e.cjs` drives the PiHoleVault UI in Chromium through setup, backups of
two Pi-holes, encryption, S3 and WebDAV off-site storage, ntfy notifications,
diff, selective restore, pin, verify and delete. It checks each outcome
against the API and the real services, not only the page.

CI (`.github/workflows/ci.yml`, job `e2e`) runs it against the Docker image
built from the checkout. To run the same thing locally:

```bash
cd e2e
npm ci
npx playwright install chromium

# Everything, including PiHoleVault built from this checkout
docker compose --profile app up -d --build --wait
docker compose exec -T s3 sh -c 'echo "s3.bucket.create -name pihole-backups" | weed shell'
npm test

docker compose --profile app down -v
```

Against PiHoleVault running from source (`backend` on :3001, `vite` on :3000)
instead of the image, start only the services and say so:

```bash
docker compose up -d --wait
docker compose exec -T s3 sh -c 'echo "s3.bucket.create -name pihole-backups" | weed shell'
E2E_TARGET=local npm test
```

Screenshots of every step, and of the failing one, land in `e2e/artifacts/`.
The test sets PiHoleVault up from scratch, so point it at a fresh data
directory.
