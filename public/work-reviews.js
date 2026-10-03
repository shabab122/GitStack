(async () => {
  "use strict";
  const G = window.GitStackStudent || window.GitStackInstructor;
  const student = Boolean(window.GitStackStudent);
  if (!await (student ? G.ensureStudent() : G.ensureInstructor())) return;
  const UI = window.GitStackReviewsUI;
  const t = UI.t;
  const escape = G.escapeHtml;
  const $ = (id) => document.getElementById(id);
  const text = {
    heading: ["Work reviews", "কাজের রিভিউ"], refresh: ["Refresh", "রিফ্রেশ"], filter: ["Status", "অবস্থা"], all: ["All requests", "সব অনুরোধ"],
    pending: ["Pending review", "রিভিউয়ের অপেক্ষায়"], reviewed: ["Reviewed", "রিভিউ সম্পন্ন"], approved: ["Approved", "অনুমোদিত"], changes: ["Changes requested", "সংশোধন প্রয়োজন"],
    newRequest: ["Request a review", "Review-এর অনুরোধ করুন"], team: ["Team repository", "Team repository"], assignment: ["Assignment (optional)", "Assignment (ঐচ্ছিক)"],
    title: ["Review title", "Review-এর শিরোনাম"], titlePlaceholder: ["Review my login validation", "আমার login validation review করুন"],
    referenceType: ["Work reference", "কাজের reference"], branch: ["Branch", "Branch"], commit: ["Commit", "Commit"], pullRequest: ["Pull Request", "Pull Request"],
    reference: ["Branch name, commit SHA or PR number", "Branch name, commit SHA অথবা PR number"],
    referenceHelp: ["Push your changes to the assigned team repository first.", "আগে assigned team repository-তে নিজের পরিবর্তন push করুন।"],
    summary: ["My contribution and questions", "আমার অবদান ও প্রশ্ন"], summaryPlaceholder: ["Explain what you changed, how you tested it and what you want feedback on.", "কী পরিবর্তন করেছেন, কীভাবে test করেছেন এবং কোন বিষয়ে feedback চান লিখুন।"],
    files: ["Files to focus on (optional)", "কোন files review করতে হবে (ঐচ্ছিক)"], filesPlaceholder: ["src/login.js\ntests/login.test.js", "src/login.js\ntests/login.test.js"],
    filesHelp: ["One exact repository-relative path per line, up to 20 files. Leave blank to review the whole submitted change.", "প্রতি লাইনে একটি exact repository-relative path দিন, সর্বোচ্চ ২০টি file। পুরো change review করতে খালি রাখুন।"],
    scopeHelp: ["Describe your own portion of the work. Your team instructor receives a private request. The submitted commit snapshot is preserved, so later pushes do not replace it.", "নিজের করা কাজের অংশটি লিখুন। আপনার team instructor ব্যক্তিগত request পাবেন। Submitted commit snapshot সংরক্ষিত থাকবে, পরে push করলেও এটি বদলাবে না।"],
    send: ["Send review request", "Review request পাঠান"]
  };
  let contexts = [], rows = [], nextCursor = null, total = 0, pending = 0, selected = null;
  let requestKey = crypto.randomUUID(), listLoading = false, submitting = false, replying = false, selectionVersion = 0;
  function message(id, value, kind = "error") {
    const element = $(id); element.textContent = value; element.className = `review-message ${kind}`; element.hidden = !value;
  }
  function refPlaceholder() {
    if (!student) return;
    $("reviewReference").placeholder = $("reviewReferenceType").value === "BRANCH" ? "feature/login-improvement"
      : $("reviewReferenceType").value === "COMMIT" ? "a1b2c3d..." : "12";
  }
  function renderContexts() {
    if (!student) return;
    const selectedTeam = $("reviewTeam").value;
    const selectedAssignment = $("reviewAssignment").value;
    $("reviewTeam").innerHTML = `<option value="">${t("Choose a team repository", "Team repository নির্বাচন করুন")}</option>` + contexts.map((team) => `<option value="${escape(team.id)}">${escape(team.name)} · ${escape(team.repository)} · ${escape(team.instructor)}</option>`).join("");
    $("reviewTeam").value = contexts.some((team) => team.id === selectedTeam) ? selectedTeam : contexts.length === 1 ? contexts[0].id : "";
    renderAssignments(selectedAssignment);
    $("sendWorkReview").disabled = !contexts.length || submitting;
    if (!contexts.length) message("reviewFormMessage", t("Your instructor needs to create your team and assign its Gitea repository before you can request a review.", "Review-এর অনুরোধ করতে instructor-কে আগে আপনার team ও Gitea repository assign করতে হবে।"));
  }
  function renderAssignments(value = "") {
    const team = contexts.find((item) => item.id === $("reviewTeam").value);
    $("reviewAssignment").innerHTML = `<option value="">${t("General team work", "Team-এর সাধারণ কাজ")}</option>` + (team?.assignments || []).map((assignment) => `<option value="${escape(assignment.id)}">${escape(assignment.title)}</option>`).join("");
    if (team?.assignments.some((assignment) => assignment.id === value)) $("reviewAssignment").value = value;
  }
  function renderList() {
    $("reviewCounts").textContent = `${total} ${t("requests", "অনুরোধ")} · ${pending} ${t("pending", "অপেক্ষমাণ")}`;
    $("workReviewList").innerHTML = rows.length ? rows.map((row) => `<button type="button" class="review-list-item ${row.id === selected?.id ? "active" : ""}" data-review-open="${escape(row.id)}"><strong>${escape(row.title)}</strong><small>${escape(row.teamName)} · ${escape(student ? row.instructor?.fullName || "" : row.student?.fullName || "")}</small><div class="review-list-meta">${UI.status(row.status)}<small>${G.formatDate(row.createdAt)}</small></div></button>`).join("") : `<div class="review-empty">${t("No review requests match this filter.", "এই filter-এ কোনো review request নেই।")}</div>`;
    if (nextCursor) $("workReviewList").insertAdjacentHTML("beforeend", `<button class="secondary-action" type="button" data-review-more>${t("Load more", "আরও দেখুন")}</button>`);
  }
  function safeUrl(value) {
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? escape(url.href) : "#"; } catch { return "#"; }
  }
  function renderDetail(preserveDraft = true) {
    const draft = preserveDraft ? $("reviewFeedback")?.value : null;
    const outcome = preserveDraft ? $("reviewOutcome")?.value : null;
    const root = $("workReviewDetail");
    if (!selected) { root.innerHTML = `<div class="review-empty">${t("Select a request to view its work snapshot and feedback.", "কাজের snapshot ও feedback দেখতে একটি request নির্বাচন করুন।")}</div>`; return; }
    const row = selected, evidence = row.evidence || {};
    root.innerHTML = `<div class="review-detail-head"><h3>${escape(row.title)}</h3>${UI.status(row.status)}</div>
      <div class="review-detail-meta"><span>${t("Student", "Student")}: <strong>${escape(row.student?.fullName || t("Former student", "সাবেক student"))}</strong>${row.student?.universityId ? ` · ${escape(row.student.universityId)}` : ""}</span><span>${t("Instructor", "Instructor")}: <strong>${escape(row.instructor?.fullName || "—")}</strong></span><span>${escape(row.teamName)} · ${escape(row.repository)}</span>${row.assignment ? `<span>${t("Assignment", "Assignment")}: ${escape(row.assignment.title)}</span>` : ""}<span>${t("Requested", "অনুরোধের সময়")}: ${G.formatDate(row.createdAt)}</span></div>
      <h4>${t("Student contribution and questions", "Student-এর অবদান ও প্রশ্ন")}</h4><div class="review-prose">${escape(row.summary)}</div>
      <div class="review-links"><a class="secondary-action" href="${safeUrl(evidence.snapshotUrl)}" target="_blank" rel="noopener noreferrer">${t("Open submitted changes in Gitea", "Gitea-তে submitted changes দেখুন")}</a><a class="secondary-action" href="${safeUrl(evidence.referenceUrl)}" target="_blank" rel="noopener noreferrer">${t("Open current branch / PR / commit", "বর্তমান branch / PR / commit খুলুন")}</a></div>
      <div class="review-snapshot"><strong>${t("Submitted snapshot", "Submitted snapshot")}</strong><div><code>${escape(evidence.headSha || row.headSha)}</code></div><p class="review-help">${t("This snapshot was fixed when the request was sent. Review this version even if the branch changes later.", "Request পাঠানোর সময় এই snapshot সংরক্ষিত হয়েছে। পরে branch বদলালেও review-এর জন্য এই version দেখুন।")}</p></div>
      <details ${(evidence.files?.length || 0) <= 12 ? "open" : ""}><summary><h4 style="display:inline-block">${t("Changed files", "পরিবর্তিত files")} (${evidence.files?.length || 0})</h4></summary>${evidence.selectedFiles?.length ? `<p class="review-help">${t("Highlighted files are the student's requested focus.", "Highlighted files student review করতে চেয়েছে।")}</p>` : ""}<ul class="review-file-list">${(evidence.files || []).map((file) => `<li class="${evidence.selectedFiles?.includes(file.filename) ? "is-selected" : ""}"><code>${escape(file.filename)}</code> · ${escape(file.status)}</li>`).join("")}</ul>${evidence.filesTruncated ? `<p class="review-help">${t("Open Gitea for the complete file list.", "সম্পূর্ণ file list-এর জন্য Gitea খুলুন।")}</p>` : ""}</details>
      <details><summary>${t("Latest submitted commit diff", "সর্বশেষ submitted commit-এর diff")}</summary><p class="review-help">${t("This preview shows the final commit only. For the complete branch or PR, open the submitted changes link above.", "এই preview শুধু শেষ commit দেখায়। পুরো branch বা PR-এর changes দেখতে উপরের submitted changes link খুলুন।")}</p><pre class="review-diff">${escape(evidence.latestCommitDiff || t("No text diff is available. Open the snapshot in Gitea.", "Text diff নেই। Gitea-তে snapshot খুলুন।"))}</pre>${evidence.diffTruncated ? `<p class="review-help">${t("Preview shortened. View the full diff in Gitea.", "Preview সংক্ষিপ্ত করা হয়েছে। সম্পূর্ণ diff Gitea-তে দেখুন।")}</p>` : ""}</details>
      <h4>${t("Instructor feedback", "শিক্ষকের feedback")}</h4>${row.feedback ? `<div class="review-feedback-box"><div class="review-prose">${escape(row.feedback)}</div><small class="review-help">${G.formatDate(row.reviewedAt)}</small></div>${student && row.status === "CHANGES_REQUESTED" ? `<p class="review-help">${t("Make the requested changes, push your work and send a new review request.", "প্রয়োজনীয় পরিবর্তন করে push করুন, তারপর নতুন review request পাঠান।")}</p>` : ""}` : student ? `<p class="review-help">${t("Your instructor has not replied yet.", "আপনার instructor এখনো reply দেননি।")}</p>` : row.status === "PENDING" ? `<form id="reviewReplyForm" class="review-form"><div class="review-field full"><label for="reviewOutcome">${t("Review outcome", "Review-এর ফলাফল")}</label><select id="reviewOutcome"><option value="REVIEWED">${UI.statusLabel("REVIEWED")}</option><option value="APPROVED">${UI.statusLabel("APPROVED")}</option><option value="CHANGES_REQUESTED">${UI.statusLabel("CHANGES_REQUESTED")}</option></select></div><div class="review-field full"><label for="reviewFeedback">${t("Feedback for this student", "এই student-এর জন্য feedback")}</label><textarea id="reviewFeedback" required minlength="3" maxlength="4000" rows="5" placeholder="${t("Explain what works and what needs improvement.", "কোন কাজ ভালো হয়েছে এবং কোথায় উন্নতি প্রয়োজন লিখুন।")}"></textarea><small class="review-help">${t("Only this student receives your reply. This does not approve or merge a Gitea PR or award XP.", "শুধু এই student আপনার reply পাবে। এতে Gitea PR approve বা merge হবে না এবং XP বদলাবে না।")}</small></div><div class="review-field full"><p id="reviewReplyMessage" class="review-message" role="status" hidden></p><div><button type="submit" id="sendWorkFeedback" class="primary-action" ${replying ? "disabled" : ""}>${replying ? t("Sending…", "পাঠানো হচ্ছে…") : t("Send feedback", "Feedback পাঠান")}</button></div></div></form>` : ""}`;
    if (draft !== null && $("reviewFeedback")) $("reviewFeedback").value = draft;
    if (outcome && $("reviewOutcome")) $("reviewOutcome").value = outcome;
    $("reviewReplyForm")?.addEventListener("submit", reply);
  }
  function translate() {
    document.querySelectorAll("[data-review-label]").forEach((element) => { const pair = text[element.dataset.reviewLabel]; if (pair) element.textContent = t(...pair); });
    document.querySelectorAll("[data-review-placeholder]").forEach((element) => { const pair = text[element.dataset.reviewPlaceholder]; if (pair) element.placeholder = t(...pair); });
    document.querySelector('[data-review-label="description"]').textContent = student ? t("Request private feedback on your own team contribution and track your instructor's replies.", "Team-এ নিজের কাজের জন্য ব্যক্তিগত feedback চান এবং instructor-এর reply দেখুন।") : t("Review individual team contributions and send private feedback to the requesting student.", "Team member-এর ব্যক্তিগত কাজ review করুন এবং request করা student-কে feedback দিন।");
    renderContexts(); refPlaceholder(); renderList(); renderDetail();
    if (submitting && student) $("sendWorkReview").textContent = t("Verifying and sending…", "যাচাই করে পাঠানো হচ্ছে…");
  }
  async function loadList(older = false) {
    if (listLoading) return;
    listLoading = true; $("refreshWorkReviews").disabled = true;
    try {
      const data = await G.api(`/api/reviews/requests?status=${encodeURIComponent($("reviewStatusFilter").value)}${older && nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ""}`);
      rows = older ? [...rows, ...data.requests] : data.requests;
      nextCursor = data.nextCursor; total = data.total; pending = data.pending; renderList(); message("reviewPageMessage", "");
    } catch (error) { message("reviewPageMessage", error.message); }
    finally { listLoading = false; $("refreshWorkReviews").disabled = false; }
  }
  async function select(id, scroll = true) {
    const version = ++selectionVersion;
    try {
      const data = await G.api(`/api/reviews/requests/${encodeURIComponent(id)}`);
      if (version !== selectionVersion) return;
      selected = data.review; renderList(); renderDetail(false);
      const url = new URL(location.href); url.searchParams.set("request", id); history.replaceState(null, "", url);
      if (scroll && matchMedia("(max-width:720px)").matches) $("workReviewDetail").scrollIntoView({ block: "start" });
      await G.api(`/api/reviews/requests/${encodeURIComponent(id)}/seen`, { method: "POST" });
      document.dispatchEvent(new CustomEvent("gitstack:reviewsupdated"));
    } catch (error) { message("reviewPageMessage", error.message); }
  }
  async function submit(event) {
    event.preventDefault(); if (submitting) return;
    submitting = true; $("sendWorkReview").disabled = true; $("sendWorkReview").textContent = t("Verifying and sending…", "যাচাই করে পাঠানো হচ্ছে…");
    message("reviewFormMessage", "");
    try {
      const data = await G.api("/api/reviews/requests", { method: "POST", body: JSON.stringify({
        clientRequestId: requestKey, teamId: $("reviewTeam").value, assignmentId: $("reviewAssignment").value || null,
        title: $("reviewTitle").value, summary: $("reviewSummary").value, referenceType: $("reviewReferenceType").value,
        reference: $("reviewReference").value, files: [...new Set($("reviewFiles").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
      }) });
      requestKey = crypto.randomUUID();
      message("reviewFormMessage", data.reused ? t("Your existing pending request for this snapshot is open below.", "এই snapshot-এর আগের pending request নিচে খোলা হয়েছে।") : t("Request sent to your team instructor.", "আপনার team instructor-এর কাছে request পাঠানো হয়েছে।"), "success");
      $("reviewStatusFilter").value = "ALL"; await loadList(); await select(data.review.id);
      document.dispatchEvent(new CustomEvent("gitstack:reviewsupdated"));
    } catch (error) { message("reviewFormMessage", error.message); }
    finally { submitting = false; $("sendWorkReview").disabled = !contexts.length; $("sendWorkReview").textContent = t(...text.send); }
  }
  async function reply(event) {
    event.preventDefault(); if (replying) return;
    replying = true;
    const button = $("sendWorkFeedback"); button.disabled = true; button.textContent = t("Sending…", "পাঠানো হচ্ছে…");
    const id = selected.id;
    try {
      const data = await G.api(`/api/reviews/requests/${encodeURIComponent(id)}/feedback`, { method: "POST", body: JSON.stringify({ status: $("reviewOutcome").value, feedback: $("reviewFeedback").value }) });
      if (selected?.id === id) { selected = data.review; renderDetail(false); }
      await loadList(); document.dispatchEvent(new CustomEvent("gitstack:reviewsupdated"));
      G.toast(t("Feedback sent to the student.", "Student-এর কাছে feedback পাঠানো হয়েছে।"), "success");
    } catch (error) {
      if ($("reviewReplyMessage")) message("reviewReplyMessage", error.message);
      else message("reviewPageMessage", error.message);
    } finally { replying = false; const currentButton = $("sendWorkFeedback"); if (currentButton) { currentButton.disabled = false; currentButton.textContent = t("Send feedback", "Feedback পাঠান"); } }
  }
  $("workReviewList").addEventListener("click", (event) => {
    if (event.target.closest("[data-review-more]")) return loadList(true);
    const button = event.target.closest("[data-review-open]"); if (button) select(button.dataset.reviewOpen);
  });
  $("reviewStatusFilter").addEventListener("change", () => loadList());
  $("refreshWorkReviews").addEventListener("click", async () => { await loadList(); if (selected && !$("reviewFeedback")?.value) await select(selected.id, false); });
  $("workReviewForm")?.addEventListener("submit", submit);
  $("reviewTeam")?.addEventListener("change", () => renderAssignments());
  $("reviewReferenceType")?.addEventListener("change", refPlaceholder);
  document.addEventListener("gitstack:languagechange", translate);
  try {
    if (student) {
      const data = await G.api("/api/reviews/contexts"); contexts = data.teams;
      renderContexts();
      const teamId = new URLSearchParams(location.search).get("team");
      if (contexts.some((team) => team.id === teamId)) { $("reviewTeam").value = teamId; renderAssignments(); }
      if (new URLSearchParams(location.search).has("new")) $("reviewCompose").open = true;
    }
    translate(); await loadList();
    const requested = new URLSearchParams(location.search).get("request");
    if (requested) await select(requested, false);
    else if (rows.length) await select(rows[0].id, false);
  } catch (error) { message("reviewPageMessage", error.message); }
})();
