(() => {
  const installData = {
    linux: { title: 'Ubuntu / Debian', code: '$ sudo apt update\n$ sudo apt install git\n$ git --version\n✓ git version 2.43.0' },
    windows: { title: 'Windows', code: '# Download Git for Windows from git-scm.com\n$ git --version\n✓ git version 2.43.0.windows.1' },
    mac: { title: 'macOS', code: '$ brew install git\n$ git --version\n✓ git version 2.43.0' }
  };
  const installTitle = document.getElementById('installTitle');
  const installCode = document.getElementById('installCode');
  document.querySelectorAll('.os-tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.os-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const item = installData[tab.dataset.os];
    installTitle.textContent = item.title;
    installCode.textContent = item.code;
  }));

  document.querySelectorAll('.copy-btn').forEach(btn => btn.addEventListener('click', async () => {
    const target = document.getElementById(btn.dataset.copyTarget);
    try {
      await navigator.clipboard.writeText(target.innerText);
      btn.classList.add('copied');
      const old = btn.innerHTML;
      btn.innerHTML = '<span>Copied</span>';
      setTimeout(() => { btn.innerHTML = old; btn.classList.remove('copied'); lucide.createIcons(); }, 1400);
    } catch (_) {}
  }));

  const progressBar = document.getElementById('readingProgress');
  const sideBar = document.querySelector('.level-card div span');
  const sideText = document.querySelector('.level-card small');
  const updateProgress = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - innerHeight;
    const value = max > 0 ? Math.min(100, Math.max(0, scrollY / max * 100)) : 0;
    progressBar.style.width = value + '%';
    if (sideBar) sideBar.style.width = value + '%';
    if (sideText) sideText.textContent = Math.round(value) + '% read';
  };
  addEventListener('scroll', updateProgress, { passive:true });
  updateProgress();

  const links = [...document.querySelectorAll('.toc-nav a')];
  const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
      }
    });
  }, { rootMargin:'-25% 0px -65% 0px' });
  sections.forEach(section => sectionObserver.observe(section));

  const tocToggle = document.getElementById('tocToggle');
  const tocPanel = document.getElementById('tocPanel');
  tocToggle?.addEventListener('click', () => tocPanel.classList.toggle('open'));
  links.forEach(a => a.addEventListener('click', () => tocPanel.classList.remove('open')));

  const checks = [...document.querySelectorAll('[data-step]')];
  const missionProgress = document.getElementById('missionProgress');
  const missionCount = document.getElementById('missionCount');
  const validation = document.getElementById('validationCard');
  checks.forEach(check => check.addEventListener('change', () => {
    const done = checks.filter(c => c.checked).length;
    missionProgress.style.width = `${done / checks.length * 100}%`;
    missionCount.textContent = `${done} / ${checks.length} complete`;
    if (done === checks.length) {
      validation.classList.add('complete');
      validation.innerHTML = '<i data-lucide="badge-check"></i><div><strong>Mission requirements satisfied</strong><p>Repository initialized, file staged and meaningful commit detected. +120 XP preview.</p></div>';
      lucide.createIcons();
    } else {
      validation.classList.remove('complete');
      validation.innerHTML = '<i data-lucide="circle-dashed"></i><div><strong>Validation in progress</strong><p>Complete each requirement to preview automatic assessment.</p></div>';
      lucide.createIcons();
    }
  }));
})();
