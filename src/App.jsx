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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?date_key=eq.${dateKey}&select=*`, { headers: HEADERS });
  const data = await res.json();
  return data?.[0] || null;
}

async function dbUpsert(table, row) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(row),
  });
}

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

  // Migration + chargement initial
  useEffect(() => {
    const init = async () => {
      setSyncing(true);
      try {
        // Migrer les données d'hier si pas encore en base
        for (const [dateKey, data] of Object.entries(MIGRATION_DATA)) {
          const existing = await dbGet("daily_tasks", dateKey);
          if (!existing) {
            await dbUpsert("daily_tasks", { date_key: dateKey, tasks: data.tasks, checked_tasks: data.checked_tasks });
            await dbUpsert("daily_routines", { date_key: dateKey, checked_routine: data.checked_routine });
          }
        }
        // Charger aujourd'hui
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
    init();
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
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

  const completedTasks = Object.values(checkedTasks).filter(Boolean).length;
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

  const NAV = [
    { id: "dashboard", label: "📋 Dashboard" },
    { id: "morning", label: "🌅 Matin" },
    { id: "tasks", label: "✅ Tâches" },
    { id: "evening", label: "🌙 Soir" },
    { id: "bilan", label: "✍️ Bilan" },
    { id: "analyse", label: "📊 Analyse" },
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
            <div style={{ fontSize:26, fontWeight:"bold", color:"#8ab4f8", fontFamily:"monospace" }}>{timeStr}</div>
            <div style={{ fontSize:10, color:"#4a5a6a", letterSpacing:1, marginTop:2 }}>
              {completedMorn}/{MORNING_ROUTINE.length} matin · {completedTasks}/6 tâches · {completedEve}/{EVENING_ROUTINE.length} soir
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

        {/* DASHBOARD */}
        {view==="dashboard" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:22 }}>
              {[
                { label:"Routine Matin", done:completedMorn, total:MORNING_ROUTINE.length, color:"#f0b429" },
                { label:"Tâches du jour", done:completedTasks, total:6, color:"#68d391" },
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
            <div style={{ background:"#0f1520", borderRadius:10, border:"1px solid #1a2535", padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:"#68d391", textTransform:"uppercase", marginBottom:12 }}>6 Tâches du jour</div>
              {tasks.map((t,i) => (
                <div key={i} onClick={() => toggleTask(i)} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:i<5?"1px solid #141e2a":"none", cursor:"pointer" }}>
                  <CheckBox checked={!!checkedTasks[i]}/>
                  <span style={{ fontSize:10, color:"#3a5a6a", fontFamily:"monospace", flexShrink:0 }}>#{i+1}</span>
                  <div style={{ fontSize:13, color:checkedTasks[i]?"#3a5a3a":"#b8b0a4", textDecoration:checkedTasks[i]?"line-through":"none" }}>{t}</div>
                </div>
              ))}
            </div>
            <div style={{ background:"#0d1219", borderRadius:10, border:"1px solid #1a2535", padding:"16px 20px", textAlign:"center" }}>
              <div style={{ fontSize:14, color:"#c8c0a0", fontStyle:"italic", lineHeight:1.9 }}>
                "La discipline n'est pas une contrainte.<br/>C'est la forme la plus haute de liberté."
              </div>
              <div style={{ fontSize:10, color:"#3a4a5a", letterSpacing:3, marginTop:10, textTransform:"uppercase" }}>Système de Discipline Personnelle</div>
            </div>
          </div>
        )}

        {/* MATIN */}
        {view==="morning" && (
          <div>
            <div style={{ marginBottom:22 }}>
              <div style={{ fontSize:10, letterSpacing:4, color:"#f0b429", textTransform:"uppercase", marginBottom:5 }}>Routine Matinale</div>
              <div style={{ fontSize:26, color:"#e8e0d4", fontWeight:"bold" }}>Énergie & Clarté</div>
              <div style={{ fontSize:12, color:"#5a6a7a", marginTop:5 }}>{completedMorn}/{MORNING_ROUTINE.length} étapes · 05h50 → 08h30</div>
            </div>
            {MORNING_ROUTINE.map(r => (
              <div key={r.id} onClick={() => toggleRoutine(r.id)} style={{ display:"flex", gap:14, padding:"14px", marginBottom:8, background:checkedRoutine[r.id]?"#0c1810":"#0f1520", borderRadius:9, border:`1px solid ${checkedRoutine[r.id]?"#2a4a20":"#1a2535"}`, cursor:"pointer", transition:"all 0.2s" }}>
                <div style={{ flexShrink:0, width:44, textAlign:"center", paddingTop:2 }}>
                  <div style={{ fontSize:20 }}>{r.icon}</div>
                  <div style={{ fontSize:10, color:"#f0b429", fontFamily:"monospace", marginTop:2 }}>{r.time}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:"bold", marginBottom:4, color:checkedRoutine[r.id]?"#4a7a3a":"#d4c9a0", textDecoration:checkedRoutine[r.id]?"line-through":"none" }}>{r.label}</div>
                  <div style={{ fontSize:12, color:"#5a6a7a", lineHeight:1.5 }}>{r.desc}</div>
                </div>
                <CheckBox checked={!!checkedRoutine[r.id]} color="#f0b429"/>
              </div>
            ))}
          </div>
        )}

        {/* TÂCHES */}
        {view==="tasks" && (
          <div>
            <div style={{ marginBottom:22 }}>
              <div style={{ fontSize:10, letterSpacing:4, color:"#68d391", textTransform:"uppercase", marginBottom:5 }}>Objectifs quotidiens</div>
              <div style={{ fontSize:26, color:"#e8e0d4", fontWeight:"bold" }}>6 Tâches du jour</div>
              <div style={{ fontSize:12, color:"#5a6a7a", marginTop:5 }}>{completedTasks}/6 accomplies · Cliquer pour modifier · Sauvegarde auto</div>
            </div>
            {tasks.map((t,i) => (
              <div key={i} style={{ background:"#0f1520", borderRadius:9, border:"1px solid #1a2535", padding:"14px 16px", marginBottom:8, display:"flex", gap:12, alignItems:"center" }}>
                <div onClick={() => toggleTask(i)} style={{ cursor:"pointer" }}><CheckBox checked={!!checkedTasks[i]}/></div>
                {editIdx===i ? (
                  <div style={{ flex:1, display:"flex", gap:8 }}>
                    <input value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key==="Enter" && saveEdit()} autoFocus
                      style={{ flex:1, background:"#0a0c10", border:"1px solid #3a5080", borderRadius:5, padding:"6px 10px", color:"#e8e0d4", fontSize:13, fontFamily:"Georgia,serif", outline:"none" }}/>
                    <button onClick={saveEdit} style={{ background:"#68d391", border:"none", borderRadius:5, padding:"6px 14px", color:"#0a0c10", fontSize:12, fontWeight:"bold", cursor:"pointer" }}>OK</button>
                    <button onClick={() => setEditIdx(null)} style={{ background:"#1a2535", border:"none", borderRadius:5, padding:"6px 10px", color:"#5a6a7a", fontSize:12, cursor:"pointer" }}>✕</button>
                  </div>
                ) : (
                  <div style={{ flex:1, cursor:"pointer" }} onClick={() => startEdit(i)}>
                    <div style={{ fontSize:10, color:"#3a5a6a", fontFamily:"monospace", marginBottom:2 }}>TÂCHE #{i+1}</div>
                    <div style={{ fontSize:13, color:checkedTasks[i]?"#3a5a3a":"#b8b0a4", textDecoration:checkedTasks[i]?"line-through":"none" }}>{t}</div>
                  </div>
                )}
                {editIdx!==i && <div onClick={() => startEdit(i)} style={{ fontSize:12, color:"#2a3a4a", cursor:"pointer" }}>✏️</div>}
              </div>
            ))}
            <div style={{ background:"#0a0f18", borderRadius:9, border:"1px dashed #1a2535", padding:"12px", textAlign:"center", fontSize:11, color:"#3a4a5a" }}>
              Cliquer sur le texte d'une tâche pour la modifier · Entrée pour valider
            </div>
          </div>
        )}

        {/* SOIR */}
        {view==="evening" && (
          <div>
            <div style={{ marginBottom:22 }}>
              <div style={{ fontSize:10, letterSpacing:4, color:"#8ab4f8", textTransform:"uppercase", marginBottom:5 }}>Routine du Soir</div>
              <div style={{ fontSize:26, color:"#e8e0d4", fontWeight:"bold" }}>Bilan & Apaisement</div>
              <div style={{ fontSize:12, color:"#5a6a7a", marginTop:5 }}>{completedEve}/{EVENING_ROUTINE.length} étapes · 19h00 → 22h00</div>
            </div>
            {EVENING_ROUTINE.map(r => (
              <div key={r.id} onClick={() => toggleRoutine(r.id)} style={{ display:"flex", gap:14, padding:"18px", marginBottom:10, background:checkedRoutine[r.id]?"#0c1018":"#0f1520", borderRadius:9, border:`1px solid ${checkedRoutine[r.id]?"#2a2a5a":"#1a2535"}`, cursor:"pointer", transition:"all 0.2s" }}>
                <div style={{ flexShrink:0, width:44, textAlign:"center", paddingTop:2 }}>
                  <div style={{ fontSize:22 }}>{r.icon}</div>
                  <div style={{ fontSize:10, color:"#8ab4f8", fontFamily:"monospace", marginTop:2 }}>{r.time}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:"bold", marginBottom:5, color:checkedRoutine[r.id]?"#3a3a7a":"#d4c9a0", textDecoration:checkedRoutine[r.id]?"line-through":"none" }}>{r.label}</div>
                  <div style={{ fontSize:12, color:"#5a6a7a", lineHeight:1.6 }}>{r.desc}</div>
                </div>
                <CheckBox checked={!!checkedRoutine[r.id]} color="#8ab4f8"/>
              </div>
            ))}
            <div style={{ background:"#0d1018", borderRadius:9, border:"1px solid #1a2030", padding:"16px 18px", textAlign:"center" }}>
              <div style={{ fontSize:13, color:"#6a7a9a", lineHeight:1.8, fontStyle:"italic" }}>
                La discipline du soir construit la clarté du matin.
              </div>
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
}
