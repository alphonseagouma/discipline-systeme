import { useState, useEffect } from "react";

const TASKS_KEY = "discipline_tasks_v3";
const CHECKED_KEY = "discipline_checks_v3";
const ROUTINE_KEY = "discipline_routine_v3";

const MORNING_ROUTINE = [
  { id: "m1", time: "05:50", icon: "☀️", label: "Réveil & Hydratation", desc: "Lever immédiat, 1 grand verre d'eau. Pas de téléphone. Respiration profonde 3 min." },
  { id: "m2", time: "06:00", icon: "🏠", label: "Responsabilités de la maison", desc: "1h dédiée aux tâches du foyer — ménage, rangement, ou ce qui est nécessaire. Pleine présence, sans téléphone." },
  { id: "m3", time: "07:00", icon: "🏃", label: "Sport · Douche · Méditation / Visualisation", desc: "1h complète : sport 30 min → douche → méditation et visualisation 15 min — ancrer l'intention du jour, clarté mentale." },
  { id: "m4", time: "08:00", icon: "☕", label: "Petit-déjeuner", desc: "Repas nutritif et conscient. Pas d'écrans. Prendre le temps de bien manger avant de commencer la journée." },
];

const EVENING_ROUTINE = [
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

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function getWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + 1);
  return d.toISOString().split("T")[0];
}

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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
    return getWeekKey(d);
  }).reverse();
}

function getLast6Months() {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return getMonthKey(d);
  });
}

function loadDayStats(dateKey) {
  const tasks = JSON.parse(localStorage.getItem(CHECKED_KEY + dateKey) || "{}");
  const routine = JSON.parse(localStorage.getItem(ROUTINE_KEY + dateKey) || "{}");
  const tasksDone = Object.values(tasks).filter(Boolean).length;
  const routineDone = Object.values(routine).filter(Boolean).length;
  const totalRoutine = MORNING_ROUTINE.length + EVENING_ROUTINE.length;
  return { tasksDone, routineDone, totalRoutine, hasData: tasksDone > 0 || routineDone > 0 };
}

