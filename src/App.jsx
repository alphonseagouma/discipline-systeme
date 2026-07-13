import { useState, useEffect } from "react";

const TASKS_KEY = "trader_daily_tasks_v2";
const CHECKED_KEY = "trader_task_checks_v2";
const ROUTINE_KEY = "trader_routine_checks_v2";

const MORNING_ROUTINE = [
  { id: "m1", time: "05:30", icon: "☀️", label: "Réveil & Hydratation", desc: "Lever immédiat, 1 grand verre d'eau. Pas de téléphone. Respiration profonde 3 min." },
  { id: "m2", time: "05:40", icon: "🧘", label: "Méditation / Visualisation", desc: "10 min — ancrer l'intention du jour. Visualiser une journée de trading disciplinée, respecter ton plan." },
  { id: "m3", time: "05:50", icon: "📖", label: "Lecture & Journal", desc: "30 min — lecture trading ou développement perso. Écrire 3 intentions du jour avant de commencer." },
  { id: "m4", time: "06:00", icon: "🏠", label: "Responsabilités de la maison", desc: "1h dédiée aux tâches du foyer — ménage, rangement, courses, ou ce qui est nécessaire. Pleine présence, sans téléphone." },
  { id: "m5", time: "07:00", icon: "🏃", label: "Sport · Douche · Petit-déjeuner", desc: "1h complète : sport 30 min → douche froide → petit-déjeuner nutritif sans écran. Énergie pleine pour la journée." },
  { id: "m6", time: "08:00", icon: "📊", label: "Revue des marchés", desc: "Analyser les marchés Deriv, identifier les zones clés sur tes actifs, définir le plan de la session." },
];

const EVENING_ROUTINE = [
  { id: "e0", time: "19:00", icon: "🚿", label: "Douche", desc: "Couper avec la journée de travail. Douche chaude pour décompresser, laver le stress du trading." },
  { id: "e1", time: "19:20", icon: "📝", label: "Bilan de journée", desc: "15 min — trades, tâches, état d'esprit. Journal à jour. Qu'est-ce que j'ai bien fait ? Qu'est-ce que j'améliore demain ?" },
  { id: "e2", time: "19:35", icon: "👨‍👩‍👦", label: "Temps famille / social", desc: "Dîner, échanges, présence réelle. Couper complètement du trading. Cette heure est sacrée." },
  { id: "e3", time: "21:00", icon: "🗓️", label: "Préparer le lendemain", desc: "10 min — écrire les 6 tâches du lendemain, poser les alertes marchés, vérifier l'agenda." },
  { id: "e4", time: "21:15", icon: "🌙", label: "Ritual de nuit", desc: "Lumières tamisées, étirements doux, respiration 4-7-8. Téléphone en mode avion. Coucher avant 22h." },
];

const TRADER_SCHEDULE = [
  { time: "08:30", type: "checklist", label: "Checklist d'ouverture", desc: "Valider les 8 points avant le 1er trade — aucun trade sans checklist complète" },
  { time: "09:00", type: "trade", label: "Session 1 — Matin", desc: "Trades sur setups validés uniquement. Max 5 trades/jour. RR min 1:3. SL obligatoire." },
  { time: "10:30", type: "task", label: "Tâche #1", desc: "Première tâche pendant la consolidation de milieu de matinée" },
  { time: "11:00", type: "trade", label: "Session 2 — Continuation", desc: "Si perte max journalière non atteinte. Zéro revenge trading. 30 min de pause après une perte." },
  { time: "12:00", type: "break", label: "Pause déjeuner obligatoire", desc: "Couper l'écran, manger avec la famille. Pas de vérification des positions pendant le repas." },
  { time: "13:00", type: "task", label: "Tâches #2 & #3", desc: "Deux tâches pendant la digestion — ne pas forcer le trading post-repas" },
  { time: "14:00", type: "trade", label: "Session 3 — Après-midi", desc: "Reprendre si état d'esprit favorable. Journal à jour avant d'ouvrir un nouveau trade." },
  { time: "15:30", type: "task", label: "Tâches #4 & #5", desc: "Profiter de la stabilité d'après-midi pour avancer" },
  { time: "17:00", type: "trade", label: "Clôture & Journal de trading", desc: "Fermer positions, documenter chaque trade. Revue équité du jour. Ne pas oublier : équité = réalité." },
  { time: "18:00", type: "task", label: "Tâche #6", desc: "Dernière tâche de la journée avant de basculer en routine soir" },
  { time: "19:00", type: "evening", label: "Routine du soir", desc: "Douche, bilan, famille, préparer demain, ritual de nuit" },
];

