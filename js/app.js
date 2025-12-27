/**
 * Fin.Journey – lightweight gamification & tools (localStorage).
 * No backend: everything stored on the user's device.
 */
const STORE_KEY = "finjourney_state_v1";

const DEFAULT_STATE = {
  createdAt: new Date().toISOString(),
  points: 0,
  reads: {},      // {moduleId: true}
  quizzes: {},    // {quizId: {score, total, ts}}
  badges: {},     // {badgeId: true}
  lastToastTs: 0
};

const LEVELS = [
  { name: "Beginner", min: 0 },
  { name: "Intermediate", min: 160 },
  { name: "Advanced", min: 320 }
];

const BADGES = [
  { id: "fintech_explorer", name: "FinTech Explorer", rule: (s)=> completedModules(s) >= 2 },
  { id: "security_aware", name: "Security Aware", rule: (s)=> s.quizzes["security_quiz"]?.score >= 3 },
  { id: "reg_ready", name: "Regulation Ready", rule: (s)=> s.reads["regulation"] && s.quizzes["regulation_quiz"]?.score >= 3 },
  { id: "tool_user", name: "Tool User", rule: (s)=> s.reads["tools"] === true }, // awarded when user visits tools and clicks "Simpan hasil"
  { id: "journey_streak", name: "Journey Starter", rule: (s)=> totalActions(s) >= 4 }
];

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  }catch(e){
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state){
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function addPoints(amount, reason=""){
  const s = loadState();
  s.points = Math.max(0, (s.points||0) + amount);
  awardBadges(s);
  saveState(s);
  toast(`+${amount} poin. ${reason}`.trim());
  refreshGamificationUI();
}

function markRead(moduleId){
  const s = loadState();
  if(s.reads[moduleId]) {
    toast("Materi ini sudah tercatat sebagai selesai ✅");
    return;
  }
  s.reads[moduleId] = true;
  s.points += 30;
  awardBadges(s);
  saveState(s);
  toast("Materi selesai! +30 poin ✅");
  refreshGamificationUI();
}

function recordQuiz(quizId, score, total){
  const s = loadState();
  const prev = s.quizzes[quizId];
  s.quizzes[quizId] = { score, total, ts: new Date().toISOString() };

  // Points: base + performance; if improved, bonus.
  const base = 40;
  const perf = Math.round((score/total)*40);
  let gained = base + perf;
  if(prev && score > (prev.score||0)) gained += 15;

  s.points += gained;
  awardBadges(s);
  saveState(s);

  toast(`Kuis tersimpan! Skor ${score}/${total}. +${gained} poin 🎯`);
  refreshGamificationUI();
}

function awardBadges(s){
  for(const b of BADGES){
    if(s.badges[b.id]) continue;
    if(b.rule(s)){
      s.badges[b.id] = true;
    }
  }
}

function levelFor(points){
  let cur = LEVELS[0];
  for(const lv of LEVELS){
    if(points >= lv.min) cur = lv;
  }
  const idx = LEVELS.indexOf(cur);
  const next = LEVELS[idx+1] || null;
  return { current: cur, next };
}

function completedModules(s){
  return Object.values(s.reads||{}).filter(Boolean).length;
}

function completedQuizzes(s){
  return Object.keys(s.quizzes||{}).length;
}

function totalActions(s){
  return completedModules(s) + completedQuizzes(s);
}

function overallProgress(s){
  // 4 core modules + tools page "read" counts as 1 optional; quizzes: 4
  const modulesTarget = 4;
  const quizzesTarget = 4;
  const m = Math.min(completedModules(s), modulesTarget);
  const q = Math.min(completedQuizzes(s), quizzesTarget);
  const done = m + q;
  const total = modulesTarget + quizzesTarget;
  return { done, total, pct: Math.round((done/total)*100) };
}

function formatPct(p){ return `${Math.max(0, Math.min(100, p))}%`; }

function toast(msg){
  const el = document.getElementById("toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=> el.classList.remove("show"), 2600);
}

function setActiveNav(){
  const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll("[data-nav]").forEach(a=>{
    const target = (a.getAttribute("href")||"").split("/").pop().toLowerCase();
    if(target === path) a.classList.add("active");
  });
}

function setupMobileNav(){
  const btn = document.getElementById("mobileBtn");
  const drawer = document.getElementById("mobileDrawer");
  if(!btn || !drawer) return;
  btn.addEventListener("click", ()=>{
    drawer.classList.toggle("open");
  });
  drawer.querySelectorAll("a").forEach(a=>{
    a.addEventListener("click", ()=> drawer.classList.remove("open"));
  });
}

function refreshGamificationUI(){
  const s = loadState();
  const points = s.points || 0;
  const lv = levelFor(points);
  const prog = overallProgress(s);

  const setText = (id, v)=>{ const el=document.getElementById(id); if(el) el.textContent = v; };
  const setHTML = (id, v)=>{ const el=document.getElementById(id); if(el) el.innerHTML = v; };

  setText("pointsVal", points.toString());
  setText("levelVal", lv.current.name);

  const bar = document.getElementById("levelBar");
  if(bar){
    const start = lv.current.min;
    const end = lv.next ? lv.next.min : (lv.current.min + 120);
    const pct = lv.next ? Math.round(((points-start)/(end-start))*100) : 100;
    bar.style.width = formatPct(pct);
  }

  const progBar = document.getElementById("progressBar");
  if(progBar) progBar.style.width = formatPct(prog.pct);

  setText("progressVal", `${prog.pct}%`);
  setText("progressMeta", `${prog.done}/${prog.total} checkpoint`);

  // badges list
  const list = document.getElementById("badgesList");
  if(list){
    const earned = Object.keys(s.badges||{});
    const items = BADGES.map(b=>{
      const on = earned.includes(b.id);
      return `<span class="badge" title="${on ? 'Tercapai' : 'Belum tercapai'}">
        ${on ? "🏅" : "🔒"} <strong>${b.name}</strong>
      </span>`;
    }).join(" ");
    list.innerHTML = items || `<span class="small">Belum ada badge. Mulai baca materi & kerjakan kuis!</span>`;
  }

  // history table
  const h = document.getElementById("historyBody");
  if(h){
    const rows = [];
    for(const [qid, v] of Object.entries(s.quizzes||{})){
      rows.push({ type: "Kuis", id: qid, detail: `${v.score}/${v.total}`, ts: v.ts });
    }
    for(const [mid, ok] of Object.entries(s.reads||{})){
      if(ok) rows.push({ type:"Materi", id: mid, detail:"Selesai", ts: s.createdAt });
    }
    rows.sort((a,b)=> (b.ts||"").localeCompare(a.ts||""));
    h.innerHTML = rows.slice(0,12).map(r=>`
      <tr>
        <td>${r.type}</td>
        <td>${escapeHtml(prettyId(r.id))}</td>
        <td>${r.detail}</td>
      </tr>
    `).join("") || `<tr><td colspan="3" class="small">Belum ada riwayat. Mulai dari halaman Modul.</td></tr>`;
  }
}

function prettyId(id){
  return (id||"")
    .replaceAll("_"," ")
    .replace(/\b\w/g, m=>m.toUpperCase());
}
function escapeHtml(str){
  return (str||"").replace(/[&<>"']/g, s=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}

// --- Quiz helper ---
function wireQuiz(formId, quizId, answerKey){
  const form = document.getElementById(formId);
  if(!form) return;
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    let score = 0;
    const total = Object.keys(answerKey).length;
    for(const q of Object.keys(answerKey)){
      const chosen = form.querySelector(`input[name="${q}"]:checked`)?.value;
      if(chosen && chosen === answerKey[q]) score += 1;
    }
    recordQuiz(quizId, score, total);

    const result = form.querySelector("[data-quiz-result]");
    if(result){
      result.innerHTML = score >= Math.ceil(total*0.75)
        ? `✅ Mantap! Skor kamu <strong>${score}/${total}</strong>. Kamu sudah cukup siap untuk praktik berikutnya.`
        : `📌 Skor kamu <strong>${score}/${total}</strong>. Coba baca ulang poin penting, lalu ulangi kuis untuk meningkatkan skor.`;
    }
  });
}

// --- Tools ---
function wireBudgetTool(){
  const form = document.getElementById("budgetForm");
  if(!form) return;
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const income = num("income");
    const need = num("need");
    const want = num("want");
    const save = num("save");
    const total = need + want + save;

    const out = document.getElementById("budgetOut");
    if(!out) return;

    if(income <= 0){
      out.innerHTML = `<span class="small">Masukkan pemasukan bulanan terlebih dulu.</span>`;
      return;
    }
    const diff = income - total;
    const status = diff >= 0 ? "ok" : "danger";
    out.innerHTML = `
      <div class="kpi">
        <div>
          <div class="n">${formatIDR(income)}</div>
          <div class="lbl">Pemasukan</div>
        </div>
        <div>
          <div class="n">${formatIDR(total)}</div>
          <div class="lbl">Total Alokasi</div>
        </div>
        <div>
          <div class="n">${formatIDR(diff)}</div>
          <div class="lbl">${diff>=0 ? "Sisa" : "Defisit"}</div>
        </div>
      </div>
      <hr class="sep"/>
      <div class="notice">
        <strong>Insight cepat:</strong>
        ${budgetInsight(income, need, want, save, diff)}
      </div>
      <div class="section" style="padding:14px 0 0">
        <div class="small">Visual alokasi (perkiraan)</div>
        <div class="progress" style="margin-top:8px"><div style="width:${pct(need,income)}"></div></div>
        <div class="small" style="margin-top:6px">Kebutuhan: ${pct(need,income)}</div>
        <div class="progress" style="margin-top:8px"><div style="width:${pct(want,income)}"></div></div>
        <div class="small" style="margin-top:6px">Keinginan: ${pct(want,income)}</div>
        <div class="progress" style="margin-top:8px"><div style="width:${pct(save,income)}"></div></div>
        <div class="small" style="margin-top:6px">Tabungan/Investasi: ${pct(save,income)}</div>
      </div>
    `;

    // count as "tools read" + reward small points once
    const s = loadState();
    if(!s.reads["tools"]){
      s.reads["tools"] = true;
      s.points += 20;
      awardBadges(s);
      saveState(s);
      toast("Hasil simulasi tersimpan di perangkat kamu. +20 poin 🛠️");
    }else{
      toast("Hasil simulasi diperbarui ✅");
    }
    refreshGamificationUI();
  });
}

function wireSavingsTool(){
  const form = document.getElementById("saveForm");
  if(!form) return;
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const target = num("target");
    const monthly = num("monthly");
    const months = num("months");
    const out = document.getElementById("saveOut");
    if(!out) return;

    if(target<=0){
      out.innerHTML = `<span class="small">Masukkan target dana.</span>`;
      return;
    }
    let calcMonths = null;
    let calcMonthly = null;

    if(monthly>0 && (!months || months<=0)){
      calcMonths = Math.ceil(target / monthly);
    }
    if(months>0 && (!monthly || monthly<=0)){
      calcMonthly = Math.ceil(target / months);
    }

    const msg = [];
    if(calcMonths!==null){
      msg.push(`Dengan setoran <strong>${formatIDR(monthly)}</strong>/bulan, kamu butuh sekitar <strong>${calcMonths} bulan</strong> untuk mencapai target <strong>${formatIDR(target)}</strong>.`);
    }else if(calcMonthly!==null){
      msg.push(`Dengan waktu <strong>${months} bulan</strong>, kamu perlu menabung sekitar <strong>${formatIDR(calcMonthly)}</strong>/bulan untuk mencapai target <strong>${formatIDR(target)}</strong>.`);
    }else if(monthly>0 && months>0){
      const total = monthly*months;
      msg.push(`Jika menabung <strong>${formatIDR(monthly)}</strong>/bulan selama <strong>${months} bulan</strong>, totalnya <strong>${formatIDR(total)}</strong>.`);
      msg.push(total>=target ? `✅ Target tercapai!` : `📌 Masih kurang <strong>${formatIDR(target-total)}</strong> dari target.`);
    }else{
      msg.push("Isi minimal salah satu: setoran per bulan atau durasi bulan.");
    }

    out.innerHTML = `<div class="notice"><strong>Hasil:</strong> ${msg.join(" ")}</div>`;
    toast("Simulasi tabungan diperbarui ✅");
  });
}

