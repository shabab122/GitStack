(async () => {
  "use strict";
  const G=window.GitStackStudent;
  if(!await G.ensureStudent()) return;
  const root=document.getElementById("feedbackList");
  try{
    const data=await G.api("/api/student/feedback");
    root.innerHTML=data.feedback.length?data.feedback.map(item=>`<article class="history-row" style="grid-template-columns:1fr"><div><div class="mission-meta"><span class="tag">${G.escapeHtml(item.mission.title)}</span>${item.score!==null?`<span class="tag">Score ${item.score}%</span>`:''}${item.passed===true?`<span class="status-chip completed">PASSED</span>`:item.passed===false?`<span class="status-chip failed">NEEDS WORK</span>`:''}</div><p style="margin:10px 0 5px;font-weight:650">${G.escapeHtml(item.message)}</p><small>${G.formatDate(item.createdAt)} • বাংলা feedback</small><div style="margin-top:9px"><a href="student-mission.html?run=${encodeURIComponent(item.runId)}" style="color:var(--sd-accent);font-size:12px;font-weight:800">Open mission attempt →</a></div></div></article>`).join(""):`<div class="empty-state"><i data-lucide="messages-square"></i><h3>No feedback yet</h3><p>Submit a mission and GitStack will store validator feedback here.</p></div>`;
    window.lucide?.createIcons?.();
  }catch(error){root.innerHTML=`<div class="empty-state">${G.escapeHtml(error.message)}</div>`;}
})();
