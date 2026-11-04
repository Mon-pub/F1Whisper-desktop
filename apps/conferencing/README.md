# Threema Conferencing

The Threema Conferencing web app, built with Svelte and Tailwind CSS. It is a static single-page
app, which is distributed as a container image that serves the pre-built files.

## Deployment

The steps below build the app and run it in a simple single-host setup. More complex environments
(e.g. Kubernetes) will differ.

1. To build the container image and export it as a tarball. Run the following command from the
   monorepo root:

   ```bash
   pnpm run dist:conferencing
   ```

   The image is exported to `apps/conferencing/dist/image.tar`, and tagged with the app's version
   from its `package.json` (e.g. `threema-conferencing:0.1.0`).

2. Copy the tarball to the target host and load it:

   ```bash
   docker load --input image.tar
   ```

3. Start the container (app is served on port `8080` in the container by default):

   ```bash
   docker run --detach --publish 8080:8080 threema-conferencing:0.1.0
   ```

4. The app is now available at <http://localhost:8080>.

### Notes

- **Port**: The container serves on port `8080`. Usually it is enough to publish it on a different
  host port (e.g. `--publish 80:8080`). To change the port inside the container, set
  `--env MINISERVE_PORT=9090`; the health check follows it automatically.
- **TLS**: The app is served over plain HTTP. Terminate TLS in front of the container, e.g. with a
  reverse proxy or an ingress.
- **Hardening**: The container is stateless, runs as an unprivileged user and needs no write access,
  so it can be locked down further with
  `--read-only --cap-drop=ALL --security-opt no-new-privileges`. In Kubernetes, the equivalents are
  `readOnlyRootFilesystem`, `runAsNonRoot`, `allowPrivilegeEscalation: false` and dropping all
  capabilities.
- **Health check**: The image declares a health check, which `docker ps` reports in its `STATUS`
  column. Kubernetes ignores it, so define readiness and liveness probes on `/` instead.
- **Podman**: `podman` can be used instead of `docker` for the commands above. To build the image
  with it, run `pnpm run dist:conferencing -- -- --engine podman`.
