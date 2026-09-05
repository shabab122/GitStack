(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;
  const grid = document.getElementById("teamGrid");
  const modal = document.getElementById("teamModal");
  const form = document.getElementById("teamForm");
  const nameInput = document.getElementById("teamName");
  const teamIdInput = document.getElementById("teamId");
  const fields = document.getElementById("teamMemberFields");
  let students = [];
  let teams = [];
  const roles = ["FEATURE_DEVELOPER", "TEST_DEVELOPER", "CODE_REVIEWER"];

  function memberFields(selected = []) {
    fields.innerHTML = [0,1,2].map((index) => {
      const current = selected[index] || {};
      const selectedIds = new Set(selected.map((member) => member.id));
      const candidates = students.filter((student) => !student.team || selectedIds.has(student.id));
      return `<div class="team-member-form"><select data-member="${index}" required><option value="">Choose student ${index+1}</option>${candidates.map((student) => `<option value="${student.id}" ${student.id===current.id?'selected':''}>${G.escapeHtml(student.fullName)} · ${G.escapeHtml(student.universityId)}</option>`).join("")}</select><select data-role="${index}" required>${roles.map((role) => `<option value="${role}" ${role===current.teamRole?'selected':''}>${G.escapeHtml(G.roleLabel(role))}</option>`).join("")}</select></div>`;
    }).join("");
  }
  function showMessage(message, kind = "error") { const el=form.querySelector(".form-message"); el.className=`form-message ${kind} show`; el.textContent=message; }
  function clearMessage(){const el=form.querySelector(".form-message");el.className="form-message";el.textContent="";}
  function openTeam(team = null) {
    clearMessage(); teamIdInput.value = team?.id || ""; nameInput.value = team?.name || "";
    document.getElementById("teamModalTitle").textContent = team ? "Edit three-person team" : "Create three-person team";
    memberFields(team?.members || []); modal.hidden = false; window.lucide?.createIcons?.();
  }
  function closeTeam(){modal.hidden=true;form.reset();teamIdInput.value="";}
  document.getElementById("openTeamModal").addEventListener("click",()=>openTeam());
  document.querySelectorAll("[data-close-team]").forEach((button)=>button.addEventListener("click",closeTeam));

  function render(){
    grid.innerHTML = teams.length ? teams.map((team) => `
      <article class="team-card"><div class="team-card-top"><div><span class="tag green">3-person team</span><h3>${G.escapeHtml(team.name)}</h3><p>Created ${G.formatDateOnly(team.createdAt)}</p></div><span class="tag dark">${team.runCount} runs</span></div>
      <div class="member-list">${team.members.map((member)=>`<div class="member-row"><div class="member-left"><span class="avatar">${G.escapeHtml((member.fullName||'?')[0])}</span><div><strong>${G.escapeHtml(member.fullName)}</strong><small>${G.escapeHtml(member.universityId)}</small></div></div><span class="tag">${G.escapeHtml(G.roleLabel(member.teamRole))}</span></div>`).join("")}</div>
      <div class="notice info" style="margin-top:13px">Gitea repository: <strong>not provisioned yet</strong> — next collaboration milestone.</div>
      <div style="display:flex;gap:8px;margin-top:14px"><button class="secondary-action" data-edit="${team.id}" type="button">Edit team</button><a class="primary-action" href="instructor-assignments.html">Assign team mission</a><button class="danger-action" data-delete="${team.id}" type="button">Delete</button></div></article>`).join("") : `<div class="empty-state">No teams yet. Create the first three-person team.</div>`;
    grid.querySelectorAll("[data-edit]").forEach((button)=>button.addEventListener("click",()=>openTeam(teams.find((team)=>team.id===button.dataset.edit))));
    grid.querySelectorAll("[data-delete]").forEach((button)=>button.addEventListener("click",()=>deleteTeam(button.dataset.delete)));
    window.lucide?.createIcons?.();
  }
  async function loadTeams(){teams=(await G.api("/api/instructor/teams")).teams;render();}
  async function deleteTeam(id){if(!confirm("Delete this team? Teams with assignment or mission history cannot be deleted."))return;try{await G.api(`/api/instructor/teams/${id}`,{method:"DELETE"});G.toast("Team deleted.","success");await loadTeams();}catch(error){G.toast(error.message,"error");}}
  form.addEventListener("submit",async(event)=>{event.preventDefault();clearMessage();const members=[0,1,2].map((index)=>({userId:fields.querySelector(`[data-member="${index}"]`).value,teamRole:fields.querySelector(`[data-role="${index}"]`).value}));if(new Set(members.map((m)=>m.userId)).size!==3)return showMessage("Choose three different students.");if(new Set(members.map((m)=>m.teamRole)).size!==3)return showMessage("Each team role must be unique.");const id=teamIdInput.value;try{await G.api(id?`/api/instructor/teams/${id}`:"/api/instructor/teams",{method:id?"PATCH":"POST",body:JSON.stringify({name:nameInput.value,members})});G.toast(id?"Team updated.":"Team created.","success");closeTeam();await loadTeams();}catch(error){showMessage(error.message);}});

  try{students=(await G.api("/api/instructor/students")).students.filter((student)=>student.isActive);memberFields();await loadTeams();}catch(error){grid.innerHTML=`<div class="empty-state">${G.escapeHtml(error.message)}</div>`;}
})();
