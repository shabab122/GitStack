# GitStack Sandbox Service

The sandbox service runs student Git commands inside temporary Docker containers.

## Lifecycle

```text
Create → Start → Terminal/Commands → Stop → Start → Reset → Delete/Expire
```

## Modes

- `ISOLATED`: Docker network is `none`.
- `COLLABORATION`: container joins the internal `gitstack-sandbox-network`. Gitea can later join this same private network.

## Persistence

Docker labels make containers discoverable. PostgreSQL `SandboxSession` records store owner, mission run, mode, status, container metadata and timestamps. The Docker container remains the source of truth for its live runtime state.

## Terminal

The WebSocket endpoint is:

```text
/ws/sandboxes/:sandboxId/terminal
```

It verifies the JWT cookie, loads the user, checks sandbox ownership and then launches an interactive Bash process inside the correct container. The container uses the `script` command to allocate a pseudo-terminal.

## REST endpoints

```http
GET    /api/sandboxes
POST   /api/sandboxes
GET    /api/sandboxes/:id
POST   /api/sandboxes/:id/start
POST   /api/sandboxes/:id/stop
POST   /api/sandboxes/:id/reset
DELETE /api/sandboxes/:id
POST   /api/sandboxes/:id/commands
```

## Security

- Student commands run as UID/GID 10001.
- No host source directory is mounted.
- No Docker socket is mounted into student containers.
- CPU, memory and PID limits are applied.
- `/workspace` and `/tmp` are temporary tmpfs mounts.
- Isolated mode has no network.
- Collaboration mode uses an internal Docker network.
- REST commands use fixed argument arrays and timeouts.
- Browser terminal access requires authentication and ownership.
- Expired sandboxes are automatically removed.
