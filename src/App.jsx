import { useState, useEffect, useRef } from "react";

const SUPABASE_URL = "https://fbuxwyuwtrpzzavayonr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZidXh3eXV3dHJwenphdmF5b25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDE2MjYsImV4cCI6MjA5OTU3NzYyNn0.w6PWlN4eooXMxOuJR6YeqCK6ZBkn9qSfXAimtHcqU6c";

const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer": "resolution=merge-duplicates",
};

// Données d'hier (2026-07-13) à migrer automatiquement
const MIGRATION_DATA = {
  "2026-07-13": {
    tasks: ["Refaire mon système de gestion de tâches","Relire le livre de Forvil en profondeur pour préparer mon plan","Finir le paln de mon Journal de trading pour préparer mes trades","Aller acheter pour papa","Analyser le marché à la recherche d'opportunité en suivant mon plan","Lire 30 min — développement personnel ou professionnel"],
    checked_tasks: {"0":true,"1":true,"2":true,"3":true,"4":true,"5":false},
    checked_routine: {"m1":true,"m2":true,"m4":true,"e0":true,"e2":true,"m3":true,"e1":true},
  }
};

// --- Offline-first : cache local + file d'attente de synchronisation ---
const CACHE_KEY = "tds_cache_v1";
const QUEUE_KEY = "tds_pending_queue_v1";

function lsRead(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / privé */ }
}
function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c==="x"?r:(r&0x3|0x8); return v.toString(16);
  });
}
function getCache() { return lsRead(CACHE_KEY, {}); }
function setCacheTable(table, rows) {
  const c = getCache(); c[table] = rows; lsWrite(CACHE_KEY, c);
}
function getCacheTable(table) { return getCache()[table] || []; }
function getQueue() { return lsRead(QUEUE_KEY, []); }
function setQueue(q) { lsWrite(QUEUE_KEY, q); syncListeners.forEach(fn => fn(q)); }
function pushToQueue(op) { setQueue([...getQueue(), op]); }
const syncListeners = new Set();
function onSyncStateChange(fn) { syncListeners.add(fn); return () => syncListeners.delete(fn); }

async function flushPendingQueue() {
  let queue = getQueue();
  if (queue.length === 0) return;
  const remaining = [];
  for (const op of queue) {
    try {
      let ok = false;
      if (op.type === "insert") {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${op.table}`, { method:"POST", headers:{...HEADERS,"Prefer":"return=minimal"}, body: JSON.stringify(op.row) });
        ok = res.ok;
      } else if (op.type === "patch") {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${op.table}?id=eq.${op.id}`, { method:"PATCH", headers:{...HEADERS,"Prefer":"return=minimal"}, body: JSON.stringify(op.patch) });
        ok = res.ok;
      } else if (op.type === "delete") {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${op.table}?id=eq.${op.id}`, { method:"DELETE", headers: HEADERS });
        ok = res.ok;
      } else if (op.type === "upsert") {
        const existing = await fetch(`${SUPABASE_URL}/rest/v1/${op.table}?date_key=eq.${op.row.date_key}&select=date_key`, { headers: HEADERS }).then(r => r.ok ? r.json() : []).catch(() => []);
        if (existing && existing.length > 0) {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/${op.table}?date_key=eq.${op.row.date_key}`, { method:"PATCH", headers:{...HEADERS,"Prefer":"return=minimal"}, body: JSON.stringify(op.row) });
          ok = res.ok;
        } else {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/${op.table}`, { method:"POST", headers:{...HEADERS,"Prefer":"return=minimal"}, body: JSON.stringify(op.row) });
          ok = res.ok;
        }
      }
      if (!ok) remaining.push(op); // on garde l'ordre, on retentera plus tard
    } catch {
      remaining.push(op);
      break; // toujours hors ligne : on arrête ici pour respecter l'ordre
    }
  }
  setQueue(remaining);
}

async function dbGet(table, dateKey) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?date_key=eq.${dateKey}&select=*`, { headers: HEADERS });
    if (!res.ok) throw new Error("http");
    const data = await res.json();
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (row) { const rows = getCacheTable(table).filter(r => r.date_key !== dateKey); setCacheTable(table, [...rows, row]); }
    return row;
  } catch {
    return getCacheTable(table).find(r => r.date_key === dateKey) || null;
  }
}

async function dbUpsert(table, row) {
  // Mise à jour optimiste immédiate du cache local
  const cached = getCacheTable(table).filter(r => r.date_key !== row.date_key);
  setCacheTable(table, [...cached, row]);
  try {
    const existing = await dbGet(table, row.date_key);
    if (existing) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?date_key=eq.${row.date_key}`, { method:"PATCH", headers:{...HEADERS,"Prefer":"return=minimal"}, body: JSON.stringify(row) });
      if (!res.ok) throw new Error("http");
    } else {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:"POST", headers:{...HEADERS,"Prefer":"return=minimal"}, body: JSON.stringify(row) });
      if (!res.ok) throw new Error("http");
    }
  } catch {
    pushToQueue({ type:"upsert", table, row });
  }
}

// --- Helpers génériques (par id) pour le Planificateur ---
async function dbList(table, query = "") {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${query}`, { headers: HEADERS });
    if (!res.ok) throw new Error("http");
    const data = await res.json();
    setCacheTable(table, data);
    return data;
  } catch {
    return getCacheTable(table);
  }
}

async function dbInsert(table, row) {
  const rowWithId = row.id ? row : { ...row, id: uuid() };
  setCacheTable(table, [...getCacheTable(table), rowWithId]);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "return=representation" },
      body: JSON.stringify(rowWithId),
    });
    if (!res.ok) throw new Error("http");
    const data = await res.json();
    const saved = Array.isArray(data) ? data[0] : data;
    setCacheTable(table, getCacheTable(table).map(r => r.id === rowWithId.id ? saved : r));
    return saved;
  } catch {
    pushToQueue({ type:"insert", table, row: rowWithId });
    return rowWithId; // optimiste : l'UI continue avec l'id généré localement
  }
}

async function dbPatch(table, id, patch) {
  setCacheTable(table, getCacheTable(table).map(r => r.id === id ? { ...r, ...patch } : r));
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("http");
  } catch {
    pushToQueue({ type:"patch", table, id, patch });
  }
}

async function dbDelete(table, id) {
  setCacheTable(table, getCacheTable(table).filter(r => r.id !== id));
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: HEADERS,
    });
    if (!res.ok) throw new Error("http");
  } catch {
    pushToQueue({ type:"delete", table, id });
  }
}
// --- fin helpers Planificateur ---

// Durées par défaut (en minutes) pour les étapes de routine dont la donnée vient de Supabase
// et n'a donc pas forcément de champ "duration" (colonne absente en base) — utilisées uniquement
// pour calculer les créneaux bloqués dans le Planificateur.
const ROUTINE_STEP_DURATIONS = { m4: 30 };

const DEFAULT_MORNING_ROUTINE = [
  { id: "m1", time: "05:50", icon: "☀️", label: "Réveil & Hydratation", desc: "Lever immédiat, 1 grand verre d'eau. Pas de téléphone. Respiration profonde 3 min." },
  { id: "m2", time: "06:00", icon: "🏠", label: "Responsabilités de la maison", desc: "1h dédiée aux tâches du foyer — ménage, rangement, ou ce qui est nécessaire. Pleine présence, sans téléphone." },
  { id: "m3", time: "07:00", icon: "🏃", label: "Sport · Douche · Méditation / Visualisation", desc: "1h complète : sport 30 min → douche → méditation et visualisation 15 min — ancrer l'intention du jour, clarté mentale." },
  { id: "m4", time: "08:00", icon: "☕", label: "Petit-déjeuner", desc: "Repas nutritif et conscient. Pas d'écrans. Prendre le temps de bien manger avant de commencer la journée. 30 min — fin à 8h30 max.", duration: 30 },
];

const DEFAULT_EVENING_ROUTINE = [
  { id: "e0", time: "19:00", icon: "🚿", label: "Douche", desc: "Couper avec la journée de travail. Douche chaude pour décompresser et se recentrer." },
  { id: "e1", time: "19:20", icon: "📝", label: "Bilan de journée", desc: "15 min — tâches accomplies, état d'esprit, leçons du jour. Qu'est-ce que j'ai bien fait ? Qu'est-ce que j'améliore demain ?" },
  { id: "e2", time: "19:45", icon: "👨‍👩‍👦", label: "Temps famille / social", desc: "Dîner, échanges, présence réelle. Déconnexion totale du travail. Ce temps est sacré." },
  { id: "e3", time: "21:00", icon: "🗓️", label: "Préparer le lendemain", desc: "10 min — écrire les 6 tâches du lendemain, vérifier l'agenda, poser les alertes nécessaires." },
  { id: "e4", time: "22:00", icon: "🌙", label: "Rituel de nuit", desc: "Lumières tamisées, étirements doux, respiration 4-7-8. Téléphone en mode avion. Coucher serein." },
];

const DEFAULT_TASKS = [
  "Tâche prioritaire du jour",
  "Tâche secondaire importante",
  "Aider à une tâche familiale à la maison",
  "Lire 30 min — développement personnel ou professionnel",
  "Ranger et nettoyer mon espace de travail",
  "Écrire les 6 tâches de demain et préparer le lendemain",
];

// --- Constantes Planificateur ---
const PRIORITIES = [
  { val: "haute", label: "Haute", color: "var(--accentOrange2)" },
  { val: "moyenne", label: "Moyenne", color: "var(--accentAmber)" },
  { val: "basse", label: "Basse", color: "var(--accentBlue)" },
];
const RECURRENCES = [
  { val: "aucune", label: "Aucune" },
  { val: "quotidienne", label: "Quotidienne" },
  { val: "ouvrable", label: "Jours ouvrables (lun-ven)" },
  { val: "hebdomadaire", label: "Hebdomadaire" },
  { val: "mensuelle", label: "Mensuelle" },
];
const LABEL_COLORS = ["#68d391","#8ab4f8","#f0b429","#fb8a4a","#c084fc","#f472b6","#4dd4d4","var(--text)"];
const WINDOW_PRESETS = [
  { label:"Toute la journée", icon:"🌐", start:null, end:null },
  { label:"Matin", icon:"🌅", start:"06:00:00", end:"12:00:00" },
  { label:"Après-midi", icon:"☀️", start:"12:00:00", end:"18:00:00" },
  { label:"Soir", icon:"🌙", start:"18:00:00", end:"22:00:00" },
  { label:"Personnalisé", icon:"⚙️", start:"09:00:00", end:"17:00:00" },
];
const GOAL_CATEGORIES = [
  { val:"personnel", label:"Personnel", icon:"🧘" },
  { val:"finance", label:"Finance", icon:"💰" },
  { val:"professionnel", label:"Professionnel", icon:"💼" },
  { val:"business", label:"Business", icon:"🚀" },
  { val:"maison", label:"Maison", icon:"🏠" },
];
const PLANNER_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06h -> 22h
const GOOGLE_CLIENT_ID = "475742292156-jh4j1m135g5oeco89ko8rasmab5u78ug.apps.googleusercontent.com";

const THEME_DARK = {
  bg0:"#0a0c10", bg1:"#0f1520", bg2:"#0d1219", bg3:"#0a0f18",
  border:"#1a2535", border2:"#141e2a", text:"#e8e0d4", text2:"#c8c0b4", muted:"#5a6a7a", muted2:"#3a4a5a",
  headerEnd:"#141b2a", accentGold:"#d4c9a0", accentOrange:"#f0a070", greenMuted:"#5a7a5a",
  accentBlue:"#8ab4f8", accentGreen:"#68d391", accentAmber:"#f0b429", accentOrange2:"#fb8a4a", accentPurple:"#c084fc",
};
const THEME_LIGHT = {
  bg0:"#f4f1ea", bg1:"#ffffff", bg2:"#ece7db", bg3:"#eeeae0",
  border:"#d8d0c0", border2:"#e4ddce", text:"#2a2418", text2:"#4a4030", muted:"#7a7060", muted2:"#a89e8c",
  headerEnd:"#ddd3ba", accentGold:"#8a6a2a", accentOrange:"#b85a2a", greenMuted:"#3a5a3a",
  // Variantes plus saturées/foncées pour rester lisibles sur fond clair (contraste AA sur blanc)
  accentBlue:"#2563eb", accentGreen:"#15803d", accentAmber:"#b45309", accentOrange2:"#c2410c", accentPurple:"#9333ea",
};
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar";

function downloadCSV(filename, rows) {
  const escape = (v) => {
    const s = (v === null || v === undefined) ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const csv = rows.map(row => row.map(escape).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function pad2(n) { return String(n).padStart(2, "0"); }

const HOUR_PX = 48;

// Calcule la position/hauteur (façon Google Agenda) de chaque tâche datée d'une journée,
// en gérant les chevauchements par colonnes côte à côte.
function layoutDayTimedTasks(tasks, startH) {
  const items = tasks.map(t => {
    const [hh, mm] = t.scheduled_time.split(":").map(Number);
    const start = hh + mm / 60;
    const dur = Math.max(15, t.duration_minutes || 30) / 60;
    return { task: t, start, end: start + dur };
  }).sort((a, b) => a.start - b.start || a.end - b.end);

  const colEnds = []; // dernière fin de chaque colonne
  items.forEach(it => {
    let col = colEnds.findIndex(end => end <= it.start + 0.001);
    if (col === -1) { col = colEnds.length; colEnds.push(it.end); }
    else colEnds[col] = it.end;
    it.col = col;
  });
  items.forEach(it => {
    const overlapping = items.filter(o => o.start < it.end - 0.001 && o.end > it.start + 0.001);
    it.totalCols = Math.max(1, ...overlapping.map(o => o.col + 1));
  });

  return items.map(it => ({
    task: it.task,
    top: Math.max(0, (it.start - startH)) * HOUR_PX,
    height: Math.max(20, (it.end - it.start) * HOUR_PX - 3),
    leftPct: (it.col / it.totalCols) * 100,
    widthPct: (100 / it.totalCols) - (it.totalCols > 1 ? 1.5 : 0),
  }));
}

function toDateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function getWeekStart(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay(); // 0=dim
  const diff = day === 0 ? -6 : 1 - day; // lundi comme premier jour
  x.setDate(x.getDate() + diff);
  x.setHours(0,0,0,0);
  return x;
}
function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}
function getRangeDays(start, count) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}
function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function nextRecurrenceDate(dateKey, recurrence) {
  const d = new Date(dateKey + "T00:00:00");
  if (recurrence === "quotidienne") d.setDate(d.getDate() + 1);
  else if (recurrence === "ouvrable") {
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); // saute samedi/dimanche
  }
  else if (recurrence === "hebdomadaire") d.setDate(d.getDate() + 7);
  else if (recurrence === "mensuelle") d.setMonth(d.getMonth() + 1);
  else return null;
  return toDateKey(d);
}
// --- fin constantes Planificateur ---

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });
}

function getLast4Weeks() {
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split("T")[0];
  }).reverse();
}

function getLast6Months() {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });
}

