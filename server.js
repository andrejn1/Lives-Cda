"use strict";

const express = require("express");
const path = require("path");

const {
  PORT = 3000,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  KICK_CLIENT_ID,
  KICK_CLIENT_SECRET,
} = process.env;

const CACHE_SECONDS = Number(process.env.CACHE_SECONDS || 60);
const TWITCH_GAME_ID = process.env.TWITCH_GAME_ID || "32982"; // Grand Theft Auto V
const TWITCH_LANGUAGE = process.env.TWITCH_LANGUAGE ?? "pt";
const TWITCH_MAX_PAGES = Number(process.env.TWITCH_MAX_PAGES || 10);
const KICK_CATEGORY_ID = process.env.KICK_CATEGORY_ID || "";
const KICK_LANGUAGE = process.env.KICK_LANGUAGE ?? "pt";

/* ---------- Filtro da cidade (CDA / Cidade Alta) ---------- */

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const keywords = (process.env.CDA_KEYWORDS || "cda,cidade alta,cidade alta rp")
  .split(",")
  .map((k) => normalize(k).trim())
  .filter(Boolean);

const matcher = new RegExp(
  "(^|[^a-z0-9])(" +
    keywords.map((k) => escapeRe(k).replace(/\s+/g, "\\s*")).join("|") +
    ")([^a-z0-9]|$)"
);

const isCda = (title) => matcher.test(normalize(title));

/* ---------- Utilitário HTTP ---------- */

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} em ${new URL(url).host}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/* ---------- Twitch ---------- */

const twitchAuth = { token: null, expiresAt: 0 };

async function getTwitchToken() {
  if (twitchAuth.token && Date.now() < twitchAuth.expiresAt) return twitchAuth.token;
  const data = await fetchJson("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  twitchAuth.token = data.access_token;
  twitchAuth.expiresAt = Date.now() + Math.max(60, data.expires_in - 300) * 1000;
  return twitchAuth.token;
}

async function fetchTwitch() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    return { status: "disabled", message: "Defina TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET.", lives: [] };
  }

  try {
    const token = await getTwitchToken();
    const lives = [];
    let cursor = "";
    let scanned = 0;

    for (let page = 0; page < TWITCH_MAX_PAGES; page++) {
      const params = new URLSearchParams({ game_id: TWITCH_GAME_ID, first: "100" });
      if (TWITCH_LANGUAGE) params.set("language", TWITCH_LANGUAGE);
      if (cursor) params.set("after", cursor);

      const data = await fetchJson(`https://api.twitch.tv/helix/streams?${params}`, {
        headers: { "Client-Id": TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
      });

      for (const s of data.data || []) {
        scanned++;
        if (!isCda(s.title)) continue;
        lives.push({
          platform: "twitch",
          id: `twitch-${s.id}`,
          channel: s.user_login,
          displayName: s.user_name,
          title: s.title,
          viewers: s.viewer_count,
          thumbnail: (s.thumbnail_url || "").replace("{width}", "440").replace("{height}", "248"),
          url: `https://www.twitch.tv/${s.user_login}`,
          startedAt: s.started_at,
        });
      }

      cursor = data.pagination && data.pagination.cursor;
      if (!cursor || !(data.data || []).length) break;
    }

    return { status: "ok", scanned, lives };
  } catch (err) {
    if (/HTTP 401/.test(err.message)) twitchAuth.token = null;
    throw err;
  }
}

/* ---------- Kick (API oficial) ---------- */

const kickAuth = { token: null, expiresAt: 0 };
let kickCategoryId = KICK_CATEGORY_ID;

async function getKickToken() {
  if (kickAuth.token && Date.now() < kickAuth.expiresAt) return kickAuth.token;
  const data = await fetchJson("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: KICK_CLIENT_ID,
      client_secret: KICK_CLIENT_SECRET,
    }),
  });
  kickAuth.token = data.access_token;
  kickAuth.expiresAt = Date.now() + Math.max(60, (data.expires_in || 3600) - 300) * 1000;
  return kickAuth.token;
}

async function findKickCategoryId(token) {
  if (kickCategoryId) return kickCategoryId;
  const params = new URLSearchParams({ q: "Grand Theft Auto V" });
  const data = await fetchJson(`https://api.kick.com/public/v1/categories?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const list = data.data || [];
  const target = "grand theft auto v";
  const match =
    list.find((c) => normalize(c.name) === target) ||
    list.find((c) => normalize(c.name).includes(target));
  if (!match) throw new Error("Categoria GTA V não encontrada na Kick. Defina KICK_CATEGORY_ID.");
  kickCategoryId = String(match.id);
  return kickCategoryId;
}

async function fetchKick() {
  if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET) {
    return { status: "disabled", message: "Defina KICK_CLIENT_ID e KICK_CLIENT_SECRET.", lives: [] };
  }

  try {
    const token = await getKickToken();
    const categoryId = await findKickCategoryId(token);

    const params = new URLSearchParams({
      category_id: categoryId,
      limit: "100",
      sort: "viewer_count",
    });
    if (KICK_LANGUAGE) params.set("language", KICK_LANGUAGE);

    const data = await fetchJson(`https://api.kick.com/public/v1/livestreams?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const all = data.data || [];
    const lives = all
      .filter((s) => isCda(s.stream_title))
      .map((s) => ({
        platform: "kick",
        id: `kick-${s.broadcaster_user_id || s.slug}`,
        channel: s.slug,
        displayName: s.slug,
        title: s.stream_title,
        viewers: s.viewer_count,
        thumbnail: s.thumbnail || "",
        url: `https://kick.com/${s.slug}`,
        startedAt: s.started_at,
      }));

    return { status: "ok", scanned: all.length, lives };
  } catch (err) {
    if (/HTTP 401/.test(err.message)) kickAuth.token = null;
    throw err;
  }
}

/* ---------- Cache + agregação ---------- */

let cache = { at: 0, data: null };
let inflight = null;

async function refresh() {
  const [tw, kk] = await Promise.allSettled([fetchTwitch(), fetchKick()]);

  const info = (r) =>
    r.status === "fulfilled"
      ? { status: r.value.status, message: r.value.message || "", scanned: r.value.scanned || 0 }
      : { status: "error", message: r.reason && r.reason.message ? r.reason.message : "Erro desconhecido", scanned: 0 };

  const lives = [
    ...(tw.status === "fulfilled" ? tw.value.lives : []),
    ...(kk.status === "fulfilled" ? kk.value.lives : []),
  ].sort((a, b) => b.viewers - a.viewers);

  const platforms = { twitch: info(tw), kick: info(kk) };
  for (const [name, p] of Object.entries(platforms)) {
    if (p.status !== "ok") console.warn(`[${name}] ${p.status}: ${p.message}`);
  }

  return { updatedAt: new Date().toISOString(), total: lives.length, lives, platforms };
}

async function getLives() {
  if (cache.data && Date.now() - cache.at < CACHE_SECONDS * 1000) return cache.data;
  if (!inflight) {
    inflight = refresh()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/* ---------- Servidor ---------- */

const app = express();

app.get("/health", (_req, res) => res.send("ok"));

app.get("/api/lives", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await getLives());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha ao buscar as lives." });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log(`Lives CDA rodando na porta ${PORT}`));
