// Adds to the Labspace interface the header and the milestones of the simulated lab (simspace/):
//   - a header: "Labspace", the lab's title, "<section> / <sections>" and a progress track;
//   - a "Milestones" card at the top of each section, from the `steps` of instructions/labspace.yaml.
// A milestone checks itself when you click Run or Copy on a code block, or open a link, whose text
// contains its `match`; clicking a milestone checks or unchecks it. Progress stays in this browser.
//
//
// It also gives the instructions' relative links somewhere to go (the interface would open the raw
// Markdown in a new tab): a link to another module opens that section, and a link to a file of the
// repository (or a `:fileLink`) opens it in your editor, or on GitHub in the static preview.
//
// The interface is a React app this script doesn't own: it only adds its own elements next to the
// interface's, and puts them back if a re-render removes them. Styles are in theme.css.
(() => {
  const base = document.currentScript?.dataset.base || "/";
  let config = null;
  let done = {};
  let storageKey = "labspace-ui";

  const load = () => {
    try {
      done = JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
    } catch {
      done = {};
    }
  };
  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(done));
    } catch {
      /* private mode: progress only lasts for this page */
    }
  };

  // The section in the URL: /<section> (or /<repo>/<section> on GitHub Pages); the first one otherwise
  function activeIndex() {
    let rest = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname;
    rest = decodeURIComponent(rest.split("/").filter(Boolean)[0] || "");
    const index = config.sections.findIndex((s) => s.id === rest);
    return index >= 0 ? index : 0;
  }

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function renderHeader(header, current) {
    header.replaceChildren();
    const bar = el("div", "lsui-header-bar");
    const brand = el("div", "lsui-brand");
    const logo = el("img", "lsui-brand-logo");
    logo.src = `${base}docker.svg`;
    logo.alt = "";
    const text = el("div", "lsui-brand-text");
    text.append(el("span", "lsui-brand-eyebrow", "Labspace"), el("span", "lsui-brand-title", config.title));
    brand.append(logo, text);

    const count = el("div", "lsui-progress-count");
    count.append(el("span", "lsui-progress-current", String(current + 1)), el("span", "lsui-progress-total", `/ ${config.sections.length}`));
    bar.append(brand, count);

    const track = el("div", "lsui-progress-track");
    config.sections.forEach((section, i) => {
      const segment = el("span", "lsui-progress-segment" + (i < current ? " is-complete" : "") + (i === current ? " is-active" : ""));
      segment.title = section.title;
      track.append(segment);
    });
    header.append(bar, track);
  }

  function renderMilestones(card, section) {
    card.replaceChildren();
    card.hidden = section.steps.length === 0;
    if (card.hidden) return;
    const doneHere = new Set(done[section.id] || []);
    card.append(el("span", "lsui-milestones-caption", "Milestones"));
    const list = el("ul", "lsui-milestones-list");
    for (const step of section.steps) {
      const isDone = doneHere.has(step.id);
      const item = el("li", "lsui-milestone" + (isDone ? " is-done" : ""));
      const button = el("button", "lsui-milestone-button");
      button.type = "button";
      button.title = isDone ? "Mark as not done" : "Mark as done";
      button.append(
        el("span", "lsui-milestone-check material-symbols-outlined", isDone ? "check_circle" : "radio_button_unchecked"),
        el("span", "lsui-milestone-title", step.title),
      );
      button.addEventListener("click", () => setDone(section, step, !isDone));
      item.append(button);
      list.append(item);
    }
    card.append(list);
  }

  function setDone(section, step, value) {
    const ids = new Set(done[section.id] || []);
    if (value) ids.add(step.id);
    else ids.delete(step.id);
    done[section.id] = [...ids];
    save();
    render();
  }

  // Puts the header and the card in place (again, after a re-render) and fills them
  function render() {
    if (!config) return;
    const body = document.querySelector(".workshop-body");
    const scroll = body?.parentElement;
    const column = scroll?.parentElement;
    if (!body || !column) return;

    let header = column.querySelector(":scope > .lsui-header");
    if (!header) {
      header = el("header", "lsui-header");
      column.insertBefore(header, scroll);
    }
    let card = scroll.querySelector(":scope > .lsui-milestones");
    if (!card) {
      card = el("div", "lsui-milestones");
      scroll.insertBefore(card, body);
    }
    const current = activeIndex();
    renderHeader(header, current);
    renderMilestones(card, config.sections[current]);
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    // Not requestAnimationFrame: it doesn't run in a background tab, and the page would stay bare
    setTimeout(() => {
      scheduled = false;
      render();
    }, 0);
  };

  // Section changes go through the History API (react-router)
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      schedule();
      return result;
    };
  }
  window.addEventListener("popstate", schedule);

  // Run, Copy and links check the milestones they match
  document.addEventListener(
    "click",
    (event) => {
      if (!config) return;
      const target = event.target instanceof Element ? event.target : null;
      const block = target?.closest(".workshop-body .code-block");
      const link = target?.closest(".workshop-body a[href]");
      let text = null;
      if (block && target.closest("button")) text = block.querySelector("code")?.textContent || block.textContent;
      else if (link) text = link.getAttribute("href");
      if (!text) return;
      const section = config.sections[activeIndex()];
      for (const step of section.steps) {
        if (step.match && text.includes(step.match) && !(done[section.id] || []).includes(step.id)) setDone(section, step, true);
      }
    },
    true,
  );

  // ------------------------------------------------------------------ links to modules and files

  // Editors that open a file from a URL (the path is absolute)
  const EDITORS = {
    vscode: (file) => `vscode://file${file}`,
    "vscode-insiders": (file) => `vscode-insiders://file${file}`,
    cursor: (file) => `cursor://file${file}`,
    windsurf: (file) => `windsurf://file${file}`,
    idea: (file) => `idea://open?file=${encodeURIComponent(file)}`,
  };

  // Opens a file or folder of the repository (`relativePath` from its root): in the local editor,
  // or on GitHub in the static preview. Returns false when there is nowhere to open it.
  function openRepoFile(relativePath, line) {
    const files = config?.files || {};
    const clean = relativePath.replace(/^\/+/, "").replace(/\/+$/, "");
    if (files.workspace) {
      const editor = EDITORS[files.editor] || EDITORS.vscode;
      const url = editor(`${files.workspace}/${clean}`) + (line && files.editor !== "idea" ? `:${line}` : "");
      // A custom scheme hands the file to the editor; the page stays where it is
      const a = el("a");
      a.href = url;
      a.click();
      return true;
    }
    if (files.github) {
      window.open(`${files.github}${clean}${line ? `#L${line}` : ""}`, "_blank", "noopener");
      return true;
    }
    return false;
  }

  // GitHub's anchor for a heading: lower case, punctuation removed, spaces as dashes
  const githubAnchor = (text) =>
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");

  function goToSection(section, hash) {
    history.pushState({}, "", `${base}${section.id}`);
    window.dispatchEvent(new PopStateEvent("popstate")); // react-router follows the History API
    if (!hash) return;
    // The interface's headings have no id: find the one whose GitHub anchor is the link's, once
    // the section has loaded
    const anchor = decodeURIComponent(hash);
    const started = Date.now();
    const find = () => {
      const heading = [...document.querySelectorAll(".workshop-body :is(h1, h2, h3, h4)")].find(
        (h) => githubAnchor(h.textContent) === anchor,
      );
      if (heading) heading.scrollIntoView({ block: "start" });
      else if (Date.now() - started < 3000) setTimeout(find, 100);
    };
    setTimeout(find, 100);
  }

  // Relative links of the Markdown, resolved from instructions/ (where the modules live)
  document.addEventListener(
    "click",
    (event) => {
      if (!config || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const link = event.target instanceof Element ? event.target.closest(".workshop-body a[href]") : null;
      const href = link?.getAttribute("href");
      if (!href || /^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(href)) return; // absolute, anchor or site path
      const url = new URL(href, "https://repo.invalid/instructions/");
      const repoPath = decodeURIComponent(url.pathname.slice(1));
      const section = config.sections.find((s) => `instructions/${s.file.replace(/^\.\//, "")}` === repoPath);
      if (section) {
        event.preventDefault();
        event.stopPropagation();
        goToSection(section, url.hash.slice(1));
      } else if (openRepoFile(repoPath)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );

  // `:fileLink[...]{path=...}` directives: the interface asks its API to open the file in the IDE,
  // which a host terminal doesn't have. Open it here instead (the path is from the repository root).
  const previousFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url;
    if (url === "/api/labspace/open-file" && config) {
      try {
        const { filePath, line } = JSON.parse(init.body || "{}");
        if (filePath && openRepoFile(filePath, line)) {
          return Promise.resolve(new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } }));
        }
      } catch {
        /* fall through to the interface */
      }
    }
    return previousFetch(input, init);
  };

  fetch(`${base}labspace-ui.json`, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
    .then((data) => {
      config = data;
      storageKey = `labspace-ui:${data.id}`;
      load();
      new MutationObserver(() => {
        const body = document.querySelector(".workshop-body");
        const missing =
          body &&
          (!body.parentElement.querySelector(":scope > .lsui-milestones") ||
            !body.parentElement.parentElement.querySelector(":scope > .lsui-header"));
        if (missing) schedule();
      }).observe(document.body, { childList: true, subtree: true });
      render();
    })
    .catch((err) => console.warn("labspace-ui: no header nor milestones:", err.message));
})();
