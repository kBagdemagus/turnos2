"use strict";

/* =========================
   Firebase Config + Init
========================= */
console.log("[turnos] v-mobile-letters-2"); // ← para verificar en consola que es el JS nuevo

const firebaseConfig = {
  apiKey: "AIzaSyCsxoAqOfBalegYyd7QUWwaU3C3uZRZc9c",
  authDomain: "turnos-a5c61.firebaseapp.com",
  projectId: "turnos-a5c61",
  storageBucket: "turnos-a5c61.firebasestorage.app",
  messagingSenderId: "384397085085",
  appId: "1:384397085085:web:3620d12de5d3e0ebd3c774",
  measurementId: "G-MC3MTGN976"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* =========================
   DOM Refs
========================= */
const calendarDays   = document.getElementById("calendarDays");
const monthYear      = document.getElementById("monthYear");
const prevMonthBtn   = document.getElementById("prevMonth");
const nextMonthBtn   = document.getElementById("nextMonth");
const syncStatusEl   = document.getElementById("syncStatus");
const lastMessageEl  = document.getElementById("lastMessage");
const workerTabs     = document.querySelectorAll(".worker-tab");

const exportBtn      = document.getElementById("exportBtn");
const importBtn      = document.getElementById("importBtn");
const importFile     = document.getElementById("importFile");
const resetBtn       = document.getElementById("resetBtn");
const saveTurnoBtn   = document.getElementById("saveTurnoBtn");
const cancelTurnoBtn = document.getElementById("cancelTurnoBtn");

/* =========================
   Estado Global
========================= */
let currentDate = new Date();

// Fechas de inicio por trabajador
const workers = {
  trabajador1: { name: "Trabajador 1", start: new Date(2024, 11,  2) }, // 2 dic 2024
  trabajador2: { name: "Trabajador 2", start: new Date(2025,  9, 13) }, // 13 oct 2025
  trabajador3: { name: "Trabajador 3", start: new Date(2025,  9, 20) }, // 20 oct 2025
  trabajador4: { name: "Trabajador 4", start: new Date(2025,  9, 27) }  // 27 oct 2025
};

// Ciclo 4 semanas (L-D)
const weekPatterns = [
  { days: ["mañana","mañana","mañana","mañana","mañana","libre","libre"] },
  { days: ["mañana","mañana","mañana","mañana","mañana","libre","libre"] },
  { days: ["mañana","mañana","mañana","mañana","mañana","libre","libre"] },
  { days: ["tarde","tarde","tarde","tarde","tarde","mañana","libre"] }
];

// Festivos 2025
const festivos2025 = new Set([
  "2025-01-01", "2025-01-06", "2025-01-29",
  "2025-03-05",
  "2025-04-17", "2025-04-18",
  "2025-04-23",
  "2025-05-02",
  "2025-08-15",
  "2025-10-13",
  "2025-11-01",
  "2025-12-06", "2025-12-08", "2025-12-25"
]);

// Usuario simple (puedes integrar Auth más adelante)
const userId = "usuario_default";

// Estado de trabajador actual y turnos editados
let currentWorkerId = localStorage.getItem("currentWorkerId") || "trabajador1";
let editedTurnos = {};
let selectedDateStr = "";

/* =========================
   Helpers
========================= */
// Diferencia de días en UTC (evita DST)
function diffDaysUTC(a, b) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((utcA - utcB) / 86400000);
}
// Módulo positivo
const mod = (n, m) => ((n % m) + m) % m;

// Fecha local YYYY-MM-DD
function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Normaliza posibles valores antiguos
function normalizeTurno(v) {
  if (v === "morning") return "mañana";
  if (v === "evening") return "tarde";
  if (v === "free")    return "libre";
  return v;
}

// Clase CSS desde turno
function classFromTurno(turno) {
  switch (turno) {
    case "mañana": return "turno-manana";
    case "tarde":  return "turno-tarde";
    case "libre":  return "turno-libre";
    case "festivo":return "turno-festivo";
    default:       return "turno-libre";
  }
}

// Letra a mostrar
function letterFromTurno(turno) {
  switch (turno) {
    case "mañana": return "M";
    case "tarde":  return "T";
    case "libre":  return "L";
    case "festivo":return "F";
    default:       return "?";
  }
}