export default function App() {
  const [view, setView] = useState("dashboard");
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [checkedTasks, setCheckedTasks] = useState({});
  const [checkedRoutine, setCheckedRoutine] = useState({});
  const [morningRoutine, setMorningRoutine] = useState(DEFAULT_MORNING_ROUTINE);
  const [eveningRoutine, setEveningRoutine] = useState(DEFAULT_EVENING_ROUTINE);
  const [editingRoutineId, setEditingRoutineId] = useState(null);
  const [settings, setSettings] = useState({ buffer_minutes:10, workday_start:"08:00", workday_end:"20:00", auto_reschedule:true, theme:"dark", notifications_enabled:false });
  const [habits, setHabits] = useState([]);
  const [habitCompletions, setHabitCompletions] = useState({}); // habit_id -> [date_key,...]
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [editingHabitId, setEditingHabitId] = useState(null);
  const [showArchivedHabits, setShowArchivedHabits] = useState(false);
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [syncQueueLen, setSyncQueueLen] = useState(0);
  useEffect(() => {
    setSyncQueueLen(getQueue().length);
    const unsub = onSyncStateChange(q => setSyncQueueLen(q.length));
    const goOnline = () => { setIsOnline(true); flushPendingQueue(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    flushPendingQueue(); // tentative de synchro au chargement, au cas où
    const interval = setInterval(() => { if (navigator.onLine) flushPendingQueue(); }, 20000);
    return () => { unsub(); window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); clearInterval(interval); };
  }, []);
  const notifiedTasksRef = useRef(new Set());
  const [now, setNow] = useState(new Date());


  // --- Redimensionnement des tâches par glisser (façon Google Agenda / Reclaim.ai) ---
  const resizeStateRef = useRef(null); // { id, startY, startDuration, current }
  const [resizingTaskId, setResizingTaskId] = useState(null);
  useEffect(() => {
    const onMove = (e) => {
      const st = resizeStateRef.current;
      if (!st) return;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const deltaY = clientY - st.startY;
      const deltaMin = Math.round(((deltaY / HOUR_PX) * 60) / 15) * 15;
      const next = Math.max(15, st.startDuration + deltaMin);
      if (next !== st.current) {
        st.current = next;
        setPlannerTasks(prev => prev.map(t => t.id === st.id ? { ...t, duration_minutes: next } : t));
      }
    };
    const onUp = () => {
      const st = resizeStateRef.current;
      if (st) {
        patchPlannerTask(st.id, { duration_minutes: st.current });
        resizeStateRef.current = null;
        setResizingTaskId(null);
        document.body.style.cursor = "";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive:false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, []);
  const startResizeTask = (task, e) => {
    e.stopPropagation(); e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    resizeStateRef.current = { id: task.id, startY: clientY, startDuration: task.duration_minutes || 30, current: task.duration_minutes || 30 };
    setResizingTaskId(task.id);
    document.body.style.cursor = "ns-resize";
  };
  // --- fin redimensionnement ---

  const [syncing, setSyncing] = useState(false);
  const [syncOk, setSyncOk] = useState(null);
  const [analyseData, setAnalyseData] = useState(null);
  const [bilan, setBilan] = useState({ humeur:"", senti:"", reussi:"", tombe:"", appris:"", dieu:"", priorite_demain:"" });
  const [bilanSaved, setBilanSaved] = useState(false);
  const [bilanDate, setBilanDate] = useState(getTodayKey());
  const [bilanLoading, setBilanLoading] = useState(false);
  const saveTimer = useRef(null);
  const bilanTimer = useRef(null);

  // --- Planificateur ---
  const [plannerTasks, setPlannerTasks] = useState([]);
  const [plannerLabels, setPlannerLabels] = useState([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [plannerViewMode, setPlannerViewMode] = useState("3day"); // day | 3day | week
  const [plannerStart, setPlannerStart] = useState(startOfDay());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [newInboxTitle, setNewInboxTitle] = useState("");
  const [dragTaskId, setDragTaskId] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [quickCaptureVal, setQuickCaptureVal] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const [googleToken, setGoogleToken] = useState(null);
  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleTokenClient = useRef(null);
  const [goals, setGoals] = useState([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [editingGoalId, setEditingGoalId] = useState(null);

  // Migration + chargement initial + resynchronisation périodique
  const refreshToday = async () => {
    setSyncing(true);
    try {
      const todayKey = getTodayKey();
      const taskRow = await dbGet("daily_tasks", todayKey);
      const routineRow = await dbGet("daily_routines", todayKey);
      if (taskRow) {
        setTasks(taskRow.tasks || DEFAULT_TASKS);
        setCheckedTasks(taskRow.checked_tasks || {});
      }
      if (routineRow) setCheckedRoutine(routineRow.checked_routine || {});
      setSyncOk(true);
    } catch(e) {
      setSyncOk(false);
    }
    setSyncing(false);
  };

  useEffect(() => {
    const init = async () => {
      try {
        // Migrer les données d'hier si pas encore en base
        for (const [dateKey, data] of Object.entries(MIGRATION_DATA)) {
          const existing = await dbGet("daily_tasks", dateKey);
          if (!existing) {
            await dbUpsert("daily_tasks", { date_key: dateKey, tasks: data.tasks, checked_tasks: data.checked_tasks });
            await dbUpsert("daily_routines", { date_key: dateKey, checked_routine: data.checked_routine });
          }
        }
        await refreshToday();
        await loadGoals();
        await loadRoutines();
        await loadSettings();
        await loadHabits();
      } catch(e) {
        setSyncOk(false);
        setSyncing(false);
      }
    };
    init();
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Resynchronisation auto : toutes les 30s + à chaque retour sur l'onglet/app (multi-appareils)
  useEffect(() => {
    const resync = () => { refreshToday(); loadGoals(); if (view === "routines") loadRoutines(); if (view === "planner" || view === "today") loadPlanner(); };
    const syncInterval = setInterval(resync, 30000);
    const onFocus = () => resync();
    window.addEventListener("focus", onFocus);
    const onVis = () => { if (!document.hidden) resync(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(syncInterval); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); };
  }, [view]);

  // Raccourcis clavier
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
      if (typing) {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (e.key === "/") { e.preventDefault(); setShowGlobalSearch(true); }
      else if (e.key === "n" || e.key === "N") { e.preventDefault(); setShowQuickCapture(true); }
      else if (e.key === "t" || e.key === "T") setView("today");
      else if (e.key === "p" || e.key === "P") setView("planner");
      else if (e.key === "r" || e.key === "R") setView("routines");
      else if (e.key === "b" || e.key === "B") setView("bilan");
      else if (e.key === "a" || e.key === "A") setView("analyse");
      else if (e.key === "1") setPlannerViewMode("day");
      else if (e.key === "3") setPlannerViewMode("3day");
      else if (e.key === "7") setPlannerViewMode("week");
      else if (e.key === "?") setShowShortcuts(s => !s);
      else if (e.key === "Escape") { setShowQuickCapture(false); setEditingTaskId(null); setShowShortcuts(false); setShowGlobalSearch(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof Notification === "undefined") { alert("Les notifications ne sont pas supportées par ce navigateur."); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setSettings(s => ({ ...s, notifications_enabled: true }));
    } else {
      alert("Permission refusée — active les notifications dans les réglages de ton navigateur pour ce site.");
    }
  };

  const saveToDb = (newTasks, newChecks, newRoutine) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const todayKey = getTodayKey();
      await dbUpsert("daily_tasks", { date_key: todayKey, tasks: newTasks, checked_tasks: newChecks });
      await dbUpsert("daily_routines", { date_key: todayKey, checked_routine: newRoutine });
    }, 800);
  };

  const saveTasks = (t) => { setTasks(t); saveToDb(t, checkedTasks, checkedRoutine); };
  const toggleTask = (i) => {
    const next = { ...checkedTasks, [i]: !checkedTasks[i] };
    setCheckedTasks(next); saveToDb(tasks, next, checkedRoutine);
  };
  const toggleRoutine = (id) => {
    const next = { ...checkedRoutine, [id]: !checkedRoutine[id] };
    setCheckedRoutine(next); saveToDb(tasks, checkedTasks, next);
  };
  const startEdit = (i) => { setEditIdx(i); setEditVal(tasks[i]); };
  const saveEdit = () => { const t = [...tasks]; t[editIdx] = editVal; saveTasks(t); setEditIdx(null); };

  const todayKeyGlobal = getTodayKey();
  const MORNING_ROUTINE = morningRoutine;
  const EVENING_ROUTINE = eveningRoutine;
  const routineSpanHours = (list) => {
    if (!list.length) return [];
    const startFrac = list.reduce((min, r) => {
      const [hh, mm] = r.time.split(":").map(Number);
      const f = hh + mm / 60;
      return Math.min(min, f);
    }, 24);
    const last = list.reduce((acc, r) => {
      const [hh, mm] = r.time.split(":").map(Number);
      const f = hh + mm / 60;
      return f > acc.f ? { f, r } : acc;
    }, { f: -1, r: null });
    const endFrac = last.f + (last.r ? (last.r.duration || ROUTINE_STEP_DURATIONS[last.r.id] || 60) : 60) / 60;
    const arr = [];
    for (let h = Math.floor(startFrac); h + 1 <= endFrac; h++) arr.push(h);
    return arr;
  };
  const blockedHours = new Set([...routineSpanHours(morningRoutine), ...routineSpanHours(eveningRoutine)]);
  const todayPlannerTasksGlobal = plannerTasks.filter(t => t.scheduled_date === todayKeyGlobal);

  // Notifications navigateur pour les tâches planifiées à heure fixe
  useEffect(() => {
    if (!settings.notifications_enabled) return;
    if (typeof Notification === "undefined") return;
    const check = () => {
      if (Notification.permission !== "granted") return;
      const nowKey = getTodayKey();
      const nowHM = `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`;
      todayPlannerTasksGlobal.forEach(t => {
        if (t.completed || !t.scheduled_time || notifiedTasksRef.current.has(t.id)) return;
        if (t.scheduled_date === nowKey && t.scheduled_time.slice(0,5) === nowHM) {
          notifiedTasksRef.current.add(t.id);
          new Notification("⏰ " + t.title, { body: "C'est l'heure de cette tâche planifiée.", icon: "/favicon-192.png" });
        }
      });
    };
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [settings.notifications_enabled, todayPlannerTasksGlobal]);

  const completedTasks = todayPlannerTasksGlobal.filter(t => t.completed).length;
  const completedMorn = MORNING_ROUTINE.filter(r => checkedRoutine[r.id]).length;
  const completedEve = EVENING_ROUTINE.filter(r => checkedRoutine[r.id]).length;
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  // Bilan
  useEffect(() => {
    if (view !== "bilan") return;
    const load = async () => {
      setBilanLoading(true);
      const row = await dbGet("daily_bilans", bilanDate);
      setBilan(row?.bilan || { humeur:"", senti:"", reussi:"", tombe:"", appris:"", dieu:"", priorite_demain:"" });
      setBilanSaved(!!row);
      setBilanLoading(false);
    };
    load();
  }, [view, bilanDate]);

  const saveBilan = (newBilan) => {
    setBilanSaved(false);
    if (bilanTimer.current) clearTimeout(bilanTimer.current);
    bilanTimer.current = setTimeout(async () => {
      await dbUpsert("daily_bilans", { date_key: bilanDate, bilan: newBilan });
      setBilanSaved(true);
    }, 900);
  };

  const updateBilan = (field, val) => {
    const next = { ...bilan, [field]: val };
    setBilan(next);
    saveBilan(next);
  };

  const exportBilansCSV = async () => {
    const rows = await dbList("daily_bilans", "&order=date_key.asc");
    if (!rows || rows.length === 0) { alert("Aucun bilan enregistré pour l'instant."); return; }
    const header = ["Date","Humeur","Je me suis senti","J'ai réussi à","Ce que j'aurais pu mieux faire","Ce que j'ai appris","Ce que je confie à Dieu","Priorité pour demain"];
    const body = rows.map(r => {
      const b = r.bilan || {};
      return [r.date_key, b.humeur, b.senti, b.reussi, b.tombe, b.appris, b.dieu, b.priorite_demain];
    });
    downloadCSV(`bilans_${getTodayKey()}.csv`, [header, ...body]);
  };

  // Charger données analyse — basé sur le Planificateur (tâches), les routines et les habitudes
  useEffect(() => {
    if (view !== "analyse") return;
    const loadAnalyse = async () => {
      const last7 = getLast7Days();
      const last6m = getLast6Months();
      // Un seul appel réseau : toutes les routines des 6 derniers mois
      const routineRows = await dbList("daily_routines", "&order=date_key.desc&limit=200");
      const routineByDay = {};
      (routineRows || []).forEach(r => { routineByDay[r.date_key] = Object.values(r.checked_routine||{}).filter(Boolean).length; });
      const routineTotal = MORNING_ROUTINE.length + EVENING_ROUTINE.length;

      const results = {};
      for (const k of last7) {
        const dayTasks = plannerTasks.filter(t => t.scheduled_date === k);
        results[k] = {
          tasksDone: dayTasks.filter(t => t.completed).length,
          tasksTotal: dayTasks.length,
          routineDone: routineByDay[k] || 0,
          hasData: dayTasks.length > 0 || routineByDay[k] !== undefined,
        };
      }
      const monthResults = {};
      for (const mKey of last6m) {
        const [y,m] = mKey.split("-").map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        let totalTasks=0, totalRoutine=0, activeDays=0;
        for (let d=1; d<=daysInMonth; d++) {
          const dk = `${mKey}-${String(d).padStart(2,"0")}`;
          const dayTasks = plannerTasks.filter(t => t.scheduled_date === dk);
          const rDone = routineByDay[dk] || 0;
          if (dayTasks.length > 0 || routineByDay[dk] !== undefined) {
            totalTasks += dayTasks.filter(t => t.completed).length;
            totalRoutine += rDone;
            activeDays++;
          }
        }
        monthResults[mKey] = { totalTasks, totalRoutine, activeDays };
      }
      setAnalyseData({ daily: results, monthly: monthResults, routineTotal });
    };
    loadAnalyse();
  }, [view, plannerTasks]);

  // Charger les données du planificateur
  const loadPlanner = async () => {
    setPlannerLoading(true);
    const [t, l] = await Promise.all([
      dbList("tasks", "&order=scheduled_time.asc.nullslast"),
      dbList("task_labels", "&order=created_at.asc"),
    ]);
    setPlannerTasks(t || []);
    setPlannerLabels(l || []);
    setPlannerLoading(false);
  };

  useEffect(() => {
    if (view !== "planner" && view !== "today") return;
    loadPlanner();
  }, [view]);

  useEffect(() => {
    if (plannerTasks.length > 0) autoRebalance();
  }, [plannerTasks.length]);

  const addInboxTask = async () => {
    const title = newInboxTitle.trim();
    if (!title) return;
    const row = await dbInsert("tasks", {
      title, priority: "moyenne", recurrence: "aucune",
      scheduled_date: null, scheduled_time: null, label_id: null, completed: false,
    });
    if (row) setPlannerTasks(prev => [...prev, row]);
    setNewInboxTitle("");
  };

  const quickCapture = async () => {
    const title = quickCaptureVal.trim();
    if (!title) { setShowQuickCapture(false); return; }
    const row = await dbInsert("tasks", {
      title, priority: "moyenne", recurrence: "aucune",
      scheduled_date: null, scheduled_time: null, label_id: null, completed: false,
    });
    if (row) setPlannerTasks(prev => [...prev, row]);
    setQuickCaptureVal("");
    setShowQuickCapture(false);
  };

  const patchPlannerTask = async (id, patch) => {
    setPlannerTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    await dbPatch("tasks", id, patch);
  };

  const deletePlannerTask = async (id) => {
    setPlannerTasks(prev => prev.filter(t => t.id !== id));
    await dbDelete("tasks", id);
  };

  const toggleTaskDone = async (task) => {
    if (!task.scheduled_date) return; // les tâches de l'inbox ne sont pas cochables
    const completed = !task.completed;
    await patchPlannerTask(task.id, { completed });
    // Tâche issue d'une habitude autoplanifiée : synchronise le suivi de l'habitude ce jour-là.
    if (task.habit_id) {
      const alreadyDone = (habitCompletions[task.habit_id] || []).includes(task.scheduled_date);
      if (completed && !alreadyDone) {
        const row = await dbInsert("habit_completions", { habit_id: task.habit_id, date_key: task.scheduled_date });
        if (row) setHabitCompletions(prev => ({ ...prev, [task.habit_id]: [...(prev[task.habit_id]||[]), task.scheduled_date] }));
      } else if (!completed && alreadyDone) {
        const res = await dbList("habit_completions", `&habit_id=eq.${task.habit_id}&date_key=eq.${task.scheduled_date}`);
        if (res && res[0]) await dbDelete("habit_completions", res[0].id);
        setHabitCompletions(prev => ({ ...prev, [task.habit_id]: (prev[task.habit_id]||[]).filter(d => d !== task.scheduled_date) }));
      }
    }
    if (completed && task.recurrence && task.recurrence !== "aucune" && task.scheduled_date) {
      const nextDate = nextRecurrenceDate(task.scheduled_date, task.recurrence);
      if (nextDate) {
        const row = await dbInsert("tasks", {
          title: task.title, priority: task.priority, recurrence: task.recurrence,
          scheduled_date: nextDate, scheduled_time: task.scheduled_time, label_id: task.label_id,
          duration_minutes: task.duration_minutes, goal_id: task.goal_id, completed: false,
        });
        if (row) setPlannerTasks(prev => [...prev, row]);
      }
    }
  };

  const dayIsFull = (dateKey, excludeId) => tasksForDay(dateKey).filter(t => t.id !== excludeId).length >= 6;

  const addTaskAt = async (dateKey, time) => {
    if (dayIsFull(dateKey)) { alert("Ce jour a déjà 6 tâches — la limite est atteinte."); return; }
    const row = await dbInsert("tasks", {
      title: "Nouvelle tâche", priority: "moyenne", recurrence: "aucune",
      scheduled_date: dateKey, scheduled_time: time || null, label_id: null, completed: false,
    });
    if (row) { setPlannerTasks(prev => [...prev, row]); setEditingTaskId(row.id); }
  };

  const dropOnDay = async (dateKey) => {
    if (!dragTaskId) return;
    if (dayIsFull(dateKey, dragTaskId)) { alert("Ce jour a déjà 6 tâches — la limite est atteinte."); setDragTaskId(null); return; }
    await patchPlannerTask(dragTaskId, { scheduled_date: dateKey, scheduled_time: null });
    setDragTaskId(null);
  };

  const dropOnSlot = async (dateKey, hour) => {
    if (!dragTaskId) return;
    if (dayIsFull(dateKey, dragTaskId)) { alert("Ce jour a déjà 6 tâches — la limite est atteinte."); setDragTaskId(null); return; }
    await patchPlannerTask(dragTaskId, { scheduled_date: dateKey, scheduled_time: `${pad2(hour)}:00` });
    setDragTaskId(null);
  };

  const dropOnInbox = async () => {
    if (!dragTaskId) return;
    await patchPlannerTask(dragTaskId, { scheduled_date: null, scheduled_time: null });
    setDragTaskId(null);
  };

  // --- Semaine type : duplication ---
  const shiftDateKey = (dateKey, days) => {
    const d = new Date(dateKey + "T00:00:00");
    d.setDate(d.getDate() + days);
    return toDateKey(d);
  };

  const duplicateDay = async (dateKey) => {
    const source = plannerTasks.filter(t => t.scheduled_date === dateKey);
    if (source.length === 0) { alert("Aucune tâche à dupliquer ce jour-là."); return; }
    const targetKey = shiftDateKey(dateKey, 1);
    if (dayIsFull(targetKey)) { alert("Le jour suivant a déjà 6 tâches — la limite est atteinte."); return; }
    const room = 6 - tasksForDay(targetKey).length;
    for (const t of source.slice(0, room)) {
      const row = await dbInsert("tasks", {
        title: t.title, priority: t.priority, recurrence: "aucune",
        scheduled_date: targetKey, scheduled_time: t.scheduled_time, label_id: t.label_id,
        duration_minutes: t.duration_minutes, goal_id: t.goal_id, completed: false,
      });
      if (row) setPlannerTasks(prev => [...prev, row]);
    }
  };

  const duplicateWeek = async (weekStartDate) => {
    const days = getWeekDays(weekStartDate).map(d => toDateKey(d));
    const source = plannerTasks.filter(t => days.includes(t.scheduled_date));
    if (source.length === 0) { alert("Aucune tâche à dupliquer cette semaine-là."); return; }
    for (const t of source) {
      const targetKey = shiftDateKey(t.scheduled_date, 7);
      if (dayIsFull(targetKey)) continue;
      const row = await dbInsert("tasks", {
        title: t.title, priority: t.priority, recurrence: "aucune",
        scheduled_date: targetKey, scheduled_time: t.scheduled_time, label_id: t.label_id,
        duration_minutes: t.duration_minutes, goal_id: t.goal_id, completed: false,
      });
      if (row) setPlannerTasks(prev => [...prev, row]);
    }
  };
  // --- fin Semaine type ---

  const addLabel = async () => {
    const name = newLabelName.trim();
    if (!name) return;
    const row = await dbInsert("task_labels", { name, color: newLabelColor });
    if (row) setPlannerLabels(prev => [...prev, row]);
    setNewLabelName("");
  };

  const deleteLabel = async (id) => {
    setPlannerLabels(prev => prev.filter(l => l.id !== id));
    await dbDelete("task_labels", id);
  };

  const inboxTasks = plannerTasks.filter(t => !t.scheduled_date && !t.completed);
  const rangeCount = plannerViewMode === "day" ? 1 : plannerViewMode === "3day" ? 3 : 7;
  const weekDays = getRangeDays(plannerStart, rangeCount);
  const tasksForDay = (dateKey) => plannerTasks.filter(t => t.scheduled_date === dateKey);
  const labelById = (id) => plannerLabels.find(l => l.id === id);

  // --- Google Calendar ---
  const getGoogleTokenClient = () => {
    if (!googleTokenClient.current && window.google?.accounts) {
      googleTokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPE,
        callback: (resp) => {
          if (resp && resp.access_token) {
            setGoogleToken(resp.access_token);
            localStorage.setItem("google_connected", "1");
          }
        },
      });
    }
    return googleTokenClient.current;
  };

  const connectGoogle = () => {
    if (!window.google || !window.google.accounts) {
      alert("Google n'est pas encore chargé, réessaie dans 2 secondes.");
      return;
    }
    getGoogleTokenClient()?.requestAccessToken();
  };

  const disconnectGoogle = () => { setGoogleToken(null); setGoogleEvents([]); localStorage.removeItem("google_connected"); };

  const loadGoogleEvents = async () => {
    if (!googleToken) return;
    setGoogleLoading(true);
    try {
      const timeMin = weekDays[0].toISOString();
      const end = new Date(weekDays[6]); end.setHours(23,59,59,999);
      const timeMax = end.toISOString();
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${googleToken}` } }
      );
      if (res.status === 401) { setGoogleToken(null); setGoogleEvents([]); return; }
      const data = await res.json();
      setGoogleEvents(data.items || []);
      setTimeout(() => autoRebalance(), 300); // laisse le state se stabiliser avant de vérifier les conflits
    } catch { /* silencieux */ }
    setGoogleLoading(false);
  };

  useEffect(() => {
    if (view === "planner" && googleToken) loadGoogleEvents();
  }, [view, googleToken, plannerStart, plannerViewMode]);

  const sendTaskToGoogle = async (task) => {
    if (!googleToken) { alert("Connecte d'abord Google Calendar."); return; }
    if (!task.scheduled_date) { alert("Planifie d'abord la tâche sur une date."); return; }
    const time = task.scheduled_time || "09:00:00";
    const startDT = `${task.scheduled_date}T${time.length===5?time+":00":time}`;
    const start = new Date(startDT);
    const end = new Date(start.getTime() + (task.duration_minutes || 30)*60*1000);
    try {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: task.title,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      });
      loadGoogleEvents();
    } catch { /* silencieux */ }
  };

  const eventsForDay = (dateKey) => googleEvents.filter(ev => {
    const s = ev.start?.dateTime || ev.start?.date;
    return s && s.slice(0,10) === dateKey;
  });
  // --- fin Google Calendar ---

  // --- Objectifs (Effet Cumulé) ---
  // --- Paramètres ---
  const loadSettings = async () => {
    const rows = await dbList("app_settings");
    if (rows && rows[0]) setSettings(rows[0]);
  };
  const patchSettings = async (patch) => {
    setSettings(prev => ({ ...prev, ...patch }));
    await dbPatch("app_settings", 1, patch);
  };
  // --- fin Paramètres ---

  // --- Habitudes (Life) ---
  const loadHabits = async () => {
    const [h, c] = await Promise.all([
      dbList("habits", "&order=created_at.asc"),
      dbList("habit_completions", "&order=date_key.desc"),
    ]);
    setHabits(h || []);
    const map = {};
    (c || []).forEach(row => { (map[row.habit_id] = map[row.habit_id] || []).push(row.date_key); });
    setHabitCompletions(map);
  };
  const addHabit = async () => {
    const title = newHabitTitle.trim();
    if (!title) return;
    const row = await dbInsert("habits", { title, color: LABEL_COLORS[habits.length % LABEL_COLORS.length], weekly_target: 7, archived: false });
    if (row) setHabits(prev => [...prev, row]);
    setNewHabitTitle("");
  };
  const patchHabit = async (id, patch) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...patch } : h));
    await dbPatch("habits", id, patch);
  };
  const archiveHabit = async (id) => patchHabit(id, { archived: true });
  const deleteHabit = async (id) => {
    setHabits(prev => prev.filter(h => h.id !== id));
    await dbDelete("habits", id);
  };
  const toggleHabitDate = async (habit, dateKey) => {
    const done = (habitCompletions[habit.id] || []).includes(dateKey);
    if (done) {
      const res = await dbList("habit_completions", `&habit_id=eq.${habit.id}&date_key=eq.${dateKey}`);
      if (res && res[0]) await dbDelete("habit_completions", res[0].id);
      setHabitCompletions(prev => ({ ...prev, [habit.id]: (prev[habit.id]||[]).filter(d => d !== dateKey) }));
    } else {
      const row = await dbInsert("habit_completions", { habit_id: habit.id, date_key: dateKey });
      if (row) setHabitCompletions(prev => ({ ...prev, [habit.id]: [...(prev[habit.id]||[]), dateKey] }));
    }
  };
  const toggleHabitToday = (habit) => toggleHabitDate(habit, getTodayKey());

  // Autoplanification des habitudes : place des occurrences flexibles (heure libre, pas fixe)
  // dans le calendrier jusqu'à atteindre l'objectif hebdomadaire (ex: "Sport 3x/semaine"),
  // et retire les occurrences en trop si l'objectif est déjà atteint autrement.
  const ensureHabitSchedule = async () => {
    const todayKey = getTodayKey();
    const weekDaysArr = getWeekDays(getWeekStart()).map(d => toDateKey(d));
    const remainingDays = weekDaysArr.filter(d => d >= todayKey);

    for (const h of habits.filter(x => !x.archived && x.auto_schedule)) {
      const target = h.weekly_target || 3;
      const doneThisWeek = weekDaysArr.filter(d => (habitCompletions[h.id]||[]).includes(d));
      const scheduledThisWeek = plannerTasks.filter(t => t.habit_id === h.id && !t.completed && weekDaysArr.includes(t.scheduled_date));
      const need = target - doneThisWeek.length - scheduledThisWeek.length;

      if (need > 0) {
        const busyDays = new Set([...doneThisWeek, ...scheduledThisWeek.map(t => t.scheduled_date)]);
        const availableDays = remainingDays.filter(d => !busyDays.has(d));
        let created = 0;
        for (const dayKey of availableDays) {
          if (created >= need) break;
          const slot = findNextFreeSlot(dayKey, h.duration_minutes || 30, null, plannerTasks, h.window_start, h.window_end);
          if (slot && slot.dateKey === dayKey) {
            const row = await dbInsert("tasks", {
              title: h.title, priority: "moyenne", recurrence: "aucune",
              scheduled_date: slot.dateKey, scheduled_time: slot.time,
              duration_minutes: h.duration_minutes || 30, habit_id: h.id,
              window_start: h.window_start || null, window_end: h.window_end || null,
              completed: false, locked: false,
            });
            if (row) { setPlannerTasks(prev => [...prev, row]); created++; }
          }
        }
      } else if (need < 0 && scheduledThisWeek.length > 0) {
        // Objectif déjà atteint (ex: cochée manuellement) : retire les occurrences en trop, en gardant les plus proches.
        const excess = scheduledThisWeek
          .sort((a,b) => (b.scheduled_date+b.scheduled_time).localeCompare(a.scheduled_date+a.scheduled_time))
          .slice(0, -need);
        for (const t of excess) {
          setPlannerTasks(prev => prev.filter(pt => pt.id !== t.id));
          await dbDelete("tasks", t.id);
        }
      }
    }
  };

  const habitStreak = (habitId) => {
    const dates = new Set(habitCompletions[habitId] || []);
    let streak = 0; const d = new Date();
    while (dates.has(toDateKey(d))) { streak++; d.setDate(d.getDate()-1); }
    return streak;
  };
  const habitWeekCount = (habitId, weekDaysArr) => {
    const dates = new Set(habitCompletions[habitId] || []);
    return weekDaysArr.filter(d => dates.has(toDateKey(d))).length;
  };
  const habitBestStreak = (habitId) => {
    const dates = habitCompletions[habitId] || [];
    if (dates.length === 0) return 0;
    const sorted = [...new Set(dates)].sort();
    let best = 1, cur = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i-1] + "T00:00:00");
      const next = new Date(sorted[i] + "T00:00:00");
      const diffDays = Math.round((next - prev) / 86400000);
      cur = diffDays === 1 ? cur + 1 : 1;
      if (cur > best) best = cur;
    }
    return best;
  };
  const getLastNWeeks = (n) => {
    const weeks = [];
    let ws = getWeekStart();
    for (let i = 0; i < n; i++) {
      weeks.unshift({ weekStart: ws, days: getWeekDays(ws) });
      ws = new Date(ws); ws.setDate(ws.getDate() - 7);
    }
    return weeks;
  };
  // --- fin Habitudes ---

  // --- Auto-scheduling / Buffer / Replanification / Time tracking ---
  const isSlotFree = (dateKey, hour, durationMin, existingTasksThatDay, googleEventsThatDay) => {
    if (blockedHours.has(hour)) return false;
    const bufferH = settings.buffer_minutes / 60;
    const slotStart = hour, slotEnd = hour + Math.max(durationMin/60, 0.5);
    for (const t of existingTasksThatDay) {
      if (!t.scheduled_time) continue;
      const tH = parseInt(t.scheduled_time.slice(0,2),10) + parseInt(t.scheduled_time.slice(3,5),10)/60;
      const tEnd = tH + (t.duration_minutes||30)/60;
      if (slotStart < tEnd + bufferH && slotEnd + bufferH > tH) return false;
    }
    for (const ev of googleEventsThatDay) {
      const s = ev.start?.dateTime; if (!s) continue;
      const evStart = new Date(s), evEnd = new Date(ev.end?.dateTime || s);
      const evH = evStart.getHours() + evStart.getMinutes()/60;
      const evEndH = evEnd.getHours() + evEnd.getMinutes()/60;
      if (slotStart < evEndH + bufferH && slotEnd + bufferH > evH) return false;
    }
    return true;
  };

  const findNextFreeSlot = (fromDateKey, durationMin, excludeTaskId, tasksSource, windowStart, windowEnd) => {
    const source = tasksSource || plannerTasks;
    const workStartH = parseInt(settings.workday_start.slice(0,2),10);
    const workEndH = parseInt(settings.workday_end.slice(0,2),10);
    // Fenêtre horaire propre à la tâche (ex: "matin seulement") : on l'intersecte avec les horaires de travail.
    const winStartH = windowStart ? parseInt(windowStart.slice(0,2),10) + parseInt(windowStart.slice(3,5),10)/60 : workStartH;
    const winEndH = windowEnd ? parseInt(windowEnd.slice(0,2),10) + parseInt(windowEnd.slice(3,5),10)/60 : workEndH;
    const startH = Math.max(workStartH, Math.floor(winStartH));
    const endH = Math.min(workEndH, Math.ceil(winEndH));
    const todayKey = getTodayKey();
    const now = new Date();
    // Heure actuelle arrondie au prochain multiple de 5 minutes, pour ne jamais proposer un créneau déjà passé.
    const nowH = now.getHours() + (Math.ceil(now.getMinutes()/5)*5)/60;
    for (let dayOffset = 0; dayOffset < 21; dayOffset++) {
      const d = new Date(fromDateKey + "T00:00:00"); d.setDate(d.getDate() + dayOffset);
      const dateKey = toDateKey(d);
      const dayTasksList = source.filter(t => t.scheduled_date === dateKey && t.id !== excludeTaskId);
      if (dayTasksList.length >= 6) continue;
      const dayEvents = googleEvents.filter(ev => { const s = ev.start?.dateTime || ev.start?.date; return s && s.slice(0,10) === dateKey; });
      const isToday = dateKey === todayKey;
      for (let h = startH; h < endH; h++) {
        if (isToday && h + 1 <= nowH) continue; // ce créneau horaire est entièrement dans le passé
        let slotStart = (isToday && h === Math.floor(nowH)) ? nowH : h;
        slotStart = Math.max(slotStart, winStartH); // respecte le début exact de la fenêtre (ex: 06:30)
        if (slotStart + durationMin/60 > winEndH) continue; // dépasserait la fin de la fenêtre
        if (isSlotFree(dateKey, slotStart, durationMin, dayTasksList, dayEvents)) {
          const hh = Math.floor(slotStart), mm = Math.round((slotStart - hh) * 60);
          return { dateKey, time: `${pad2(hh)}:${pad2(mm)}` };
        }
      }
    }
    return null;
  };

  // Replanifie l'ensemble des tâches non terminées :
  // 1) celles déjà présentes dans le calendrier (planificateur), triées par échéance (date/heure prévue) la plus proche d'abord
  // 2) puis celles de l'inbox (sans date), triées par priorité (haute → moyenne → basse)
  const autoScheduleAll = async () => {
    setAutoScheduling(true);
    const todayKey = getTodayKey();
    const priorityRank = { haute: 0, moyenne: 1, basse: 2 };

    let working = [...plannerTasks];
    const scheduledPending = working
      .filter(t => t.scheduled_date && !t.completed && !t.locked)
      .sort((a, b) => (a.scheduled_date + (a.scheduled_time || "")).localeCompare(b.scheduled_date + (b.scheduled_time || "")));
    const inboxPending = working
      .filter(t => !t.scheduled_date && !t.completed && !t.locked)
      .sort((a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1));

    const order = [...scheduledPending, ...inboxPending].map(t => t.id);

    for (const id of order) {
      const task = working.find(t => t.id === id);
      if (!task) continue;
      const slot = findNextFreeSlot(todayKey, task.duration_minutes || 30, task.id, working, task.window_start, task.window_end);
      if (slot) {
        working = working.map(t => t.id === id ? { ...t, scheduled_date: slot.dateKey, scheduled_time: slot.time } : t);
        await patchPlannerTask(id, { scheduled_date: slot.dateKey, scheduled_time: slot.time });
      }
    }
    setAutoScheduling(false);
  };


  // Vérifie si une tâche planifiée est désormais en conflit (retard, routine, autre tâche, événement Google)
  const taskHasConflict = (task, source) => {
    if (!task.scheduled_date || !task.scheduled_time) return false;
    const todayKey = getTodayKey();
    if (task.scheduled_date < todayKey) return true; // jour déjà passé
    const [hh, mm] = task.scheduled_time.split(":").map(Number);
    const start = hh + mm / 60;
    const dur = (task.duration_minutes || 30) / 60;
    const end = start + dur;
    if (task.scheduled_date === todayKey) {
      const now = new Date();
      const nowH = now.getHours() + now.getMinutes() / 60;
      if (end <= nowH) return true; // créneau déjà entièrement passé aujourd'hui
    }
    for (let h = Math.floor(start); h < Math.ceil(end); h++) if (blockedHours.has(h)) return true; // routine
    if (task.window_start) {
      const winStart = parseInt(task.window_start.slice(0,2),10) + parseInt(task.window_start.slice(3,5),10)/60;
      if (start < winStart) return true; // avant sa fenêtre horaire
    }
    if (task.window_end) {
      const winEnd = parseInt(task.window_end.slice(0,2),10) + parseInt(task.window_end.slice(3,5),10)/60;
      if (end > winEnd) return true; // après sa fenêtre horaire
    }
    const bufferH = settings.buffer_minutes / 60;
    const others = source.filter(t => t.id !== task.id && t.scheduled_date === task.scheduled_date && t.scheduled_time && !t.completed);
    for (const o of others) {
      const [ohh, omm] = o.scheduled_time.split(":").map(Number);
      const oStart = ohh + omm / 60, oEnd = oStart + (o.duration_minutes || 30) / 60;
      if (start < oEnd + bufferH && end + bufferH > oStart) return true;
    }
    const dayEvents = googleEvents.filter(ev => { const s = ev.start?.dateTime || ev.start?.date; return s && s.slice(0,10) === task.scheduled_date; });
    for (const ev of dayEvents) {
      const s = ev.start?.dateTime; if (!s) continue;
      const evStart = new Date(s), evEnd = new Date(ev.end?.dateTime || s);
      const evH = evStart.getHours() + evStart.getMinutes()/60, evEndH = evEnd.getHours() + evEnd.getMinutes()/60;
      if (start < evEndH + bufferH && end + bufferH > evH) return true;
    }
    return false;
  };

  // Replanification automatique en continu : déplace en silence les tâches flexibles (non verrouillées)
  // qui prennent du retard ou entrent en conflit avec un événement/une routine/une autre tâche.
  const autoRebalance = async () => {
    if (!settings.auto_reschedule) return;
    let working = [...plannerTasks];
    const priorityRank = { haute: 0, moyenne: 1, basse: 2 };
    const candidates = working
      .filter(t => t.scheduled_date && !t.completed && !t.locked && taskHasConflict(t, working))
      .sort((a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1));
    if (candidates.length === 0) return;
    const todayKey = getTodayKey();
    for (const task of candidates) {
      const searchFrom = task.scheduled_date < todayKey ? todayKey : task.scheduled_date;
      const slot = findNextFreeSlot(searchFrom, task.duration_minutes || 30, task.id, working, task.window_start, task.window_end);
      if (slot) {
        working = working.map(t => t.id === task.id ? { ...t, scheduled_date: slot.dateKey, scheduled_time: slot.time } : t);
        await patchPlannerTask(task.id, { scheduled_date: slot.dateKey, scheduled_time: slot.time });
      }
    }
  };

  // Rééquilibrage automatique périodique : rattrape les conflits qui apparaissent avec le temps
  // qui passe (créneau aujourd'hui désormais dépassé) même sans nouvelle donnée chargée.
  // Gère aussi l'autoplanification des habitudes (occurrences flexibles vers l'objectif hebdomadaire).
  useEffect(() => {
    autoRebalance();
    ensureHabitSchedule();
    const interval = setInterval(() => { autoRebalance(); ensureHabitSchedule(); }, 3 * 60 * 1000); // toutes les 3 min
    const onVisible = () => { if (document.visibilityState === "visible") { autoRebalance(); ensureHabitSchedule(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [plannerTasks, googleEvents, settings.auto_reschedule, settings.buffer_minutes, habits, habitCompletions]);

  const startTimer = (task) => patchPlannerTask(task.id, { timer_started_at: new Date().toISOString() });
  const stopTimer = (task) => {
    if (!task.timer_started_at) return;
    const elapsedMin = Math.max(1, Math.round((Date.now() - new Date(task.timer_started_at).getTime()) / 60000));
    patchPlannerTask(task.id, { timer_started_at: null, time_spent_minutes: (task.time_spent_minutes || 0) + elapsedMin });
  };
  // --- fin Auto-scheduling ---

  // --- Routines éditables ---
  const loadRoutines = async () => {
    const rows = await dbList("routine_items", "&order=sort_order.asc");
    if (rows && rows.length) {
      setMorningRoutine(rows.filter(r => r.period === "morning").map(r => ({ id:r.id, time:r.time, icon:r.icon, label:r.label, desc:r.description })));
      setEveningRoutine(rows.filter(r => r.period === "evening").map(r => ({ id:r.id, time:r.time, icon:r.icon, label:r.label, desc:r.description })));
    }
  };

  const addRoutineItem = async (period) => {
    const list = period === "morning" ? morningRoutine : eveningRoutine;
    const row = await dbInsert("routine_items", { period, time:"08:00", icon:"⭐", label:"Nouvelle étape", description:"", sort_order: list.length+1 });
    if (row) {
      const item = { id:row.id, time:row.time, icon:row.icon, label:row.label, desc:row.description };
      if (period === "morning") setMorningRoutine(prev => [...prev, item]); else setEveningRoutine(prev => [...prev, item]);
      setEditingRoutineId(row.id);
    }
  };

  const patchRoutineItem = async (period, id, patch) => {
    const setList = period === "morning" ? setMorningRoutine : setEveningRoutine;
    setList(prev => prev.map(r => r.id === id ? { ...r, ...patch, desc: patch.description !== undefined ? patch.description : r.desc } : r));
    const dbPatchBody = { ...patch };
    if (dbPatchBody.desc !== undefined) { dbPatchBody.description = dbPatchBody.desc; delete dbPatchBody.desc; }
    await dbPatch("routine_items", id, dbPatchBody);
  };

  const deleteRoutineItem = async (period, id) => {
    const setList = period === "morning" ? setMorningRoutine : setEveningRoutine;
    setList(prev => prev.filter(r => r.id !== id));
    await dbDelete("routine_items", id);
  };
  // --- fin Routines éditables ---

  const loadGoals = async () => {
    setGoalsLoading(true);
    const g = await dbList("goals", "&order=created_at.asc");
    setGoals(g || []);
    setGoalsLoading(false);
  };

  const addGoal = async () => {
    const title = newGoalTitle.trim();
    if (!title || goals.length >= 3) return;
    const row = await dbInsert("goals", { title, color: LABEL_COLORS[goals.length % LABEL_COLORS.length], category: "personnel" });
    if (row) setGoals(prev => [...prev, row]);
    setNewGoalTitle("");
  };

  const patchGoal = async (id, patch) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
    await dbPatch("goals", id, patch);
  };

  const deleteGoal = async (id) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    // Détacher les tâches liées à cet objectif
    plannerTasks.filter(t => t.goal_id === id).forEach(t => patchPlannerTask(t.id, { goal_id: null }));
    await dbDelete("goals", id);
  };

  const goalProgress = (goalId) => {
    const linked = plannerTasks.filter(t => t.goal_id === goalId);
    const done = linked.filter(t => t.completed).length;
    return { done, total: linked.length };
  };
  // --- fin Objectifs ---

  const NAV = [
    { id: "today", label: "🎯 Aujourd'hui" },
    { id: "planner", label: "🗓️ Planificateur" },
    { id: "routines", label: "🌗 Routines" },
    { id: "life", label: "🌱 Life" },
    { id: "bilan", label: "✍️ Bilan" },
    { id: "analyse", label: "📊 Analyse" },
    { id: "settings", label: "⚙️ Paramètres" },
  ];

  const CheckBox = ({ checked, color = "var(--accentGreen)" }) => (
    <div style={{
      width: 26, height: 26, borderRadius: 5, flexShrink: 0,
      border: `2px solid ${checked ? color : "var(--border)"}`,
      background: checked ? color : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
    }}>
      {checked && <span style={{ color: "var(--bg0)", fontSize: 13, fontWeight: "bold" }}>✓</span>}
    </div>
  );

  const last7 = getLast7Days();
  const last6m = getLast6Months();

  const weeklyData = last7.map(key => {
    const s = analyseData?.daily?.[key];
    const d = new Date(key);
    return {
      label: d.toLocaleDateString("fr-FR", { weekday: "short" }),
      tasks: s?.tasksDone ?? 0,
      tasksTotal: s?.tasksTotal ?? 0,
      routine: s?.routineDone ?? 0,
      total: MORNING_ROUTINE.length + EVENING_ROUTINE.length,
      hasData: s?.hasData ?? false,
    };
  });

  const bilanMensuel = last6m.map(mKey => {
    const s = analyseData?.monthly?.[mKey];
    const [y,m] = mKey.split("-").map(Number);
    return {
      label: new Date(y, m-1, 1).toLocaleDateString("fr-FR", { month: "short" }),
      avgTasks: s?.activeDays ? Math.round(s.totalTasks / s.activeDays) : 0,
      avgRoutine: s?.activeDays ? Math.round(s.totalRoutine / s.activeDays) : 0,
      activeDays: s?.activeDays ?? 0,
    };
  });

  const weekTasksDone = weeklyData.reduce((a,d) => a+d.tasks, 0);
  const weekTasksTotal = weeklyData.reduce((a,d) => a+d.tasksTotal, 0);
  const weekRoutine = weeklyData.reduce((a,d) => a+d.routine, 0);
  const weekRoutineMax = weeklyData.length * (MORNING_ROUTINE.length + EVENING_ROUTINE.length);
  const weekHabitDays = getLast7Days();
  const activeHabitsForStats = habits.filter(h => !h.archived);
  const weekHabitsDone = activeHabitsForStats.reduce((a,h) => a + weekHabitDays.filter(d => (habitCompletions[h.id]||[]).includes(d)).length, 0);
  const weekHabitsMax = activeHabitsForStats.length * 7;

  const exportAnalyseCSV = () => {
    const last8Weeks = getLastNWeeks(8);
    const activeHabitsList = habits.filter(h => !h.archived);
    const rows = [
      ["Analyse — export du " + getTodayKey()],
      [],
      ["7 derniers jours"],
      ["Jour","Tâches faites","Tâches planifiées","Routines faites","Routines totales"],
      ...weeklyData.map((d,i) => [last7[i], d.tasks, d.tasksTotal, d.routine, d.total]),
      [],
      ["6 derniers mois"],
      ["Mois","Moy. tâches/jour actif","Moy. routines/jour actif","Jours actifs"],
      ...bilanMensuel.map(m => [m.label, m.avgTasks, m.avgRoutine, m.activeDays]),
      [],
      ["Habitudes — vue d'ensemble"],
      ["Habitude","Cette semaine (/7)","Série en cours (j)","Record (j)","Total complétions"],
      ...activeHabitsList.map(h => [h.title, habitWeekCount(h.id, weekHabitDays.map(d=>new Date(d))), habitStreak(h.id), habitBestStreak(h.id), (habitCompletions[h.id]||[]).length]),
      [],
      ["Habitudes — tendance 8 dernières semaines (jours complétés / 7)"],
      ["Habitude", ...last8Weeks.map(w => toDateKey(w.days[0]))],
      ...activeHabitsList.map(h => [h.title, ...last8Weeks.map(w => habitWeekCount(h.id, w.days))]),
      [],
      ["Objectifs"],
      ["Titre","Tâches faites","Tâches totales"],
      ...goals.map(g => { const {done,total} = goalProgress(g.id); return [g.title, done, total]; }),
    ];
    downloadCSV(`analyse_${getTodayKey()}.csv`, rows);
  };

  const weekScore = (weekTasksTotal + weekRoutineMax + weekHabitsMax) > 0
    ? Math.round((weekTasksDone + weekRoutine + weekHabitsDone) / (weekTasksTotal + weekRoutineMax + weekHabitsMax) * 100) : 0;

  const BarChart = ({ data, maxVal = 9 }) => (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 64 }}>
            <div style={{ flex:1, background:"#68d391", borderRadius:"3px 3px 0 0", height:`${Math.min((d.tasks??0)/maxVal*100,100)}%`, minHeight:(d.tasks??0)>0?3:0, opacity:0.85, transition:"height 0.4s ease" }} />
            <div style={{ flex:1, background:"#8ab4f8", borderRadius:"3px 3px 0 0", height:`${Math.min((d.routine??0)/(d.total??9)*100,100)}%`, minHeight:(d.routine??0)>0?3:0, opacity:0.85, transition:"height 0.4s ease" }} />
          </div>
          <div style={{ fontSize:9, color:"var(--muted)", fontFamily:"monospace", textTransform:"uppercase" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{
      minHeight:"100vh", background:"var(--bg0)", color:"var(--text)", fontFamily:"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      "--bg0": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).bg0,
      "--bg1": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).bg1,
      "--bg2": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).bg2,
      "--bg3": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).bg3,
      "--border": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).border,
      "--border2": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).border2,
      "--text": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).text,
      "--text2": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).text2,
      "--muted": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).muted,
      "--muted2": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).muted2,
      "--headerEnd": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).headerEnd,
      "--accentGold": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).accentGold,
      "--accentOrange": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).accentOrange,
      "--greenMuted": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).greenMuted,
      "--accentBlue": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).accentBlue,
      "--accentGreen": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).accentGreen,
      "--accentAmber": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).accentAmber,
      "--accentOrange2": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).accentOrange2,
      "--accentPurple": (settings.theme==="light"?THEME_LIGHT:THEME_DARK).accentPurple,
    }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,var(--bg2) 0%,var(--headerEnd) 100%)", borderBottom:"1px solid var(--border2)", padding:"18px 24px 0", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:4, color:"var(--greenMuted)", textTransform:"uppercase", fontFamily:"monospace", marginBottom:3, display:"flex", alignItems:"center", gap:8 }}>
              DISCIPLINE SYSTEM
              <span style={{ fontSize:9, color: !isOnline ? "var(--accentOrange2)" : syncQueueLen>0 ? "var(--accentAmber)" : syncing ? "var(--accentAmber)" : syncOk === true ? "var(--accentGreen)" : syncOk === false ? "var(--accentOrange2)" : "var(--muted2)" }}
                title={!isOnline ? "Hors ligne — tout est sauvegardé localement et se synchronisera au retour du réseau" : syncQueueLen>0 ? `${syncQueueLen} changement(s) en attente de synchronisation` : "Synchronisé avec le cloud"}>
                {!isOnline ? "● hors ligne (local)" : syncQueueLen>0 ? `⟳ sync ${syncQueueLen} en attente` : syncing ? "⟳ sync..." : syncOk === true ? "● en ligne" : syncOk === false ? "● hors ligne" : ""}
              </span>
            </div>
            <div style={{ fontSize:20, fontWeight:"bold", color:"var(--accentGold)", letterSpacing:0.5 }}>{dateStr}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"flex-end" }}>
              <div style={{ fontSize:26, fontWeight:"bold", color:"var(--accentBlue)", fontFamily:"monospace" }}>{timeStr}</div>
              <div onClick={() => setShowShortcuts(true)} title="Raccourcis clavier (?)" style={{ width:22, height:22, borderRadius:"50%", border:"1px solid var(--border2)", color:"var(--muted)", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>?</div>
            </div>
            <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:1, marginTop:2 }}>
              {completedMorn}/{MORNING_ROUTINE.length} matin · {completedTasks}/{todayPlannerTasksGlobal.length || 6} tâches · {completedEve}/{EVENING_ROUTINE.length} soir
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:4, overflowX:"auto" }}>
          {NAV.map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)} style={{
              padding:"8px 14px", borderRadius:"6px 6px 0 0", border:"none", cursor:"pointer",
              fontSize:11, fontFamily:"monospace", letterSpacing:0.5, whiteSpace:"nowrap",
              background: view===tab.id ? "var(--bg0)" : "transparent",
              color: view===tab.id ? "var(--accentGold)" : "var(--muted)",
              borderTop: view===tab.id ? "1px solid var(--border2)" : "1px solid transparent",
              borderLeft: view===tab.id ? "1px solid var(--border2)" : "1px solid transparent",
              borderRight: view===tab.id ? "1px solid var(--border2)" : "1px solid transparent",
              fontWeight: view===tab.id ? "bold" : "normal", transition:"all 0.15s",
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:780, margin:"0 auto", padding:"22px 18px" }}>

        {/* AUJOURD'HUI — vue unifiée (fusion Aujourd'hui + Dashboard) */}
        {view==="today" && (() => {
          const todayKey = getTodayKey();
          const todayPlannerTasks = plannerTasks.filter(t => t.scheduled_date === todayKey);
          const doneToday = todayPlannerTasks.filter(t => t.completed).length;
          return (
            <div>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:10, letterSpacing:4, color:"var(--accentGreen)", textTransform:"uppercase", marginBottom:5 }}>Vue unifiée</div>
                <div style={{ fontSize:26, color:"var(--text)", fontWeight:"bold", textTransform:"capitalize" }}>{dateStr}</div>
              </div>

              {/* Jauges */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:22 }}>
                {[
                  { label:"Routine Matin", done:completedMorn, total:MORNING_ROUTINE.length, color:"var(--accentAmber)" },
                  { label:"Tâches du jour", done:doneToday, total:Math.max(todayPlannerTasks.length,1), color:"var(--accentGreen)" },
                  { label:"Routine Soir", done:completedEve, total:EVENING_ROUTINE.length, color:"var(--accentBlue)" },
                ].map(({ label,done,total,color }) => {
                  const pct = Math.round((done/total)*100);
                  const circ = 2*Math.PI*30;
                  return (
                    <div key={label} style={{ background:"var(--bg1)", borderRadius:10, padding:"18px 12px", border:"1px solid var(--border)", textAlign:"center" }}>
                      <svg width="70" height="70" viewBox="0 0 70 70" style={{ display:"block", margin:"0 auto 10px" }}>
                        <circle cx="35" cy="35" r="30" fill="none" stroke="var(--border)" strokeWidth="5"/>
                        <circle cx="35" cy="35" r="30" fill="none" stroke={color} strokeWidth="5"
                          strokeDasharray={`${(pct/100)*circ} ${circ}`} strokeLinecap="round"
                          transform="rotate(-90 35 35)" style={{ transition:"stroke-dasharray 0.5s ease" }}/>
                        <text x="35" y="39" textAnchor="middle" fill={color} fontSize="14" fontWeight="bold" fontFamily="monospace">{pct}%</text>
                      </svg>
                      <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:2, textTransform:"uppercase" }}>{label}</div>
                      <div style={{ fontSize:16, color, fontWeight:"bold", marginTop:3 }}>{done}/{total}</div>
                    </div>
                  );
                })}
              </div>

              {/* Tâches du jour (max 6, gérées depuis le Planificateur) */}
              <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:16 }}>
                <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentGreen)", textTransform:"uppercase", marginBottom:12 }}>✅ Tâches du jour ({doneToday}/{todayPlannerTasks.length || 0} · max 6)</div>
                {todayPlannerTasks.length === 0 && <div style={{ fontSize:11, color:"var(--muted2)", fontStyle:"italic" }}>Aucune tâche planifiée aujourd'hui — ajoute-en depuis le 🗓️ Planificateur.</div>}
                {todayPlannerTasks.map(t => {
                  const pr = PRIORITIES.find(p => p.val === t.priority) || PRIORITIES[1];
                  return (
                    <div key={t.id} onClick={() => toggleTaskDone(t)} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid var(--border2)", cursor:"pointer" }}>
                      <CheckBox checked={!!t.completed} color={pr.color}/>
                      {t.scheduled_time && <span style={{ fontSize:10, color:"var(--accentBlue)", fontFamily:"monospace" }}>{t.scheduled_time.slice(0,5)}</span>}
                      <div style={{ fontSize:13, flex:1, color:t.completed?"#3a5a3a":"var(--text2)", textDecoration:t.completed?"line-through":"none" }}>{t.title}</div>
                    </div>
                  );
                })}
              </div>

              {/* Routines compactes */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"14px 16px" }}>
                  <div style={{ fontSize:10, letterSpacing:2, color:"var(--accentAmber)", textTransform:"uppercase", marginBottom:10 }}>🌅 Matin ({completedMorn}/{MORNING_ROUTINE.length})</div>
                  {MORNING_ROUTINE.map(r => (
                    <div key={r.id} onClick={() => toggleRoutine(r.id)} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", cursor:"pointer" }}>
                      <CheckBox checked={!!checkedRoutine[r.id]} color="var(--accentAmber)"/>
                      <div style={{ fontSize:12, color:checkedRoutine[r.id]?"#4a7a3a":"var(--text2)", textDecoration:checkedRoutine[r.id]?"line-through":"none" }}>{r.icon} {r.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"14px 16px" }}>
                  <div style={{ fontSize:10, letterSpacing:2, color:"var(--accentBlue)", textTransform:"uppercase", marginBottom:10 }}>🌙 Soir ({completedEve}/{EVENING_ROUTINE.length})</div>
                  {EVENING_ROUTINE.map(r => (
                    <div key={r.id} onClick={() => toggleRoutine(r.id)} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", cursor:"pointer" }}>
                      <CheckBox checked={!!checkedRoutine[r.id]} color="var(--accentBlue)"/>
                      <div style={{ fontSize:12, color:checkedRoutine[r.id]?"#3a3a7a":"var(--text2)", textDecoration:checkedRoutine[r.id]?"line-through":"none" }}>{r.icon} {r.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div onClick={() => setView("bilan")} style={{ background:"var(--bg2)", borderRadius:9, border:"1px solid var(--border)", padding:"14px 18px", textAlign:"center", cursor:"pointer", marginBottom:12 }}>
                <div style={{ fontSize:12, color:"var(--text2)" }}>✍️ Faire le bilan de la journée →</div>
              </div>

              <div style={{ background:"var(--bg2)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 20px", textAlign:"center" }}>
                <div style={{ fontSize:14, color:"var(--text2)", fontStyle:"italic", lineHeight:1.9 }}>
                  "La discipline n'est pas une contrainte.<br/>C'est la forme la plus haute de liberté."
                </div>
                <div style={{ fontSize:10, color:"var(--muted2)", letterSpacing:3, marginTop:10, textTransform:"uppercase" }}>Système de Discipline Personnelle</div>
              </div>
            </div>
          );
        })()}

        {/* ROUTINES — fusion Matin + Soir, éditable */}
        {view==="routines" && (() => {
          const RoutineRow = ({ r, period, color, bgOn }) => {
            const isEditing = editingRoutineId === r.id;
            if (isEditing) {
              return (
                <div style={{ padding:"12px", marginBottom:8, background:"var(--bg3)", borderRadius:9, border:`1px solid ${color}` }}>
                  <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                    <input value={r.icon} onChange={e => patchRoutineItem(period, r.id, { icon: e.target.value })} style={{ width:40, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:5, padding:"6px", color:"var(--text)", fontSize:14, textAlign:"center", outline:"none" }} />
                    <input type="time" value={r.time} onChange={e => patchRoutineItem(period, r.id, { time: e.target.value })} style={{ width:100, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:5, padding:"6px", color:"var(--text)", fontSize:12, outline:"none" }} />
                    <input value={r.label} onChange={e => patchRoutineItem(period, r.id, { label: e.target.value })} style={{ flex:1, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:5, padding:"6px 8px", color:"var(--text)", fontSize:13, outline:"none" }} />
                  </div>
                  <textarea value={r.desc} onChange={e => patchRoutineItem(period, r.id, { desc: e.target.value })} rows={2}
                    style={{ width:"100%", boxSizing:"border-box", background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:5, padding:"6px 8px", color:"var(--text2)", fontSize:12, outline:"none", resize:"vertical", marginBottom:6 }} />
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => setEditingRoutineId(null)} style={{ flex:1, background:"#68d391", border:"none", borderRadius:5, padding:"6px 0", color:"var(--bg0)", fontSize:12, fontWeight:"bold", cursor:"pointer" }}>OK</button>
                    <button onClick={() => deleteRoutineItem(period, r.id)} style={{ background:"#fb8a4a18", border:"1px solid #fb8a4a55", borderRadius:5, padding:"6px 12px", color:"var(--accentOrange2)", fontSize:12, cursor:"pointer" }}>🗑️</button>
                  </div>
                </div>
              );
            }
            return (
              <div style={{ display:"flex", gap:14, padding:"14px", marginBottom:8, background:checkedRoutine[r.id]?bgOn:"var(--bg1)", borderRadius:9, border:`1px solid ${checkedRoutine[r.id]?color+"55":"var(--border)"}`, transition:"all 0.2s" }}>
                <div onClick={() => toggleRoutine(r.id)} style={{ display:"flex", gap:14, flex:1, cursor:"pointer" }}>
                  <div style={{ flexShrink:0, width:44, textAlign:"center", paddingTop:2 }}>
                    <div style={{ fontSize:20 }}>{r.icon}</div>
                    <div style={{ fontSize:10, color, fontFamily:"monospace", marginTop:2 }}>{r.time}</div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:"bold", marginBottom:4, color:checkedRoutine[r.id]?"#4a7a3a":"var(--accentGold)", textDecoration:checkedRoutine[r.id]?"line-through":"none" }}>{r.label}</div>
                    <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>{r.desc}</div>
                  </div>
                  <CheckBox checked={!!checkedRoutine[r.id]} color={color}/>
                </div>
                <div onClick={() => setEditingRoutineId(r.id)} style={{ fontSize:12, color:"var(--muted2)", cursor:"pointer", paddingLeft:6 }}>✏️</div>
              </div>
            );
          };

          return (
            <div>
              <div style={{ marginBottom:22 }}>
                <div style={{ fontSize:10, letterSpacing:4, color:"var(--accentAmber)", textTransform:"uppercase", marginBottom:5 }}>Rituels quotidiens</div>
                <div style={{ fontSize:26, color:"var(--text)", fontWeight:"bold" }}>Routines</div>
                <div style={{ fontSize:12, color:"var(--muted)", marginTop:5 }}>{completedMorn+completedEve}/{MORNING_ROUTINE.length+EVENING_ROUTINE.length} étapes accomplies · clique ✏️ pour modifier</div>
              </div>

              <div style={{ fontSize:11, letterSpacing:2, color:"var(--accentAmber)", textTransform:"uppercase", marginBottom:10 }}>🌅 Matin ({completedMorn}/{MORNING_ROUTINE.length})</div>
              {MORNING_ROUTINE.map(r => <RoutineRow key={r.id} r={r} period="morning" color="var(--accentAmber)" bgOn="#68d39122" />)}
              <button onClick={() => addRoutineItem("morning")} style={{ width:"100%", background:"var(--bg3)", border:"1px dashed var(--border)", borderRadius:9, padding:"8px", color:"var(--muted2)", fontSize:12, cursor:"pointer", marginBottom:20 }}>+ Ajouter une étape matin</button>

              <div style={{ fontSize:11, letterSpacing:2, color:"var(--accentBlue)", textTransform:"uppercase", margin:"22px 0 10px" }}>🌙 Soir ({completedEve}/{EVENING_ROUTINE.length})</div>
              {EVENING_ROUTINE.map(r => <RoutineRow key={r.id} r={r} period="evening" color="var(--accentBlue)" bgOn="#8ab4f822" />)}
              <button onClick={() => addRoutineItem("evening")} style={{ width:"100%", background:"var(--bg3)", border:"1px dashed var(--border)", borderRadius:9, padding:"8px", color:"var(--muted2)", fontSize:12, cursor:"pointer", marginBottom:20 }}>+ Ajouter une étape soir</button>

              <div style={{ background:"var(--bg3)", borderRadius:9, border:"1px solid var(--border2)", padding:"16px 18px", textAlign:"center", marginTop:12 }}>
                <div style={{ fontSize:13, color:"#6a7a9a", lineHeight:1.8, fontStyle:"italic" }}>
                  La discipline du soir construit la clarté du matin.
                </div>
              </div>
            </div>
          );
        })()}

        {/* PLANIFICATEUR */}
        {view==="planner" && (() => {
          const rangeLabel = rangeCount === 1
            ? weekDays[0].toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"short"})
            : `${weekDays[0].toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} — ${weekDays[weekDays.length-1].toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}`;
          const editingTask = plannerTasks.find(t => t.id === editingTaskId);

          const TaskCard = ({ task, checkable = true, compact = false, style = {} }) => {
            const lbl = labelById(task.label_id);
            const pr = PRIORITIES.find(p => p.val === task.priority) || PRIORITIES[1];
            if (compact) {
              const isResizing = resizingTaskId === task.id;
              return (
                <div
                  draggable={!isResizing}
                  onDragStart={() => setDragTaskId(task.id)}
                  onClick={(e) => { e.stopPropagation(); if (!isResizing) setEditingTaskId(task.id); }}
                  style={{
                    position:"relative",
                    background:"var(--bg1)", border:`1px solid ${lbl?lbl.color+"55":"var(--border)"}`, borderLeft:`3px solid ${pr.color}`,
                    borderRadius:5, padding:"3px 6px", cursor: isResizing ? "ns-resize" : "grab", opacity: task.completed?0.45:1,
                    height:"100%", overflow:"hidden", boxSizing:"border-box",
                    boxShadow: isResizing ? `0 0 0 2px ${pr.color}` : "0 1px 3px #00000033",
                    ...style,
                  }}
                >
                  <div style={{ fontSize:11, lineHeight:1.2, color: task.completed?"#3a5a3a":"var(--text2)", textDecoration:task.completed?"line-through":"none", fontWeight:500 }}>
                    {task.locked && <span title="Verrouillée — jamais déplacée automatiquement">🔒 </span>}{task.title}
                  </div>
                  <div style={{ fontSize:9, color:"var(--muted)", fontFamily:"monospace", marginTop:1 }}>
                    {task.scheduled_time?.slice(0,5)}{task.duration_minutes ? ` · ${task.duration_minutes}min` : ""}
                  </div>
                  {/* Poignée de redimensionnement — glisser pour changer la durée, comme sur Google Agenda / Reclaim */}
                  <div
                    onMouseDown={(e) => startResizeTask(task, e)}
                    onTouchStart={(e) => startResizeTask(task, e)}
                    style={{ position:"absolute", left:0, right:0, bottom:0, height:7, cursor:"ns-resize", display:"flex", alignItems:"flex-end", justifyContent:"center" }}
                  >
                    <div style={{ width:22, height:3, borderRadius:2, background: isResizing ? pr.color : "var(--muted2)", opacity: isResizing?1:0.6 }} />
                  </div>
                </div>
              );
            }
            return (
              <div
                draggable
                onDragStart={() => setDragTaskId(task.id)}
                onClick={(e) => { e.stopPropagation(); setEditingTaskId(task.id); }}
                style={{
                  background:"var(--bg1)", border:`1px solid ${lbl?lbl.color+"55":"var(--border)"}`, borderLeft:`3px solid ${pr.color}`,
                  borderRadius:6, padding:"7px 9px", marginBottom:6, cursor:"grab", opacity: task.completed?0.4:1,
                }}
              >
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  {checkable ? (
                    <div onClick={(e) => { e.stopPropagation(); toggleTaskDone(task); }} style={{ cursor:"pointer" }}>
                      <CheckBox checked={!!task.completed} color={pr.color} />
                    </div>
                  ) : (
                    <div style={{ width:10, height:10, borderRadius:"50%", border:`2px solid ${pr.color}55`, flexShrink:0 }} title="Planifie cette tâche sur une date pour pouvoir la cocher" />
                  )}
                  <div style={{ flex:1, fontSize:12, color: task.completed?"#3a5a3a":"var(--text2)", textDecoration:task.completed?"line-through":"none" }}>
                    {task.locked && <span title="Verrouillée — jamais déplacée automatiquement">🔒 </span>}{task.title}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, marginTop:5, flexWrap:"wrap" }}>
                  {task.duration_minutes && <span style={{ fontSize:9, color:"var(--muted)", fontFamily:"monospace" }}>⏱ {task.duration_minutes}min</span>}
                  {task.scheduled_time && <span style={{ fontSize:9, color:"var(--accentBlue)", fontFamily:"monospace" }}>{task.scheduled_time.slice(0,5)}</span>}
                  {lbl && <span style={{ fontSize:9, color:lbl.color, background:lbl.color+"22", borderRadius:4, padding:"1px 6px" }}>{lbl.name}</span>}
                  {task.recurrence!=="aucune" && <span style={{ fontSize:9, color:"var(--muted)" }}>🔁 {RECURRENCES.find(r=>r.val===task.recurrence)?.label}</span>}
                  {task.window_start && <span style={{ fontSize:9, color:"var(--accentBlue)" }} title={`Fenêtre : ${task.window_start.slice(0,5)}–${task.window_end?.slice(0,5)}`}>🕘 {task.window_start.slice(0,5)}–{task.window_end?.slice(0,5)}</span>}
                  <span onClick={(e) => { e.stopPropagation(); patchPlannerTask(task.id, { locked: !task.locked }); }}
                    title={task.locked ? "Verrouillée — clique pour rendre flexible" : "Flexible — clique pour verrouiller"}
                    style={{ fontSize:9, color: task.locked?"var(--accentOrange2)":"var(--muted2)", cursor:"pointer" }}>{task.locked ? "🔒" : "🔓"}</span>
                </div>
              </div>
            );
          };

          const shiftRange = (dir) => {
            setPlannerStart(d => { const n = new Date(d); n.setDate(n.getDate() + dir*rangeCount); return n; });
          };

          return (
            <div>
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:10, letterSpacing:4, color:"var(--accentBlue)", textTransform:"uppercase", marginBottom:5 }}>Organisation</div>
                <div style={{ fontSize:26, color:"var(--text)", fontWeight:"bold" }}>Planificateur</div>
                <div style={{ fontSize:12, color:"var(--muted)", marginTop:5 }}>Clique un jour ou un créneau pour créer une tâche · glisse pour replanifier</div>
              </div>

              {/* Widget "ce qui reste à faire maintenant" */}
              {(() => {
                const remainingToday = todayPlannerTasksGlobal.filter(t => !t.completed).sort((a,b) => (a.scheduled_time||"99:99").localeCompare(b.scheduled_time||"99:99"));
                if (remainingToday.length === 0) return null;
                const next = remainingToday[0];
                return (
                  <div style={{ background:"#8ab4f818", border:"1px solid #8ab4f855", borderRadius:9, padding:"10px 14px", marginBottom:14, display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}
                    onClick={() => setEditingTaskId(next.id)}>
                    <span style={{ fontSize:11, color:"var(--accentBlue)", fontFamily:"monospace" }}>⏳ {remainingToday.length} restante{remainingToday.length>1?"s":""}</span>
                    <span style={{ fontSize:12, color:"var(--text2)", flex:1 }}>
                      Maintenant : <b>{next.title}</b>{next.scheduled_time && <span style={{ color:"var(--muted)" }}> · {next.scheduled_time.slice(0,5)}</span>}
                    </span>
                  </div>
                );
              })()}

              {/* Sélecteur de vue */}
              <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                {[["day","Jour"],["3day","3 jours"],["week","Semaine"]].map(([m,l]) => (
                  <button key={m} onClick={() => setPlannerViewMode(m)} style={{
                    background: plannerViewMode===m ? "#8ab4f822" : "var(--bg1)", border:`1px solid ${plannerViewMode===m?"var(--accentBlue)":"var(--border)"}`,
                    borderRadius:6, color: plannerViewMode===m?"var(--accentBlue)":"var(--muted)", padding:"5px 12px", cursor:"pointer", fontSize:11 }}>{l}</button>
                ))}
              </div>

              {/* Barre navigation */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                <button onClick={() => shiftRange(-1)}
                  style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, color:"var(--accentBlue)", padding:"6px 12px", cursor:"pointer", fontSize:13 }}>←</button>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, color:"var(--text2)", fontFamily:"monospace", textTransform:"capitalize" }}>{rangeLabel}</span>
                  <button onClick={() => setPlannerStart(startOfDay())} style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, color:"var(--muted)", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>Aujourd'hui</button>
                  <button onClick={() => setShowLabelManager(s => !s)} style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, color:"var(--accentPurple)", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>🏷️ Étiquettes</button>
                  {(inboxTasks.length > 0 || plannerTasks.some(t => t.scheduled_date && !t.completed)) && (
                    <button onClick={autoScheduleAll} disabled={autoScheduling}
                      title="Replanifie toutes les tâches non terminées : d'abord celles déjà dans le calendrier (par échéance), puis l'inbox (par priorité)"
                      style={{ background:"#68d39118", border:"1px solid #68d39155", borderRadius:6, color:"var(--accentGreen)", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>
                      {autoScheduling ? "⟳ Planification..." : "🪄 Autoplanifier"}
                    </button>
                  )}
                  <button onClick={() => duplicateDay(rangeCount===1 ? toDateKey(weekDays[0]) : toDateKey(startOfDay()))}
                    title="Copie les tâches du jour affiché (ou d'aujourd'hui) sur le lendemain"
                    style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, color:"var(--accentPurple)", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>📋 Dupliquer le jour →</button>
                  <button onClick={() => duplicateWeek(getWeekStart(weekDays[0]))}
                    title="Copie toutes les tâches de la semaine affichée sur la semaine suivante"
                    style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, color:"var(--accentPurple)", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>📋 Dupliquer la semaine →</button>
                  {googleToken ? (
                    <button onClick={disconnectGoogle} style={{ background:"#68d39118", border:"1px solid #68d39155", borderRadius:6, color:"var(--accentGreen)", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>📅 Google connecté {googleLoading?"⟳":""}</button>
                  ) : (
                    <button onClick={connectGoogle} style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, color:"var(--accentBlue)", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>📅 Connecter Google Calendar</button>
                  )}
                </div>
                <button onClick={() => shiftRange(1)}
                  style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, color:"var(--accentBlue)", padding:"6px 12px", cursor:"pointer", fontSize:13 }}>→</button>
              </div>

              {showLabelManager && (
                <div style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:10, padding:14, marginBottom:14 }}>
                  <div style={{ fontSize:10, letterSpacing:2, color:"var(--accentPurple)", textTransform:"uppercase", marginBottom:10 }}>Gérer les étiquettes</div>
                  {plannerLabels.map(l => (
                    <div key={l.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <div style={{ width:12, height:12, borderRadius:3, background:l.color }} />
                      <span style={{ fontSize:12, color:"var(--text2)", flex:1 }}>{l.name}</span>
                      <button onClick={() => deleteLabel(l.id)} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:12 }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:6, marginTop:10, alignItems:"center", flexWrap:"wrap" }}>
                    <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)} placeholder="Nom de l'étiquette"
                      style={{ flex:1, minWidth:120, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:5, padding:"6px 10px", color:"var(--text)", fontSize:12, outline:"none" }} />
                    {LABEL_COLORS.map(c => (
                      <div key={c} onClick={() => setNewLabelColor(c)} style={{ width:18, height:18, borderRadius:4, background:c, cursor:"pointer", border: newLabelColor===c?"2px solid #fff":"2px solid transparent" }} />
                    ))}
                    <button onClick={addLabel} style={{ background:"#68d391", border:"none", borderRadius:5, padding:"6px 12px", color:"var(--bg0)", fontSize:12, fontWeight:"bold", cursor:"pointer" }}>+ Ajouter</button>
                  </div>
                </div>
              )}

              {plannerLoading ? (
                <div style={{ textAlign:"center", padding:40, color:"var(--muted)", fontFamily:"monospace" }}>Chargement...</div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:`200px repeat(${weekDays.length}, minmax(150px,1fr))`, gap:8, overflowX:"auto" }}>
                  {/* Inbox */}
                  <div onDragOver={e => e.preventDefault()} onDrop={dropOnInbox}
                    style={{ background:"var(--bg3)", border:"1px dashed var(--border)", borderRadius:9, padding:10, minHeight:200 }}>
                    <div style={{ fontSize:10, letterSpacing:2, color:"var(--muted)", textTransform:"uppercase", marginBottom:8 }}>📥 Inbox</div>
                    <div style={{ display:"flex", gap:4, marginBottom:8 }}>
                      <input value={newInboxTitle} onChange={e => setNewInboxTitle(e.target.value)}
                        onKeyDown={e => e.key==="Enter" && addInboxTask()} placeholder="Nouvelle tâche..."
                        style={{ flex:1, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:5, padding:"6px 8px", color:"var(--text)", fontSize:11, outline:"none" }} />
                      <button onClick={addInboxTask} style={{ background:"var(--border)", border:"none", borderRadius:5, color:"var(--accentGreen)", padding:"0 8px", cursor:"pointer" }}>+</button>
                    </div>
                    {inboxTasks.map(t => <TaskCard key={t.id} task={t} checkable={false} />)}
                    {inboxTasks.length===0 && <div style={{ fontSize:11, color:"var(--muted2)", textAlign:"center", marginTop:10 }}>Vide</div>}
                  </div>

                  {/* Colonnes jours */}
                  {weekDays.map(day => {
                    const dateKey = toDateKey(day);
                    const isToday = dateKey === getTodayKey();
                    const dayTasks = tasksForDay(dateKey);
                    const untimed = dayTasks.filter(t => !t.scheduled_time);
                    return (
                      <div key={dateKey}
                        onDragOver={e => e.preventDefault()} onDrop={() => dropOnDay(dateKey)}
                        style={{ background: isToday?"#68d39118":"var(--bg3)", border:`1px solid ${isToday?"#68d39155":"var(--border2)"}`, borderRadius:9, padding:8, minWidth:130 }}>
                        <div onClick={() => addTaskAt(dateKey)} style={{ textAlign:"center", marginBottom:8, cursor:"pointer" }} title="Cliquer pour ajouter une tâche ce jour">
                          <div style={{ fontSize:10, color:isToday?"var(--accentGreen)":"var(--muted)", fontFamily:"monospace", textTransform:"uppercase" }}>{day.toLocaleDateString("fr-FR",{weekday:"short"})}</div>
                          <div style={{ fontSize:15, color:isToday?"var(--accentGreen)":"var(--text2)", fontWeight:"bold" }}>{day.getDate()} <span style={{fontSize:11}}>+</span></div>
                          <div style={{ fontSize:9, color: dayTasks.length>=6 ? "var(--accentOrange2)" : "var(--muted2)", fontFamily:"monospace" }}>{dayTasks.length}/6</div>
                        </div>
                        {eventsForDay(dateKey).map(ev => (
                          <div key={ev.id} style={{ background:"#c084fc18", border:"1px solid #c084fc55", borderRadius:6, padding:"5px 8px", marginBottom:6, fontSize:11, color:"var(--accentPurple)" }}>
                            📅 {ev.summary || "(sans titre)"}
                            {ev.start?.dateTime && <div style={{ fontSize:9, color:"#8a6ab0", marginTop:2 }}>{new Date(ev.start.dateTime).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>}
                          </div>
                        ))}
                        {untimed.map(t => <TaskCard key={t.id} task={t} />)}
                        <div style={{ position:"relative", borderTop:"1px solid var(--border2)", marginTop:4 }}>
                          {/* Colonne des heures — toujours visible, jamais recouverte par les tâches */}
                          <div style={{ position:"absolute", top:0, left:0, width:24, height: PLANNER_HOURS.length * HOUR_PX, zIndex:3, background:"var(--bg3)", pointerEvents:"none" }}>
                            {PLANNER_HOURS.map((h, idx) => {
                              const blocked = blockedHours.has(h);
                              return (
                                <div key={h} style={{ position:"absolute", top: idx*HOUR_PX, left:0, width:24, height:HOUR_PX, boxSizing:"border-box", paddingTop:2 }}>
                                  <div style={{ fontSize:8, color: blocked ? "#5a4a3a" : "var(--muted2)", fontFamily:"monospace", textAlign:"right", paddingRight:2 }}>{pad2(h)}h{blocked ? " 🔒" : ""}</div>
                                </div>
                              );
                            })}
                          </div>
                          {/* Zone des créneaux et tâches, décalée à droite de la colonne des heures */}
                          <div style={{ position:"relative", marginLeft:24 }}>
                            {PLANNER_HOURS.map((h, idx) => {
                              const blocked = blockedHours.has(h);
                              return (
                                <div key={h}
                                  onDragOver={e => { if (!blocked) e.preventDefault(); }}
                                  onDrop={(e) => { e.stopPropagation(); if (!blocked) dropOnSlot(dateKey, h); }}
                                  onClick={() => { if (!blocked) addTaskAt(dateKey, `${pad2(h)}:00`); }}
                                  style={{ position:"absolute", top: idx*HOUR_PX, left:0, right:0, height:HOUR_PX,
                                    borderBottom:"1px solid var(--border2)",
                                    cursor: blocked ? "not-allowed" : "pointer",
                                    background: blocked ? "#1a141422" : "transparent" }}
                                  title={blocked ? "Créneau réservé à une routine" : "Cliquer pour un time-blocking à cette heure"} />
                              );
                            })}
                            {/* Espaceur pour donner sa hauteur totale au conteneur */}
                            <div style={{ height: PLANNER_HOURS.length * HOUR_PX }} />
                            {/* Blocs de tâches positionnés selon leur heure et durée, façon Google Agenda */}
                            {layoutDayTimedTasks(dayTasks.filter(t => t.scheduled_time), PLANNER_HOURS[0]).map(({ task, top, height, leftPct, widthPct }) => (
                              <div key={task.id} style={{ position:"absolute", top, height, left:`${leftPct}%`, width:`${widthPct}%`, zIndex:2, pointerEvents:"auto" }}>
                                <TaskCard task={task} compact />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Editeur de tâche */}
              {editingTask && (
                <div onClick={() => setEditingTaskId(null)} style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
                  <div onClick={e => e.stopPropagation()} style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:10, padding:20, width:320, maxWidth:"90vw" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                      <div onClick={() => toggleTaskDone(editingTask)} style={{ cursor:"pointer" }} title={editingTask.completed ? "Marquer non terminée" : "Marquer terminée"}>
                        <CheckBox checked={!!editingTask.completed} color="var(--accentGreen)" />
                      </div>
                      <div style={{ fontSize:10, letterSpacing:2, color:"var(--accentBlue)", textTransform:"uppercase", flex:1 }}>Modifier la tâche</div>
                      <span onClick={() => { deletePlannerTask(editingTask.id); setEditingTaskId(null); }} title="Supprimer"
                        style={{ fontSize:15, cursor:"pointer", color:"var(--accentOrange2)" }}>🗑️</span>
                      <span onClick={() => setEditingTaskId(null)} title="Fermer"
                        style={{ fontSize:15, cursor:"pointer", color:"var(--muted)" }}>✕</span>
                    </div>
                    <input value={editingTask.title} onChange={e => patchPlannerTask(editingTask.id, { title: e.target.value })}
                      autoFocus
                      style={{ width:"100%", boxSizing:"border-box", background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:6, padding:"8px 10px", color:"var(--text)", fontSize:13, marginBottom:10, outline:"none", textDecoration: editingTask.completed?"line-through":"none" }} />

                    <div style={{ fontSize:10, color:"var(--muted)", marginBottom:5 }}>📅 Échéance (date & heure)</div>
                    <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                      <input type="date" value={editingTask.scheduled_date || ""} onChange={e => patchPlannerTask(editingTask.id, { scheduled_date: e.target.value || null })}
                        style={{ flex:1, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:6, padding:"7px 8px", color:"var(--text)", fontSize:12, outline:"none" }} />
                      <input type="time" value={editingTask.scheduled_time ? editingTask.scheduled_time.slice(0,5) : ""} onChange={e => patchPlannerTask(editingTask.id, { scheduled_time: e.target.value ? e.target.value+":00" : null })}
                        style={{ width:90, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:6, padding:"7px 8px", color:"var(--text)", fontSize:12, outline:"none" }} />
                      <div onClick={() => patchPlannerTask(editingTask.id, { locked: !editingTask.locked })}
                        title={editingTask.locked ? "Verrouillée — cliquer pour rendre flexible" : "Flexible — cliquer pour verrouiller"}
                        style={{ width:34, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:6, cursor:"pointer", fontSize:15,
                          background: editingTask.locked ? "#fb8a4a18" : "var(--bg3)", border:`1px solid ${editingTask.locked?"#fb8a4a55":"var(--border)"}` }}>{editingTask.locked ? "🔒" : "🔓"}</div>
                    </div>
                    {!editingTask.scheduled_date && <div style={{ fontSize:10, color:"var(--muted2)", marginBottom:10, fontStyle:"italic" }}>Sans date = reste dans l'Inbox</div>}

                    <div style={{ fontSize:10, color:"var(--muted)", marginBottom:5 }}>⏱ Durée</div>
                    <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                      {[15,30,45,60,90,120].map(m => (
                        <div key={m} onClick={() => patchPlannerTask(editingTask.id, { duration_minutes: m })}
                          style={{ flex:1, textAlign:"center", padding:"5px 0", borderRadius:6, cursor:"pointer", fontSize:10,
                            background: editingTask.duration_minutes===m ? "#8ab4f822" : "var(--bg3)",
                            border:`1px solid ${editingTask.duration_minutes===m?"var(--accentBlue)":"var(--border)"}`,
                            color: editingTask.duration_minutes===m?"var(--accentBlue)":"var(--muted)" }}>{m>=60?`${m/60}h${m%60||""}`:`${m}m`}</div>
                      ))}
                    </div>

                    <div style={{ fontSize:10, color:"var(--muted)", marginBottom:5 }}>Priorité</div>
                    <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                      {PRIORITIES.map(p => (
                        <div key={p.val} onClick={() => patchPlannerTask(editingTask.id, { priority: p.val })}
                          style={{ flex:1, textAlign:"center", padding:"6px 0", borderRadius:6, cursor:"pointer", fontSize:11,
                            background: editingTask.priority===p.val ? p.color+"33" : "var(--bg3)",
                            border:`1px solid ${editingTask.priority===p.val?p.color:"var(--border)"}`, color: p.color }}>{p.label}</div>
                      ))}
                    </div>

                    <div style={{ fontSize:10, color:"var(--muted)", marginBottom:5 }}>Fenêtre horaire — l'autoplanification ne place cette tâche que dans ce créneau</div>
                    <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
                      {WINDOW_PRESETS.map(w => {
                        const active = editingTask.window_start === w.start && editingTask.window_end === w.end;
                        return (
                          <div key={w.label} onClick={() => patchPlannerTask(editingTask.id, { window_start: w.start, window_end: w.end })}
                            style={{ padding:"5px 10px", borderRadius:5, cursor:"pointer", fontSize:11,
                              background: active ? "#8ab4f822" : "var(--bg3)",
                              border:`1px solid ${active?"var(--accentBlue)":"var(--border)"}`, color: active?"var(--accentBlue)":"var(--muted)" }}>{w.icon} {w.label}</div>
                        );
                      })}
                    </div>
                    {editingTask.window_start && (
                      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
                        <input type="time" value={editingTask.window_start.slice(0,5)} onChange={e => patchPlannerTask(editingTask.id, { window_start: e.target.value+":00" })}
                          style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:5, color:"var(--text2)", padding:"5px 8px", fontSize:11 }} />
                        <span style={{ fontSize:11, color:"var(--muted)" }}>→</span>
                        <input type="time" value={editingTask.window_end.slice(0,5)} onChange={e => patchPlannerTask(editingTask.id, { window_end: e.target.value+":00" })}
                          style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:5, color:"var(--text2)", padding:"5px 8px", fontSize:11 }} />
                        <span onClick={() => patchPlannerTask(editingTask.id, { window_start: null, window_end: null })}
                          style={{ fontSize:11, color:"var(--muted2)", cursor:"pointer", marginLeft:"auto" }}>✕ Retirer</span>
                      </div>
                    )}

                    <div style={{ fontSize:10, color:"var(--muted)", marginBottom:5 }}>Étiquette</div>
                    <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                      <div onClick={() => patchPlannerTask(editingTask.id, { label_id: null })}
                        style={{ padding:"4px 10px", borderRadius:5, cursor:"pointer", fontSize:11, color:"var(--muted)", border:`1px solid ${!editingTask.label_id?"var(--muted)":"var(--border)"}` }}>Aucune</div>
                      {plannerLabels.map(l => (
                        <div key={l.id} onClick={() => patchPlannerTask(editingTask.id, { label_id: l.id })}
                          style={{ padding:"4px 10px", borderRadius:5, cursor:"pointer", fontSize:11, color:l.color,
                            background: editingTask.label_id===l.id ? l.color+"22" : "transparent",
                            border:`1px solid ${editingTask.label_id===l.id?l.color:"var(--border)"}` }}>{l.name}</div>
                      ))}
                    </div>

                    <div style={{ fontSize:10, color:"var(--muted)", marginBottom:5 }}>⏳ Temps passé</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:6, padding:"8px 10px" }}>
                      <span style={{ fontSize:12, color:"var(--text2)", fontFamily:"monospace", flex:1 }}>
                        {editingTask.timer_started_at ? "⟳ Chrono en cours..." : `${editingTask.time_spent_minutes || 0} min cumulées`}
                      </span>
                      {editingTask.timer_started_at ? (
                        <button onClick={() => stopTimer(editingTask)} style={{ background:"#fb8a4a", border:"none", borderRadius:5, padding:"5px 12px", color:"var(--bg0)", fontSize:11, fontWeight:"bold", cursor:"pointer" }}>⏹ Stop</button>
                      ) : (
                        <button onClick={() => startTimer(editingTask)} style={{ background:"#68d391", border:"none", borderRadius:5, padding:"5px 12px", color:"var(--bg0)", fontSize:11, fontWeight:"bold", cursor:"pointer" }}>▶ Démarrer</button>
                      )}
                    </div>

                    <div style={{ fontSize:10, color:"var(--muted)", marginBottom:5 }}>Récurrence</div>
                    <select value={editingTask.recurrence} onChange={e => patchPlannerTask(editingTask.id, { recurrence: e.target.value })}
                      style={{ width:"100%", background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:6, padding:"7px 10px", color:"var(--text)", fontSize:12, marginBottom:14, outline:"none" }}>
                      {RECURRENCES.map(r => <option key={r.val} value={r.val}>{r.label}</option>)}
                    </select>

                    {goals.length > 0 && (
                      <>
                        <div style={{ fontSize:10, color:"var(--muted)", marginBottom:5 }}>🎯 Objectif lié (Effet Cumulé)</div>
                        <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
                          <div onClick={() => patchPlannerTask(editingTask.id, { goal_id: null })}
                            style={{ padding:"4px 10px", borderRadius:5, cursor:"pointer", fontSize:11, color:"var(--muted)", border:`1px solid ${!editingTask.goal_id?"var(--muted)":"var(--border)"}` }}>Aucun</div>
                          {goals.map(g => (
                            <div key={g.id} onClick={() => patchPlannerTask(editingTask.id, { goal_id: g.id })}
                              style={{ padding:"4px 10px", borderRadius:5, cursor:"pointer", fontSize:11, color:g.color,
                                background: editingTask.goal_id===g.id ? g.color+"22" : "transparent",
                                border:`1px solid ${editingTask.goal_id===g.id?g.color:"var(--border)"}` }}>{g.title}</div>
                          ))}
                        </div>
                      </>
                    )}

                    {googleToken && (
                      <button onClick={() => sendTaskToGoogle(editingTask)}
                        style={{ width:"100%", marginTop:8, background:"#c084fc18", border:"1px solid #c084fc55", borderRadius:6, color:"var(--accentPurple)", padding:"8px 0", cursor:"pointer", fontSize:12 }}>📅 Envoyer vers Google Calendar</button>
                    )}
                  </div>
                </div>
              )}

              <div style={{ background:"var(--bg2)", borderRadius:9, border:"1px solid var(--border)", padding:"12px 16px", marginTop:16, textAlign:"center" }}>
                <div style={{ fontSize:11, color:"var(--muted2)", lineHeight:1.7 }}>
                  {googleToken ? "📅 Google Calendar connecté — tes événements apparaissent en violet dans chaque jour." : "📅 Connecte Google Calendar (bouton en haut) pour voir tes événements et y envoyer tes tâches."}
                </div>
              </div>
            </div>
          );
        })()}

        {/* LIFE — Objectifs + Habitudes */}
        {view==="life" && (() => {
          const habitWeekDays = getWeekDays(getWeekStart());
          const DAY_LETTERS = ["L","M","M","J","V","S","D"];
          const activeHabits = habits.filter(h => !h.archived);
          const archivedHabits = habits.filter(h => h.archived);

          return (
          <div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:10, letterSpacing:4, color:"var(--accentGreen)", textTransform:"uppercase", marginBottom:5 }}>Long terme</div>
              <div style={{ fontSize:26, color:"var(--text)", fontWeight:"bold" }}>Life</div>
              <div style={{ fontSize:12, color:"var(--muted)", marginTop:5 }}>Objectifs majeurs et habitudes — la base de l'Effet Cumulé</div>
            </div>

            {/* Habitudes — calendrier hebdomadaire */}
            <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentBlue)", textTransform:"uppercase", marginBottom:14 }}>🔁 Mes habitudes — semaine en cours</div>

              <div style={{ display:"grid", gridTemplateColumns:"180px 1fr", gap:10 }}>
                {/* Colonne 1 : liste des habitudes */}
                <div>
                  {activeHabits.map(h => (
                    <div key={h.id} style={{ marginBottom:10 }}>
                      {editingHabitId === h.id ? (
                        <div style={{ background:"var(--bg3)", border:`1px solid ${h.color}`, borderRadius:7, padding:8 }}>
                          <input value={h.title} onChange={e => patchHabit(h.id, { title: e.target.value })}
                            style={{ width:"100%", boxSizing:"border-box", background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:5, padding:"5px 7px", color:"var(--text)", fontSize:12, outline:"none", marginBottom:6 }} />
                          <div style={{ fontSize:9, color:"var(--muted)", marginBottom:4 }}>Objectif/semaine</div>
                          <div style={{ display:"flex", gap:3, marginBottom:6 }}>
                            {[1,2,3,4,5,6,7].map(n => (
                              <div key={n} onClick={() => patchHabit(h.id, { weekly_target: n })}
                                style={{ flex:1, textAlign:"center", padding:"3px 0", borderRadius:4, cursor:"pointer", fontSize:9,
                                  background: h.weekly_target===n ? h.color+"33" : "var(--bg0)",
                                  border:`1px solid ${h.weekly_target===n?h.color:"var(--border)"}`,
                                  color: h.weekly_target===n?h.color:"var(--muted)" }}>{n}</div>
                            ))}
                          </div>

                          <div onClick={() => patchHabit(h.id, { auto_schedule: !h.auto_schedule })}
                            style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", padding:"5px 7px", borderRadius:5, marginBottom:6,
                              background: h.auto_schedule ? h.color+"18" : "var(--bg0)", border:`1px solid ${h.auto_schedule?h.color+"55":"var(--border)"}` }}>
                            <CheckBox checked={!!h.auto_schedule} color={h.color} />
                            <div style={{ fontSize:10, color: h.auto_schedule ? h.color : "var(--muted)" }}>🪄 Autoplanifier dans le calendrier</div>
                          </div>
                          {h.auto_schedule && (
                            <>
                              <div style={{ fontSize:9, color:"var(--muted)", marginBottom:3 }}>Durée par séance</div>
                              <div style={{ display:"flex", gap:3, marginBottom:6, flexWrap:"wrap" }}>
                                {[15,30,45,60,90].map(m => (
                                  <div key={m} onClick={() => patchHabit(h.id, { duration_minutes: m })}
                                    style={{ padding:"3px 6px", borderRadius:4, cursor:"pointer", fontSize:9,
                                      background: (h.duration_minutes||30)===m ? h.color+"33" : "var(--bg0)",
                                      border:`1px solid ${(h.duration_minutes||30)===m?h.color:"var(--border)"}`,
                                      color: (h.duration_minutes||30)===m?h.color:"var(--muted)" }}>{m>=60?`${m/60}h`:`${m}m`}</div>
                                ))}
                              </div>
                              <div style={{ fontSize:9, color:"var(--muted)", marginBottom:3 }}>Fenêtre — sinon placée librement dans la journée</div>
                              <div style={{ display:"flex", gap:3, marginBottom:6, flexWrap:"wrap" }}>
                                {WINDOW_PRESETS.filter(w => w.label!=="Personnalisé").map(w => {
                                  const active = (h.window_start||null) === w.start && (h.window_end||null) === w.end;
                                  return (
                                    <div key={w.label} onClick={() => patchHabit(h.id, { window_start: w.start, window_end: w.end })}
                                      style={{ padding:"3px 6px", borderRadius:4, cursor:"pointer", fontSize:9,
                                        background: active ? h.color+"33" : "var(--bg0)",
                                        border:`1px solid ${active?h.color:"var(--border)"}`, color: active?h.color:"var(--muted)" }}>{w.icon}</div>
                                  );
                                })}
                              </div>
                            </>
                          )}
                          <div style={{ display:"flex", gap:5 }}>
                            <button onClick={() => setEditingHabitId(null)} style={{ flex:1, background:"#68d391", border:"none", borderRadius:5, padding:"5px 0", color:"var(--bg0)", fontSize:11, fontWeight:"bold", cursor:"pointer" }}>OK</button>
                            <button onClick={() => archiveHabit(h.id)} style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:5, padding:"5px 8px", color:"var(--muted)", fontSize:11, cursor:"pointer" }}>📦</button>
                            <button onClick={() => deleteHabit(h.id)} style={{ background:"#fb8a4a18", border:"1px solid #fb8a4a55", borderRadius:5, padding:"5px 8px", color:"var(--accentOrange2)", fontSize:11, cursor:"pointer" }}>🗑️</button>
                          </div>
                        </div>
                      ) : (
                        <div onClick={() => setEditingHabitId(h.id)} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", height:34 }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", background:h.color, flexShrink:0 }} />
                          <div style={{ fontSize:12, color:"var(--text2)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.title}</div>
                          {h.auto_schedule && <span title="Autoplanifiée dans le calendrier" style={{ fontSize:10 }}>🪄</span>}
                          <div style={{ fontSize:9, color:"var(--muted2)" }}>✏️</div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:4, marginTop:6 }}>
                    <input value={newHabitTitle} onChange={e => setNewHabitTitle(e.target.value)} onKeyDown={e => e.key==="Enter" && addHabit()}
                      placeholder="+ Habitude..."
                      style={{ flex:1, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:5, padding:"6px 8px", color:"var(--text)", fontSize:11, outline:"none" }} />
                    <button onClick={addHabit} style={{ background:"#8ab4f8", border:"none", borderRadius:5, padding:"6px 10px", color:"var(--bg0)", fontSize:11, fontWeight:"bold", cursor:"pointer" }}>+</button>
                  </div>
                  {activeHabits.length === 0 && <div style={{ fontSize:11, color:"var(--muted2)", fontStyle:"italic", marginBottom:8 }}>Aucune habitude suivie.</div>}
                </div>

                {/* Colonne 2 : calendrier hebdomadaire */}
                <div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr) 50px", gap:4, marginBottom:6 }}>
                    {DAY_LETTERS.map((l,i) => (
                      <div key={i} style={{ textAlign:"center", fontSize:10, color: toDateKey(habitWeekDays[i])===getTodayKey() ? "var(--accentGreen)" : "var(--muted)", fontFamily:"monospace" }}>{l}</div>
                    ))}
                    <div />
                  </div>
                  {activeHabits.map(h => {
                    const weekCount = habitWeekCount(h.id, habitWeekDays);
                    const target = h.weekly_target || 7;
                    const pct = Math.min(100, Math.round((weekCount/target)*100));
                    const circ = 2*Math.PI*16;
                    return (
                      <div key={h.id} style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr) 50px", gap:4, alignItems:"center", height:34, marginBottom:10 }}>
                        {habitWeekDays.map(day => {
                          const dk = toDateKey(day);
                          const done = (habitCompletions[h.id] || []).includes(dk);
                          const isFuture = dk > getTodayKey();
                          return (
                            <div key={dk} onClick={() => !isFuture && toggleHabitDate(h, dk)}
                              style={{ width:24, height:24, margin:"0 auto", borderRadius:6, cursor: isFuture?"default":"pointer",
                                background: done ? h.color : "var(--bg3)", border:`1px solid ${done?h.color:"var(--border)"}`,
                                opacity: isFuture?0.3:1,
                                display:"flex", alignItems:"center", justifyContent:"center" }}>
                              {done && <span style={{ fontSize:11, color:"var(--bg0)" }}>✓</span>}
                            </div>
                          );
                        })}
                        <svg width="34" height="34" viewBox="0 0 34 34">
                          <circle cx="17" cy="17" r="16" fill="none" stroke="var(--border)" strokeWidth="3"/>
                          <circle cx="17" cy="17" r="16" fill="none" stroke={h.color} strokeWidth="3"
                            strokeDasharray={`${(pct/100)*circ} ${circ}`} strokeLinecap="round" transform="rotate(-90 17 17)" />
                          <text x="17" y="21" textAnchor="middle" fill={h.color} fontSize="9" fontFamily="monospace">{weekCount}/{target}</text>
                        </svg>
                      </div>
                    );
                  })}
                </div>
              </div>

              {archivedHabits.length > 0 && (
                <div style={{ marginTop:14, paddingTop:10, borderTop:"1px solid var(--border2)" }}>
                  <div onClick={() => setShowArchivedHabits(s => !s)} style={{ fontSize:10, color:"var(--muted2)", cursor:"pointer" }}>
                    {showArchivedHabits ? "▾" : "▸"} {archivedHabits.length} habitude(s) archivée(s)
                  </div>
                  {showArchivedHabits && archivedHabits.map(h => (
                    <div key={h.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0" }}>
                      <div style={{ fontSize:12, color:"var(--muted)", flex:1 }}>{h.title}</div>
                      <span onClick={() => patchHabit(h.id, { archived:false })} style={{ fontSize:10, color:"var(--accentGreen)", cursor:"pointer" }}>Réactiver</span>
                      <span onClick={() => deleteHabit(h.id)} style={{ fontSize:10, color:"var(--accentOrange2)", cursor:"pointer" }}>Supprimer</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Objectifs */}
            <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px" }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentAmber)", textTransform:"uppercase", marginBottom:12 }}>🎯 Mes objectifs (max 3)</div>
              {goals.map(g => {
                const { done, total } = goalProgress(g.id);
                const pct = total > 0 ? Math.round((done/total)*100) : 0;
                const cat = GOAL_CATEGORIES.find(c => c.val === g.category) || GOAL_CATEGORIES[0];
                return (
                  <div key={g.id} style={{ marginBottom:14, paddingBottom:12, borderBottom:"1px solid var(--border2)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      {editingGoalId === g.id ? (
                        <input value={g.title} onChange={e => patchGoal(g.id, { title: e.target.value })} onBlur={() => setEditingGoalId(null)}
                          onKeyDown={e => e.key==="Enter" && setEditingGoalId(null)} autoFocus
                          style={{ flex:1, background:"var(--bg0)", border:"1px solid var(--border2)", borderRadius:5, padding:"4px 8px", color:"var(--text)", fontSize:13, outline:"none" }} />
                      ) : (
                        <div onClick={() => setEditingGoalId(g.id)} style={{ fontSize:13, color:g.color, fontWeight:"bold", cursor:"pointer" }}>{g.title}</div>
                      )}
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:11, color:"var(--muted)", fontFamily:"monospace" }}>{done}/{total} actions</span>
                        <span onClick={() => deleteGoal(g.id)} style={{ fontSize:11, color:"var(--muted2)", cursor:"pointer" }}>✕</span>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:5, marginBottom:8, flexWrap:"wrap" }}>
                      {GOAL_CATEGORIES.map(c => (
                        <div key={c.val} onClick={() => patchGoal(g.id, { category: c.val })}
                          style={{ padding:"3px 9px", borderRadius:5, cursor:"pointer", fontSize:10,
                            background: g.category===c.val ? g.color+"22" : "var(--bg3)",
                            border:`1px solid ${g.category===c.val?g.color:"var(--border)"}`,
                            color: g.category===c.val?g.color:"var(--muted)" }}>{c.icon} {c.label}</div>
                      ))}
                    </div>
                    <div style={{ height:6, background:"var(--bg3)", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:g.color, transition:"width 0.4s" }} />
                    </div>
                  </div>
                );
              })}
              {goals.length < 3 && (
                <div style={{ display:"flex", gap:6, marginTop:10 }}>
                  <input value={newGoalTitle} onChange={e => setNewGoalTitle(e.target.value)} onKeyDown={e => e.key==="Enter" && addGoal()}
                    placeholder="Nouvel objectif majeur (max 3)..."
                    style={{ flex:1, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:5, padding:"7px 10px", color:"var(--text)", fontSize:12, outline:"none" }} />
                  <button onClick={addGoal} style={{ background:"#f0b429", border:"none", borderRadius:5, padding:"7px 14px", color:"var(--bg0)", fontSize:12, fontWeight:"bold", cursor:"pointer" }}>+ Ajouter</button>
                </div>
              )}
              <div style={{ fontSize:10, color:"var(--muted2)", marginTop:10, fontStyle:"italic" }}>💡 Lie une tâche à un objectif depuis le Planificateur, en cliquant sur la tâche.</div>
            </div>
          </div>
          );
        })()}

        {/* BILAN */}
        {view==="bilan" && (() => {
          const HUMEURS = [
            { val:"excellent", icon:"🔥", label:"Excellent" },
            { val:"bien", icon:"😊", label:"Bien" },
            { val:"moyen", icon:"😐", label:"Moyen" },
            { val:"difficile", icon:"😔", label:"Difficile" },
          ];
          const SECTIONS = [
            { field:"senti", icon:"💭", label:"Aujourd'hui je me suis senti...", placeholder:"Comment tu te sens, sans filtre..." },
            { field:"reussi", icon:"✅", label:"Aujourd'hui j'ai réussi à...", placeholder:"Une victoire, petite ou grande..." },
            { field:"tombe", icon:"⚠️", label:"Ce que j'aurais pu mieux faire...", placeholder:"Ce qui n'a pas marché, ce que j'ai raté..." },
            { field:"appris", icon:"💡", label:"Ce que j'ai appris...", placeholder:"Une leçon, une prise de conscience..." },
            { field:"dieu", icon:"🙏", label:"Ce que je confie à Dieu...", placeholder:"Ce que tu remets entre Ses mains..." },
            { field:"priorite_demain", icon:"🎯", label:"Ma priorité pour demain...", placeholder:"Une seule chose, la plus importante..." },
          ];
          const inputStyle = {
            width:"100%", background:"var(--bg3)", border:"1px solid var(--border2)",
            borderRadius:7, padding:"10px 12px", color:"var(--text2)",
            fontSize:13, fontFamily:"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", lineHeight:1.6,
            outline:"none", resize:"vertical", boxSizing:"border-box",
            minHeight:72,
          };
          return (
            <div>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:10, letterSpacing:4, color:"var(--accentOrange)", textTransform:"uppercase", marginBottom:5 }}>Chaque soir · une page</div>
                <div style={{ fontSize:26, color:"var(--text)", fontWeight:"bold" }}>Journal personnel</div>
                <div style={{ marginTop:6 }}>
                  <button onClick={exportBilansCSV} style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, color:"var(--accentOrange)", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>⬇️ Exporter tout l'historique (CSV)</button>
                </div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8 }}>
                  <input type="date" value={bilanDate} onChange={e => setBilanDate(e.target.value)}
                    style={{ background:"var(--bg1)", border:"1px solid var(--border2)", borderRadius:6, padding:"5px 10px", color:"var(--accentBlue)", fontSize:12, fontFamily:"monospace", outline:"none" }}/>
                  <div style={{ fontSize:11, color: bilanSaved ? "var(--accentGreen)" : "var(--muted2)", fontFamily:"monospace" }}>
                    {bilanLoading ? "⟳ chargement..." : bilanSaved ? "● sauvegardé" : "..."}
                  </div>
                </div>
              </div>

              {bilanLoading ? (
                <div style={{ textAlign:"center", padding:"40px", color:"var(--muted)", fontFamily:"monospace" }}>Chargement...</div>
              ) : (
                <>
                  {/* Humeur */}
                  <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:12 }}>
                    <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentOrange)", textTransform:"uppercase", marginBottom:12 }}>🌡️ État d'esprit / énergie du jour</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                      {HUMEURS.map(h => (
                        <div key={h.val} onClick={() => updateBilan("humeur", bilan.humeur===h.val ? "" : h.val)} style={{
                          padding:"12px 6px", borderRadius:8, textAlign:"center", cursor:"pointer",
                          background: bilan.humeur===h.val ? "#8ab4f833" : "var(--bg3)",
                          border: `2px solid ${bilan.humeur===h.val ? "var(--accentBlue)" : "var(--border2)"}`,
                          transition:"all 0.2s",
                        }}>
                          <div style={{ fontSize:22, marginBottom:4 }}>{h.icon}</div>
                          <div style={{ fontSize:10, color: bilan.humeur===h.val ? "var(--accentBlue)" : "var(--muted)", fontFamily:"monospace" }}>{h.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sections guidées */}
                  {SECTIONS.map(s => (
                    <div key={s.field} style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:12 }}>
                      <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentOrange)", textTransform:"uppercase", marginBottom:10 }}>
                        {s.icon} {s.label}
                      </div>
                      <textarea
                        value={bilan[s.field]}
                        onChange={e => updateBilan(s.field, e.target.value)}
                        placeholder={s.placeholder}
                        rows={3}
                        style={{ ...inputStyle }}
                      />
                    </div>
                  ))}

                  <div style={{ background:"var(--bg3)", borderRadius:9, border:"1px solid var(--border2)", padding:"14px 18px", textAlign:"center" }}>
                    <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.8, fontStyle:"italic" }}>
                      Chaque page écrite est une victoire sur l'inertie.<br/>
                      <span style={{ fontSize:11, color:"var(--muted2)" }}>Sauvegarde automatique · Synchronisé sur tous tes appareils</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* ANALYSE */}
        {view==="analyse" && (
          <div>
            <div style={{ marginBottom:22 }}>
              <div style={{ fontSize:10, letterSpacing:4, color:"var(--accentPurple)", textTransform:"uppercase", marginBottom:5 }}>Suivi de progression</div>
              <div style={{ fontSize:26, color:"var(--text)", fontWeight:"bold" }}>Analyse</div>
              <div style={{ fontSize:12, color:"var(--muted)", marginTop:5 }}>Bilan hebdomadaire et mensuel · données synchronisées</div>
              <button onClick={exportAnalyseCSV} style={{ marginTop:10, background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, color:"var(--accentPurple)", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>⬇️ Exporter le résumé (CSV)</button>
            </div>

            {!analyseData ? (
              <div style={{ textAlign:"center", padding:"40px", color:"var(--muted)", fontFamily:"monospace" }}>Chargement des données...</div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                  <div style={{ background:"var(--bg1)", borderRadius:9, border:"1px solid var(--border)", padding:"14px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:20, fontWeight:"bold", color:weekScore>=70?"var(--accentGreen)":weekScore>=40?"var(--accentAmber)":"var(--accentOrange2)", fontFamily:"monospace" }}>{weekScore}%</div>
                    <div style={{ fontSize:9, color:"var(--muted)", letterSpacing:1, textTransform:"uppercase", marginTop:4 }}>Score global semaine</div>
                  </div>
                  <div style={{ background:"var(--bg1)", borderRadius:9, border:"1px solid var(--border)", padding:"14px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:20, fontWeight:"bold", color:"var(--accentPurple)", fontFamily:"monospace" }}>{weekHabitsMax>0?Math.round(weekHabitsDone/weekHabitsMax*100):0}%</div>
                    <div style={{ fontSize:9, color:"var(--muted)", letterSpacing:1, textTransform:"uppercase", marginTop:4 }}>Habitudes semaine</div>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
                  <div style={{ background:"var(--bg1)", borderRadius:9, border:"1px solid var(--border)", padding:"14px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:20, fontWeight:"bold", color:"var(--accentGreen)", fontFamily:"monospace" }}>{weekTasksDone}/{weekTasksTotal}</div>
                    <div style={{ fontSize:9, color:"var(--muted)", letterSpacing:1, textTransform:"uppercase", marginTop:4 }}>Tâches (7j)</div>
                  </div>
                  <div style={{ background:"var(--bg1)", borderRadius:9, border:"1px solid var(--border)", padding:"14px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:20, fontWeight:"bold", color:"var(--accentBlue)", fontFamily:"monospace" }}>{weekRoutine}/{weekRoutineMax}</div>
                    <div style={{ fontSize:9, color:"var(--muted)", letterSpacing:1, textTransform:"uppercase", marginTop:4 }}>Routines (7j)</div>
                  </div>
                </div>

                {/* Habitudes détail */}
                {activeHabitsForStats.length > 0 && (() => {
                  const last8Weeks = getLastNWeeks(8);
                  return (
                  <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:14 }}>
                    <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentPurple)", textTransform:"uppercase", marginBottom:12 }}>🔁 Habitudes — suivi dans le temps</div>
                    {activeHabitsForStats.map(h => {
                      const count = weekHabitDays.filter(d => (habitCompletions[h.id]||[]).includes(d)).length;
                      const pct = Math.round(count/7*100);
                      const streak = habitStreak(h.id);
                      const best = habitBestStreak(h.id);
                      const totalDone = (habitCompletions[h.id] || []).length;
                      return (
                        <div key={h.id} style={{ marginBottom:16, paddingBottom:14, borderBottom:"1px solid var(--border2)" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                            <span style={{ fontSize:12, color:"var(--text2)" }}>{h.title}</span>
                            <span style={{ fontSize:11, color:h.color, fontFamily:"monospace" }}>{count}/7 · {pct}%</span>
                          </div>
                          <div style={{ height:6, background:"var(--bg3)", borderRadius:3, overflow:"hidden", marginBottom:8 }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:h.color, transition:"width 0.4s" }} />
                          </div>
                          <div style={{ display:"flex", gap:14, marginBottom:8 }}>
                            <span style={{ fontSize:10, color:"var(--muted)" }}>🔥 série en cours : <b style={{ color:h.color }}>{streak}j</b></span>
                            <span style={{ fontSize:10, color:"var(--muted)" }}>🏆 record : <b style={{ color:h.color }}>{best}j</b></span>
                            <span style={{ fontSize:10, color:"var(--muted)" }}>Σ total : <b style={{ color:h.color }}>{totalDone}</b></span>
                          </div>
                          {/* Tendance 8 dernières semaines */}
                          <div style={{ display:"flex", gap:4, alignItems:"flex-end", height:36 }}>
                            {last8Weeks.map((w, i) => {
                              const wCount = habitWeekCount(h.id, w.days);
                              const wPct = Math.max(4, Math.round(wCount/7*100));
                              const isCurrentWeek = i === last8Weeks.length - 1;
                              return (
                                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}
                                  title={`Semaine du ${w.days[0].toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} : ${wCount}/7`}>
                                  <div style={{ width:"100%", height:32, display:"flex", alignItems:"flex-end", background:"var(--bg3)", borderRadius:2, overflow:"hidden" }}>
                                    <div style={{ width:"100%", height:`${wPct}%`, background: isCurrentWeek ? h.color : h.color+"88", transition:"height 0.4s" }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ fontSize:8, color:"var(--muted2)", textAlign:"center", marginTop:3 }}>8 dernières semaines</div>
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}

                {/* Objectifs détail */}
                {goals.length > 0 && (
                  <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:14 }}>
                    <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentAmber)", textTransform:"uppercase", marginBottom:12 }}>🎯 Objectifs — progression globale</div>
                    {goals.map(g => {
                      const { done, total } = goalProgress(g.id);
                      const pct = total > 0 ? Math.round(done/total*100) : 0;
                      return (
                        <div key={g.id} style={{ marginBottom:10 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                            <span style={{ fontSize:12, color:"var(--text2)" }}>{g.title}</span>
                            <span style={{ fontSize:11, color:g.color, fontFamily:"monospace" }}>{done}/{total}</span>
                          </div>
                          <div style={{ height:6, background:"var(--bg3)", borderRadius:3, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:g.color, transition:"width 0.4s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 7 jours */}
                <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:14 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentPurple)", textTransform:"uppercase", marginBottom:14 }}>7 derniers jours</div>
                  <BarChart data={weeklyData} maxVal={9}/>
                  <div style={{ display:"flex", gap:16, marginTop:12, justifyContent:"center" }}>
                    {[["var(--accentGreen)","Tâches /6"],["var(--accentBlue)","Routines"]].map(([c,l]) => (
                      <div key={l} style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:10, height:10, borderRadius:2, background:c }}/>
                        <span style={{ fontSize:10, color:"var(--muted)" }}>{l}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:14, borderTop:"1px solid var(--border2)", paddingTop:12 }}>
                    {weeklyData.map((d,i) => {
                      const date = new Date(last7[i]);
                      const isToday = last7[i]===getTodayKey();
                      return (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:i<6?"1px solid var(--border2)":"none", opacity:!d.hasData&&!isToday?0.35:1 }}>
                          <div style={{ width:72, fontSize:11, color:isToday?"var(--accentPurple)":"var(--muted)", fontFamily:"monospace" }}>
                            {date.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"})}
                            {isToday && <span style={{ color:"var(--accentPurple)" }}> ●</span>}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", gap:4, marginBottom:3 }}>
                              <div style={{ height:5, borderRadius:3, background:"#68d391", width:`${d.tasksTotal>0?Math.round(d.tasks/d.tasksTotal*100):0}%`, minHeight:d.tasks>0?4:0, transition:"width 0.4s" }}/>
                              <div style={{ height:5, borderRadius:3, background:"var(--border)", flex:1 }}/>
                            </div>
                            <div style={{ display:"flex", gap:4 }}>
                              <div style={{ height:5, borderRadius:3, background:"#8ab4f8", width:`${d.total>0?Math.round(d.routine/d.total*100):0}%`, minHeight:d.routine>0?4:0, transition:"width 0.4s" }}/>
                              <div style={{ height:5, borderRadius:3, background:"var(--border)", flex:1 }}/>
                            </div>
                          </div>
                          <div style={{ width:70, textAlign:"right", fontSize:10, color:"var(--muted)", fontFamily:"monospace" }}>{d.tasks}/{d.tasksTotal} · {d.routine}/{d.total}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 6 mois */}
                <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:14 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentPurple)", textTransform:"uppercase", marginBottom:14 }}>6 derniers mois — moyenne / jour actif</div>
                  <BarChart data={bilanMensuel.map(d=>({...d,tasks:d.avgTasks,routine:d.avgRoutine,total:9}))} maxVal={9}/>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6, marginTop:12 }}>
                    {bilanMensuel.map((m,i) => (
                      <div key={i} style={{ background:"var(--bg3)", borderRadius:6, padding:"8px 4px", border:"1px solid var(--border2)", textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"var(--muted)", textTransform:"capitalize", marginBottom:4 }}>{m.label}</div>
                        <div style={{ fontSize:13, color:"var(--accentGreen)", fontFamily:"monospace" }}>{m.avgTasks}/6</div>
                        <div style={{ fontSize:13, color:"var(--accentBlue)", fontFamily:"monospace" }}>{m.avgRoutine}/9</div>
                        <div style={{ fontSize:9, color:"var(--muted2)", marginTop:3 }}>{m.activeDays}j actifs</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background:"var(--bg3)", borderRadius:9, border:"1px solid var(--border2)", padding:"14px 18px", textAlign:"center" }}>
                  <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.8, fontStyle:"italic" }}>
                    Les données s'accumulent automatiquement et se synchronisent sur tous tes appareils.
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* PARAMÈTRES */}
        {view==="settings" && (
          <div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:10, letterSpacing:4, color:"var(--muted)", textTransform:"uppercase", marginBottom:5 }}>Configuration</div>
              <div style={{ fontSize:26, color:"var(--text)", fontWeight:"bold" }}>Paramètres</div>
            </div>

            <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentBlue)", textTransform:"uppercase", marginBottom:12 }}>🪄 Auto-planification</div>

              <div style={{ fontSize:12, color:"var(--text2)", marginBottom:6 }}>Plage horaire de travail</div>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                <input type="time" value={settings.workday_start} onChange={e => patchSettings({ workday_start: e.target.value })}
                  style={{ flex:1, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:6, padding:"7px 10px", color:"var(--text)", fontSize:12, outline:"none" }} />
                <span style={{ color:"var(--muted)", alignSelf:"center" }}>→</span>
                <input type="time" value={settings.workday_end} onChange={e => patchSettings({ workday_end: e.target.value })}
                  style={{ flex:1, background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:6, padding:"7px 10px", color:"var(--text)", fontSize:12, outline:"none" }} />
              </div>

              <div style={{ fontSize:12, color:"var(--text2)", marginBottom:6 }}>Buffer time entre deux tâches (minutes)</div>
              <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                {[0,5,10,15,20,30].map(m => (
                  <div key={m} onClick={() => patchSettings({ buffer_minutes: m })}
                    style={{ flex:1, textAlign:"center", padding:"6px 0", borderRadius:6, cursor:"pointer", fontSize:11,
                      background: settings.buffer_minutes===m ? "#8ab4f822" : "var(--bg3)",
                      border:`1px solid ${settings.buffer_minutes===m?"var(--accentBlue)":"var(--border)"}`,
                      color: settings.buffer_minutes===m?"var(--accentBlue)":"var(--muted)" }}>{m}m</div>
                ))}
              </div>

              <div onClick={() => patchSettings({ auto_reschedule: !settings.auto_reschedule })} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
                <CheckBox checked={!!settings.auto_reschedule} color="var(--accentGreen)" />
                <div style={{ fontSize:12, color:"var(--text2)" }}>
                  Replanification automatique en continu — dès qu'une tâche flexible (🔓) prend du retard ou entre en conflit avec un événement Google Calendar, elle est déplacée toute seule vers le prochain créneau libre. Les tâches verrouillées (🔒) ne sont jamais touchées.
                </div>
              </div>
            </div>

            <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentAmber)", textTransform:"uppercase", marginBottom:12 }}>🔔 Notifications</div>
              <div style={{ fontSize:12, color:"var(--text2)", marginBottom:12 }}>Reçois une notification navigateur à l'heure exacte de chaque tâche planifiée (l'onglet doit rester ouvert).</div>
              {settings.notifications_enabled ? (
                <div onClick={() => patchSettings({ notifications_enabled:false })} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
                  <CheckBox checked={true} color="var(--accentAmber)" />
                  <div style={{ fontSize:12, color:"var(--text2)" }}>Notifications activées — clique pour désactiver</div>
                </div>
              ) : (
                <button onClick={requestNotificationPermission} style={{ background:"#f0b42918", border:"1px solid #f0b42955", borderRadius:6, color:"var(--accentAmber)", padding:"8px 14px", cursor:"pointer", fontSize:12 }}>Activer les notifications</button>
              )}
            </div>

            <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"var(--accentPurple)", textTransform:"uppercase", marginBottom:12 }}>📅 Google Calendar</div>
              {googleToken ? (
                <button onClick={disconnectGoogle} style={{ background:"#68d39118", border:"1px solid #68d39155", borderRadius:6, color:"var(--accentGreen)", padding:"8px 14px", cursor:"pointer", fontSize:12 }}>Déconnecter Google Calendar</button>
              ) : (
                <button onClick={connectGoogle} style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, color:"var(--accentBlue)", padding:"8px 14px", cursor:"pointer", fontSize:12 }}>Connecter Google Calendar</button>
              )}
            </div>

            <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"var(--muted)", textTransform:"uppercase", marginBottom:12 }}>🎨 Apparence</div>
              <div style={{ display:"flex", gap:8 }}>
                {[["dark","🌙 Sombre"],["light","☀️ Clair"]].map(([v,l]) => (
                  <button key={v} onClick={() => patchSettings({ theme: v })} style={{
                    flex:1, background: settings.theme===v ? "#8ab4f822" : "var(--bg3)",
                    border:`1px solid ${settings.theme===v?"var(--accentBlue)":"var(--border)"}`,
                    borderRadius:6, color: settings.theme===v?"var(--accentBlue)":"var(--muted)", padding:"10px 0", cursor:"pointer", fontSize:12 }}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ background:"var(--bg1)", borderRadius:10, border:"1px solid var(--border)", padding:"16px 18px" }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"var(--muted)", textTransform:"uppercase", marginBottom:12 }}>ℹ️ À propos</div>
              <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.8 }}>
                Discipline System — dashboard personnel de discipline, organisation et effet cumulé.<br/>
                Données synchronisées via Supabase · Déployé sur Vercel.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Capture — bouton flottant + raccourci "n" */}
      <div onClick={() => setShowQuickCapture(true)} style={{
        position:"fixed", bottom:22, right:22, width:52, height:52, borderRadius:"50%",
        background:"#68d391", color:"var(--bg0)", fontSize:26, fontWeight:"bold",
        display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
        boxShadow:"0 4px 14px #00000066", zIndex:150,
      }} title="Capture rapide (touche N)">+</div>

      {showQuickCapture && (
        <div onClick={() => setShowQuickCapture(false)} style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:"18vh", zIndex:200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"var(--bg1)", border:"1px solid var(--border2)", borderRadius:10, padding:16, width:380, maxWidth:"90vw" }}>
            <div style={{ fontSize:10, letterSpacing:2, color:"var(--accentGreen)", textTransform:"uppercase", marginBottom:10 }}>⚡ Capture rapide → Inbox</div>
            <input autoFocus value={quickCaptureVal} onChange={e => setQuickCaptureVal(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter") quickCapture(); if (e.key==="Escape") setShowQuickCapture(false); }}
              placeholder="Note ou tâche... (Entrée pour valider)"
              style={{ width:"100%", boxSizing:"border-box", background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:6, padding:"10px 12px", color:"var(--text)", fontSize:14, outline:"none" }} />
          </div>
        </div>
      )}

      {showShortcuts && (
        <div onClick={() => setShowShortcuts(false)} style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"var(--bg1)", border:"1px solid var(--border2)", borderRadius:10, padding:20, width:340, maxWidth:"90vw" }}>
            <div style={{ fontSize:10, letterSpacing:2, color:"var(--accentBlue)", textTransform:"uppercase", marginBottom:14 }}>⌨️ Raccourcis clavier</div>
            {[
              ["N","Capture rapide"],
              ["/","Recherche globale"],
              ["T","Aller à Aujourd'hui"],
              ["P","Aller au Planificateur"],
              ["R","Aller à Routines"],
              ["B","Aller au Bilan"],
              ["A","Aller à Analyse"],
              ["1 / 3 / 7","Vue Jour / 3 jours / Semaine (Planificateur)"],
              ["Échap","Fermer une fenêtre"],
              ["?","Afficher cette aide"],
            ].map(([k,l]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid var(--border2)" }}>
                <span style={{ fontSize:12, color:"var(--text2)" }}>{l}</span>
                <span style={{ fontSize:11, color:"var(--accentGreen)", fontFamily:"monospace", background:"var(--bg3)", padding:"2px 8px", borderRadius:4 }}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showGlobalSearch && (() => {
        const q = globalSearchQuery.trim().toLowerCase();
        const taskMatches = q ? plannerTasks.filter(t => t.title.toLowerCase().includes(q)).slice(0, 8) : [];
        const goalMatches = q ? goals.filter(g => g.title.toLowerCase().includes(q)).slice(0, 5) : [];
        const habitMatches = q ? habits.filter(h => !h.archived && h.title.toLowerCase().includes(q)).slice(0, 5) : [];
        const nothing = q && taskMatches.length===0 && goalMatches.length===0 && habitMatches.length===0;
        return (
          <div onClick={() => { setShowGlobalSearch(false); setGlobalSearchQuery(""); }} style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:"12vh", zIndex:200 }}>
            <div onClick={e => e.stopPropagation()} style={{ background:"var(--bg1)", border:"1px solid var(--border2)", borderRadius:10, padding:16, width:420, maxWidth:"90vw", maxHeight:"70vh", overflowY:"auto" }}>
              <div style={{ fontSize:10, letterSpacing:2, color:"var(--accentBlue)", textTransform:"uppercase", marginBottom:10 }}>🔎 Recherche globale</div>
              <input autoFocus value={globalSearchQuery} onChange={e => setGlobalSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key==="Escape") { setShowGlobalSearch(false); setGlobalSearchQuery(""); } }}
                placeholder="Cherche une tâche, un objectif, une habitude..."
                style={{ width:"100%", boxSizing:"border-box", background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:6, padding:"10px 12px", color:"var(--text)", fontSize:14, outline:"none", marginBottom:10 }} />

              {nothing && <div style={{ fontSize:12, color:"var(--muted)", textAlign:"center", padding:"14px 0" }}>Aucun résultat</div>}

              {taskMatches.length > 0 && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:9, color:"var(--muted2)", textTransform:"uppercase", marginBottom:6 }}>Tâches</div>
                  {taskMatches.map(t => (
                    <div key={t.id} onClick={() => { setView("planner"); setEditingTaskId(t.id); setShowGlobalSearch(false); setGlobalSearchQuery(""); }}
                      style={{ padding:"7px 8px", borderRadius:6, cursor:"pointer", fontSize:12, color:"var(--text2)", display:"flex", justifyContent:"space-between" }}>
                      <span>{t.title}</span>
                      <span style={{ color:"var(--muted)", fontSize:10 }}>{t.scheduled_date || "inbox"}</span>
                    </div>
                  ))}
                </div>
              )}
              {goalMatches.length > 0 && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:9, color:"var(--muted2)", textTransform:"uppercase", marginBottom:6 }}>Objectifs</div>
                  {goalMatches.map(g => (
                    <div key={g.id} onClick={() => { setView("life"); setShowGlobalSearch(false); setGlobalSearchQuery(""); }}
                      style={{ padding:"7px 8px", borderRadius:6, cursor:"pointer", fontSize:12, color:g.color }}>🎯 {g.title}</div>
                  ))}
                </div>
              )}
              {habitMatches.length > 0 && (
                <div>
                  <div style={{ fontSize:9, color:"var(--muted2)", textTransform:"uppercase", marginBottom:6 }}>Habitudes</div>
                  {habitMatches.map(h => (
                    <div key={h.id} onClick={() => { setView("life"); setShowGlobalSearch(false); setGlobalSearchQuery(""); }}
                      style={{ padding:"7px 8px", borderRadius:6, cursor:"pointer", fontSize:12, color:h.color }}>🔁 {h.title}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
