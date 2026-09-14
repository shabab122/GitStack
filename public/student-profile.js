(async () => {
  "use strict";
  const G=window.GitStackStudent;
  if(!await G.ensureStudent()) return;
  const profileForm=document.getElementById("profileForm");
  const passwordForm=document.getElementById("passwordForm");
  const profileMessage=document.getElementById("profileMessage");
  const passwordMessage=document.getElementById("passwordMessage");
  function show(el,message,kind){el.className=`form-message show ${kind}`;el.textContent=message;}
  try{
    const {user}=await G.api("/api/student/profile");
    for(const [key,value] of Object.entries(user)){const input=profileForm.elements.namedItem(key);if(input)input.value=value??'';}
  }catch(error){G.toast(error.message,"error");}
  profileForm.addEventListener("submit",async(event)=>{event.preventDefault();try{const form=new FormData(profileForm);const data=await G.api("/api/student/profile",{method:"PATCH",body:JSON.stringify({fullName:form.get("fullName"),department:form.get("department"),semester:form.get("semester")})});show(profileMessage,data.message,"success");document.querySelectorAll("[data-student-name]").forEach(el=>el.textContent=data.user.fullName);}catch(error){show(profileMessage,error.message,"error");}});
  passwordForm.addEventListener("submit",async(event)=>{event.preventDefault();const form=new FormData(passwordForm);if(form.get("newPassword")!==form.get("confirmPassword")){show(passwordMessage,"New passwords do not match.","error");return;}try{const data=await G.api("/api/student/profile/password",{method:"POST",body:JSON.stringify({currentPassword:form.get("currentPassword"),newPassword:form.get("newPassword")})});passwordForm.reset();show(passwordMessage,data.message,"success");}catch(error){show(passwordMessage,error.message,"error");}});
})();
