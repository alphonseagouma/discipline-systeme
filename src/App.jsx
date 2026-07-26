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

async function dbGet(table, dateKey) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?date_key=eq.${dateKey}&select=*`, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch { return null; }
}

async function dbUpsert(table, row) {
  try {
    const existing = await dbGet(table, row.date_key);
    if (existing) {
      await fetch(`${SUPABASE_URL}/rest/v1/${table}?date_key=eq.${row.date_key}`, {
        method: "PATCH",
        headers: { ...HEADERS, "Prefer": "return=minimal" },
        body: JSON.stringify(row),
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...HEADERS, "Prefer": "return=minimal" },
        body: JSON.stringify(row),
      });
    }
  } catch { /* silencieux */ }
}

// --- Helpers génériques (par id) pour le Planificateur ---
async function dbList(table, query = "") {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${query}`, { headers: HEADERS });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function dbInsert(table, row) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "return=representation" },
      body: JSON.stringify(row),
    });
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  } catch { return null; }
}

async function dbPatch(table, id, patch) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify(patch),
    });
  } catch { /* silencieux */ }
}

async function dbDelete(table, id) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: HEADERS,
    });
  } catch { /* silencieux */ }
}
// --- fin helpers Planificateur ---

const DEFAULT_MORNING_ROUTINE = [
  { id: "m1", time: "05:50", icon: "☀️", label: "Réveil & Hydratation", desc: "Lever immédiat, 1 grand verre d'eau. Pas de téléphone. Respiration profonde 3 min." },
  { id: "m2", time: "06:00", icon: "🏠", label: "Responsabilités de la maison", desc: "1h dédiée aux tâches du foyer — ménage, rangement, ou ce qui est nécessaire. Pleine présence, sans téléphone." },
  { id: "m3", time: "07:00", icon: "🏃", label: "Sport · Douche · Méditation / Visualisation", desc: "1h complète : sport 30 min → douche → méditation et visualisation 15 min — ancrer l'intention du jour, clarté mentale." },
  { id: "m4", time: "08:00", icon: "☕", label: "Petit-déjeuner", desc: "Repas nutritif et conscient. Pas d'écrans. Prendre le temps de bien manger avant de commencer la journée." },
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
  { val: "haute", label: "Haute", color: "#fb8a4a" },
  { val: "moyenne", label: "Moyenne", color: "#f0b429" },
  { val: "basse", label: "Basse", color: "#8ab4f8" },
];
const RECURRENCES = [
  { val: "aucune", label: "Aucune" },
  { val: "quotidienne", label: "Quotidienne" },
  { val: "ouvrable", label: "Jours ouvrables (lun-ven)" },
  { val: "hebdomadaire", label: "Hebdomadaire" },
  { val: "mensuelle", label: "Mensuelle" },
];
const LABEL_COLORS = ["#68d391","#8ab4f8","#f0b429","#fb8a4a","#c084fc","#f472b6","#4dd4d4","#e8e0d4"];
const GOAL_CATEGORIES = [
  { val:"personnel", label:"Personnel", icon:"🧘" },
  { val:"finance", label:"Finance", icon:"💰" },
  { val:"professionnel", label:"Professionnel", icon:"💼" },
  { val:"business", label:"Business", icon:"🚀" },
  { val:"maison", label:"Maison", icon:"🏠" },
];
const PLANNER_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06h -> 22h
const GOOGLE_CLIENT_ID = "475742292156-jh4j1m135g5oeco89ko8rasmab5u78ug.apps.googleusercontent.com";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar";

