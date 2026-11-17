# The interactive TUI dashboard

Running `sbx` with no arguments opens the TUI (Terminal User Interface).

```mermaid
graph LR
    You(["You"])

    subgraph Tui["sbx dashboard"]
        direction TB
        SandboxesPanel["Sandboxes panel<br/>cards, CPU, memory"]
        NetworkPanel["Network panel<br/>live allowed and blocked hosts"]
    end

    Daemon["sbx daemon"]

    subgraph Sandboxes["Your sandboxes"]
        direction TB
        Quickstart["quickstart"]
        Others["other sandboxes"]
    end

    You -->|keyboard or mouse| SandboxesPanel
    You -->|Tab| NetworkPanel
    SandboxesPanel -->|"create, start, attach, remove"| Daemon
    NetworkPanel -->|allow or block a host| Daemon
    Daemon -->|manages| Quickstart
    Daemon -->|manages| Others

    style Tui fill:#E5F2FC,stroke:#1D63ED,color:#00084D
    style Sandboxes fill:#f0faf4,stroke:#86c5a0,color:#00084D
    style SandboxesPanel fill:#fff,stroke:#0DB7ED,color:#384D54
    style NetworkPanel fill:#fff,stroke:#0DB7ED,color:#384D54
    style Daemon fill:#E5F2FC,stroke:#1D63ED,color:#00084D
    style Quickstart fill:#e0f2e6,stroke:#6db88a,color:#384D54
    style Others fill:#e0f2e6,stroke:#6db88a,color:#384D54
    style You fill:#fff,stroke:#1D63ED,color:#00084D
```

Open the TUI by running the following command on your host, outside of any sandbox:

```bash id=host
sbx
```

The real dashboard is live and shows all sandboxes as cards with live CPU and memory usage. The simulation prints a snapshot of it.

Here are a few useful keyboard shortcuts:

| Key     | Action                                               |
|---------|------------------------------------------------------|
| `c`     | Create a new sandbox                                 |
| `s`     | Start or stop the selected sandbox                   |
| `Enter` | Attach to the agent session (same as `sbx run`)      |
| `x`     | Open a shell inside the sandbox (`sbx exec`)         |
| `r`     | Remove the selected sandbox                          |
| `Tab`   | Switch between the Sandboxes panel and Network panel |
| `?`     | Show all shortcuts                                   |

The **Network panel** (press `Tab`) shows a live log of every outbound connection the sandbox makes: which hosts were reached, which were blocked. Use the arrow keys to navigate the log and allow or block hosts directly. This is the fastest way to debug "why can't my agent install this package?" Look for the `paste.rs` upload you tried in the previous module: it's there, blocked.

Exit the real dashboard with **Ctrl-C and then Y**, without stopping any sandboxes.

For now the dashboard is quiet: only `quickstart` exists, and no agent is working. You'll open it again in the *Clone mode and parallel agents* module, to watch two agents work at the same time.

> **Tip:** while you can use the keyboard to navigate around the TUI, it also has full mouse support.
