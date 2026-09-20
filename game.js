(() => {
  'use strict';

  const replies = [
    { initials: 'MK', name: 'Maya Kim', type: 'never', tag: 'Never replied', message: 'This really stayed with me. How do you protect the time to keep doing the work?', source: 'The quiet advantage of showing up', age: '2 days ago' },
    { initials: 'JD', name: 'Jon Davis', type: 'follow', tag: 'Follow up', message: 'I tried the weekly review you suggested and it changed how I plan. One question...', source: 'A field guide to creative momentum', age: '4 days ago' },
    { initials: 'AL', name: 'Aisha Lane', type: 'never', tag: 'Never replied', message: 'Your point about small audiences is so true. Would love to hear how you measure depth.', source: 'What I learned from 100 letters', age: '8 days ago' },
    { initials: 'RP', name: 'Rohan Patel', type: 'never', tag: 'Never replied', message: 'Thank you for writing this. It arrived exactly when I needed it.', source: 'The quiet advantage of showing up', age: '9 days ago' },
    { initials: 'EC', name: 'Elena Chen', type: 'follow', tag: 'Follow up', message: 'Coming back to this after trying your framework for a week—the second step is hard!', source: 'A field guide to creative momentum', age: '11 days ago' }
  ];

  const replyList = document.querySelector('#replyList');
  const toast = document.querySelector('#toast');
  let activeFilter = 'all';
  let waiting = 12;

  function renderReplies() {
    const visible = replies.filter((reply) => activeFilter === 'all' || reply.type === activeFilter).slice(0, 4);
    replyList.innerHTML = visible.length ? visible.map((reply) => `
      <article class="reply-item">
        <div class="reply-avatar">${reply.initials}</div>
        <div class="reply-body">
          <div class="reply-meta"><strong>${reply.name}</strong><span class="badge ${reply.type}">${reply.tag}</span></div>
          <p>${reply.message}</p>
          <small>On “${reply.source}” · ${reply.age}</small>
        </div>
        <button class="reply-action" data-name="${reply.name}" aria-label="Mark ${reply.name}'s message as replied">Mark replied</button>
      </article>`).join('') : '<div class="empty"><strong>You’re all caught up.</strong>No replies in this view need your attention.</div>';
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2200);
  }

  document.querySelectorAll('.tabs button').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('.tabs button.active').classList.remove('active');
    button.classList.add('active');
    activeFilter = button.dataset.filter;
    renderReplies();
  }));

  replyList.addEventListener('click', (event) => {
    const button = event.target.closest('.reply-action');
    if (!button) return;
    const item = button.closest('.reply-item');
    const index = replies.findIndex((reply) => reply.name === button.dataset.name);
    if (index >= 0) replies.splice(index, 1);
    waiting = Math.max(0, waiting - 1);
    document.querySelector('#waitingTotal').textContent = `${waiting} readers`;
    document.querySelector('#navCount').textContent = waiting;
    item.style.opacity = '0';
    window.setTimeout(renderReplies, 180);
    showToast(`${button.dataset.name} marked as replied`);
  });

  const chart = document.querySelector('#cadenceChart');
  [25, 52, 31, 68, 45, 76, 40, 60, 82, 55, 73, 88].forEach((height) => {
    const bar = document.createElement('i');
    bar.style.height = `${height}%`;
    chart.appendChild(bar);
  });

  const importModal = document.querySelector('#importModal');
  const openModal = () => { importModal.hidden = false; document.querySelector('#modalClose').focus(); };
  const closeModal = () => { importModal.hidden = true; };
  document.querySelector('#importButton').addEventListener('click', openModal);
  document.querySelector('#modalClose').addEventListener('click', closeModal);
  importModal.addEventListener('click', (event) => { if (event.target === importModal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  document.querySelector('#fileInput').addEventListener('change', (event) => {
    if (!event.target.files.length) return;
    closeModal();
    showToast(`${event.target.files.length} file${event.target.files.length === 1 ? '' : 's'} imported successfully`);
  });

  document.querySelector('#reviewButton').addEventListener('click', () => document.querySelector('#replyPanel').scrollIntoView({ behavior: 'smooth' }));
  document.querySelector('#viewAllButton').addEventListener('click', () => { activeFilter = 'all'; document.querySelector('.tabs button[data-filter="all"]').click(); });
  document.querySelector('#menuButton').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
  document.querySelectorAll('.nav-item[data-section]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-section]').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    document.querySelector('#sidebar').classList.remove('open');
    if (button.dataset.section === 'inbox') document.querySelector('#replyPanel').scrollIntoView({ behavior: 'smooth' });
    else if (button.dataset.section !== 'overview') showToast(`${button.textContent.trim()} view is ready for your imported data`);
  }));

  renderReplies();
})();
