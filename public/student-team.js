(async () => {
  "use strict";
  const G=window.GitStackStudent;
  if(!await G.ensureStudent()) return;
  const root=document.getElementById("teamRoot");
  try{
    const {team}=await G.api("/api/student/team");
    if(!team){root.innerHTML=`<div class="card"><div class="empty-state"><i data-lucide="users-round"></i><h3>No team assignment yet</h3><p>Your instructor will assign a team for the Gitea collaboration mission. Individual missions remain fully available now.</p><a class="primary-action" href="student-missions.html">Continue individual missions</a></div></div>`;window.lucide?.createIcons?.();return;}
    root.innerHTML=`<section class="page-intro" style="margin-top:-10px"><div><div class="mission-meta"><span class="tag">${G.escapeHtml(team.role||'Member')}</span></div><h2>${G.escapeHtml(team.name)}</h2></div></section><section class="team-layout"><div class="card"><div class="card-head"><h3>Team members</h3></div><div class="card-body">${team.members.map(member=>`<div class="team-member"><div class="member-left"><span class="avatar">${G.escapeHtml((member.fullName||'?')[0])}</span><div><strong>${G.escapeHtml(member.fullName)}</strong><small>${G.escapeHtml(member.universityId)} • ${G.escapeHtml(member.teamRole||'Role pending')}</small></div></div><span class="tag">${member.xp} XP</span></div>`).join('')}</div></div><div class="card"><div class="card-head"><h3>Assignments</h3></div><div class="card-body">${team.assignments.length?team.assignments.map(a=>`<div class="history-row"><div><strong>${G.escapeHtml(a.mission.title)}</strong><small>${G.escapeHtml(a.mission.description)}</small></div><span class="status-chip ${G.statusClass(a.status)}">${G.statusLabel(a.status)}</span></div>`).join(''):`<div class="empty-state">No team mission assigned yet.</div>`}</div></div></section>`;
    window.lucide?.createIcons?.();
  }catch(error){root.innerHTML=`<div class="card"><div class="empty-state">${G.escapeHtml(error.message)}</div></div>`;}
})();
