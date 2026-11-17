# The lab as a Labspace, with a terminal on your machine

A [Labspace](https://github.com/dockersamples/labspace-infra) rendering of the hands-on lab: the
[instructions](../instructions) on the left, with **Run** buttons, and on the right a terminal that is a real shell
**on your own machine**, not in a container.

A regular Labspace runs its terminal in a VS Code container. That doesn't work for this lab: `sbx` starts microVMs on
your machine, uses your OS keychain and your `gh` login, and the lab compares what you see inside a sandbox with what
your host sees. So the commands must run where `sbx` runs: on your machine.

## Start it

You need the [prerequisites](../instructions/00-prerequisites.md) of the lab, plus **Node.js 20+** and **Docker**.

```bash
./labspace-local/start.sh
```

Then open <http://localhost:3030>. The first run installs the bridge's dependencies and pulls the interface image.
`Ctrl-C` stops everything. Running `start.sh` again while the Labspace runs is safe: it keeps the running
bridge and its shells, makes sure the interface is up, and opens the browser.

- The shells start in the root of this repository, with your login shell (`$SHELL -l`).
- Each tab is a separate shell. Click **+** for another one, as the lab asks for "another terminal".
- A code block with `terminal-id=<name>` (for example `` ```bash terminal-id=agent-2 ``) runs in the tab of that
  name, and creates it if needed.
- Reloading the page keeps the shells and replays their recent output. They stop when you stop `start.sh`.

## How it works

```mermaid
graph LR
    Browser(["Your browser<br/>localhost:3030"])

    subgraph Container["Container"]
        Interface["Labspace interface<br/>WORKSPACE_TYPE=ttyd"]
    end

    subgraph Host["Your machine"]
        Bridge["Bridge<br/>127.0.0.1:8085"]
        Shells["Your shells<br/>sbx, gh, git, docker"]
        Instructions["instructions/*.md<br/>+ labspace.yaml"]
    end

    Browser -->|instructions| Interface
    Browser -->|terminal iframe, WebSocket| Bridge
    Interface -->|Run / Save, with a token| Bridge
    Bridge --> Shells
    Instructions -->|read-only mount| Interface
```

- **Interface**: the published `dockersamples/labspace-interface` image, unchanged. With `WORKSPACE_TYPE=ttyd`, it
  sends the Run and Save buttons to `$WORKSPACE_API_URL/api/command` and `/api/save` instead of the VS Code
  extension, and shows `http://localhost:8085` in its right panel. Only this container is started: no configurator,
  VS Code workspace, socket proxy or port republisher, which a host terminal doesn't need. The Markdown is mounted
  read-only and re-read on every page load, so you can edit the lab and refresh.
- **Content** ([`content.mjs`](content.mjs)): copies `instructions/` to `.content/` as the Labspace shows it, and keeps
  the copy current while the Labspace runs. The static build uses it too.
  - It removes the navigation footer of each module (`[[<< Previous: …] | [Next >> …]]`): the Labspace has its own
    Previous/Next buttons.
  - It keeps the Run and Copy buttons for what you run or type: `bash` blocks are commands (Run and Copy), `console`
    blocks are prompts for the agent (Run and Copy) or, when they start with a table header, outputs (no button), and
    `none`, `yaml` or `dockerfile` blocks are outputs or files to read (no button).
  - It writes `labspace-ui.json`, the sections and milestones for the header and the milestones card.
- **Look of the simulated lab**: [`theme.css`](theme.css) gives the Labspace interface the look of the simulated lab in
  [`../simspace`](../simspace) (fonts, headings, inline code, alerts, code blocks, footer buttons), and
  [`labspace-ui.js`](labspace-ui.js) adds its header ("Labspace", the title, `2 / 13`, a progress track) and a
  **Milestones** card at the top of each section. The milestones are the `steps` of
  [`../instructions/labspace.yaml`](../instructions/labspace.yaml), the same as the simulated lab's: one checks itself
  when you click Run or Copy on a code block, or open a link, whose text contains its `match`, and you can click one to
  check or uncheck it. Progress stays in your browser. `start.sh` adds both files to the image's own `index.html`
  (in `.ui/`, mounted in the container) and serves them from `.content/`; the static build adds them too. The bridge's
  terminal pane takes the look of the simulated lab's terminals.
- **Bridge** ([`bridge/server.js`](bridge/server.js)): a small Node.js server on your machine. It serves the terminal
  page (xterm.js), runs one shell per tab with node-pty, and implements the two endpoints the interface calls. When
  the program in the terminal accepts bracketed paste (zsh at its prompt, Copilot in an agent session), Run pastes the
  block whole, then presses Enter: a multi-line prompt reaches the agent as one message.
- [`../instructions/labspace.yaml`](../instructions/labspace.yaml) lists the sections.

### Security

The bridge types commands into your shell, so it only accepts what the Labspace sends:

- It listens on `127.0.0.1` only.
- `/api/command` and `/api/save` need a token, which `start.sh` generates once into `labspace-local/.token` (readable
  by you only, never committed) and gives only to the bridge and the interface container. Delete the file to get a new
  token on the next start.
- The WebSocket only accepts the terminal page's own origin (`http://localhost:8085`), and every request must name
  the bridge in its `Host` header, so another web page can't drive the shell, even through DNS rebinding.
- The terminal page can only be framed by `localhost:3030`.
- Save writes only under this repository, or under your home folder for paths that start with `~/`.

## Static preview (GitHub Pages)

[`static/build.mjs`](static/build.mjs) builds the same interface as a static site, to see the rendering without
running anything: no container and no bridge. The right panel is a preview that shows what the **Run** and
**Save** buttons would do. The [`pages`](../.github/workflows/pages.yaml) workflow publishes it to GitHub Pages in
`labspace/` (`https://<owner>.github.io/sbx-lab/labspace/`), next to the simulated lab in `simspace/` and the hands-on lab at the root.

```bash
node labspace-local/static/build.mjs --base /sbx-lab/labspace/ --out _site/labspace
```

It builds the interface client from `dockersamples/labspace-infra` at a pinned commit, with small patches (base path,
preview panel instead of VS Code), writes the sections as JSON files, and adds a script that answers the client's
`/api` calls from them.

## Known limitations

- **No IDE**: "open file" links do nothing. Use your own editor on the repository.
- **Linux**: node-pty has no prebuilt binary for Linux, so `npm install` compiles it, which needs `python3`, `make`
  and a C++ compiler, and recent npm versions may ask you to approve its install script.
- The interface image is used as `latest`; its `ttyd` workspace mode is recent (April 2026). It also reads a VS Code
  signing key at start-up even in that mode, which is why [`unused-signing.key`](unused-signing.key) is mounted.
- Ports 3030 and 8085 are fixed: the interface always shows `http://localhost:8085` in its right panel.