const TRADING_RULES = [
  { num: "01", rule: "Stop Loss obligatoire sur chaque trade, sans exception", consequence: "Sortie manuelle immédiate + revue de la position" },
  { num: "02", rule: "Ne jamais dépasser le risque maximum par trade (4% / 1$ max)", consequence: "Fermer le trade et pause d'analyse avant tout nouveau trade" },
  { num: "03", rule: "Respecter le RR minimum 1:3 avant chaque entrée — si TP insuffisant, ne pas entrer", consequence: "Annuler l'entrée — setup invalide" },
  { num: "04", rule: "Ne pas dépasser 5 trades / jour", consequence: "Arrêt total de la session pour la journée" },
  { num: "05", rule: "Arrêt immédiat si perte max journalière atteinte (16%)", consequence: "Fermer toutes positions, couper l'écran, reprise demain" },
  { num: "06", rule: "Arrêt de la semaine si perte hebdomadaire max atteinte (50%)", consequence: "Aucun trade jusqu'au lundi suivant, sans exception" },
  { num: "07", rule: "Trader uniquement les actifs autorisés dans le plan", consequence: "Fermer le trade hors liste — ne jamais justifier l'exception" },
  { num: "08", rule: "N'entrer qu'avec un setup validé et clairement identifié à l'avance", consequence: "Annuler l'entrée — le doute est un signal d'abstention" },
  { num: "09", rule: "Zéro revenge trading — délai de 30 min minimum après une perte", consequence: "Pause obligatoire — fermer le terminal si nécessaire" },
  { num: "10", rule: "Ne pas trader sous la fatigue, le stress ou une émotion forte", consequence: "Reporter — le marché sera toujours là demain" },
  { num: "11", rule: "Tenir le journal à jour après chaque trade, avant d'ouvrir le suivant", consequence: "Suspendre jusqu'à mise à jour complète du journal" },
  { num: "12", rule: "Ne jamais déplacer un Stop Loss pour qu'il soit plus loin de l'entrée", consequence: "Laisser le trade atteindre le SL d'origine — discipline absolue" },
  { num: "13", rule: "Faire une revue hebdomadaire complète chaque dimanche", consequence: "Réduction du nb de trades autorisés la semaine suivante" },
];

const CHECKLIST = [
  "J'ai relu mon plan de trading et je connais mes limites du jour",
  "Mon capital est au-dessus du minimum pour trader ce jour",
  "Je ne suis pas fatigué, stressé ou dans un état émotionnel défavorable",
  "J'ai identifié les niveaux et zones clés sur mes actifs",
  "Je connais mon objectif pour cette session et mes critères de sortie anticipée",
  "Mon journal est à jour — tous les trades précédents sont enregistrés",
  "Je n'ai pas dépassé ma perte max journalière hier, ni ma perte hebdo",
  "Je suis prêt à respecter le plan même si le marché va contre ma position",
];

const DEFAULT_TASKS = [
  "Analyser 2 actifs pour la semaine prochaine",
  "Mettre à jour le journal de trading (screenshots inclus)",
  "Aider à une tâche familiale à la maison",
  "Lire 30 min sur la stratégie ou psychologie du trading",
  "Ranger et nettoyer mon espace de travail",
  "Écrire les 6 tâches de demain et poser les alertes marchés",
];

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