function pad2(n) { return String(n).padStart(2, "0"); }
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
  const [settings, setSettings] = useState({ buffer_minutes:10, workday_start:"08:00", workday_end:"20:00", auto_reschedule:true });
  const [habits, setHabits] = useState([]);
  const [habitCompletions, setHabitCompletions] = useState({}); // habit_id -> [date_key,...]
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [editingHabitId, setEditingHabitId] = useState(null);
  const [showArchivedHabits, setShowArchivedHabits] = useState(false);
  const [autoScheduling, setAutoScheduling] = useState(false);
  const rescheduledRef = useRef(false);
  const [now, setNow] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
  const [syncOk, setSyncOk] = useState(null);
  const [analyseData, setAnalyseData] = useState(null);
  const [bilan, setBilan] = useState({ humeur:"", bien:"", ameliore:"", taches:"", moment:"", gratitude:"", libre:"" });
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
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setShowQuickCapture(true); }
      else if (e.key === "t" || e.key === "T") setView("today");
      else if (e.key === "p" || e.key === "P") setView("planner");
      else if (e.key === "r" || e.key === "R") setView("routines");
      else if (e.key === "b" || e.key === "B") setView("bilan");
      else if (e.key === "a" || e.key === "A") setView("analyse");
      else if (e.key === "1") setPlannerViewMode("day");
      else if (e.key === "3") setPlannerViewMode("3day");
      else if (e.key === "7") setPlannerViewMode("week");
      else if (e.key === "?") setShowShortcuts(s => !s);
      else if (e.key === "Escape") { setShowQuickCapture(false); setEditingTaskId(null); setShowShortcuts(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    const hours = list.map(r => parseInt(r.time.slice(0,2),10));
    const min = Math.min(...hours), max = Math.max(...hours);
    const arr = []; for (let h = min; h <= max; h++) arr.push(h);
    return arr;
  };
  const blockedHours = new Set([...routineSpanHours(morningRoutine), ...routineSpanHours(eveningRoutine)]);
  const todayPlannerTasksGlobal = plannerTasks.filter(t => t.scheduled_date === todayKeyGlobal);
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
      setBilan(row?.bilan || { humeur:"", bien:"", ameliore:"", taches:"", moment:"", gratitude:"", libre:"" });
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

  // Charger données analyse depuis Supabase
  useEffect(() => {
    if (view !== "analyse") return;
    const loadAnalyse = async () => {
      const last7 = getLast7Days();
      const last6m = getLast6Months();
      const allKeys = [...new Set([...last7])];
      const results = {};
      for (const k of allKeys) {
        const t = await dbGet("daily_tasks", k);
        const r = await dbGet("daily_routines", k);
        results[k] = {
          tasksDone: t ? Object.values(t.checked_tasks||{}).filter(Boolean).length : 0,
          routineDone: r ? Object.values(r.checked_routine||{}).filter(Boolean).length : 0,
          hasData: !!(t || r),
        };
      }
      // Mois : récupérer toutes les clés du mois
      const monthResults = {};
      for (const mKey of last6m) {
        const [y,m] = mKey.split("-").map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        let totalTasks=0, totalRoutine=0, activeDays=0;
        for (let d=1; d<=daysInMonth; d++) {
          const dk = `${mKey}-${String(d).padStart(2,"0")}`;
          const t = await dbGet("daily_tasks", dk);
          const r = await dbGet("daily_routines", dk);
          if (t || r) {
            totalTasks += t ? Object.values(t.checked_tasks||{}).filter(Boolean).length : 0;
            totalRoutine += r ? Object.values(r.checked_routine||{}).filter(Boolean).length : 0;
            activeDays++;
          }
        }
        monthResults[mKey] = { totalTasks, totalRoutine, activeDays };
      }
      setAnalyseData({ daily: results, monthly: monthResults });
    };
    loadAnalyse();
  }, [view]);

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
    if (plannerTasks.length > 0 && !rescheduledRef.current) runAutoReschedule();
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
  const connectGoogle = () => {
    if (!window.google || !window.google.accounts) {
      alert("Google n'est pas encore chargé, réessaie dans 2 secondes.");
      return;
    }
    if (!googleTokenClient.current) {
      googleTokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPE,
        callback: (resp) => {
          if (resp && resp.access_token) setGoogleToken(resp.access_token);
        },
      });
    }
    googleTokenClient.current.requestAccessToken();
  };

  const disconnectGoogle = () => { setGoogleToken(null); setGoogleEvents([]); };

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

  const findNextFreeSlot = (fromDateKey, durationMin, excludeTaskId) => {
    const startH = parseInt(settings.workday_start.slice(0,2),10);
    const endH = parseInt(settings.workday_end.slice(0,2),10);
    for (let dayOffset = 0; dayOffset < 21; dayOffset++) {
      const d = new Date(fromDateKey + "T00:00:00"); d.setDate(d.getDate() + dayOffset);
      const dateKey = toDateKey(d);
      const dayTasksList = plannerTasks.filter(t => t.scheduled_date === dateKey && t.id !== excludeTaskId);
      if (dayTasksList.length >= 6) continue;
      const dayEvents = googleEvents.filter(ev => { const s = ev.start?.dateTime || ev.start?.date; return s && s.slice(0,10) === dateKey; });
      for (let h = startH; h < endH; h++) {
        if (isSlotFree(dateKey, h, durationMin, dayTasksList, dayEvents)) return { dateKey, time: `${pad2(h)}:00` };
      }
    }
    return null;
  };

  const autoScheduleInbox = async () => {
    setAutoScheduling(true);
    const todayKey = getTodayKey();
    for (const task of inboxTasks) {
      const slot = findNextFreeSlot(todayKey, task.duration_minutes || 30, task.id);
      if (slot) await patchPlannerTask(task.id, { scheduled_date: slot.dateKey, scheduled_time: slot.time });
    }
    setAutoScheduling(false);
  };

  const runAutoReschedule = async () => {
    if (rescheduledRef.current || !settings.auto_reschedule) return;
    rescheduledRef.current = true;
    const todayKey = getTodayKey();
    const late = plannerTasks.filter(t => t.scheduled_date && t.scheduled_date < todayKey && !t.completed);
    for (const task of late) {
      const slot = findNextFreeSlot(todayKey, task.duration_minutes || 30, task.id);
      if (slot) await patchPlannerTask(task.id, { scheduled_date: slot.dateKey, scheduled_time: slot.time });
    }
  };

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

  const CheckBox = ({ checked, color = "#68d391" }) => (
    <div style={{
      width: 26, height: 26, borderRadius: 5, flexShrink: 0,
      border: `2px solid ${checked ? color : "#2a3545"}`,
      background: checked ? color : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
    }}>
      {checked && <span style={{ color: "#0a0c10", fontSize: 13, fontWeight: "bold" }}>✓</span>}
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

  const weekTasks = weeklyData.reduce((a,d) => a+d.tasks, 0);
  const weekRoutine = weeklyData.reduce((a,d) => a+d.routine, 0);
  const weekMax = weeklyData.length * (6 + MORNING_ROUTINE.length + EVENING_ROUTINE.length);
  const weekScore = weekMax > 0 ? Math.round((weekTasks + weekRoutine) / weekMax * 100) : 0;

  const BarChart = ({ data, maxVal = 9 }) => (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 64 }}>
            <div style={{ flex:1, background:"#68d391", borderRadius:"3px 3px 0 0", height:`${Math.min((d.tasks??0)/maxVal*100,100)}%`, minHeight:(d.tasks??0)>0?3:0, opacity:0.85, transition:"height 0.4s ease" }} />
            <div style={{ flex:1, background:"#8ab4f8", borderRadius:"3px 3px 0 0", height:`${Math.min((d.routine??0)/(d.total??9)*100,100)}%`, minHeight:(d.routine??0)>0?3:0, opacity:0.85, transition:"height 0.4s ease" }} />
          </div>
          <div style={{ fontSize:9, color:"#4a5a6a", fontFamily:"monospace", textTransform:"uppercase" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#0a0c10", color:"#e8e0d4", fontFamily:"'Georgia', serif" }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0d1219 0%,#141b2a 100%)", borderBottom:"1px solid #1e2a3a", padding:"18px 24px 0", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:4, color:"#5a7a5a", textTransform:"uppercase", fontFamily:"monospace", marginBottom:3, display:"flex", alignItems:"center", gap:8 }}>
              DISCIPLINE SYSTEM
              <span style={{ fontSize:9, color: syncing ? "#f0b429" : syncOk === true ? "#68d391" : syncOk === false ? "#fb8a4a" : "#3a4a5a" }}>
                {syncing ? "⟳ sync..." : syncOk === true ? "● en ligne" : syncOk === false ? "● hors ligne" : ""}
              </span>
            </div>
            <div style={{ fontSize:20, fontWeight:"bold", color:"#d4c9a0", letterSpacing:0.5 }}>{dateStr}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"flex-end" }}>
              <div style={{ fontSize:26, fontWeight:"bold", color:"#8ab4f8", fontFamily:"monospace" }}>{timeStr}</div>
              <div onClick={() => setShowShortcuts(true)} title="Raccourcis clavier (?)" style={{ width:22, height:22, borderRadius:"50%", border:"1px solid #2a3a4a", color:"#5a6a7a", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>?</div>
            </div>
            <div style={{ fontSize:10, color:"#4a5a6a", letterSpacing:1, marginTop:2 }}>
              {completedMorn}/{MORNING_ROUTINE.length} matin · {completedTasks}/{todayPlannerTasksGlobal.length || 6} tâches · {completedEve}/{EVENING_ROUTINE.length} soir
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:4, overflowX:"auto" }}>
          {NAV.map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)} style={{
              padding:"8px 14px", borderRadius:"6px 6px 0 0", border:"none", cursor:"pointer",
              fontSize:11, fontFamily:"monospace", letterSpacing:0.5, whiteSpace:"nowrap",
              background: view===tab.id ? "#0a0c10" : "transparent",
              color: view===tab.id ? "#d4c9a0" : "#5a6a7a",
              borderTop: view===tab.id ? "1px solid #1e2a3a" : "1px solid transparent",
              borderLeft: view===tab.id ? "1px solid #1e2a3a" : "1px solid transparent",
              borderRight: view===tab.id ? "1px solid #1e2a3a" : "1px solid transparent",
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
                <div style={{ fontSize:10, letterSpacing:4, color:"#68d391", textTransform:"uppercase", marginBottom:5 }}>Vue unifiée</div>
                <div style={{ fontSize:26, color:"#e8e0d4", fontWeight:"bold", textTransform:"capitalize" }}>{dateStr}</div>
              </div>

              {/* Jauges */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:22 }}>
                {[
                  { label:"Routine Matin", done:completedMorn, total:MORNING_ROUTINE.length, color:"#f0b429" },
                  { label:"Tâches du jour", done:doneToday, total:Math.max(todayPlannerTasks.length,1), color:"#68d391" },
                  { label:"Routine Soir", done:completedEve, total:EVENING_ROUTINE.length, color:"#8ab4f8" },
                ].map(({ label,done,total,color }) => {
                  const pct = Math.round((done/total)*100);
                  const circ = 2*Math.PI*30;
                  return (
                    <div key={label} style={{ background:"#0f1520", borderRadius:10, padding:"18px 12px", border:"1px solid #1a2535", textAlign:"center" }}>
                      <svg width="70" height="70" viewBox="0 0 70 70" style={{ display:"block", margin:"0 auto 10px" }}>
                        <circle cx="35" cy="35" r="30" fill="none" stroke="#1a2535" strokeWidth="5"/>
                        <circle cx="35" cy="35" r="30" fill="none" stroke={color} strokeWidth="5"
                          strokeDasharray={`${(pct/100)*circ} ${circ}`} strokeLinecap="round"
                          transform="rotate(-90 35 35)" style={{ transition:"stroke-dasharray 0.5s ease" }}/>
                        <text x="35" y="39" textAnchor="middle" fill={color} fontSize="14" fontWeight="bold" fontFamily="monospace">{pct}%</text>
                      </svg>
                      <div style={{ fontSize:10, color:"#5a6a7a", letterSpacing:2, textTransform:"uppercase" }}>{label}</div>
                      <div style={{ fontSize:16, color, fontWeight:"bold", marginTop:3 }}>{done}/{total}</div>
                    </div>
                  );
                })}
              </div>

              {/* Tâches du jour (max 6, gérées depuis le Planificateur) */}
              <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px", marginBottom:16 }}>
                <div style={{ fontSize:10, letterSpacing:3, color:"#68d391", textTransform:"uppercase", marginBottom:12 }}>✅ Tâches du jour ({doneToday}/{todayPlannerTasks.length || 0} · max 6)</div>
                {todayPlannerTasks.length === 0 && <div style={{ fontSize:11, color:"#3a4a5a", fontStyle:"italic" }}>Aucune tâche planifiée aujourd'hui — ajoute-en depuis le 🗓️ Planificateur.</div>}
                {todayPlannerTasks.map(t => {
                  const pr = PRIORITIES.find(p => p.val === t.priority) || PRIORITIES[1];
                  return (
                    <div key={t.id} onClick={() => toggleTaskDone(t)} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid #141e2a", cursor:"pointer" }}>
                      <CheckBox checked={!!t.completed} color={pr.color}/>
                      {t.scheduled_time && <span style={{ fontSize:10, color:"#8ab4f8", fontFamily:"monospace" }}>{t.scheduled_time.slice(0,5)}</span>}
                      <div style={{ fontSize:13, flex:1, color:t.completed?"#3a5a3a":"#b8b0a4", textDecoration:t.completed?"line-through":"none" }}>{t.title}</div>
                    </div>
                  );
                })}
              </div>

              {/* Routines compactes */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"14px 16px" }}>
                  <div style={{ fontSize:10, letterSpacing:2, color:"#f0b429", textTransform:"uppercase", marginBottom:10 }}>🌅 Matin ({completedMorn}/{MORNING_ROUTINE.length})</div>
                  {MORNING_ROUTINE.map(r => (
                    <div key={r.id} onClick={() => toggleRoutine(r.id)} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", cursor:"pointer" }}>
                      <CheckBox checked={!!checkedRoutine[r.id]} color="#f0b429"/>
                      <div style={{ fontSize:12, color:checkedRoutine[r.id]?"#4a7a3a":"#b8b0a4", textDecoration:checkedRoutine[r.id]?"line-through":"none" }}>{r.icon} {r.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"14px 16px" }}>
                  <div style={{ fontSize:10, letterSpacing:2, color:"#8ab4f8", textTransform:"uppercase", marginBottom:10 }}>🌙 Soir ({completedEve}/{EVENING_ROUTINE.length})</div>
                  {EVENING_ROUTINE.map(r => (
                    <div key={r.id} onClick={() => toggleRoutine(r.id)} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", cursor:"pointer" }}>
                      <CheckBox checked={!!checkedRoutine[r.id]} color="#8ab4f8"/>
                      <div style={{ fontSize:12, color:checkedRoutine[r.id]?"#3a3a7a":"#b8b0a4", textDecoration:checkedRoutine[r.id]?"line-through":"none" }}>{r.icon} {r.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div onClick={() => setView("bilan")} style={{ background:"#0d1219", borderRadius:9, border:"1px solid #1a2535", padding:"14px 18px", textAlign:"center", cursor:"pointer", marginBottom:12 }}>
                <div style={{ fontSize:12, color:"#c8c0a0" }}>✍️ Faire le bilan de la journée →</div>
              </div>

              <div style={{ background:"#0d1219", borderRadius:10, border:"1px solid #1a2535", padding:"16px 20px", textAlign:"center" }}>
                <div style={{ fontSize:14, color:"#c8c0a0", fontStyle:"italic", lineHeight:1.9 }}>
                  "La discipline n'est pas une contrainte.<br/>C'est la forme la plus haute de liberté."
                </div>
                <div style={{ fontSize:10, color:"#3a4a5a", letterSpacing:3, marginTop:10, textTransform:"uppercase" }}>Système de Discipline Personnelle</div>
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
                <div style={{ padding:"12px", marginBottom:8, background:"#0a0f18", borderRadius:9, border:`1px solid ${color}` }}>
                  <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                    <input value={r.icon} onChange={e => patchRoutineItem(period, r.id, { icon: e.target.value })} style={{ width:40, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:5, padding:"6px", color:"#e8e0d4", fontSize:14, textAlign:"center", outline:"none" }} />
                    <input type="time" value={r.time} onChange={e => patchRoutineItem(period, r.id, { time: e.target.value })} style={{ width:100, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:5, padding:"6px", color:"#e8e0d4", fontSize:12, outline:"none" }} />
                    <input value={r.label} onChange={e => patchRoutineItem(period, r.id, { label: e.target.value })} style={{ flex:1, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:5, padding:"6px 8px", color:"#e8e0d4", fontSize:13, outline:"none" }} />
                  </div>
                  <textarea value={r.desc} onChange={e => patchRoutineItem(period, r.id, { desc: e.target.value })} rows={2}
                    style={{ width:"100%", boxSizing:"border-box", background:"#0a0c10", border:"1px solid #1a2535", borderRadius:5, padding:"6px 8px", color:"#b8b0a4", fontSize:12, outline:"none", resize:"vertical", marginBottom:6 }} />
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => setEditingRoutineId(null)} style={{ flex:1, background:"#68d391", border:"none", borderRadius:5, padding:"6px 0", color:"#0a0c10", fontSize:12, fontWeight:"bold", cursor:"pointer" }}>OK</button>
                    <button onClick={() => deleteRoutineItem(period, r.id)} style={{ background:"#2a1520", border:"1px solid #4a2030", borderRadius:5, padding:"6px 12px", color:"#fb8a4a", fontSize:12, cursor:"pointer" }}>🗑️</button>
                  </div>
                </div>
              );
            }
            return (
              <div style={{ display:"flex", gap:14, padding:"14px", marginBottom:8, background:checkedRoutine[r.id]?bgOn:"#0f1520", borderRadius:9, border:`1px solid ${checkedRoutine[r.id]?color+"55":"#1a2535"}`, transition:"all 0.2s" }}>
                <div onClick={() => toggleRoutine(r.id)} style={{ display:"flex", gap:14, flex:1, cursor:"pointer" }}>
                  <div style={{ flexShrink:0, width:44, textAlign:"center", paddingTop:2 }}>
                    <div style={{ fontSize:20 }}>{r.icon}</div>
                    <div style={{ fontSize:10, color, fontFamily:"monospace", marginTop:2 }}>{r.time}</div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:"bold", marginBottom:4, color:checkedRoutine[r.id]?"#4a7a3a":"#d4c9a0", textDecoration:checkedRoutine[r.id]?"line-through":"none" }}>{r.label}</div>
                    <div style={{ fontSize:12, color:"#5a6a7a", lineHeight:1.5 }}>{r.desc}</div>
                  </div>
                  <CheckBox checked={!!checkedRoutine[r.id]} color={color}/>
                </div>
                <div onClick={() => setEditingRoutineId(r.id)} style={{ fontSize:12, color:"#2a3a4a", cursor:"pointer", paddingLeft:6 }}>✏️</div>
              </div>
            );
          };

          return (
            <div>
              <div style={{ marginBottom:22 }}>
                <div style={{ fontSize:10, letterSpacing:4, color:"#f0b429", textTransform:"uppercase", marginBottom:5 }}>Rituels quotidiens</div>
                <div style={{ fontSize:26, color:"#e8e0d4", fontWeight:"bold" }}>Routines</div>
                <div style={{ fontSize:12, color:"#5a6a7a", marginTop:5 }}>{completedMorn+completedEve}/{MORNING_ROUTINE.length+EVENING_ROUTINE.length} étapes accomplies · clique ✏️ pour modifier</div>
              </div>

              <div style={{ fontSize:11, letterSpacing:2, color:"#f0b429", textTransform:"uppercase", marginBottom:10 }}>🌅 Matin ({completedMorn}/{MORNING_ROUTINE.length})</div>
              {MORNING_ROUTINE.map(r => <RoutineRow key={r.id} r={r} period="morning" color="#f0b429" bgOn="#0c1810" />)}
              <button onClick={() => addRoutineItem("morning")} style={{ width:"100%", background:"#0a0f18", border:"1px dashed #1a2535", borderRadius:9, padding:"8px", color:"#3a4a5a", fontSize:12, cursor:"pointer", marginBottom:20 }}>+ Ajouter une étape matin</button>

              <div style={{ fontSize:11, letterSpacing:2, color:"#8ab4f8", textTransform:"uppercase", margin:"22px 0 10px" }}>🌙 Soir ({completedEve}/{EVENING_ROUTINE.length})</div>
              {EVENING_ROUTINE.map(r => <RoutineRow key={r.id} r={r} period="evening" color="#8ab4f8" bgOn="#0c1018" />)}
              <button onClick={() => addRoutineItem("evening")} style={{ width:"100%", background:"#0a0f18", border:"1px dashed #1a2535", borderRadius:9, padding:"8px", color:"#3a4a5a", fontSize:12, cursor:"pointer", marginBottom:20 }}>+ Ajouter une étape soir</button>

              <div style={{ background:"#0d1018", borderRadius:9, border:"1px solid #1a2030", padding:"16px 18px", textAlign:"center", marginTop:12 }}>
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

          const TaskCard = ({ task, checkable = true }) => {
            const lbl = labelById(task.label_id);
            const pr = PRIORITIES.find(p => p.val === task.priority) || PRIORITIES[1];
            return (
              <div
                draggable
                onDragStart={() => setDragTaskId(task.id)}
                onClick={(e) => { e.stopPropagation(); setEditingTaskId(task.id); }}
                style={{
                  background:"#0f1520", border:`1px solid ${lbl?lbl.color+"55":"#1a2535"}`, borderLeft:`3px solid ${pr.color}`,
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
                  <div style={{ flex:1, fontSize:12, color: task.completed?"#3a5a3a":"#c8c0b4", textDecoration:task.completed?"line-through":"none" }}>
                    {task.title}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, marginTop:5, flexWrap:"wrap" }}>
                  {task.duration_minutes && <span style={{ fontSize:9, color:"#5a6a7a", fontFamily:"monospace" }}>⏱ {task.duration_minutes}min</span>}
                  {task.scheduled_time && <span style={{ fontSize:9, color:"#8ab4f8", fontFamily:"monospace" }}>{task.scheduled_time.slice(0,5)}</span>}
                  {lbl && <span style={{ fontSize:9, color:lbl.color, background:lbl.color+"22", borderRadius:4, padding:"1px 6px" }}>{lbl.name}</span>}
                  {task.recurrence!=="aucune" && <span style={{ fontSize:9, color:"#5a6a7a" }}>🔁 {RECURRENCES.find(r=>r.val===task.recurrence)?.label}</span>}
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
                <div style={{ fontSize:10, letterSpacing:4, color:"#8ab4f8", textTransform:"uppercase", marginBottom:5 }}>Organisation</div>
                <div style={{ fontSize:26, color:"#e8e0d4", fontWeight:"bold" }}>Planificateur</div>
                <div style={{ fontSize:12, color:"#5a6a7a", marginTop:5 }}>Clique un jour ou un créneau pour créer une tâche · glisse pour replanifier</div>
              </div>

              {/* Sélecteur de vue */}
              <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                {[["day","Jour"],["3day","3 jours"],["week","Semaine"]].map(([m,l]) => (
                  <button key={m} onClick={() => setPlannerViewMode(m)} style={{
                    background: plannerViewMode===m ? "#8ab4f822" : "#0f1520", border:`1px solid ${plannerViewMode===m?"#8ab4f8":"#1a2535"}`,
                    borderRadius:6, color: plannerViewMode===m?"#8ab4f8":"#5a6a7a", padding:"5px 12px", cursor:"pointer", fontSize:11 }}>{l}</button>
                ))}
              </div>

              {/* Barre navigation */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                <button onClick={() => shiftRange(-1)}
                  style={{ background:"#0f1520", border:"1px solid #1a2535", borderRadius:6, color:"#8ab4f8", padding:"6px 12px", cursor:"pointer", fontSize:13 }}>←</button>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, color:"#c8c0b4", fontFamily:"monospace", textTransform:"capitalize" }}>{rangeLabel}</span>
                  <button onClick={() => setPlannerStart(startOfDay())} style={{ background:"#0f1520", border:"1px solid #1a2535", borderRadius:6, color:"#5a6a7a", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>Aujourd'hui</button>
                  <button onClick={() => setShowLabelManager(s => !s)} style={{ background:"#0f1520", border:"1px solid #1a2535", borderRadius:6, color:"#c084fc", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>🏷️ Étiquettes</button>
                  {inboxTasks.length > 0 && (
                    <button onClick={autoScheduleInbox} disabled={autoScheduling} style={{ background:"#0f1a12", border:"1px solid #2a4a20", borderRadius:6, color:"#68d391", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>
                      {autoScheduling ? "⟳ Planification..." : "🪄 Auto-planifier l'inbox"}
                    </button>
                  )}
                  {googleToken ? (
                    <button onClick={disconnectGoogle} style={{ background:"#0d1a12", border:"1px solid #2a4a20", borderRadius:6, color:"#68d391", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>📅 Google connecté {googleLoading?"⟳":""}</button>
                  ) : (
                    <button onClick={connectGoogle} style={{ background:"#0f1520", border:"1px solid #1a2535", borderRadius:6, color:"#8ab4f8", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>📅 Connecter Google Calendar</button>
                  )}
                </div>
                <button onClick={() => shiftRange(1)}
                  style={{ background:"#0f1520", border:"1px solid #1a2535", borderRadius:6, color:"#8ab4f8", padding:"6px 12px", cursor:"pointer", fontSize:13 }}>→</button>
              </div>

              {showLabelManager && (
                <div style={{ background:"#0f1520", border:"1px solid #1a2535", borderRadius:10, padding:14, marginBottom:14 }}>
                  <div style={{ fontSize:10, letterSpacing:2, color:"#c084fc", textTransform:"uppercase", marginBottom:10 }}>Gérer les étiquettes</div>
                  {plannerLabels.map(l => (
                    <div key={l.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <div style={{ width:12, height:12, borderRadius:3, background:l.color }} />
                      <span style={{ fontSize:12, color:"#c8c0b4", flex:1 }}>{l.name}</span>
                      <button onClick={() => deleteLabel(l.id)} style={{ background:"none", border:"none", color:"#5a6a7a", cursor:"pointer", fontSize:12 }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:6, marginTop:10, alignItems:"center", flexWrap:"wrap" }}>
                    <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)} placeholder="Nom de l'étiquette"
                      style={{ flex:1, minWidth:120, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:5, padding:"6px 10px", color:"#e8e0d4", fontSize:12, outline:"none" }} />
                    {LABEL_COLORS.map(c => (
                      <div key={c} onClick={() => setNewLabelColor(c)} style={{ width:18, height:18, borderRadius:4, background:c, cursor:"pointer", border: newLabelColor===c?"2px solid #fff":"2px solid transparent" }} />
                    ))}
                    <button onClick={addLabel} style={{ background:"#68d391", border:"none", borderRadius:5, padding:"6px 12px", color:"#0a0c10", fontSize:12, fontWeight:"bold", cursor:"pointer" }}>+ Ajouter</button>
                  </div>
                </div>
              )}

              {plannerLoading ? (
                <div style={{ textAlign:"center", padding:40, color:"#4a5a6a", fontFamily:"monospace" }}>Chargement...</div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:`200px repeat(${weekDays.length}, minmax(150px,1fr))`, gap:8, overflowX:"auto" }}>
                  {/* Inbox */}
                  <div onDragOver={e => e.preventDefault()} onDrop={dropOnInbox}
                    style={{ background:"#0a0f18", border:"1px dashed #1a2535", borderRadius:9, padding:10, minHeight:200 }}>
                    <div style={{ fontSize:10, letterSpacing:2, color:"#5a6a7a", textTransform:"uppercase", marginBottom:8 }}>📥 Inbox</div>
                    <div style={{ display:"flex", gap:4, marginBottom:8 }}>
                      <input value={newInboxTitle} onChange={e => setNewInboxTitle(e.target.value)}
                        onKeyDown={e => e.key==="Enter" && addInboxTask()} placeholder="Nouvelle tâche..."
                        style={{ flex:1, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:5, padding:"6px 8px", color:"#e8e0d4", fontSize:11, outline:"none" }} />
                      <button onClick={addInboxTask} style={{ background:"#1a2535", border:"none", borderRadius:5, color:"#68d391", padding:"0 8px", cursor:"pointer" }}>+</button>
                    </div>
                    {inboxTasks.map(t => <TaskCard key={t.id} task={t} checkable={false} />)}
                    {inboxTasks.length===0 && <div style={{ fontSize:11, color:"#2a3a4a", textAlign:"center", marginTop:10 }}>Vide</div>}
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
                        style={{ background: isToday?"#0d1a12":"#0a0f18", border:`1px solid ${isToday?"#2a4a20":"#141e2a"}`, borderRadius:9, padding:8, minWidth:130 }}>
                        <div onClick={() => addTaskAt(dateKey)} style={{ textAlign:"center", marginBottom:8, cursor:"pointer" }} title="Cliquer pour ajouter une tâche ce jour">
                          <div style={{ fontSize:10, color:isToday?"#68d391":"#5a6a7a", fontFamily:"monospace", textTransform:"uppercase" }}>{day.toLocaleDateString("fr-FR",{weekday:"short"})}</div>
                          <div style={{ fontSize:15, color:isToday?"#68d391":"#c8c0b4", fontWeight:"bold" }}>{day.getDate()} <span style={{fontSize:11}}>+</span></div>
                          <div style={{ fontSize:9, color: dayTasks.length>=6 ? "#fb8a4a" : "#3a4a5a", fontFamily:"monospace" }}>{dayTasks.length}/6</div>
                        </div>
                        {eventsForDay(dateKey).map(ev => (
                          <div key={ev.id} style={{ background:"#1a1530", border:"1px solid #3a2a5a", borderRadius:6, padding:"5px 8px", marginBottom:6, fontSize:11, color:"#c084fc" }}>
                            📅 {ev.summary || "(sans titre)"}
                            {ev.start?.dateTime && <div style={{ fontSize:9, color:"#8a6ab0", marginTop:2 }}>{new Date(ev.start.dateTime).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>}
                          </div>
                        ))}
                        {untimed.map(t => <TaskCard key={t.id} task={t} />)}
                        <div style={{ borderTop:"1px solid #141e2a", marginTop:4, paddingTop:4 }}>
                          {PLANNER_HOURS.map(h => {
                            const slotTasks = dayTasks.filter(t => t.scheduled_time && parseInt(t.scheduled_time.slice(0,2),10)===h);
                            const blocked = blockedHours.has(h);
                            return (
                              <div key={h}
                                onDragOver={e => { if (!blocked) e.preventDefault(); }}
                                onDrop={(e) => { e.stopPropagation(); if (!blocked) dropOnSlot(dateKey, h); }}
                                onClick={() => { if (!blocked) addTaskAt(dateKey, `${pad2(h)}:00`); }}
                                style={{ minHeight:26, borderBottom:"1px solid #10182422", padding:"2px 0",
                                  cursor: blocked ? "not-allowed" : "pointer",
                                  background: blocked ? "#1a141422" : "transparent" }}
                                title={blocked ? "Créneau réservé à une routine" : "Cliquer pour un time-blocking à cette heure"}>
                                <div style={{ fontSize:8, color: blocked ? "#5a4a3a" : "#2a3a4a", fontFamily:"monospace" }}>{pad2(h)}h{blocked ? " 🔒" : ""}</div>
                                {slotTasks.map(t => <TaskCard key={t.id} task={t} />)}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Editeur de tâche */}
              {editingTask && (
                <div onClick={() => setEditingTaskId(null)} style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
                  <div onClick={e => e.stopPropagation()} style={{ background:"#0f1520", border:"1px solid #1a2535", borderRadius:10, padding:20, width:320, maxWidth:"90vw" }}>
                    <div style={{ fontSize:10, letterSpacing:2, color:"#8ab4f8", textTransform:"uppercase", marginBottom:12 }}>Modifier la tâche</div>
                    <input value={editingTask.title} onChange={e => patchPlannerTask(editingTask.id, { title: e.target.value })}
                      autoFocus
                      style={{ width:"100%", boxSizing:"border-box", background:"#0a0c10", border:"1px solid #1a2535", borderRadius:6, padding:"8px 10px", color:"#e8e0d4", fontSize:13, marginBottom:10, outline:"none" }} />

                    <div style={{ fontSize:10, color:"#5a6a7a", marginBottom:5 }}>📅 Échéance (date & heure)</div>
                    <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                      <input type="date" value={editingTask.scheduled_date || ""} onChange={e => patchPlannerTask(editingTask.id, { scheduled_date: e.target.value || null })}
                        style={{ flex:1, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:6, padding:"7px 8px", color:"#e8e0d4", fontSize:12, outline:"none" }} />
                      <input type="time" value={editingTask.scheduled_time ? editingTask.scheduled_time.slice(0,5) : ""} onChange={e => patchPlannerTask(editingTask.id, { scheduled_time: e.target.value ? e.target.value+":00" : null })}
                        style={{ width:90, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:6, padding:"7px 8px", color:"#e8e0d4", fontSize:12, outline:"none" }} />
                    </div>
                    {!editingTask.scheduled_date && <div style={{ fontSize:10, color:"#3a4a5a", marginBottom:10, fontStyle:"italic" }}>Sans date = reste dans l'Inbox</div>}

                    <div style={{ fontSize:10, color:"#5a6a7a", marginBottom:5 }}>⏱ Durée</div>
                    <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                      {[15,30,45,60,90,120].map(m => (
                        <div key={m} onClick={() => patchPlannerTask(editingTask.id, { duration_minutes: m })}
                          style={{ flex:1, textAlign:"center", padding:"5px 0", borderRadius:6, cursor:"pointer", fontSize:10,
                            background: editingTask.duration_minutes===m ? "#8ab4f822" : "#0a0f18",
                            border:`1px solid ${editingTask.duration_minutes===m?"#8ab4f8":"#1a2535"}`,
                            color: editingTask.duration_minutes===m?"#8ab4f8":"#5a6a7a" }}>{m>=60?`${m/60}h${m%60||""}`:`${m}m`}</div>
                      ))}
                    </div>

                    <div style={{ fontSize:10, color:"#5a6a7a", marginBottom:5 }}>Priorité</div>
                    <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                      {PRIORITIES.map(p => (
                        <div key={p.val} onClick={() => patchPlannerTask(editingTask.id, { priority: p.val })}
                          style={{ flex:1, textAlign:"center", padding:"6px 0", borderRadius:6, cursor:"pointer", fontSize:11,
                            background: editingTask.priority===p.val ? p.color+"33" : "#0a0f18",
                            border:`1px solid ${editingTask.priority===p.val?p.color:"#1a2535"}`, color: p.color }}>{p.label}</div>
                      ))}
                    </div>

                    <div style={{ fontSize:10, color:"#5a6a7a", marginBottom:5 }}>Étiquette</div>
                    <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                      <div onClick={() => patchPlannerTask(editingTask.id, { label_id: null })}
                        style={{ padding:"4px 10px", borderRadius:5, cursor:"pointer", fontSize:11, color:"#5a6a7a", border:`1px solid ${!editingTask.label_id?"#5a6a7a":"#1a2535"}` }}>Aucune</div>
                      {plannerLabels.map(l => (
                        <div key={l.id} onClick={() => patchPlannerTask(editingTask.id, { label_id: l.id })}
                          style={{ padding:"4px 10px", borderRadius:5, cursor:"pointer", fontSize:11, color:l.color,
                            background: editingTask.label_id===l.id ? l.color+"22" : "transparent",
                            border:`1px solid ${editingTask.label_id===l.id?l.color:"#1a2535"}` }}>{l.name}</div>
                      ))}
                    </div>

                    <div style={{ fontSize:10, color:"#5a6a7a", marginBottom:5 }}>⏳ Temps passé</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, background:"#0a0f18", border:"1px solid #1a2535", borderRadius:6, padding:"8px 10px" }}>
                      <span style={{ fontSize:12, color:"#c8c0b4", fontFamily:"monospace", flex:1 }}>
                        {editingTask.timer_started_at ? "⟳ Chrono en cours..." : `${editingTask.time_spent_minutes || 0} min cumulées`}
                      </span>
                      {editingTask.timer_started_at ? (
                        <button onClick={() => stopTimer(editingTask)} style={{ background:"#fb8a4a", border:"none", borderRadius:5, padding:"5px 12px", color:"#0a0c10", fontSize:11, fontWeight:"bold", cursor:"pointer" }}>⏹ Stop</button>
                      ) : (
                        <button onClick={() => startTimer(editingTask)} style={{ background:"#68d391", border:"none", borderRadius:5, padding:"5px 12px", color:"#0a0c10", fontSize:11, fontWeight:"bold", cursor:"pointer" }}>▶ Démarrer</button>
                      )}
                    </div>

                    <div style={{ fontSize:10, color:"#5a6a7a", marginBottom:5 }}>Récurrence</div>
                    <select value={editingTask.recurrence} onChange={e => patchPlannerTask(editingTask.id, { recurrence: e.target.value })}
                      style={{ width:"100%", background:"#0a0c10", border:"1px solid #1a2535", borderRadius:6, padding:"7px 10px", color:"#e8e0d4", fontSize:12, marginBottom:14, outline:"none" }}>
                      {RECURRENCES.map(r => <option key={r.val} value={r.val}>{r.label}</option>)}
                    </select>

                    {goals.length > 0 && (
                      <>
                        <div style={{ fontSize:10, color:"#5a6a7a", marginBottom:5 }}>🎯 Objectif lié (Effet Cumulé)</div>
                        <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
                          <div onClick={() => patchPlannerTask(editingTask.id, { goal_id: null })}
                            style={{ padding:"4px 10px", borderRadius:5, cursor:"pointer", fontSize:11, color:"#5a6a7a", border:`1px solid ${!editingTask.goal_id?"#5a6a7a":"#1a2535"}` }}>Aucun</div>
                          {goals.map(g => (
                            <div key={g.id} onClick={() => patchPlannerTask(editingTask.id, { goal_id: g.id })}
                              style={{ padding:"4px 10px", borderRadius:5, cursor:"pointer", fontSize:11, color:g.color,
                                background: editingTask.goal_id===g.id ? g.color+"22" : "transparent",
                                border:`1px solid ${editingTask.goal_id===g.id?g.color:"#1a2535"}` }}>{g.title}</div>
                          ))}
                        </div>
                      </>
                    )}

                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={() => { deletePlannerTask(editingTask.id); setEditingTaskId(null); }}
                        style={{ flex:1, background:"#2a1520", border:"1px solid #4a2030", borderRadius:6, color:"#fb8a4a", padding:"8px 0", cursor:"pointer", fontSize:12 }}>🗑️ Supprimer</button>
                      <button onClick={() => setEditingTaskId(null)}
                        style={{ flex:1, background:"#68d391", border:"none", borderRadius:6, color:"#0a0c10", padding:"8px 0", cursor:"pointer", fontSize:12, fontWeight:"bold" }}>Fermer</button>
                    </div>
                    {googleToken && (
                      <button onClick={() => sendTaskToGoogle(editingTask)}
                        style={{ width:"100%", marginTop:8, background:"#1a1530", border:"1px solid #3a2a5a", borderRadius:6, color:"#c084fc", padding:"8px 0", cursor:"pointer", fontSize:12 }}>📅 Envoyer vers Google Calendar</button>
                    )}
                  </div>
                </div>
              )}

              <div style={{ background:"#0d1219", borderRadius:9, border:"1px solid #1a2535", padding:"12px 16px", marginTop:16, textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#3a4a5a", lineHeight:1.7 }}>
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
              <div style={{ fontSize:10, letterSpacing:4, color:"#68d391", textTransform:"uppercase", marginBottom:5 }}>Long terme</div>
              <div style={{ fontSize:26, color:"#e8e0d4", fontWeight:"bold" }}>Life</div>
              <div style={{ fontSize:12, color:"#5a6a7a", marginTop:5 }}>Objectifs majeurs et habitudes — la base de l'Effet Cumulé</div>
            </div>

            {/* Objectifs */}
            <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"#f0b429", textTransform:"uppercase", marginBottom:12 }}>🎯 Mes objectifs (max 3)</div>
              {goals.map(g => {
                const { done, total } = goalProgress(g.id);
                const pct = total > 0 ? Math.round((done/total)*100) : 0;
                const cat = GOAL_CATEGORIES.find(c => c.val === g.category) || GOAL_CATEGORIES[0];
                return (
                  <div key={g.id} style={{ marginBottom:14, paddingBottom:12, borderBottom:"1px solid #141e2a" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      {editingGoalId === g.id ? (
                        <input value={g.title} onChange={e => patchGoal(g.id, { title: e.target.value })} onBlur={() => setEditingGoalId(null)}
                          onKeyDown={e => e.key==="Enter" && setEditingGoalId(null)} autoFocus
                          style={{ flex:1, background:"#0a0c10", border:"1px solid #2a3a4a", borderRadius:5, padding:"4px 8px", color:"#e8e0d4", fontSize:13, outline:"none" }} />
                      ) : (
                        <div onClick={() => setEditingGoalId(g.id)} style={{ fontSize:13, color:g.color, fontWeight:"bold", cursor:"pointer" }}>{g.title}</div>
                      )}
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:11, color:"#5a6a7a", fontFamily:"monospace" }}>{done}/{total} actions</span>
                        <span onClick={() => deleteGoal(g.id)} style={{ fontSize:11, color:"#3a4a5a", cursor:"pointer" }}>✕</span>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:5, marginBottom:8, flexWrap:"wrap" }}>
                      {GOAL_CATEGORIES.map(c => (
                        <div key={c.val} onClick={() => patchGoal(g.id, { category: c.val })}
                          style={{ padding:"3px 9px", borderRadius:5, cursor:"pointer", fontSize:10,
                            background: g.category===c.val ? g.color+"22" : "#0a0f18",
                            border:`1px solid ${g.category===c.val?g.color:"#1a2535"}`,
                            color: g.category===c.val?g.color:"#5a6a7a" }}>{c.icon} {c.label}</div>
                      ))}
                    </div>
                    <div style={{ height:6, background:"#0a0f18", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:g.color, transition:"width 0.4s" }} />
                    </div>
                  </div>
                );
              })}
              {goals.length < 3 && (
                <div style={{ display:"flex", gap:6, marginTop:10 }}>
                  <input value={newGoalTitle} onChange={e => setNewGoalTitle(e.target.value)} onKeyDown={e => e.key==="Enter" && addGoal()}
                    placeholder="Nouvel objectif majeur (max 3)..."
                    style={{ flex:1, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:5, padding:"7px 10px", color:"#e8e0d4", fontSize:12, outline:"none" }} />
                  <button onClick={addGoal} style={{ background:"#f0b429", border:"none", borderRadius:5, padding:"7px 14px", color:"#0a0c10", fontSize:12, fontWeight:"bold", cursor:"pointer" }}>+ Ajouter</button>
                </div>
              )}
              <div style={{ fontSize:10, color:"#3a4a5a", marginTop:10, fontStyle:"italic" }}>💡 Lie une tâche à un objectif depuis le Planificateur, en cliquant sur la tâche.</div>
            </div>

            {/* Habitudes — calendrier hebdomadaire */}
            <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px" }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"#8ab4f8", textTransform:"uppercase", marginBottom:14 }}>🔁 Mes habitudes — semaine en cours</div>

              <div style={{ display:"grid", gridTemplateColumns:"180px 1fr", gap:10 }}>
                {/* Colonne 1 : liste des habitudes */}
                <div>
                  {activeHabits.map(h => (
                    <div key={h.id} style={{ marginBottom:10 }}>
                      {editingHabitId === h.id ? (
                        <div style={{ background:"#0a0f18", border:`1px solid ${h.color}`, borderRadius:7, padding:8 }}>
                          <input value={h.title} onChange={e => patchHabit(h.id, { title: e.target.value })}
                            style={{ width:"100%", boxSizing:"border-box", background:"#0a0c10", border:"1px solid #1a2535", borderRadius:5, padding:"5px 7px", color:"#e8e0d4", fontSize:12, outline:"none", marginBottom:6 }} />
                          <div style={{ fontSize:9, color:"#5a6a7a", marginBottom:4 }}>Objectif/semaine</div>
                          <div style={{ display:"flex", gap:3, marginBottom:6 }}>
                            {[1,2,3,4,5,6,7].map(n => (
                              <div key={n} onClick={() => patchHabit(h.id, { weekly_target: n })}
                                style={{ flex:1, textAlign:"center", padding:"3px 0", borderRadius:4, cursor:"pointer", fontSize:9,
                                  background: h.weekly_target===n ? h.color+"33" : "#0a0c10",
                                  border:`1px solid ${h.weekly_target===n?h.color:"#1a2535"}`,
                                  color: h.weekly_target===n?h.color:"#5a6a7a" }}>{n}</div>
                            ))}
                          </div>
                          <div style={{ display:"flex", gap:5 }}>
                            <button onClick={() => setEditingHabitId(null)} style={{ flex:1, background:"#68d391", border:"none", borderRadius:5, padding:"5px 0", color:"#0a0c10", fontSize:11, fontWeight:"bold", cursor:"pointer" }}>OK</button>
                            <button onClick={() => archiveHabit(h.id)} style={{ background:"#0a0f18", border:"1px solid #1a2535", borderRadius:5, padding:"5px 8px", color:"#5a6a7a", fontSize:11, cursor:"pointer" }}>📦</button>
                            <button onClick={() => deleteHabit(h.id)} style={{ background:"#2a1520", border:"1px solid #4a2030", borderRadius:5, padding:"5px 8px", color:"#fb8a4a", fontSize:11, cursor:"pointer" }}>🗑️</button>
                          </div>
                        </div>
                      ) : (
                        <div onClick={() => setEditingHabitId(h.id)} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", height:34 }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", background:h.color, flexShrink:0 }} />
                          <div style={{ fontSize:12, color:"#c8c0b4", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.title}</div>
                          <div style={{ fontSize:9, color:"#3a4a5a" }}>✏️</div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:4, marginTop:6 }}>
                    <input value={newHabitTitle} onChange={e => setNewHabitTitle(e.target.value)} onKeyDown={e => e.key==="Enter" && addHabit()}
                      placeholder="+ Habitude..."
                      style={{ flex:1, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:5, padding:"6px 8px", color:"#e8e0d4", fontSize:11, outline:"none" }} />
                    <button onClick={addHabit} style={{ background:"#8ab4f8", border:"none", borderRadius:5, padding:"6px 10px", color:"#0a0c10", fontSize:11, fontWeight:"bold", cursor:"pointer" }}>+</button>
                  </div>
                  {activeHabits.length === 0 && <div style={{ fontSize:11, color:"#3a4a5a", fontStyle:"italic", marginBottom:8 }}>Aucune habitude suivie.</div>}
                </div>

                {/* Colonne 2 : calendrier hebdomadaire */}
                <div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr) 50px", gap:4, marginBottom:6 }}>
                    {DAY_LETTERS.map((l,i) => (
                      <div key={i} style={{ textAlign:"center", fontSize:10, color: toDateKey(habitWeekDays[i])===getTodayKey() ? "#68d391" : "#5a6a7a", fontFamily:"monospace" }}>{l}</div>
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
                                background: done ? h.color : "#0a0f18", border:`1px solid ${done?h.color:"#1a2535"}`,
                                opacity: isFuture?0.3:1,
                                display:"flex", alignItems:"center", justifyContent:"center" }}>
                              {done && <span style={{ fontSize:11, color:"#0a0c10" }}>✓</span>}
                            </div>
                          );
                        })}
                        <svg width="34" height="34" viewBox="0 0 34 34">
                          <circle cx="17" cy="17" r="16" fill="none" stroke="#1a2535" strokeWidth="3"/>
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
                <div style={{ marginTop:14, paddingTop:10, borderTop:"1px solid #141e2a" }}>
                  <div onClick={() => setShowArchivedHabits(s => !s)} style={{ fontSize:10, color:"#3a4a5a", cursor:"pointer" }}>
                    {showArchivedHabits ? "▾" : "▸"} {archivedHabits.length} habitude(s) archivée(s)
                  </div>
                  {showArchivedHabits && archivedHabits.map(h => (
                    <div key={h.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0" }}>
                      <div style={{ fontSize:12, color:"#5a6a7a", flex:1 }}>{h.title}</div>
                      <span onClick={() => patchHabit(h.id, { archived:false })} style={{ fontSize:10, color:"#68d391", cursor:"pointer" }}>Réactiver</span>
                      <span onClick={() => deleteHabit(h.id)} style={{ fontSize:10, color:"#fb8a4a", cursor:"pointer" }}>Supprimer</span>
                    </div>
                  ))}
                </div>
              )}
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
            { field:"bien", icon:"✅", label:"Ce que j'ai bien fait aujourd'hui", placeholder:"Qu'est-ce qui s'est bien passé ? Quelle action ou attitude dont je suis fier ?" },
            { field:"taches", icon:"📋", label:"Tâches non accomplies — pourquoi ?", placeholder:"Quelles tâches je n'ai pas faites, et pour quelle raison ?" },
            { field:"ameliore", icon:"🎯", label:"Ce que j'améliore demain", placeholder:"Quelle est la chose concrète que je vais faire différemment demain ?" },
            { field:"moment", icon:"⭐", label:"Moment fort de la journée", placeholder:"Quel moment ou événement m'a le plus marqué aujourd'hui ?" },
            { field:"gratitude", icon:"🙏", label:"Gratitude — 1 chose positive", placeholder:"Pour quoi suis-je reconnaissant aujourd'hui, même si la journée a été difficile ?" },
          ];
          const inputStyle = {
            width:"100%", background:"#080d14", border:"1px solid #1e2a3a",
            borderRadius:7, padding:"10px 12px", color:"#c8c0b4",
            fontSize:13, fontFamily:"Georgia,serif", lineHeight:1.6,
            outline:"none", resize:"vertical", boxSizing:"border-box",
            minHeight:72,
          };
          return (
            <div>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:10, letterSpacing:4, color:"#f0a070", textTransform:"uppercase", marginBottom:5 }}>Journal du soir</div>
                <div style={{ fontSize:26, color:"#e8e0d4", fontWeight:"bold" }}>Bilan de journée</div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8 }}>
                  <input type="date" value={bilanDate} onChange={e => setBilanDate(e.target.value)}
                    style={{ background:"#0f1520", border:"1px solid #1e2a3a", borderRadius:6, padding:"5px 10px", color:"#8ab4f8", fontSize:12, fontFamily:"monospace", outline:"none" }}/>
                  <div style={{ fontSize:11, color: bilanSaved ? "#68d391" : "#3a4a5a", fontFamily:"monospace" }}>
                    {bilanLoading ? "⟳ chargement..." : bilanSaved ? "● sauvegardé" : "..."}
                  </div>
                </div>
              </div>

              {bilanLoading ? (
                <div style={{ textAlign:"center", padding:"40px", color:"#4a5a6a", fontFamily:"monospace" }}>Chargement...</div>
              ) : (
                <>
                  {/* Humeur */}
                  <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px", marginBottom:12 }}>
                    <div style={{ fontSize:10, letterSpacing:3, color:"#f0a070", textTransform:"uppercase", marginBottom:12 }}>🌡️ État d'esprit / énergie du jour</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                      {HUMEURS.map(h => (
                        <div key={h.val} onClick={() => updateBilan("humeur", bilan.humeur===h.val ? "" : h.val)} style={{
                          padding:"12px 6px", borderRadius:8, textAlign:"center", cursor:"pointer",
                          background: bilan.humeur===h.val ? "#1a2a3a" : "#0a0f18",
                          border: `2px solid ${bilan.humeur===h.val ? "#8ab4f8" : "#141e2a"}`,
                          transition:"all 0.2s",
                        }}>
                          <div style={{ fontSize:22, marginBottom:4 }}>{h.icon}</div>
                          <div style={{ fontSize:10, color: bilan.humeur===h.val ? "#8ab4f8" : "#5a6a7a", fontFamily:"monospace" }}>{h.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sections guidées */}
                  {SECTIONS.map(s => (
                    <div key={s.field} style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px", marginBottom:12 }}>
                      <div style={{ fontSize:10, letterSpacing:3, color:"#f0a070", textTransform:"uppercase", marginBottom:10 }}>
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

                  {/* Espace libre */}
                  <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px", marginBottom:12 }}>
                    <div style={{ fontSize:10, letterSpacing:3, color:"#f0a070", textTransform:"uppercase", marginBottom:10 }}>
                      📓 Notes libres
                    </div>
                    <div style={{ fontSize:11, color:"#3a4a5a", marginBottom:10, fontStyle:"italic" }}>
                      Tout ce que tu veux ajouter — pensées, observations, idées du jour...
                    </div>
                    <textarea
                      value={bilan.libre}
                      onChange={e => updateBilan("libre", e.target.value)}
                      placeholder="Écris librement ce qui te vient à l'esprit..."
                      rows={5}
                      style={{ ...inputStyle, minHeight:110 }}
                    />
                  </div>

                  <div style={{ background:"#0d1018", borderRadius:9, border:"1px solid #1a2030", padding:"14px 18px", textAlign:"center" }}>
                    <div style={{ fontSize:12, color:"#4a5a6a", lineHeight:1.8, fontStyle:"italic" }}>
                      Chaque bilan écrit est une victoire sur l'inertie.<br/>
                      <span style={{ fontSize:11, color:"#2a3a4a" }}>Sauvegarde automatique · Synchronisé sur tous tes appareils</span>
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
              <div style={{ fontSize:10, letterSpacing:4, color:"#c084fc", textTransform:"uppercase", marginBottom:5 }}>Suivi de progression</div>
              <div style={{ fontSize:26, color:"#e8e0d4", fontWeight:"bold" }}>Analyse</div>
              <div style={{ fontSize:12, color:"#5a6a7a", marginTop:5 }}>Bilan hebdomadaire et mensuel · données synchronisées</div>
            </div>

            {!analyseData ? (
              <div style={{ textAlign:"center", padding:"40px", color:"#4a5a6a", fontFamily:"monospace" }}>Chargement des données...</div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:18 }}>
                  {[
                    { label:"Score semaine", val:`${weekScore}%`, color:weekScore>=70?"#68d391":weekScore>=40?"#f0b429":"#fb8a4a" },
                    { label:"Tâches (7j)", val:`${weekTasks}/42`, color:"#68d391" },
                    { label:"Routines (7j)", val:`${weekRoutine}/${weeklyData.reduce((a,d)=>a+d.total,0)}`, color:"#8ab4f8" },
                  ].map(({ label,val,color }) => (
                    <div key={label} style={{ background:"#0f1520", borderRadius:9, border:"1px solid #1a2535", padding:"14px 12px", textAlign:"center" }}>
                      <div style={{ fontSize:20, fontWeight:"bold", color, fontFamily:"monospace" }}>{val}</div>
                      <div style={{ fontSize:9, color:"#4a5a6a", letterSpacing:1, textTransform:"uppercase", marginTop:4 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* 7 jours */}
                <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px", marginBottom:14 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:"#c084fc", textTransform:"uppercase", marginBottom:14 }}>7 derniers jours</div>
                  <BarChart data={weeklyData} maxVal={9}/>
                  <div style={{ display:"flex", gap:16, marginTop:12, justifyContent:"center" }}>
                    {[["#68d391","Tâches /6"],["#8ab4f8","Routines"]].map(([c,l]) => (
                      <div key={l} style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:10, height:10, borderRadius:2, background:c }}/>
                        <span style={{ fontSize:10, color:"#5a6a7a" }}>{l}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:14, borderTop:"1px solid #141e2a", paddingTop:12 }}>
                    {weeklyData.map((d,i) => {
                      const date = new Date(last7[i]);
                      const isToday = last7[i]===getTodayKey();
                      return (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:i<6?"1px solid #0e1520":"none", opacity:!d.hasData&&!isToday?0.35:1 }}>
                          <div style={{ width:72, fontSize:11, color:isToday?"#c084fc":"#5a6a7a", fontFamily:"monospace" }}>
                            {date.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"})}
                            {isToday && <span style={{ color:"#c084fc" }}> ●</span>}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", gap:4, marginBottom:3 }}>
                              <div style={{ height:5, borderRadius:3, background:"#68d391", width:`${Math.round(d.tasks/6*100)}%`, minHeight:d.tasks>0?4:0, transition:"width 0.4s" }}/>
                              <div style={{ height:5, borderRadius:3, background:"#1a2535", flex:1 }}/>
                            </div>
                            <div style={{ display:"flex", gap:4 }}>
                              <div style={{ height:5, borderRadius:3, background:"#8ab4f8", width:`${d.total>0?Math.round(d.routine/d.total*100):0}%`, minHeight:d.routine>0?4:0, transition:"width 0.4s" }}/>
                              <div style={{ height:5, borderRadius:3, background:"#1a2535", flex:1 }}/>
                            </div>
                          </div>
                          <div style={{ width:70, textAlign:"right", fontSize:10, color:"#4a5a6a", fontFamily:"monospace" }}>{d.tasks}/6 · {d.routine}/{d.total}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 6 mois */}
                <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px", marginBottom:14 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:"#c084fc", textTransform:"uppercase", marginBottom:14 }}>6 derniers mois — moyenne / jour actif</div>
                  <BarChart data={bilanMensuel.map(d=>({...d,tasks:d.avgTasks,routine:d.avgRoutine,total:9}))} maxVal={9}/>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6, marginTop:12 }}>
                    {bilanMensuel.map((m,i) => (
                      <div key={i} style={{ background:"#0a0f18", borderRadius:6, padding:"8px 4px", border:"1px solid #141e2a", textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"#5a6a7a", textTransform:"capitalize", marginBottom:4 }}>{m.label}</div>
                        <div style={{ fontSize:13, color:"#68d391", fontFamily:"monospace" }}>{m.avgTasks}/6</div>
                        <div style={{ fontSize:13, color:"#8ab4f8", fontFamily:"monospace" }}>{m.avgRoutine}/9</div>
                        <div style={{ fontSize:9, color:"#3a4a5a", marginTop:3 }}>{m.activeDays}j actifs</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background:"#0d1018", borderRadius:9, border:"1px solid #1a2030", padding:"14px 18px", textAlign:"center" }}>
                  <div style={{ fontSize:12, color:"#4a5a6a", lineHeight:1.8, fontStyle:"italic" }}>
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
              <div style={{ fontSize:10, letterSpacing:4, color:"#5a6a7a", textTransform:"uppercase", marginBottom:5 }}>Configuration</div>
              <div style={{ fontSize:26, color:"#e8e0d4", fontWeight:"bold" }}>Paramètres</div>
            </div>

            <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"#8ab4f8", textTransform:"uppercase", marginBottom:12 }}>🪄 Auto-planification</div>

              <div style={{ fontSize:12, color:"#c8c0b4", marginBottom:6 }}>Plage horaire de travail</div>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                <input type="time" value={settings.workday_start} onChange={e => patchSettings({ workday_start: e.target.value })}
                  style={{ flex:1, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:6, padding:"7px 10px", color:"#e8e0d4", fontSize:12, outline:"none" }} />
                <span style={{ color:"#5a6a7a", alignSelf:"center" }}>→</span>
                <input type="time" value={settings.workday_end} onChange={e => patchSettings({ workday_end: e.target.value })}
                  style={{ flex:1, background:"#0a0c10", border:"1px solid #1a2535", borderRadius:6, padding:"7px 10px", color:"#e8e0d4", fontSize:12, outline:"none" }} />
              </div>

              <div style={{ fontSize:12, color:"#c8c0b4", marginBottom:6 }}>Buffer time entre deux tâches (minutes)</div>
              <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                {[0,5,10,15,20,30].map(m => (
                  <div key={m} onClick={() => patchSettings({ buffer_minutes: m })}
                    style={{ flex:1, textAlign:"center", padding:"6px 0", borderRadius:6, cursor:"pointer", fontSize:11,
                      background: settings.buffer_minutes===m ? "#8ab4f822" : "#0a0f18",
                      border:`1px solid ${settings.buffer_minutes===m?"#8ab4f8":"#1a2535"}`,
                      color: settings.buffer_minutes===m?"#8ab4f8":"#5a6a7a" }}>{m}m</div>
                ))}
              </div>

              <div onClick={() => patchSettings({ auto_reschedule: !settings.auto_reschedule })} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
                <CheckBox checked={!!settings.auto_reschedule} color="#68d391" />
                <div style={{ fontSize:12, color:"#c8c0b4" }}>Replanifier automatiquement les tâches en retard vers le prochain créneau libre</div>
              </div>
            </div>

            <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"#c084fc", textTransform:"uppercase", marginBottom:12 }}>📅 Google Calendar</div>
              {googleToken ? (
                <button onClick={disconnectGoogle} style={{ background:"#0d1a12", border:"1px solid #2a4a20", borderRadius:6, color:"#68d391", padding:"8px 14px", cursor:"pointer", fontSize:12 }}>Déconnecter Google Calendar</button>
              ) : (
                <button onClick={connectGoogle} style={{ background:"#0f1520", border:"1px solid #1a2535", borderRadius:6, color:"#8ab4f8", padding:"8px 14px", cursor:"pointer", fontSize:12 }}>Connecter Google Calendar</button>
              )}
            </div>

            <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px" }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"#5a6a7a", textTransform:"uppercase", marginBottom:12 }}>ℹ️ À propos</div>
              <div style={{ fontSize:12, color:"#5a6a7a", lineHeight:1.8 }}>
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
        background:"#68d391", color:"#0a0c10", fontSize:26, fontWeight:"bold",
        display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
        boxShadow:"0 4px 14px #00000066", zIndex:150,
      }} title="Capture rapide (touche N)">+</div>

      {showQuickCapture && (
        <div onClick={() => setShowQuickCapture(false)} style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:"18vh", zIndex:200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#0f1520", border:"1px solid #2a3a4a", borderRadius:10, padding:16, width:380, maxWidth:"90vw" }}>
            <div style={{ fontSize:10, letterSpacing:2, color:"#68d391", textTransform:"uppercase", marginBottom:10 }}>⚡ Capture rapide → Inbox</div>
            <input autoFocus value={quickCaptureVal} onChange={e => setQuickCaptureVal(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter") quickCapture(); if (e.key==="Escape") setShowQuickCapture(false); }}
              placeholder="Note ou tâche... (Entrée pour valider)"
              style={{ width:"100%", boxSizing:"border-box", background:"#0a0c10", border:"1px solid #1a2535", borderRadius:6, padding:"10px 12px", color:"#e8e0d4", fontSize:14, outline:"none" }} />
          </div>
        </div>
      )}

      {showShortcuts && (
        <div onClick={() => setShowShortcuts(false)} style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#0f1520", border:"1px solid #2a3a4a", borderRadius:10, padding:20, width:340, maxWidth:"90vw" }}>
            <div style={{ fontSize:10, letterSpacing:2, color:"#8ab4f8", textTransform:"uppercase", marginBottom:14 }}>⌨️ Raccourcis clavier</div>
            {[
              ["N","Capture rapide"],
              ["T","Aller à Aujourd'hui"],
              ["P","Aller au Planificateur"],
              ["R","Aller à Routines"],
              ["B","Aller au Bilan"],
              ["A","Aller à Analyse"],
              ["1 / 3 / 7","Vue Jour / 3 jours / Semaine (Planificateur)"],
              ["Échap","Fermer une fenêtre"],
              ["?","Afficher cette aide"],
            ].map(([k,l]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #141e2a" }}>
                <span style={{ fontSize:12, color:"#c8c0b4" }}>{l}</span>
                <span style={{ fontSize:11, color:"#68d391", fontFamily:"monospace", background:"#0a0f18", padding:"2px 8px", borderRadius:4 }}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