export default function App() {
  const [view, setView] = useState("dashboard");
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [checkedTasks, setCheckedTasks] = useState({});
  const [checkedRoutine, setCheckedRoutine] = useState({});
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const stored = localStorage.getItem(TASKS_KEY + getTodayKey());
    if (stored) setTasks(JSON.parse(stored));
    const checks = localStorage.getItem(CHECKED_KEY + getTodayKey());
    if (checks) setCheckedTasks(JSON.parse(checks));
    const rChecks = localStorage.getItem(ROUTINE_KEY + getTodayKey());
    if (rChecks) setCheckedRoutine(JSON.parse(rChecks));
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const saveTasks = (t) => {
    setTasks(t);
    localStorage.setItem(TASKS_KEY + getTodayKey(), JSON.stringify(t));
  };

  const toggleTask = (i) => {
    const next = { ...checkedTasks, [i]: !checkedTasks[i] };
    setCheckedTasks(next);
    localStorage.setItem(CHECKED_KEY + getTodayKey(), JSON.stringify(next));
  };

  const toggleRoutine = (id) => {
    const next = { ...checkedRoutine, [id]: !checkedRoutine[id] };
    setCheckedRoutine(next);
    localStorage.setItem(ROUTINE_KEY + getTodayKey(), JSON.stringify(next));
  };

  const startEdit = (i) => { setEditIdx(i); setEditVal(tasks[i]); };
  const saveEdit = () => {
    const t = [...tasks]; t[editIdx] = editVal; saveTasks(t); setEditIdx(null);
  };

  const completedTasks = Object.values(checkedTasks).filter(Boolean).length;
  const completedMorn = MORNING_ROUTINE.filter(r => checkedRoutine[r.id]).length;
  const completedEve = EVENING_ROUTINE.filter(r => checkedRoutine[r.id]).length;
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const NAV = [
    { id: "dashboard", label: "📋 Dashboard" },
    { id: "morning", label: "🌅 Matin" },
    { id: "tasks", label: "✅ Tâches" },
    { id: "evening", label: "🌙 Soir" },
    { id: "analyse", label: "📊 Analyse" },
  ];

  const CheckBox = ({ checked, color = "#68d391" }) => (
    <div style={{
      width: 26, height: 26, borderRadius: 5, flexShrink: 0,
      border: `2px solid ${checked ? color : "#2a3545"}`,
      background: checked ? color : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.2s",
    }}>
      {checked && <span style={{ color: "#0a0c10", fontSize: 13, fontWeight: "bold" }}>✓</span>}
    </div>
  );

  // ── ANALYSE DATA ──
  const last7 = getLast7Days();
  const last4w = getLast4Weeks();
  const last6m = getLast6Months();

  const weeklyData = last7.map(key => {
    const s = loadDayStats(key);
    const d = new Date(key);
    return {
      label: d.toLocaleDateString("fr-FR", { weekday: "short" }),
      tasks: s.tasksDone,
      routine: s.routineDone,
      total: s.totalRoutine,
      hasData: s.hasData,
    };
  });

  const monthlyData = last4w.map((wKey, i) => {
    const days = Array.from({ length: 7 }, (_, j) => {
      const d = new Date(wKey);
      d.setDate(d.getDate() + j);
      return d.toISOString().split("T")[0];
    });
    const stats = days.map(loadDayStats);
    const avgTasks = Math.round(stats.reduce((a, s) => a + s.tasksDone, 0) / 7);
    const avgRoutine = Math.round(stats.reduce((a, s) => a + s.routineDone, 0) / 7);
    return { label: `S${i + 1}`, avgTasks, avgRoutine };
  });

  const bilanMensuel = last6m.map(mKey => {
    const [y, m] = mKey.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let totalTasks = 0, totalRoutine = 0, activeDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${mKey}-${String(d).padStart(2, "0")}`;
      const s = loadDayStats(key);
      if (s.hasData) { totalTasks += s.tasksDone; totalRoutine += s.routineDone; activeDays++; }
    }
    const monthName = new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
    return {
      label: monthName,
      avgTasks: activeDays ? Math.round(totalTasks / activeDays) : 0,
      avgRoutine: activeDays ? Math.round(totalRoutine / activeDays) : 0,
      activeDays,
    };
  });

  const todayStats = loadDayStats(getTodayKey());
  const weekTasks = weeklyData.reduce((a, d) => a + d.tasks, 0);
  const weekRoutine = weeklyData.reduce((a, d) => a + d.routine, 0);
  const weekMax = weeklyData.reduce((a, d) => a + 6 + d.total, 0);
  const weekScore = weekMax > 0 ? Math.round((weekTasks * 6 + weekRoutine) / weekMax * 100) : 0;

  const BarChart = ({ data, taskColor = "#68d391", routineColor = "#8ab4f8", maxVal = 9 }) => (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 64 }}>
            <div style={{
              flex: 1, background: taskColor, borderRadius: "3px 3px 0 0",
              height: `${Math.min((d.tasks ?? d.avgTasks) / maxVal * 100, 100)}%`,
              minHeight: (d.tasks ?? d.avgTasks) > 0 ? 3 : 0, opacity: 0.85,
              transition: "height 0.4s ease",
            }} />
            <div style={{
              flex: 1, background: routineColor, borderRadius: "3px 3px 0 0",
              height: `${Math.min((d.routine ?? d.avgRoutine) / (d.total ?? 9) * 100, 100)}%`,
              minHeight: (d.routine ?? d.avgRoutine) > 0 ? 3 : 0, opacity: 0.85,
              transition: "height 0.4s ease",
            }} />
          </div>
          <div style={{ fontSize: 9, color: "#4a5a6a", fontFamily: "monospace", textTransform: "uppercase" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8e0d4", fontFamily: "'Georgia', serif" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0d1219 0%, #141b2a 100%)",
        borderBottom: "1px solid #1e2a3a", padding: "18px 24px 0",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 4, color: "#5a7a5a", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 3 }}>
              DISCIPLINE SYSTEM
            </div>
            <div style={{ fontSize: 20, fontWeight: "bold", color: "#d4c9a0", letterSpacing: 0.5 }}>
              {dateStr}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: "bold", color: "#8ab4f8", fontFamily: "monospace" }}>{timeStr}</div>
            <div style={{ fontSize: 10, color: "#4a5a6a", letterSpacing: 1, marginTop: 2 }}>
              {completedMorn}/{MORNING_ROUTINE.length} matin · {completedTasks}/6 tâches · {completedEve}/{EVENING_ROUTINE.length} soir
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 0 }}>
          {NAV.map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)} style={{
              padding: "8px 14px", borderRadius: "6px 6px 0 0", border: "none", cursor: "pointer",
              fontSize: 11, fontFamily: "monospace", letterSpacing: 0.5, whiteSpace: "nowrap",
              background: view === tab.id ? "#0a0c10" : "transparent",
              color: view === tab.id ? "#d4c9a0" : "#5a6a7a",
              borderTop: view === tab.id ? "1px solid #1e2a3a" : "1px solid transparent",
              borderLeft: view === tab.id ? "1px solid #1e2a3a" : "1px solid transparent",
              borderRight: view === tab.id ? "1px solid #1e2a3a" : "1px solid transparent",
              fontWeight: view === tab.id ? "bold" : "normal",
              transition: "all 0.15s",
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "22px 18px" }}>

        {/* ── DASHBOARD ── */}
        {view === "dashboard" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 22 }}>
              {[
                { label: "Routine Matin", done: completedMorn, total: MORNING_ROUTINE.length, color: "#f0b429" },
                { label: "Tâches du jour", done: completedTasks, total: 6, color: "#68d391" },
                { label: "Routine Soir", done: completedEve, total: EVENING_ROUTINE.length, color: "#8ab4f8" },
              ].map(({ label, done, total, color }) => {
                const pct = Math.round((done / total) * 100);
                const circ = 2 * Math.PI * 30;
                return (
                  <div key={label} style={{
                    background: "#0f1520", borderRadius: 10, padding: "18px 12px",
                    border: "1px solid #1a2535", textAlign: "center",
                  }}>
                    <svg width="70" height="70" viewBox="0 0 70 70" style={{ display: "block", margin: "0 auto 10px" }}>
                      <circle cx="35" cy="35" r="30" fill="none" stroke="#1a2535" strokeWidth="5" />
                      <circle cx="35" cy="35" r="30" fill="none" stroke={color} strokeWidth="5"
                        strokeDasharray={`${(pct / 100) * circ} ${circ}`}
                        strokeLinecap="round" transform="rotate(-90 35 35)"
                        style={{ transition: "stroke-dasharray 0.5s ease" }} />
                      <text x="35" y="39" textAnchor="middle" fill={color} fontSize="14" fontWeight="bold" fontFamily="monospace">{pct}%</text>
                    </svg>
                    <div style={{ fontSize: 10, color: "#5a6a7a", letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ fontSize: 16, color, fontWeight: "bold", marginTop: 3 }}>{done}/{total}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ background: "#0f1520", borderRadius: 10, border: "1px solid #1a2535", padding: "16px 18px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#68d391", textTransform: "uppercase", marginBottom: 12 }}>6 Tâches du jour</div>
              {tasks.map((t, i) => (
                <div key={i} onClick={() => toggleTask(i)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
                  borderBottom: i < 5 ? "1px solid #141e2a" : "none", cursor: "pointer",
                }}>
                  <CheckBox checked={!!checkedTasks[i]} />
                  <span style={{ fontSize: 10, color: "#3a5a6a", fontFamily: "monospace", flexShrink: 0 }}>#{i + 1}</span>
                  <div style={{
                    fontSize: 13, color: checkedTasks[i] ? "#3a5a3a" : "#b8b0a4",
                    textDecoration: checkedTasks[i] ? "line-through" : "none",
                  }}>{t}</div>
                </div>
              ))}
            </div>

            <div style={{
              background: "#0d1219", borderRadius: 10, border: "1px solid #1a2535",
              padding: "16px 20px", textAlign: "center",
            }}>
              <div style={{ fontSize: 14, color: "#c8c0a0", fontStyle: "italic", lineHeight: 1.9 }}>
                "La discipline n'est pas une contrainte.<br />C'est la forme la plus haute de liberté."
              </div>
              <div style={{ fontSize: 10, color: "#3a4a5a", letterSpacing: 3, marginTop: 10, textTransform: "uppercase" }}>Système de Discipline Personnelle</div>
            </div>
          </div>
        )}

        {/* ── MATIN ── */}
        {view === "morning" && (
          <div>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, letterSpacing: 4, color: "#f0b429", textTransform: "uppercase", marginBottom: 5 }}>Routine Matinale</div>
              <div style={{ fontSize: 26, color: "#e8e0d4", fontWeight: "bold" }}>Énergie & Clarté</div>
              <div style={{ fontSize: 12, color: "#5a6a7a", marginTop: 5 }}>
                {completedMorn}/{MORNING_ROUTINE.length} étapes · 05h50 → 08h30
              </div>
            </div>
            {MORNING_ROUTINE.map((r) => (
              <div key={r.id} onClick={() => toggleRoutine(r.id)} style={{
                display: "flex", gap: 14, padding: "14px", marginBottom: 8,
                background: checkedRoutine[r.id] ? "#0c1810" : "#0f1520",
                borderRadius: 9, border: `1px solid ${checkedRoutine[r.id] ? "#2a4a20" : "#1a2535"}`,
                cursor: "pointer", transition: "all 0.2s",
              }}>
                <div style={{ flexShrink: 0, width: 44, textAlign: "center", paddingTop: 2 }}>
                  <div style={{ fontSize: 20 }}>{r.icon}</div>
                  <div style={{ fontSize: 10, color: "#f0b429", fontFamily: "monospace", marginTop: 2 }}>{r.time}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 14, fontWeight: "bold", marginBottom: 4,
                    color: checkedRoutine[r.id] ? "#4a7a3a" : "#d4c9a0",
                    textDecoration: checkedRoutine[r.id] ? "line-through" : "none",
                  }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: "#5a6a7a", lineHeight: 1.5 }}>{r.desc}</div>
                </div>
                <CheckBox checked={!!checkedRoutine[r.id]} color="#f0b429" />
              </div>
            ))}
          </div>
        )}

        {/* ── TÂCHES ── */}
        {view === "tasks" && (
          <div>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, letterSpacing: 4, color: "#68d391", textTransform: "uppercase", marginBottom: 5 }}>Objectifs quotidiens</div>
              <div style={{ fontSize: 26, color: "#e8e0d4", fontWeight: "bold" }}>6 Tâches du jour</div>
              <div style={{ fontSize: 12, color: "#5a6a7a", marginTop: 5 }}>
                {completedTasks}/6 accomplies · Cliquer pour modifier · Sauvegarde auto
              </div>
            </div>
            {tasks.map((t, i) => (
              <div key={i} style={{
                background: "#0f1520", borderRadius: 9, border: "1px solid #1a2535",
                padding: "14px 16px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center",
              }}>
                <div onClick={() => toggleTask(i)} style={{ cursor: "pointer" }}>
                  <CheckBox checked={!!checkedTasks[i]} />
                </div>
                {editIdx === i ? (
                  <div style={{ flex: 1, display: "flex", gap: 8 }}>
                    <input value={editVal} onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveEdit()} autoFocus
                      style={{
                        flex: 1, background: "#0a0c10", border: "1px solid #3a5080",
                        borderRadius: 5, padding: "6px 10px", color: "#e8e0d4",
                        fontSize: 13, fontFamily: "Georgia, serif", outline: "none",
                      }} />
                    <button onClick={saveEdit} style={{
                      background: "#68d391", border: "none", borderRadius: 5, padding: "6px 14px",
                      color: "#0a0c10", fontSize: 12, fontWeight: "bold", cursor: "pointer",
                    }}>OK</button>
                    <button onClick={() => setEditIdx(null)} style={{
                      background: "#1a2535", border: "none", borderRadius: 5, padding: "6px 10px",
                      color: "#5a6a7a", fontSize: 12, cursor: "pointer",
                    }}>✕</button>
                  </div>
                ) : (
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => startEdit(i)}>
                    <div style={{ fontSize: 10, color: "#3a5a6a", fontFamily: "monospace", marginBottom: 2 }}>TÂCHE #{i + 1}</div>
                    <div style={{
                      fontSize: 13, color: checkedTasks[i] ? "#3a5a3a" : "#b8b0a4",
                      textDecoration: checkedTasks[i] ? "line-through" : "none",
                    }}>{t}</div>
                  </div>
                )}
                {editIdx !== i && (
                  <div onClick={() => startEdit(i)} style={{ fontSize: 12, color: "#2a3a4a", cursor: "pointer" }}>✏️</div>
                )}
              </div>
            ))}
            <div style={{
              background: "#0a0f18", borderRadius: 9, border: "1px dashed #1a2535",
              padding: "12px", textAlign: "center", fontSize: 11, color: "#3a4a5a",
            }}>
              Cliquer sur le texte d'une tâche pour la modifier · Entrée pour valider
            </div>
          </div>
        )}

        {/* ── SOIR ── */}
        {view === "evening" && (
          <div>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, letterSpacing: 4, color: "#8ab4f8", textTransform: "uppercase", marginBottom: 5 }}>Routine du Soir</div>
              <div style={{ fontSize: 26, color: "#e8e0d4", fontWeight: "bold" }}>Bilan & Apaisement</div>
              <div style={{ fontSize: 12, color: "#5a6a7a", marginTop: 5 }}>
                {completedEve}/{EVENING_ROUTINE.length} étapes · 19h00 → 22h00
              </div>
            </div>
            {EVENING_ROUTINE.map((r) => (
              <div key={r.id} onClick={() => toggleRoutine(r.id)} style={{
                display: "flex", gap: 14, padding: "18px", marginBottom: 10,
                background: checkedRoutine[r.id] ? "#0c1018" : "#0f1520",
                borderRadius: 9, border: `1px solid ${checkedRoutine[r.id] ? "#2a2a5a" : "#1a2535"}`,
                cursor: "pointer", transition: "all 0.2s",
              }}>
                <div style={{ flexShrink: 0, width: 44, textAlign: "center", paddingTop: 2 }}>
                  <div style={{ fontSize: 22 }}>{r.icon}</div>
                  <div style={{ fontSize: 10, color: "#8ab4f8", fontFamily: "monospace", marginTop: 2 }}>{r.time}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 14, fontWeight: "bold", marginBottom: 5,
                    color: checkedRoutine[r.id] ? "#3a3a7a" : "#d4c9a0",
                    textDecoration: checkedRoutine[r.id] ? "line-through" : "none",
                  }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: "#5a6a7a", lineHeight: 1.6 }}>{r.desc}</div>
                </div>
                <CheckBox checked={!!checkedRoutine[r.id]} color="#8ab4f8" />
              </div>
            ))}
            <div style={{
              background: "#0d1018", borderRadius: 9, border: "1px solid #1a2030",
              padding: "16px 18px", textAlign: "center",
            }}>
              <div style={{ fontSize: 13, color: "#6a7a9a", lineHeight: 1.8, fontStyle: "italic" }}>
                La discipline du soir construit la clarté du matin.
              </div>
            </div>
          </div>
        )}

        {/* ── ANALYSE ── */}
        {view === "analyse" && (
          <div>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, letterSpacing: 4, color: "#c084fc", textTransform: "uppercase", marginBottom: 5 }}>Suivi de progression</div>
              <div style={{ fontSize: 26, color: "#e8e0d4", fontWeight: "bold" }}>Analyse</div>
              <div style={{ fontSize: 12, color: "#5a6a7a", marginTop: 5 }}>
                Bilan hebdomadaire et mensuel de ta discipline
              </div>
            </div>

            {/* Score semaine */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18,
            }}>
              {[
                { label: "Score semaine", val: `${weekScore}%`, color: weekScore >= 70 ? "#68d391" : weekScore >= 40 ? "#f0b429" : "#fb8a4a" },
                { label: "Tâches (7j)", val: `${weekTasks}/42`, color: "#68d391" },
                { label: "Routines (7j)", val: `${weekRoutine}/${weeklyData.reduce((a,d)=>a+d.total,0)}`, color: "#8ab4f8" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{
                  background: "#0f1520", borderRadius: 9, border: "1px solid #1a2535",
                  padding: "14px 12px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 20, fontWeight: "bold", color, fontFamily: "monospace" }}>{val}</div>
                  <div style={{ fontSize: 9, color: "#4a5a6a", letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Graphe 7 jours */}
            <div style={{
              background: "#0f1520", borderRadius: 10, border: "1px solid #1a2535",
              padding: "16px 18px", marginBottom: 14,
            }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#c084fc", textTransform: "uppercase", marginBottom: 14 }}>7 derniers jours</div>
              <BarChart data={weeklyData} maxVal={9} />
              <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: "#68d391" }} />
                  <span style={{ fontSize: 10, color: "#5a6a7a" }}>Tâches /6</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: "#8ab4f8" }} />
                  <span style={{ fontSize: 10, color: "#5a6a7a" }}>Routines</span>
                </div>
              </div>
              {/* Détail jour par jour */}
              <div style={{ marginTop: 14, borderTop: "1px solid #141e2a", paddingTop: 12 }}>
                {weeklyData.map((d, i) => {
                  const date = new Date(last7[i]);
                  const isToday = last7[i] === getTodayKey();
                  const taskPct = Math.round(d.tasks / 6 * 100);
                  const routinePct = d.total > 0 ? Math.round(d.routine / d.total * 100) : 0;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
                      borderBottom: i < 6 ? "1px solid #0e1520" : "none",
                      opacity: !d.hasData && !isToday ? 0.35 : 1,
                    }}>
                      <div style={{ width: 60, fontSize: 11, color: isToday ? "#c084fc" : "#5a6a7a", fontFamily: "monospace" }}>
                        {date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                        {isToday && <span style={{ color: "#c084fc" }}> ●</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 4, marginBottom: 3 }}>
                          <div style={{ height: 5, borderRadius: 3, background: "#68d391", width: `${taskPct}%`, minWidth: d.tasks > 0 ? 4 : 0, transition: "width 0.4s" }} />
                          <div style={{ height: 5, borderRadius: 3, background: "#1a2535", flex: 1 }} />
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <div style={{ height: 5, borderRadius: 3, background: "#8ab4f8", width: `${routinePct}%`, minWidth: d.routine > 0 ? 4 : 0, transition: "width 0.4s" }} />
                          <div style={{ height: 5, borderRadius: 3, background: "#1a2535", flex: 1 }} />
                        </div>
                      </div>
                      <div style={{ width: 70, textAlign: "right", fontSize: 10, color: "#4a5a6a", fontFamily: "monospace" }}>
                        {d.tasks}/6 · {d.routine}/{d.total}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bilan 4 semaines */}
            <div style={{
              background: "#0f1520", borderRadius: 10, border: "1px solid #1a2535",
              padding: "16px 18px", marginBottom: 14,
            }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#c084fc", textTransform: "uppercase", marginBottom: 14 }}>4 dernières semaines — moyenne / jour</div>
              <BarChart data={monthlyData.map(d => ({ ...d, tasks: d.avgTasks, routine: d.avgRoutine, total: 9 }))} maxVal={9} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 12 }}>
                {monthlyData.map((w, i) => (
                  <div key={i} style={{
                    background: "#0a0f18", borderRadius: 6, padding: "8px",
                    border: "1px solid #141e2a", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 10, color: "#5a6a7a", marginBottom: 4 }}>Sem. {i + 1}</div>
                    <div style={{ fontSize: 12, color: "#68d391", fontFamily: "monospace" }}>{w.avgTasks}/6</div>
                    <div style={{ fontSize: 10, color: "#4a5a6a" }}>tâches moy.</div>
                    <div style={{ fontSize: 12, color: "#8ab4f8", fontFamily: "monospace", marginTop: 2 }}>{w.avgRoutine}/9</div>
                    <div style={{ fontSize: 10, color: "#4a5a6a" }}>routines moy.</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bilan 6 mois */}
            <div style={{
              background: "#0f1520", borderRadius: 10, border: "1px solid #1a2535",
              padding: "16px 18px", marginBottom: 14,
            }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#c084fc", textTransform: "uppercase", marginBottom: 14 }}>6 derniers mois — moyenne / jour actif</div>
              <BarChart data={bilanMensuel.map(d => ({ ...d, tasks: d.avgTasks, routine: d.avgRoutine, total: 9 }))} maxVal={9} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginTop: 12 }}>
                {bilanMensuel.map((m, i) => (
                  <div key={i} style={{
                    background: "#0a0f18", borderRadius: 6, padding: "8px 4px",
                    border: "1px solid #141e2a", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 10, color: "#5a6a7a", textTransform: "capitalize", marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 13, color: "#68d391", fontFamily: "monospace" }}>{m.avgTasks}/6</div>
                    <div style={{ fontSize: 13, color: "#8ab4f8", fontFamily: "monospace" }}>{m.avgRoutine}/9</div>
                    <div style={{ fontSize: 9, color: "#3a4a5a", marginTop: 3 }}>{m.activeDays}j actifs</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              background: "#0d1018", borderRadius: 9, border: "1px solid #1a2030",
              padding: "14px 18px", textAlign: "center",
            }}>
              <div style={{ fontSize: 12, color: "#4a5a6a", lineHeight: 1.8, fontStyle: "italic" }}>
                Les données s'accumulent automatiquement chaque jour que tu utilises le système.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
