lucide.createIcons();

const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
menuToggle?.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

const levels = [
  { title:'Create your first meaningful commit', text:'Create <code>profile.html</code>, stage the file and commit it using a clear message that explains the change.', reward:'+50 XP' },
  { title:'Build a feature on a separate branch', text:'Create <code>feature/profile-card</code>, switch to it, make a focused change and merge it safely.', reward:'+90 XP' },
  { title:'Push your work to a remote repository', text:'Connect a remote, push your branch and verify that local and remote history are synchronized.', reward:'+120 XP' },
  { title:'Open and review a pull request', text:'Link an issue, submit a complete pull request, review a teammate and respond to requested changes.', reward:'+180 XP' }
];
const levelButtons = document.querySelectorAll('.level-item');
levelButtons.forEach((button, index) => button.addEventListener('click', () => {
  levelButtons.forEach(b => b.classList.remove('active'));
  button.classList.add('active');
  document.getElementById('missionTitle').textContent = levels[index].title;
  document.getElementById('missionText').innerHTML = levels[index].text;
  document.getElementById('missionReward').textContent = levels[index].reward;
}));

document.querySelectorAll('.faq-item').forEach(item => item.addEventListener('click', () => item.classList.toggle('open')));