// --- helpers ---
function num(id){
  const el = document.getElementById(id);
  if(!el) return 0;
  const v = (el.value||"").toString().replace(/[^\d.]/g,"");
  return Number(v||0);
}
function formatIDR(n){
  try{
    return new Intl.NumberFormat("id-ID", {style:"currency", currency:"IDR", maximumFractionDigits:0}).format(n);
  }catch{
    return "Rp " + Math.round(n).toString();
  }
}
function pct(part, total){
  if(total<=0) return "0%";
  return `${Math.min(100, Math.max(0, Math.round((part/total)*100)))}%`;
}
function budgetInsight(income, need, want, save, diff){
  const needPct = (need/income)*100;
  const wantPct = (want/income)*100;
  const savePct = (save/income)*100;

  const tips = [];
  // simple 50/30/20 heuristic
  if(needPct > 55) tips.push("Kebutuhan kamu cukup tinggi. Coba cek pos biaya tetap: kontrakan, cicilan, dan tagihan.");
  if(wantPct > 35) tips.push("Pengeluaran keinginan terlihat dominan. Pertimbangkan membuat batas (cap) mingguan.");
  if(savePct < 15) tips.push("Porsi tabungan/investasi masih kecil. Mulai dari auto-debit kecil tapi konsisten.");
  if(diff < 0) tips.push("Kamu defisit. Prioritaskan kebutuhan, kurangi keinginan, atau cari tambahan pemasukan.");
  if(tips.length === 0) tips.push("Struktur alokasi kamu sudah seimbang. Pertahankan konsistensi dan evaluasi tiap bulan.");
  return tips.join(" ");
}

// --- boot ---
document.addEventListener("DOMContentLoaded", ()=>{
  setActiveNav();
  setupMobileNav();
  refreshGamificationUI();
  wireBudgetTool();
  wireSavingsTool();
});