function setStatus(type, text) {
  syncStatusEl.className = "status";
  if (type === "connected")    syncStatusEl.classList.add("status-connected");
  else if (type === "saving")  syncStatusEl.classList.add("status-saving");
  else if (type === "error")   syncStatusEl.classList.add("status-error");
  else                         syncStatusEl.classList.add("status-disconnected");
  syncStatusEl.textContent = `Estado: ${text}`;
}
function setMsg(msg) { lastMessageEl.textContent = msg || ""; }

function getWorkerDocRef() {
  const docId = `${userId}_${currentWorkerId}`;
  return db.collection("usuarios").doc(docId);
}

/* =========================
   Firestore
========================= */
async function loadTurnosFromFirestore() {
  const ref = getWorkerDocRef();
  try {
    setStatus("saving", `cargando ${workers[currentWorkerId].name}…`);
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data();
      if (data.turnos && typeof data.turnos === "object") {
        const fixed = {};
        for (const [d, t] of Object.entries(data.turnos)) fixed[d] = normalizeTurno(t);
        editedTurnos = fixed;
        localStorage.setItem(`turnosGuardados_${currentWorkerId}`, JSON.stringify(editedTurnos));
        setStatus("connected", "conectado");
        setMsg(`Turnos de ${workers[currentWorkerId].name} sincronizados.`);
        return;
      }
    }
    await ref.set({ turnos: {} }, { merge: true });
    editedTurnos = {};
    localStorage.setItem(`turnosGuardados_${currentWorkerId}`, "{}");
    setStatus("connected", "conectado");
    setMsg(`Documento creado para ${workers[currentWorkerId].name}.`);
  } catch (err) {
    console.error("[Firestore] Error al cargar:", err);
    setStatus("error", "error");
    setMsg("No se pudo leer Firestore. Revisa reglas/servidor.");
  }
}

async function saveAllTurnosToFirestore() {
  const ref = getWorkerDocRef();
  try {
    setStatus("saving", `guardando ${workers[currentWorkerId].name}…`);
    await ref.set({ turnos: editedTurnos }, { merge: true });
    setStatus("connected", "conectado");
    setMsg(`✅ Cambios guardados (${workers[currentWorkerId].name}).`);
  } catch (err) {
    console.error("[Firestore] Error al guardar:", err);
    setStatus("error", "error");
    setMsg("❌ Error guardando en Firestore (ver consola).");
  }
}

/* =========================
   Calendario
========================= */
function getStartCycleDate() { return workers[currentWorkerId].start; }
function isFestivo(dateStr) { return festivos2025.has(dateStr); }

function generateCalendar(date) {
  calendarDays.innerHTML = "";

  const year  = date.getFullYear();
  const month = date.getMonth();
  monthYear.innerText = `${workers[currentWorkerId].name} · ${date.toLocaleString("es-ES", { month: "long", year: "numeric" })}`;

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Lunes=0
  const totalDays = lastDay.getDate();

  const todayStr = formatLocalDate(new Date());
  const startCycleDate = getStartCycleDate();

  // Relleno inicial
  for (let i = 0; i < startWeekday; i++) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty";
    calendarDays.appendChild(emptyDiv);
  }

  // Días
  for (let day = 1; day <= totalDays; day++) {
    const cell = document.createElement("div");
    const thisDate = new Date(year, month, day);
    const dateStr  = formatLocalDate(thisDate);

    const daysDiff  = diffDaysUTC(thisDate, startCycleDate);
    const weekIndex = mod(Math.floor(daysDiff / 7), 4);
    const weekday   = thisDate.getDay() === 0 ? 6 : thisDate.getDay() - 1;

    let turno;
    let clickable = true;

    if (isFestivo(dateStr)) {
      turno = "festivo";
      clickable = false;
      cell.title = "Festivo";
    } else if (editedTurnos[dateStr]) {
      turno = normalizeTurno(editedTurnos[dateStr]);
    } else {
      turno = weekPatterns[weekIndex].days[weekday];
    }

    cell.className = classFromTurno(turno);
    if (dateStr === todayStr) cell.classList.add("is-today");
    if (!clickable) cell.classList.add("no-click");

    // Número + letra (M/T/L/F)
    const num = document.createElement("div");
    num.className = "day-number";
    num.textContent = String(day);

    const letter = document.createElement("div");
    letter.className = "turno-letter";
    letter.textContent = letterFromTurno(turno);
    letter.title = turno;

    cell.appendChild(num);
    cell.appendChild(letter);

    if (clickable) cell.addEventListener("click", () => openModal(dateStr, turno));
    calendarDays.appendChild(cell);
  }

  // Relleno final
  const cellsSoFar = startWeekday + totalDays;
  const trailing = (7 - (cellsSoFar % 7)) % 7;
  for (let i = 0; i < trailing; i++) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty";
    calendarDays.appendChild(emptyDiv);
  }
}