export default function App() {
  const [view, setView] = useState("dashboard");
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [checkedTasks, setCheckedTasks] = useState({});
  const [checkedRoutine, setCheckedRoutine] = useState({});
  const [checkedChecklist, setCheckedChecklist] = useState({});
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const stored = localStorage.getItem(TASKS_KEY + getTodayKey());
    if (stored) setTasks(JSON.parse(stored));
    const checks = localStorage.getItem(CHECKED_KEY + getTodayKey());
    if (checks) setCheckedTasks(JSON.parse(checks));
    const rChecks = localStorage.getItem(ROUTINE_KEY + getTodayKey());
    if (rChecks) setCheckedRoutine(JSON.parse(rChecks));
    const cChecks = localStorage.getItem("checklist_" + getTodayKey());
    if (cChecks) setCheckedChecklist(JSON.parse(cChecks));
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

  const toggleChecklist = (i) => {
    const next = { ...checkedChecklist, [i]: !checkedChecklist[i] };
    setCheckedChecklist(next);
    localStorage.setItem("checklist_" + getTodayKey(), JSON.stringify(next));
  };

  const startEdit = (i) => { setEditIdx(i); setEditVal(tasks[i]); };
  const saveEdit = () => {
    const t = [...tasks]; t[editIdx] = editVal; saveTasks(t); setEditIdx(null);
  };

  const completedTasks = Object.values(checkedTasks).filter(Boolean).length;
  const completedMorn = MORNING_ROUTINE.filter(r => checkedRoutine[r.id]).length;
  const completedEve = EVENING_ROUTINE.filter(r => checkedRoutine[r.id]).length;
  const completedCheck = Object.values(checkedChecklist).filter(Boolean).length;
  const checklistOK = completedCheck === CHECKLIST.length;

  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const currentHour = now.getHours() + now.getMinutes() / 60;

  const NAV = [
    { id: "dashboard", label: "📋 Dashboard" },
    { id: "morning", label: "🌅 Matin" },
    { id: "tasks", label: "✅ Tâches" },
    { id: "trader", label: "📈 Trader" },
    { id: "rules", label: "⚡ Règles" },
    { id: "evening", label: "🌙 Soir" },
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
              TRADER DISCIPLINE SYSTEM — DERIV
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
                        strokeLinecap="round"
                        transform="rotate(-90 35 35)"
                        style={{ transition: "stroke-dasharray 0.5s ease" }} />
                      <text x="35" y="39" textAnchor="middle" fill={color} fontSize="14" fontWeight="bold" fontFamily="monospace">{pct}%</text>
                    </svg>
                    <div style={{ fontSize: 10, color: "#5a6a7a", letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ fontSize: 16, color, fontWeight: "bold", marginTop: 3 }}>{done}/{total}</div>
                  </div>
                );
              })}
            </div>

            {/* Checklist trading */}
            <div style={{
              background: checklistOK ? "#0a1a0e" : "#0f1520",
              borderRadius: 10, border: `1px solid ${checklistOK ? "#2a5a2a" : "#1a2535"}`,
              padding: "16px 18px", marginBottom: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: checklistOK ? "#68d391" : "#8ab4f8", textTransform: "uppercase" }}>
                  ✓ Checklist d'ouverture de session
                </div>
                <div style={{ fontSize: 11, color: checklistOK ? "#68d391" : "#5a6a7a", fontFamily: "monospace" }}>
                  {completedCheck}/8 {checklistOK ? "— PRÊT À TRADER ✓" : ""}
                </div>
              </div>
              {CHECKLIST.map((item, i) => (
                <div key={i} onClick={() => toggleChecklist(i)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
                  borderBottom: i < CHECKLIST.length - 1 ? "1px solid #141e2a" : "none", cursor: "pointer",
                }}>
                  <CheckBox checked={!!checkedChecklist[i]} color="#68d391" />
                  <div style={{
                    fontSize: 12, color: checkedChecklist[i] ? "#3a5a3a" : "#9a9a8a",
                    textDecoration: checkedChecklist[i] ? "line-through" : "none", lineHeight: 1.4,
                  }}>{item}</div>
                </div>
              ))}
            </div>

            {/* Tasks preview */}
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
              <div style={{ fontSize: 14, color: "#c8c0a0", fontStyle: "italic", lineHeight: 1.8 }}>
                "Ce plan de trading est un contrat avec moi-même.<br />Le respecter est la seule décision qui dépend entièrement de moi."
              </div>
              <div style={{ fontSize: 10, color: "#3a5a4a", letterSpacing: 3, marginTop: 10, textTransform: "uppercase" }}>Ton Plan de Trading — Deriv</div>
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
                {completedMorn}/{MORNING_ROUTINE.length} étapes · 05h30 → 08h30 · Sport à 07h00 (père parti)
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
                      onKeyDown={e => e.key === "Enter" && saveEdit()}
                      autoFocus
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

        {/* ── TRADER ── */}
        {view === "trader" && (
          <div>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, letterSpacing: 4, color: "#8ab4f8", textTransform: "uppercase", marginBottom: 5 }}>Planning Spécial</div>
              <div style={{ fontSize: 26, color: "#e8e0d4", fontWeight: "bold" }}>Journée Day Trader</div>
              <div style={{ fontSize: 12, color: "#5a6a7a", marginTop: 5 }}>
                Deriv · Indices Synthétiques · Max 5 trades/jour · RR min 1:3
              </div>
            </div>

            {/* Paramètres compte */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8, marginBottom: 18,
            }}>
              {[
                { label: "Risque max/trade", val: "4%" },
                { label: "Trades max/jour", val: "5" },
                { label: "Perte max/jour", val: "16%" },
                { label: "Perte max/sem.", val: "50%" },
                { label: "RR minimum", val: "1:3" },
                { label: "Objectif mensuel", val: "+10%" },
              ].map(({ label, val }) => (
                <div key={label} style={{
                  background: "#0f1520", borderRadius: 7, padding: "10px 12px",
                  border: "1px solid #1a2535", textAlign: "center",
                }}>
                  <div style={{ fontSize: 16, fontWeight: "bold", color: "#8ab4f8", fontFamily: "monospace" }}>{val}</div>
                  <div style={{ fontSize: 9, color: "#4a5a6a", letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#4a5a6a", textTransform: "uppercase", marginBottom: 14 }}>Planning de la journée</div>
            {TRADER_SCHEDULE.map((item, i) => {
              const [h, m] = item.time.split(":").map(Number);
              const itemHour = h + m / 60;
              const isNow = Math.abs(currentHour - itemHour) < 0.7;
              const isPast = currentHour > itemHour + 0.7;
              const colors = { trade: "#8ab4f8", task: "#68d391", break: "#f0b429", evening: "#c084fc", checklist: "#fb8a4a" };
              const color = colors[item.type] || "#8a9ab0";
              return (
                <div key={i} style={{ display: "flex", gap: 12, position: "relative" }}>
                  <div style={{
                    flexShrink: 0, width: 48, textAlign: "right", fontFamily: "monospace", fontSize: 11,
                    color: isNow ? color : isPast ? "#2a3a4a" : "#5a6a7a", paddingTop: 13,
                  }}>{item.time}</div>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%", marginTop: 14,
                      background: isNow ? color : isPast ? "#1e2a3a" : "#141e2a",
                      border: `2px solid ${isNow ? color : "#1e2a3a"}`,
                      boxShadow: isNow ? `0 0 8px ${color}` : "none", flexShrink: 0,
                    }} />
                    {i < TRADER_SCHEDULE.length - 1 && (
                      <div style={{ width: 1, flex: 1, background: "#141e2a", minHeight: 18 }} />
                    )}
                  </div>
                  <div style={{
                    flex: 1, background: isNow ? `${color}12` : "#0f1520",
                    borderRadius: 8, padding: "9px 13px", marginBottom: 6,
                    border: `1px solid ${isNow ? color + "35" : "#1a2535"}`,
                    opacity: isPast && !isNow ? 0.45 : 1, transition: "all 0.3s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: "bold", color: isNow ? color : "#c0b8a8" }}>{item.label}</div>
                      <div style={{
                        fontSize: 8, letterSpacing: 2, color: color, textTransform: "uppercase",
                        background: `${color}18`, padding: "2px 7px", borderRadius: 3,
                      }}>{item.type}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#4a5a6a", marginTop: 4, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── RÈGLES ── */}
        {view === "rules" && (
          <div>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, letterSpacing: 4, color: "#fb8a4a", textTransform: "uppercase", marginBottom: 5 }}>Plan de Trading Personnel</div>
              <div style={{ fontSize: 26, color: "#e8e0d4", fontWeight: "bold" }}>13 Règles Non Négociables</div>
              <div style={{ fontSize: 12, color: "#5a6a7a", marginTop: 5 }}>
                Violation = arrêt immédiat · Ce plan est un contrat avec toi-même
              </div>
            </div>
            {TRADING_RULES.map((r, i) => (
              <div key={i} style={{
                background: "#0f1520", borderRadius: 9, border: "1px solid #1a2535",
                padding: "14px 16px", marginBottom: 8,
              }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: 5,
                    background: "#141e2a", border: "1px solid #2a3a4a",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "#fb8a4a" }}>{r.num}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#c8c0b0", lineHeight: 1.5, marginBottom: 5 }}>{r.rule}</div>
                    <div style={{ fontSize: 11, color: "#4a5a6a", fontStyle: "italic" }}>
                      → {r.consequence}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div style={{
              background: "#0d1219", borderRadius: 9, border: "1px solid #2a3a2a",
              padding: "14px 18px", marginTop: 8, textAlign: "center",
            }}>
              <div style={{ fontSize: 12, color: "#7a8a7a", lineHeight: 1.8 }}>
                "Ce plan de trading est un contrat avec moi-même.<br />
                Le respecter est la seule décision qui dépend entièrement de moi."
              </div>
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
                {completedEve}/{EVENING_ROUTINE.length} étapes · 18h30 → 22h00 · Vie sociale incluse
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
                La discipline du soir construit la performance du matin.<br />
                <span style={{ fontSize: 11, color: "#3a4a5a" }}>Le marché sera toujours là demain.</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
