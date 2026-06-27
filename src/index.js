/**
 * Cabang - Percabangan Masa Depan Obrolan
 * AI menyiapkan beberapa kemungkinan balasan sekaligus (bukan cuma 1) untuk
 * setiap giliran, divisualisasikan sebagai pohon yang bisa dijelajahi --
 * kamu pilih satu cabang, atau balik lagi pilih cabang lain kapan saja.
 * Didukung Groq API (cepat, gratis). Jalan di Cloudflare Workers.
 */

const GROQ_MODEL = "llama-3.1-8b-instant";
const DEFAULT_BRANCH_COUNT = 4;
const VALID_BRANCH_COUNTS = [2, 4, 6];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }
    if (url.pathname === "/api/branches" && request.method === "POST") {
      return handleBranches(request, env);
    }

    return new Response(HTML_PAGE, {
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  },
};

async function handleLogin(request, env) {
  const { password } = await request.json();
  const appPassword = env.APP_PASSWORD;
  if (!appPassword) {
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ ok: password === appPassword });
}

async function handleBranches(request, env) {
  try {
    if (!env.GROQ_API_KEY) {
      return jsonResponse({ error: "GROQ_API_KEY belum diset di Secrets." }, 500);
    }

    const { transcript, password, scenario, branchCount } = await request.json();

    if (env.APP_PASSWORD && password !== env.APP_PASSWORD) {
      return jsonResponse({ error: "Password salah atau belum dimasukkan." }, 401);
    }

    if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
      return jsonResponse({ error: "Transkrip percakapan kosong." }, 400);
    }

    const safeBranchCount = VALID_BRANCH_COUNTS.includes(Number(branchCount))
      ? Number(branchCount)
      : DEFAULT_BRANCH_COUNT;
    const safeScenario = typeof scenario === "string" ? scenario.trim().slice(0, 200) : "";

    const branches = await generateBranches(transcript, safeBranchCount, safeScenario, env.GROQ_API_KEY);
    return jsonResponse({ branches });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

async function generateBranches(transcript, branchCount, scenario, apiKey) {
  const formatLines = [];
  for (let i = 1; i <= branchCount; i++) {
    formatLines.push(`LABEL${i}: <gaya singkat 1-3 kata>`);
    formatLines.push(`TEKS${i}: <isi balasan>`);
  }

  const scenarioLine = scenario
    ? `Peran/konteks lawan bicara dalam percakapan ini: "${scenario}". Sesuaikan semua balasan dengan peran ini. `
    : "";

  const systemPrompt =
    `${scenarioLine}Kamu akan diberi potongan percakapan. Berikan ${branchCount} kemungkinan balasan yang ` +
    `BERBEDA-BEDA secara nada/pendekatan untuk melanjutkan percakapan ini sebagai lawan bicara. ` +
    `Setiap balasan harus punya gaya yang jelas berbeda satu sama lain (misal: satu antusias, satu ` +
    `skeptis, satu santai/becanda, satu serius/formal). Jawab dalam format PERSIS seperti ini, ` +
    `tanpa tambahan apapun di luar format:\n` +
    formatLines.join("\n") +
    `\nSelalu dalam Bahasa Indonesia.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
      temperature: 0.9,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(friendlyErrorMessage(response.status, errorText));
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  return parseBranches(raw, branchCount);
}

function parseBranches(raw, branchCount) {
  const branches = [];
  for (let i = 1; i <= branchCount; i++) {
    const labelMatch = raw.match(new RegExp(`LABEL${i}:\\s*(.+)`));
    const textMatch = raw.match(new RegExp(`TEKS${i}:\\s*([\\s\\S]*?)(?=\\n?LABEL${i + 1}:|$)`));
    if (labelMatch && textMatch && textMatch[1].trim()) {
      branches.push({ label: labelMatch[1].trim(), text: textMatch[1].trim() });
    }
  }
  if (branches.length === 0) {
    branches.push({ label: "Jawaban", text: raw.trim() || "Maaf, gagal menghasilkan respons." });
  }
  return branches;
}

function friendlyErrorMessage(status, rawErrorText) {
  const lower = rawErrorText.toLowerCase();
  if (status === 429 || lower.includes("rate limit")) {
    return "Kuota Groq habis untuk saat ini. Tunggu sebentar lalu coba lagi.";
  }
  if (status === 401 || status === 403) {
    return "API Key Groq tidak valid. Cek lagi nilai GROQ_API_KEY di Secrets.";
  }
  if (status === 503) {
    return "Server Groq sedang sibuk. Coba lagi sebentar.";
  }
  return `Terjadi kesalahan (${status}): ${rawErrorText}`;
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Multi Think</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');

  :root {
    --bg: #120a1f;
    --panel: #1c1130;
    --border: #2e1f4a;
    --text: #ede7f6;
    --muted: #8a7ba8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Plus Jakarta Sans', sans-serif;
    background: radial-gradient(ellipse at top, #1c1130 0%, #120a1f 60%);
    color: var(--text);
    display: flex;
    justify-content: center;
    min-height: 100vh;
  }
  .app { width: 100%; max-width: 640px; padding: 28px 20px 50px; }
  header { text-align: center; margin-bottom: 22px; }
  header h1 { margin: 0; font-family: 'Outfit', sans-serif; font-size: 28px; font-weight: 700; }
  header p { margin: 6px 0 0; color: var(--muted); font-size: 14px; }

  .settings {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .settings input {
    flex: 1;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    font-family: inherit;
    font-size: 13px;
  }
  .settings input::placeholder { color: var(--muted); }
  .settings select {
    padding: 10px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    font-family: inherit;
    font-size: 13px;
  }

  #path-container { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
  .bubble {
    max-width: 85%;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 15px;
    line-height: 1.5;
  }
  .bubble.user { align-self: flex-end; background: var(--panel); border: 1px solid var(--border); }
  .bubble.ai {
    align-self: flex-start;
    background: var(--panel);
    border: 1.5px solid var(--border);
  }
  .siblings-row { display: flex; gap: 6px; flex-wrap: wrap; align-self: flex-start; margin: -2px 0 8px 4px; }
  .sibling-pill {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--muted);
    border-radius: 20px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
    opacity: 0.65;
  }
  .sibling-pill.active { opacity: 1; font-weight: 600; }
  .sibling-pill:hover { opacity: 1; }

  .frontier-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  @media (max-width: 480px) { .frontier-grid { grid-template-columns: 1fr; } }
  .frontier-card {
    text-align: left;
    border: 1.5px solid var(--border);
    background: var(--panel);
    border-radius: 12px;
    padding: 12px;
    cursor: pointer;
    color: var(--text);
    font-family: inherit;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .frontier-card:hover { transform: translateY(-2px); }
  .frontier-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }
  .frontier-text { font-size: 14px; line-height: 1.5; }

  .regen-btn {
    display: block;
    margin: 0 auto 10px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 20px;
    padding: 8px 16px;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
  }
  .regen-btn:hover { color: var(--text); border-color: var(--text); }

  .status { text-align: center; color: var(--muted); font-size: 13px; min-height: 18px; margin: 6px 0; }

  form { display: flex; gap: 8px; margin-top: 10px; }
  form input {
    flex: 1;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    font-family: inherit;
    font-size: 15px;
  }
  form input::placeholder { color: var(--muted); }
  form input:focus-visible { outline: 2px solid var(--text); outline-offset: 1px; }
  form button {
    padding: 12px 20px;
    border-radius: 10px;
    border: none;
    background: #b388ff;
    color: #1a0f2e;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
  }

  #reset-btn {
    display: block;
    margin: 18px auto 0;
    background: transparent;
    border: none;
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    font-family: inherit;
  }

  .gate { display: flex; align-items: center; justify-content: center; min-height: 100vh; width: 100%; padding: 20px; }
  .gate-card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 32px; width: 100%; max-width: 320px; text-align: center; }
  .gate-card h2 { margin: 0 0 16px; font-family: 'Outfit', sans-serif; font-size: 17px; }
  .gate-card input {
    width: 100%; margin-bottom: 12px; padding: 12px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 15px; font-family: inherit;
  }
  .gate-card button {
    width: 100%; padding: 12px; border-radius: 8px; border: none;
    background: #b388ff; color: #1a0f2e; font-weight: 700; cursor: pointer; font-family: inherit;
  }
  .gate-error { color: #ff8a8a; font-size: 13px; margin: 10px 0 0; min-height: 16px; }
</style>
</head>
<body>
  <div class="gate" id="gate">
    <div class="gate-card">
      <h2>🔒 Akses Terbatas</h2>
      <input id="gate-input" type="password" placeholder="Masukkan password" autocomplete="current-password" />
      <button id="gate-btn" type="button">Masuk</button>
      <p class="gate-error" id="gate-error"></p>
    </div>
  </div>

  <div class="app" id="app" style="display:none;">
    <header>
      <h1>Multi Think</h1>
      <p>AI menyiapkan beberapa kemungkinan balasan sekaligus -- kamu pilih jalannya.</p>
    </header>

    <div class="settings">
      <input id="scenario-input" type="text" placeholder="Peran/skenario lawan bicara (opsional)... misal: teman dekat" aria-label="Peran atau skenario AI" />
      <select id="branch-count-select" aria-label="Jumlah cabang per giliran">
        <option value="2">2 cabang</option>
        <option value="4" selected>4 cabang</option>
        <option value="6">6 cabang</option>
      </select>
    </div>

    <div id="path-container"></div>
    <div id="frontier-container"></div>
    <p class="status" id="status" role="status" aria-live="polite"></p>

    <form id="start-form">
      <input id="start-input" type="text" placeholder="Mulai percakapan dengan apa?" aria-label="Pesan pembuka" />
      <button type="submit">Mulai</button>
    </form>

    <form id="reply-form" style="display:none;">
      <input id="reply-input" type="text" placeholder="Balasan kamu..." aria-label="Balasan kamu" />
      <button type="submit">Kirim</button>
    </form>

    <button id="reset-btn" type="button">Mulai ulang dari awal</button>
  </div>

  <script>
    const BRANCH_COLORS = ["#b388ff", "#4fd1c5", "#ffb86b", "#ff7597", "#7ec8e3", "#c9e265"];

    // ---------- Gerbang password ----------
    const gateEl = document.getElementById("gate");
    const appEl = document.getElementById("app");
    const gateInput = document.getElementById("gate-input");
    const gateBtn = document.getElementById("gate-btn");
    const gateError = document.getElementById("gate-error");
    let appPassword = "";

    function showApp() {
      gateEl.style.display = "none";
      appEl.style.display = "block";
    }

    async function checkPassword(password) {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password }),
      });
      const data = await res.json();
      return data.ok;
    }

    async function tryLogin() {
      const password = gateInput.value;
      gateBtn.disabled = true;
      gateError.textContent = "";
      try {
        const ok = await checkPassword(password);
        if (ok) { appPassword = password; showApp(); }
        else gateError.textContent = "Password salah, coba lagi.";
      } catch (err) {
        gateError.textContent = "Gagal memeriksa password: " + err.message;
      } finally {
        gateBtn.disabled = false;
      }
    }

    checkPassword("").then(function (ok) {
      if (ok) { appPassword = ""; showApp(); }
    }).catch(function () {});

    gateBtn.addEventListener("click", tryLogin);
    gateInput.addEventListener("keydown", function (e) { if (e.key === "Enter") tryLogin(); });

    // ---------- Logika percabangan ----------
    const pathContainer = document.getElementById("path-container");
    const frontierContainer = document.getElementById("frontier-container");
    const statusEl = document.getElementById("status");
    const startForm = document.getElementById("start-form");
    const startInput = document.getElementById("start-input");
    const replyForm = document.getElementById("reply-form");
    const replyInput = document.getElementById("reply-input");
    const resetBtn = document.getElementById("reset-btn");
    const scenarioInput = document.getElementById("scenario-input");
    const branchCountSelect = document.getElementById("branch-count-select");

    let path = [];
    let frontierBranches = [];

    function buildTranscript() {
      return path.map(function (n) {
        return (n.role === "user" ? "Pengguna: " : "Lawan bicara: ") + n.text;
      }).join("\\n");
    }

    function render() {
      pathContainer.innerHTML = "";
      path.forEach(function (node, idx) {
        const bubble = document.createElement("div");
        bubble.className = "bubble " + node.role;
        bubble.textContent = node.text;
        if (node.role === "ai") {
          bubble.style.borderColor = BRANCH_COLORS[node.colorIndex % BRANCH_COLORS.length];
        }
        pathContainer.appendChild(bubble);

        if (node.role === "ai" && node.siblings && node.siblings.length > 1) {
          const row = document.createElement("div");
          row.className = "siblings-row";
          node.siblings.forEach(function (sib, sIdx) {
            const pill = document.createElement("button");
            const isActive = sib.text === node.text;
            pill.className = "sibling-pill" + (isActive ? " active" : "");
            pill.style.borderColor = BRANCH_COLORS[sIdx % BRANCH_COLORS.length];
            pill.style.color = isActive ? BRANCH_COLORS[sIdx % BRANCH_COLORS.length] : "";
            pill.textContent = sib.label;
            pill.type = "button";
            pill.addEventListener("click", function () { selectSibling(idx, sIdx); });
            row.appendChild(pill);
          });
          pathContainer.appendChild(row);
        }
      });

      frontierContainer.innerHTML = "";
      if (frontierBranches.length > 0) {
        const grid = document.createElement("div");
        grid.className = "frontier-grid";
        frontierBranches.forEach(function (branch, idx) {
          const card = document.createElement("button");
          card.type = "button";
          card.className = "frontier-card";
          const color = BRANCH_COLORS[idx % BRANCH_COLORS.length];
          card.style.borderColor = color;
          const labelEl = document.createElement("div");
          labelEl.className = "frontier-label";
          labelEl.style.color = color;
          labelEl.textContent = branch.label;
          const textEl = document.createElement("div");
          textEl.className = "frontier-text";
          textEl.textContent = branch.text;
          card.appendChild(labelEl);
          card.appendChild(textEl);
          card.addEventListener("click", function () { commitBranch(idx); });
          grid.appendChild(card);
        });
        frontierContainer.appendChild(grid);

        const regenBtn = document.createElement("button");
        regenBtn.type = "button";
        regenBtn.className = "regen-btn";
        regenBtn.textContent = "🔄 Coba lagi";
        regenBtn.addEventListener("click", function () { fetchBranches(); });
        frontierContainer.appendChild(regenBtn);
      }

      startForm.style.display = path.length === 0 ? "flex" : "none";
      replyForm.style.display = (path.length > 0 && frontierBranches.length === 0) ? "flex" : "none";
    }

    async function fetchBranches() {
      statusEl.textContent = "Menyusun kemungkinan...";
      frontierBranches = [];
      render();
      try {
        const res = await fetch("/api/branches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: buildTranscript(),
            password: appPassword,
            scenario: scenarioInput.value.trim(),
            branchCount: parseInt(branchCountSelect.value, 10),
          }),
        });
        const data = await res.json();
        if (data.error) {
          statusEl.textContent = data.error;
        } else {
          frontierBranches = data.branches;
          statusEl.textContent = "";
        }
      } catch (err) {
        statusEl.textContent = "Gagal terhubung: " + err.message;
      }
      render();
    }

    function commitBranch(idx) {
      const chosen = frontierBranches[idx];
      path.push({ role: "ai", text: chosen.text, label: chosen.label, colorIndex: idx, siblings: frontierBranches.slice() });
      frontierBranches = [];
      render();
    }

    function selectSibling(nodeIdx, siblingIdx) {
      const node = path[nodeIdx];
      const sib = node.siblings[siblingIdx];
      path = path.slice(0, nodeIdx);
      path.push({ role: "ai", text: sib.text, label: sib.label, colorIndex: siblingIdx, siblings: node.siblings });
      frontierBranches = [];
      render();
    }

    startForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const text = startInput.value.trim();
      if (!text) return;
      path.push({ role: "user", text: text });
      startInput.value = "";
      render();
      fetchBranches();
    });

    replyForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const text = replyInput.value.trim();
      if (!text) return;
      path.push({ role: "user", text: text });
      replyInput.value = "";
      render();
      fetchBranches();
    });

    resetBtn.addEventListener("click", function () {
      path = [];
      frontierBranches = [];
      statusEl.textContent = "";
      scenarioInput.value = "";
      branchCountSelect.value = "4";
      render();
    });

    render();
  </script>
</body>
</html>`;
