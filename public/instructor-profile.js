(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;
  const profileForm = document.getElementById("profileForm");
  const passwordForm = document.getElementById("passwordForm");

  function setMessage(form, message, kind) {
    const el = form.querySelector(".form-message");
    el.className = `form-message full ${kind} show`;
    el.textContent = message;
  }
  try {
    const { user } = await G.api("/api/instructor/profile");
    for (const [key, value] of Object.entries({ fullName:user.fullName,email:user.email,universityId:user.universityId,department:user.department,designation:user.designation })) {
      const field = profileForm.elements.namedItem(key); if (field) field.value = value || "";
    }
  } catch (error) { G.toast(error.message, "error"); }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const fd = new FormData(profileForm);
    try {
      const data = await G.api("/api/instructor/profile", { method:"PATCH", body:JSON.stringify({ fullName:fd.get("fullName"), department:fd.get("department"), designation:fd.get("designation") }) });
      setMessage(profileForm, data.message, "success");
      document.querySelectorAll("[data-instructor-name]").forEach((el)=>el.textContent=data.user.fullName);
      document.querySelectorAll("[data-instructor-designation]").forEach((el)=>el.textContent=data.user.designation || "Instructor");
    } catch (error) { setMessage(profileForm, error.message, "error"); }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const fd = new FormData(passwordForm);
    if (fd.get("newPassword") !== fd.get("confirmPassword")) return setMessage(passwordForm,"New passwords do not match.","error");
    try { const data=await G.api("/api/instructor/profile/password",{method:"POST",body:JSON.stringify({currentPassword:fd.get("currentPassword"),newPassword:fd.get("newPassword")})});setMessage(passwordForm,data.message,"success");passwordForm.reset(); } catch(error){setMessage(passwordForm,error.message,"error");}
  });
})();
