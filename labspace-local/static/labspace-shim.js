// Static Labspace: answers the interface's /api calls from the JSON files written by build.mjs.
// The Run and Save buttons don't run anything: they send the code block to the preview panel
// (terminal.html), which shows it.
(() => {
  const base = document.currentScript.dataset.base || "/";
  const realFetch = window.fetch.bind(window);
  const variables = {};
  const sectionCache = {};

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const section = (id) =>
    (sectionCache[id] ||= realFetch(`${base}api/sections/${encodeURIComponent(id)}.json`).then((r) => {
      if (!r.ok) throw new Error(`section ${id} not found`);
      return r.json();
    }));

  // Same parsing as the Labspace API (LabspaceService.getCodeBlock)
  function codeBlock(content, index) {
    const blocks = content.match(/```(.*?)```/gs) || [];
    if (blocks[index] === undefined) throw new Error(`code block ${index} not found`);
    const rows = blocks[index].split("\n");
    const header = rows.shift().substring(3);
    rows.pop();
    const [language, ...metaInfo] = header.split(" ");
    const meta = metaInfo.reduce((acc, cur) => {
      const [key, value] = cur.split("=");
      if (key.trim()) acc[key.trim()] = value ? value : "true";
      return acc;
    }, {});
    const indentation = (rows[0] || "").match(/^\s*/)[0].length;
    return { language, meta, code: rows.map((row) => row.substring(indentation)).join("\n") };
  }

  function toPreview(message) {
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        if (new URL(frame.src).pathname === `${base}terminal.html`) {
          frame.contentWindow.postMessage({ source: "labspace-static", ...message }, location.origin);
        }
      } catch {
        /* not the preview frame */
      }
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("/api/")) return realFetch(input, init);
    const method = (init.method || "GET").toUpperCase();

    try {
      if (url === "/api/labspace") return realFetch(`${base}api/labspace.json`);
      if (url === "/api/labspace/export") return realFetch(`${base}api/export.json`);
      if (url === "/api/labspace/open-file") return json({ success: true });
      if (url === "/api/variables") {
        if (method === "GET") return json(variables);
        const { key, value } = JSON.parse(init.body || "{}");
        if (value) variables[key] = value;
        else delete variables[key];
        return json({ success: true });
      }

      let m = url.match(/^\/api\/labspace\/sections\/([^/]+)$/);
      if (m) return realFetch(`${base}api/sections/${m[1]}.json`);

      m = url.match(/^\/api\/labspace\/sections\/([^/]+)\/(command|save-file)$/);
      if (m) {
        const { codeBlockIndex } = JSON.parse(init.body || "{}");
        const block = codeBlock((await section(decodeURIComponent(m[1]))).content, codeBlockIndex);
        toPreview({ kind: m[2] === "command" ? "run" : "save", ...block });
        return json({ success: true });
      }
    } catch (err) {
      return json({ error: String(err.message || err) }, 500);
    }
    return json({ error: "not found" }, 404);
  };
})();
