/* ===========================================================
   ScheduleCraft - script.js
   Single-file app: storage + auth + router + generator + history
   White & Blue theme | BTEC CSE 1st year project
   NOTE: Backend is future scope — data is stored locally for now.
   =========================================================== */

/* ===========================================================
   1. CORE (storage, auth, history, nav, toast)
   =========================================================== */
const SC = (() => {
  const KEYS = { users: "sc_users", session: "sc_session", history: "sc_history" };

  function read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* ---------- auth ---------- */
  function getUsers() {
    return read(KEYS.users, []);
  }
  function currentUser() {
    return read(KEYS.session, null);
  }
  function signup({ name, email, password }) {
    const users = getUsers();
    if (users.some((u) => u.email === email.toLowerCase())) {
      throw new Error("An account with this email already exists.");
    }
    const user = { name, email: email.toLowerCase(), password, joined: Date.now() };
    users.push(user);
    write(KEYS.users, users);
    write(KEYS.session, { name: user.name, email: user.email });
    return user;
  }
  function login({ email, password }) {
    const users = getUsers();
    const user = users.find((u) => u.email === email.toLowerCase());
    if (!user || user.password !== password) {
      throw new Error("Invalid email or password.");
    }
    write(KEYS.session, { name: user.name, email: user.email });
    return user;
  }
  function logout() {
    localStorage.removeItem(KEYS.session);
  }

  /* ---------- history ---------- */
  function getHistory() {
    const user = currentUser();
    if (!user) return [];
    const all = read(KEYS.history, []);
    return all.filter((h) => h.owner === user.email).sort((a, b) => b.createdAt - a.createdAt);
  }
  function addHistory(entry) {
    const user = currentUser();
    if (!user) return;
    const all = read(KEYS.history, []);
    const record = {
      id: "tt_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      owner: user.email,
      createdAt: Date.now(),
      exports: [],
      ...entry,
    };
    all.push(record);
    write(KEYS.history, all);
    return record;
  }
  function logExport(historyId, format) {
    const all = read(KEYS.history, []);
    const rec = all.find((h) => h.id === historyId);
    if (rec) {
      rec.exports = rec.exports || [];
      rec.exports.push({ format, at: Date.now() });
      write(KEYS.history, all);
    }
  }
  function updateGrid(historyId, grid) {
    const all = read(KEYS.history, []);
    const rec = all.find((h) => h.id === historyId);
    if (rec) {
      rec.grid = grid;
      write(KEYS.history, all);
    }
  }
  function deleteHistory(historyId) {
    let all = read(KEYS.history, []);
    all = all.filter((h) => h.id !== historyId);
    write(KEYS.history, all);
  }

  /* ---------- navbar render ---------- */
  function renderNav() {
    const guest = document.querySelectorAll("[data-auth='guest']");
    const authed = document.querySelectorAll("[data-auth='user']");
    const user = currentUser();
    guest.forEach((el) => el.classList.toggle("hidden", !!user));
    authed.forEach((el) => el.classList.toggle("hidden", !user));
    if (user) {
      const initials = user.name ? user.name.trim().charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
      document.querySelectorAll("[data-user-initial]").forEach((el) => (el.textContent = initials));
      document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = user.name || user.email));
    }
  }

  /* ---------- toast ---------- */
  let toastEl;
  function toast(message, type = "") {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.className = "toast " + type;
    toastEl.textContent = message;
    requestAnimationFrame(() => toastEl.classList.add("show"));
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString(undefined, {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  return {
    currentUser, signup, login, logout,
    getHistory, addHistory, logExport, updateGrid, deleteHistory,
    renderNav, toast, formatDate,
  };
})();

/* ===========================================================
   2. SHARED HELPERS (escaping, export utilities)
   =========================================================== */
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}
function csvCell(v) {
  v = String(v == null ? "" : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function downloadBlob(content, name, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safeFileName(name, ext) {
  const base = name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return base + "_" + Date.now() + "." + ext;
}

/* matrix from a record/state { days, grid } */
function buildMatrix(days, grid) {
  const header = ["Time"].concat(days);
  const rows = grid.map((row) => [row.time].concat(days.map((d) => row.cells[d] || "")));
  return { header, rows };
}

/* exports that operate on an existing table element + data */
function exportCSV(days, grid, name) {
  const { header, rows } = buildMatrix(days, grid);
  const lines = [header].concat(rows).map((r) => r.map(csvCell).join(","));
  downloadBlob(lines.join("\r\n"), safeFileName(name, "csv"), "text/csv;charset=utf-8;");
}
function exportExcel(days, grid, name) {
  const { header, rows } = buildMatrix(days, grid);
  let table = "<table border='1'><tr>" + header.map((h) => `<th>${esc(h)}</th>`).join("") + "</tr>";
  rows.forEach((r) => (table += "<tr>" + r.map((c) => `<td>${esc(c)}</td>`).join("") + "</tr>"));
  table += "</table>";
  const html =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    "<head><meta charset='utf-8'></head><body>" + table + "</body></html>";
  downloadBlob(html, safeFileName(name, "xls"), "application/vnd.ms-excel");
}
function exportPDF(tableEl, name) {
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) throw new Error("PDF library not loaded");
  html2canvas(tableEl, { scale: 2, backgroundColor: "#ffffff" }).then((canvas) => {
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const margin = 30;
    const w = pw - margin * 2;
    const h = (canvas.height * w) / canvas.width;
    pdf.setFontSize(16);
    pdf.text(name, margin, 30);
    pdf.addImage(img, "PNG", margin, 44, w, h);
    pdf.save(safeFileName(name, "pdf"));
  });
}
function exportImage(tableEl, name, format) {
  html2canvas(tableEl, { scale: 2, backgroundColor: "#ffffff" }).then((canvas) => {
    const mime = format === "png" ? "image/png" : "image/jpeg";
    const a = document.createElement("a");
    a.href = canvas.toDataURL(mime, 0.95);
    a.download = safeFileName(name, format === "png" ? "png" : "jpg");
    a.click();
  });
}

/* render a static (read-only) timetable table into HTML */
function renderStaticTable(days, grid, tableId) {
  let html = `<table class="timetable" id="${tableId}"><thead><tr><th>Time</th>`;
  days.forEach((d) => (html += `<th>${esc(d)}</th>`));
  html += "</tr></thead><tbody>";
  grid.forEach((row) => {
    html += `<tr><td class="time-col">${esc(row.time)}</td>`;
    days.forEach((day) => {
      const val = row.cells[day] || "";
      html += `<td class="${val === "Break" ? "cell-break" : ""}">${esc(val)}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  return html;
}

/* ===========================================================
   3. ROUTER (view switching for the single-page app)
   =========================================================== */
const Router = (() => {
  function go(view) {
    // guard: create/history require login
    if ((view === "create" || view === "history") && !SC.currentUser()) {
      Auth.open("login");
      return;
    }
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const target = document.getElementById("view-" + view);
    if (target) target.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (view === "create") Generator.init();
    if (view === "history") History.render();
  }
  return { go };
})();

/* ===========================================================
   4. AUTH MODAL
   =========================================================== */
const Auth = (() => {
  let overlay, loginForm, signupForm, tabLogin, tabSignup, errBox;

  function setMode(mode) {
    const isLogin = mode === "login";
    tabLogin.classList.toggle("active", isLogin);
    tabSignup.classList.toggle("active", !isLogin);
    loginForm.classList.toggle("hidden", !isLogin);
    signupForm.classList.toggle("hidden", isLogin);
    errBox.classList.add("hidden");
  }
  function open(mode) {
    overlay.classList.remove("hidden");
    setMode(mode || "login");
  }
  function close() {
    overlay.classList.add("hidden");
  }
  function showErr(msg) {
    errBox.textContent = msg;
    errBox.classList.remove("hidden");
  }

  function init() {
    overlay = document.getElementById("authModal");
    loginForm = document.getElementById("loginForm");
    signupForm = document.getElementById("signupForm");
    tabLogin = document.getElementById("tabLogin");
    tabSignup = document.getElementById("tabSignup");
    errBox = document.getElementById("authError");

    document.querySelectorAll("[data-open-auth]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        open(btn.getAttribute("data-open-auth"));
      });
    });

    tabLogin.addEventListener("click", () => setMode("login"));
    tabSignup.addEventListener("click", () => setMode("signup"));
    document.getElementById("toSignup").addEventListener("click", (e) => { e.preventDefault(); setMode("signup"); });
    document.getElementById("toLogin").addEventListener("click", (e) => { e.preventDefault(); setMode("login"); });
    document.getElementById("authClose").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      if (!email || !password) return showErr("Please fill in all fields.");
      try {
        SC.login({ email, password });
        SC.toast("Welcome back!", "success");
        close();
        SC.renderNav();
        Router.go("create");
      } catch (err) {
        showErr(err.message);
      }
    });

    signupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("signupName").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value;
      if (!name || !email || !password) return showErr("Please fill in all fields.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr("Please enter a valid email address.");
      if (password.length < 4) return showErr("Password must be at least 4 characters.");
      try {
        SC.signup({ name, email, password });
        SC.toast("Account created! Let's build a timetable.", "success");
        close();
        SC.renderNav();
        Router.go("create");
      } catch (err) {
        showErr(err.message);
      }
    });
  }

  return { init, open, close };
})();

/* ===========================================================
   5. GENERATOR (create view)
   =========================================================== */
const Generator = (() => {
  const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let booted = false;
  const state = {
    type: null,
    mode: "random",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    subjects: [],
    grid: null,
    times: [],
    currentRecordId: null,
  };
  let el = {};

  function init() {
    if (booted) return;
    booted = true;

    el = {
      builder: document.getElementById("builder"),
      result: document.getElementById("result"),
      typeCards: document.querySelectorAll("#view-create .type-card"),
      modeRandom: document.getElementById("modeRandom"),
      modeManual: document.getElementById("modeManual"),
      panelTitle: document.getElementById("panelTitle"),
      panelHint: document.getElementById("panelHint"),
      itemsLabel: document.getElementById("itemsLabel"),
      randomOpts: document.getElementById("randomOpts"),
      daysWrap: document.getElementById("daysWrap"),
      subjectsList: document.getElementById("subjectsList"),
      subjectInput: document.getElementById("subjectInput"),
      addSubjectBtn: document.getElementById("addSubjectBtn"),
      generateBtn: document.getElementById("generateBtn"),
      timetableArea: document.getElementById("timetableArea"),
      regenBtn: document.getElementById("regenBtn"),
    };

    el.typeCards.forEach((card) => {
      card.addEventListener("click", () => {
        el.typeCards.forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        state.type = card.getAttribute("data-type");
        el.builder.classList.remove("hidden");
        applyTypeDefaults();
        el.builder.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    el.modeRandom.addEventListener("click", () => setMode("random"));
    el.modeManual.addEventListener("click", () => setMode("manual"));
    el.addSubjectBtn.addEventListener("click", addSubject);
    el.subjectInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addSubject(); }
    });
    el.generateBtn.addEventListener("click", generate);
    el.regenBtn.addEventListener("click", regenerate);

    document.querySelectorAll("#view-create [data-export]").forEach((btn) => {
      btn.addEventListener("click", () => doExport(btn.getAttribute("data-export")));
    });

    renderDays();
    renderSubjects();
    setMode("random");
  }

  function applyTypeDefaults() {
    if (state.subjects.length) return;
    if (state.type === "academic") {
      el.itemsLabel.textContent = "Subjects";
      el.subjectInput.placeholder = "Add a subject (e.g. Mathematics) and press Enter";
      state.subjects = ["Mathematics", "Physics", "Computer Science", "English", "Chemistry"];
    } else {
      el.itemsLabel.textContent = "Activities";
      el.subjectInput.placeholder = "Add an activity (e.g. Gym) and press Enter";
      state.subjects = ["Study", "Gym", "Work", "Reading", "Meal", "Relax"];
    }
    renderSubjects();
  }

  function setMode(mode) {
    state.mode = mode;
    el.modeRandom.classList.toggle("active", mode === "random");
    el.modeManual.classList.toggle("active", mode === "manual");
    el.randomOpts.style.display = mode === "random" ? "" : "none";
    if (mode === "random") {
      el.panelTitle.textContent = "Random generator details";
      el.panelHint.textContent = "Feed in your details — we'll shuffle them into a balanced timetable.";
      el.generateBtn.textContent = "🎲 Generate random timetable";
    } else {
      el.panelTitle.textContent = "Build your own details";
      el.panelHint.textContent = "Feed in your details — then place each item into the slots you want.";
      el.generateBtn.textContent = "✍️ Build empty grid to fill in";
    }
  }

  function renderDays() {
    el.daysWrap.innerHTML = "";
    ALL_DAYS.forEach((day) => {
      const label = document.createElement("label");
      label.style.cssText = "display:flex;align-items:center;gap:6px;font-weight:500;cursor:pointer";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = day;
      cb.style.width = "auto";
      cb.checked = state.days.includes(day);
      cb.addEventListener("change", () => {
        if (cb.checked) {
          if (!state.days.includes(day)) state.days.push(day);
        } else {
          state.days = state.days.filter((d) => d !== day);
        }
        state.days.sort((a, b) => ALL_DAYS.indexOf(a) - ALL_DAYS.indexOf(b));
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(day.slice(0, 3)));
      el.daysWrap.appendChild(label);
    });
  }

  function renderSubjects() {
    el.subjectsList.innerHTML = "";
    if (!state.subjects.length) {
      el.subjectsList.innerHTML = '<span class="hint" style="padding:4px 0">No items yet — add some below.</span>';
      return;
    }
    state.subjects.forEach((s, i) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = `${esc(s)} <button aria-label="Remove ${escAttr(s)}">&times;</button>`;
      chip.querySelector("button").addEventListener("click", () => {
        state.subjects.splice(i, 1);
        renderSubjects();
      });
      el.subjectsList.appendChild(chip);
    });
  }

  function addSubject() {
    const val = el.subjectInput.value.trim();
    if (!val) return;
    if (state.subjects.some((s) => s.toLowerCase() === val.toLowerCase())) {
      SC.toast("That item is already in the list", "error");
      return;
    }
    state.subjects.push(val);
    el.subjectInput.value = "";
    renderSubjects();
    el.subjectInput.focus();
  }

  function buildTimes() {
    const start = document.getElementById("ttStart").value || "09:00";
    const period = parseInt(document.getElementById("ttPeriod").value, 10);
    const slots = parseInt(document.getElementById("ttSlots").value, 10);
    const [h, m] = start.split(":").map(Number);
    let total = h * 60 + m;
    const times = [];
    for (let i = 0; i < slots; i++) {
      const s = total;
      const e = total + period;
      times.push(fmt(s) + " – " + fmt(e));
      total = e;
    }
    return times;
  }
  function fmt(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function validate() {
    if (!state.type) return SC.toast("Pick a timetable type first", "error"), false;
    if (!state.days.length) return SC.toast("Select at least one day", "error"), false;
    if (state.mode === "random" && state.subjects.length < 1) {
      return SC.toast("Add at least one subject/activity", "error"), false;
    }
    return true;
  }

  function getName() {
    const n = document.getElementById("ttName").value.trim();
    if (n) return n;
    return (state.type === "academic" ? "Academic" : "Personal") + " timetable";
  }

  function generateRandom() {
    const includeBreak = document.getElementById("includeBreak").checked;
    const pool = state.subjects.slice();
    const grid = [];
    state.times.forEach((time, rowIdx) => {
      const row = { time, cells: {} };
      const breakRow = includeBreak && rowIdx === Math.floor(state.times.length / 2);
      state.days.forEach((day) => {
        row.cells[day] = breakRow ? "Break" : pool[Math.floor(Math.random() * pool.length)];
      });
      grid.push(row);
    });
    state.grid = grid;
  }

  function generateManual() {
    const grid = [];
    state.times.forEach((time) => {
      const row = { time, cells: {} };
      state.days.forEach((day) => (row.cells[day] = ""));
      grid.push(row);
    });
    state.grid = grid;
  }

  function generate() {
    if (!validate()) return;
    state.times = buildTimes();
    if (state.mode === "random") generateRandom();
    else generateManual();
    renderTimetable();
    el.result.classList.remove("hidden");

    const record = SC.addHistory({
      name: getName(),
      type: state.type,
      mode: state.mode,
      days: state.days.slice(),
      times: state.times.slice(),
      subjects: state.subjects.slice(),
      grid: state.grid,
    });
    state.currentRecordId = record ? record.id : null;
    SC.toast("Timetable generated and saved to history", "success");
    el.result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function regenerate() {
    if (state.mode === "random") {
      generateRandom();
      renderTimetable();
      if (state.currentRecordId) SC.updateGrid(state.currentRecordId, state.grid);
      SC.toast("Re-shuffled!", "success");
    } else {
      SC.toast("Edit cells directly in manual mode", "");
    }
  }

  function renderTimetable() {
    const editable = state.mode === "manual";
    if (!editable) {
      el.timetableArea.innerHTML = renderStaticTable(state.days, state.grid, "ttTable");
      return;
    }
    let html = '<table class="timetable" id="ttTable"><thead><tr><th>Time</th>';
    state.days.forEach((d) => (html += `<th>${esc(d)}</th>`));
    html += "</tr></thead><tbody>";
    state.grid.forEach((row, r) => {
      html += `<tr><td class="time-col">${esc(row.time)}</td>`;
      state.days.forEach((day) => {
        const val = row.cells[day] || "";
        const opts = ['<option value=""></option>']
          .concat(state.subjects.map((s) => `<option ${s === val ? "selected" : ""}>${esc(s)}</option>`))
          .concat([`<option ${val === "Break" ? "selected" : ""}>Break</option>`])
          .join("");
        html += `<td><select class="cell-select" data-r="${r}" data-day="${escAttr(day)}">${opts}</select></td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    el.timetableArea.innerHTML = html;

    el.timetableArea.querySelectorAll(".cell-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const r = parseInt(sel.getAttribute("data-r"), 10);
        const day = sel.getAttribute("data-day");
        state.grid[r].cells[day] = sel.value;
        if (state.currentRecordId) SC.updateGrid(state.currentRecordId, state.grid);
      });
    });
  }

  function doExport(format) {
    if (!state.grid) return SC.toast("Generate a timetable first", "error");
    try {
      const table = document.getElementById("ttTable");
      const name = getName();
      if (format === "csv") exportCSV(state.days, state.grid, name);
      else if (format === "excel") exportExcel(state.days, state.grid, name);
      else if (format === "pdf") exportPDF(table, name);
      else if (format === "png" || format === "jpeg") exportImage(table, name, format);
      if (state.currentRecordId) SC.logExport(state.currentRecordId, format);
      SC.toast("Exported as " + format.toUpperCase(), "success");
    } catch (err) {
      SC.toast("Export failed: " + err.message, "error");
    }
  }

  return { init };
})();

/* ===========================================================
   6. HISTORY (history view + preview modal)
   =========================================================== */
const History = (() => {
  let listEl, emptyEl, statsRow, previewModal, previewArea, previewTitle, previewMeta;
  let activeRecord = null;
  let booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    listEl = document.getElementById("historyList");
    emptyEl = document.getElementById("emptyState");
    statsRow = document.getElementById("statsRow");
    previewModal = document.getElementById("previewModal");
    previewArea = document.getElementById("previewArea");
    previewTitle = document.getElementById("previewTitle");
    previewMeta = document.getElementById("previewMeta");

    document.getElementById("previewClose").addEventListener("click", closePreview);
    previewModal.addEventListener("click", (e) => { if (e.target === previewModal) closePreview(); });

    document.querySelectorAll("[data-pexport]").forEach((btn) => {
      btn.addEventListener("click", () => reExport(btn.getAttribute("data-pexport")));
    });
  }

  function statCard(value, label) {
    return `<div class="stat-card"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
  }

  function render() {
    boot();
    const history = SC.getHistory();

    const totalExports = history.reduce((n, h) => n + (h.exports ? h.exports.length : 0), 0);
    const academic = history.filter((h) => h.type === "academic").length;
    const personal = history.filter((h) => h.type === "personal").length;
    statsRow.innerHTML = [
      statCard(history.length, "Timetables created"),
      statCard(totalExports, "Files downloaded"),
      statCard(academic, "Academic"),
      statCard(personal, "Personal"),
    ].join("");

    if (!history.length) {
      listEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    listEl.innerHTML = "";
    history.forEach((rec) => listEl.appendChild(renderCard(rec)));
  }

  function renderCard(rec) {
    const card = document.createElement("article");
    card.className = "history-card";

    const exportCount = rec.exports ? rec.exports.length : 0;
    const exportFormats =
      rec.exports && rec.exports.length
        ? [...new Set(rec.exports.map((e) => e.format.toUpperCase()))].join(", ")
        : "Not downloaded yet";

    card.innerHTML = `
      <div class="history-main">
        <div class="history-icon ${rec.type}">${rec.type === "academic" ? "🎓" : "🗓️"}</div>
        <div class="history-info">
          <h3>${esc(rec.name)}</h3>
          <div class="history-tags">
            <span class="tag">${rec.type === "academic" ? "Academic" : "Personal"}</span>
            <span class="tag tag-mode">${rec.mode === "random" ? "🎲 Random" : "✍️ Manual"}</span>
            <span class="tag">${rec.days ? rec.days.length : 0} days</span>
            <span class="tag">${rec.times ? rec.times.length : 0} slots</span>
          </div>
          <p class="history-meta">Created ${SC.formatDate(rec.createdAt)}</p>
          <p class="history-downloads"><strong>Downloads:</strong> ${exportCount} ${exportCount === 1 ? "file" : "files"} <span class="dot">•</span> ${exportFormats}</p>
        </div>
      </div>
      <div class="history-actions">
        <button class="btn btn-outline btn-sm" data-view>View</button>
        <button class="btn btn-ghost btn-sm" data-del>Delete</button>
      </div>
    `;

    card.querySelector("[data-view]").addEventListener("click", () => openPreview(rec));
    card.querySelector("[data-del]").addEventListener("click", () => {
      if (confirm("Delete this timetable from your history?")) {
        SC.deleteHistory(rec.id);
        SC.toast("Timetable deleted", "");
        render();
      }
    });
    return card;
  }

  function openPreview(rec) {
    activeRecord = rec;
    previewTitle.textContent = rec.name;
    previewMeta.textContent =
      (rec.type === "academic" ? "Academic" : "Personal") +
      " · " + (rec.mode === "random" ? "Random" : "Manual") +
      " · " + SC.formatDate(rec.createdAt);
    previewArea.innerHTML =
      rec.grid && rec.days ? renderStaticTable(rec.days, rec.grid, "previewTable") : "<p>No data.</p>";
    previewModal.classList.remove("hidden");
  }
  function closePreview() {
    previewModal.classList.add("hidden");
    activeRecord = null;
  }

  function reExport(format) {
    if (!activeRecord) return;
    try {
      const rec = activeRecord;
      const table = document.getElementById("previewTable");
      if (format === "csv") exportCSV(rec.days, rec.grid, rec.name);
      else if (format === "excel") exportExcel(rec.days, rec.grid, rec.name);
      else if (format === "pdf") exportPDF(table, rec.name);
      else if (format === "png" || format === "jpeg") exportImage(table, rec.name, format);
      SC.logExport(rec.id, format);
      SC.toast("Exported as " + format.toUpperCase(), "success");
      render();
    } catch (err) {
      SC.toast("Export failed: " + err.message, "error");
    }
  }

  return { render };
})();

/* ===========================================================
   7. BOOTSTRAP
   =========================================================== */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();

  SC.renderNav();
  Auth.init();

  // nav buttons (data-nav="home|create|history")
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      Router.go(btn.getAttribute("data-nav"));
    });
  });

  // logout
  document.querySelectorAll("[data-action='logout']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      SC.logout();
      SC.renderNav();
      SC.toast("Logged out successfully");
      Router.go("home");
    });
  });
});
