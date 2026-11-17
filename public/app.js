(() => {
  "use strict";

  const REFRESH_MS = 60000;
  const PLATFORM_NAMES = { twitch: "Twitch", kick: "Kick" };

  let filter = "all";
  let data = null;
  let lastLoad = 0;

  const $ = (id) => document.getElementById(id);
  const grid = $("grid");
  const empty = $("empty");
  const count = $("count");
  const notices = $("notices");
  const updated = $("updated");

  const nf = new Intl.NumberFormat("pt-BR");

  function since(iso) {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (Number.isNaN(mins)) return "";
    if (mins < 60) return `Ao vivo há ${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `Ao vivo há ${h} h${m ? ` ${m} min` : ""}`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function card(live) {
    const li = el("li");
    const a = el("a", "card");
    a.href = live.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.dataset.platform = live.platform;

    const thumb = el("div", "thumb");
    if (live.thumbnail) {
      const img = document.createElement("img");
      img.src = live.thumbnail;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => img.remove());
      thumb.appendChild(img);
    }
    thumb.appendChild(el("span", "tag viewers", `${nf.format(live.viewers)} assistindo`));
    thumb.appendChild(el("span", "tag platform", PLATFORM_NAMES[live.platform] || live.platform));

    const info = el("div", "info");
    info.appendChild(el("h2", "name", live.displayName));
    info.appendChild(el("p", "title", live.title));
    info.appendChild(el("p", "since", since(live.startedAt)));

    a.append(thumb, info);
    li.appendChild(a);
    return li;
  }

  function render() {
    if (!data) return;

    const lives = data.lives.filter((l) => filter === "all" || l.platform === filter);

    grid.replaceChildren(...lives.map(card));
    empty.hidden = lives.length > 0;

    if (lives.length === 0) count.textContent = "Nenhuma live aberta agora";
    else count.textContent = `${lives.length} ${lives.length === 1 ? "live aberta" : "lives abertas"}`;

    notices.replaceChildren();
    for (const [key, p] of Object.entries(data.platforms)) {
      if (p.status === "ok") continue;
      console.warn(`[${key}] ${p.status}: ${p.message}`);
      const name = PLATFORM_NAMES[key];
      const text =
        p.status === "disabled"
          ? `${name} ainda não está configurada neste site.`
          : `Não foi possível carregar as lives da ${name}. Tentaremos de novo em instantes.`;
      notices.appendChild(el("p", "notice", text));
    }

    const time = new Date(data.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    updated.textContent = `Atualizado às ${time}`;
  }

  async function load() {
    try {
      const res = await fetch("/api/lives", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      lastLoad = Date.now();
      render();
    } catch (err) {
      console.error(err);
      if (!data) count.textContent = "Não foi possível carregar as lives. Tente atualizar.";
    }
  }

  document.querySelectorAll(".filters button").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      document.querySelectorAll(".filters button").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn))
      );
      render();
    });
  });

  $("refresh").addEventListener("click", load);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastLoad > REFRESH_MS) load();
  });

  setInterval(() => {
    if (!document.hidden) load();
  }, REFRESH_MS);

  load();
})();
