# 🐳 Docker inside the sandbox

Each sandbox has its own private Docker daemon. Your agent can run `docker compose up`, build images, and start containers, and none of them appear in your host's `docker ps`.

```mermaid
graph LR
    subgraph Host["Your machine"]
        direction TB
        HostDocker["Your own Docker<br/>docker ps shows none of it"]
        Proxy["Proxy"]
    end

    subgraph Sandbox["Sandbox: quickstart"]
        direction TB
        Agent["Copilot agent"]
        subgraph Daemon["Private Docker daemon"]
            direction TB
            Frontend["frontend :3000"]
            Backend["backend :8000"]
            Db["postgres"]
        end
    end

    Registries["Docker Hub, npm, PyPI"]

    Agent -->|docker compose up| Daemon
    Frontend -->|API calls| Backend
    Backend -->|SQL| Db
    Daemon -->|image and package downloads| Proxy
    Proxy -->|allowed hosts| Registries
    HostDocker -.->|"can't see"| Daemon

    %% Styles — containers
    style Host fill:#E5F2FC,stroke:#1D63ED,color:#00084D
    style Sandbox fill:#f0faf4,stroke:#86c5a0,color:#00084D
    style Daemon fill:#f8fbff,stroke:#9fc5e8,color:#00084D

    %% Styles — host nodes
    style HostDocker fill:#fff,stroke:#0DB7ED,color:#384D54
    style Proxy fill:#E5F2FC,stroke:#1D63ED,color:#00084D

    %% Styles — sandbox nodes
    style Agent fill:#e0f2e6,stroke:#6db88a,color:#384D54
    style Frontend fill:#e0f2e6,stroke:#6db88a,color:#384D54
    style Backend fill:#e0f2e6,stroke:#6db88a,color:#384D54
    style Db fill:#e0f2e6,stroke:#6db88a,color:#384D54

    %% Styles — external nodes
    style Registries fill:#fff0e5,stroke:#d4915e,color:#384D54
```

1. Go back to the `project` directory (the clone mode module left you at the root of the repository) and reconnect to your sandbox:

    ```bash id=host
    cd project
    sbx run --name quickstart
    ```

2. Give your agent the following prompt:

    ```console
    Start the full application stack using Docker Compose.
    Once everything is healthy:
    1. Confirm the backend API is responding at http://localhost:8000/health
    2. Create a test user via the API
    3. Create a project and two issues for that user
    4. Report the final state (user, project, issues) as JSON

    Use the API docs at http://localhost:8000/docs if helpful.
    Make sure all servers bind to 0.0.0.0 so I can reach them via port forwarding.
    ```

    You will see your agent run `docker compose up --build -d`, wait for the database and backend health checks to pass, then call the API endpoints with `curl` or `httpx`. The first run pulls images and installs the frontend dependencies, so it can take a few minutes.

3. From inside the agent session, list the running containers:

    ```bash id=sandbox
    !docker ps
    ```

    The output looks similar to this:

    ```console
    CONTAINER ID   IMAGE                COMMAND                  CREATED         STATUS                   PORTS                                         NAMES
    a74c644a575f   project-frontend     "docker-entrypoint.s…"   2 minutes ago   Up 2 minutes             0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp   project-frontend-1
    046609163f75   project-backend      "uvicorn app.main:ap…"   2 minutes ago   Up 2 minutes (healthy)   0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp   project-backend-1
    f8c2988853b3   postgres:16-alpine   "docker-entrypoint.s…"   2 minutes ago   Up 2 minutes (healthy)   5432/tcp                                      project-db-1
    ```

    Run `docker ps` in another terminal on your host: you won't see these containers there.

4. **Leave the agent session open** and move on to the next module in another terminal.

    > [!IMPORTANT]
    > A sandbox stops when no agent session is attached to it, and its containers and published ports go with it. If you exit the session (`Ctrl-C` twice), restart the sandbox without opening a new session:
    >
    > ```bash id=host
    > sbx run --detach --name quickstart
    > ```
    >
    > The Compose services restart on their own within a few seconds, and published ports are restored.

The containers your agent runs live entirely inside the sandbox. When you remove the sandbox with `sbx rm`, all its images, containers, and PostgreSQL data are deleted too.

[[<< Previous: Clone mode and parallel agents](07-parallel-agents.md) | [Next >> Port forwarding](09-port-forwarding.md)]
