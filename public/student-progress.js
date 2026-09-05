(async () => {
  "use strict";
  const G = window.GitStackStudent;
  if (!await G.ensureStudent()) return;
  try {
    const data = await G.api("/api/student/progress");
    document.getElementById("xpTotal").textContent = `${data.xp.total} XP`;
    document.getElementById("xpLevel").textContent = data.xp.level;
    document.getElementById("xpLevelBar").style.width = `${data.xp.progressPercent}%`;
    document.getElementById("xpMessage").textContent = `${Math.max(0,data.xp.nextLevelXp-data.xp.total)} XP until Level ${data.xp.level+1}`;
    document.querySelectorAll("[data-student-xp]").forEach((el) => el.textContent = `${data.xp.total} XP`);
    const passedAttempts = data.runs.filter((run) => run.assessment?.passed).length;
    document.getElementById("progressStats").innerHTML = [
      ["badge-check",data.completedMissions,"Unique missions completed"],
      ["history",data.totalAttempts,"Total attempts"],
      ["scan-search",passedAttempts,"Passed assessments"],
      ["rotate-ccw",data.runs.reduce((sum,run)=>sum+(run.resetCount||0),0),"Sandbox resets"]
    ].map(([icon,value,label])=>`<article class="stat-card"><span class="stat-icon"><i data-lucide="${icon}"></i></span><strong>${value}</strong><span>${label}</span></article>`).join("");
    const rows=document.getElementById("progressRows");
    rows.innerHTML=data.runs.length?data.runs.map(run=>`<tr><td><strong>${G.escapeHtml(run.mission.title)}</strong></td><td>#${run.attemptNumber}</td><td><span class="status-chip ${G.statusClass(run.status)}">${G.statusLabel(run.status)}</span></td><td><span class="score-badge">${run.assessment?.totalScore ?? '—'}${run.assessment?'%':''}</span></td><td>${run.xpAwarded || 0}</td><td>${G.formatDate(run.updatedAt)}</td><td><a href="student-mission.html?run=${encodeURIComponent(run.id)}" style="color:var(--sd-accent);font-weight:800">Open</a></td></tr>`).join(""):`<tr><td colspan="7"><div class="empty-state">No attempts yet.</div></td></tr>`;
    window.lucide?.createIcons?.();
  } catch(error){G.toast(error.message,"error");}
})();