/* =========================
   Modal edición
========================= */
function openModal(dateStr, currentTurno) {
  selectedDateStr = dateStr;
  document.getElementById("modalDate").innerText = `Día: ${dateStr}`;
  document.getElementById("turnoSelect").value = currentTurno;
  document.getElementById("turnoModal").classList.remove("hidden");
}
function closeModal() { document.getElementById("turnoModal").classList.add("hidden"); }
async function saveTurno() {
  if (!selectedDateStr) return;
  if (isFestivo(selectedDateStr)) { closeModal(); return; }
  const newTurno = normalizeTurno(document.getElementById("turnoSelect").value);
  editedTurnos[selectedDateStr] = newTurno;
  localStorage.setItem(`turnosGuardados_${currentWorkerId}`, JSON.stringify(editedTurnos));
  closeModal();
  generateCalendar(currentDate);
  await saveAllTurnosToFirestore();
}

/* =========================
   Import/Export/Reset
========================= */
function exportTurnos() {
  const dataStr = JSON.stringify(editedTurnos, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentWorkerId}_turnos.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function openImportDialog() { importFile.click(); }
function handleImportFileChange() {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const raw = JSON.parse(e.target.result);
      const imported = {};
      for (const [d, t] of Object.entries(raw || {})) imported[d] = normalizeTurno(t);
      editedTurnos = imported;
      localStorage.setItem(`turnosGuardados_${currentWorkerId}`, JSON.stringify(editedTurnos));
      generateCalendar(currentDate);
      await saveAllTurnosToFirestore();
      alert(`✔️ Turnos importados (${workers[currentWorkerId].name})`);
    } catch (err) {
      console.error("Import error:", err);
      alert("❌ Error al leer el archivo");
    } finally {
      importFile.value = "";
    }
  };
  reader.readAsText(file);
}
async function resetTurnos() {
  if (confirm(`¿Borrar todos los turnos personalizados de ${workers[currentWorkerId].name}?`)) {
    localStorage.removeItem(`turnosGuardados_${currentWorkerId}`);
    editedTurnos = {};
    generateCalendar(currentDate);
    try {
      await getWorkerDocRef().set({ turnos: {} }, { merge: true });
      setMsg(`✔️ Turnos restaurados en Firestore (${workers[currentWorkerId].name}).`);
    } catch (err) {
      console.error("Error al resetear Firestore:", err);
      setMsg("❌ No se pudo resetear en Firestore.");
    }
  }
}

/* =========================
   Cambio de trabajador
========================= */
async function setCurrentWorker(id) {
  currentWorkerId = id;
  localStorage.setItem("currentWorkerId", currentWorkerId);

  workerTabs.forEach(btn => {
    const active = btn.dataset.id === currentWorkerId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  editedTurnos = JSON.parse(localStorage.getItem(`turnosGuardados_${currentWorkerId}`) || "{}");
  await loadTurnosFromFirestore();
  generateCalendar(currentDate);
}

/* =========================
   Eventos UI
========================= */
prevMonthBtn.addEventListener("click", () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  generateCalendar(currentDate);
});
nextMonthBtn.addEventListener("click", () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  generateCalendar(currentDate);
});
workerTabs.forEach(btn => btn.addEventListener("click", () => setCurrentWorker(btn.dataset.id)));
exportBtn.addEventListener("click", exportTurnos);
importBtn.addEventListener("click", openImportDialog);
importFile.addEventListener("change", handleImportFileChange);
resetBtn.addEventListener("click", resetTurnos);
saveTurnoBtn.addEventListener("click", saveTurno);
cancelTurnoBtn.addEventListener("click", closeModal);

/* =========================
   Inicio
========================= */
(async () => {
  try {
    setStatus("saving", "iniciando…");
    workerTabs.forEach(btn => {
      const active = btn.dataset.id === currentWorkerId;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    editedTurnos = JSON.parse(localStorage.getItem(`turnosGuardados_${currentWorkerId}`) || "{}");
    await loadTurnosFromFirestore();
  } finally {
    generateCalendar(currentDate);
  }
})();
