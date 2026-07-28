(() => {
  const app = document.getElementById('app');
  let state = { user: null, token: localStorage.getItem('pulse_token'), page: 'home', data: {} };
  let notifInterval;

  const API = {
    async req(url, opts = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
      try {
        const res = await fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка');
        return data;
      } catch (e) { throw e; }
    },
    get: (url) => API.req(url),
    post: (url, body) => API.req(url, { method: 'POST', body: JSON.stringify(body) }),
    put: (url, body) => API.req(url, { method: 'PUT', body: JSON.stringify(body) }),
    del: (url) => API.req(url, { method: 'DELETE' }),
    upload(url, file) {
      const fd = new FormData();
      fd.append(file.name === 'avatar' || file.name === 'cover' ? file.name : 'image', file);
      return API.req(url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + state.token }, body: fd });
    }
  };

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function timeAgo(date) {
    if (!date) return '';
    const now = new Date();
    const d = new Date(date + (date.endsWith('Z') ? '' : 'Z'));
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return `${diff}с`;
    if (diff < 3600) return `${Math.floor(diff / 60)}м`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}ч`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}д`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function formatDate(date) {
    if (!date) return '';
    const d = new Date(date + (date.endsWith('Z') ? '' : 'Z'));
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function linkify(text) {
    if (!text) return '';
    let t = escapeHtml(text);
    t = t.replace(/(#\w+)/g, '<a href="#" onclick="event.stopPropagation();window.__search($1)">$1</a>');
    t = t.replace(/(@\w+)/g, '<a href="#" onclick="event.stopPropagation();window.__profile($1.slice(1))">$1</a>');
    t = t.replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" onclick="event.stopPropagation()">$1</a>');
    return t;
  }

  function avatarHtml(user, size) {
    if (!user) return `<div class="avatar" style="width:${size||40}px;height:${size||40}px">?</div>`;
    if (user.avatar) return `<div class="avatar" style="width:${size||40}px;height:${size||40}px"><img src="${escapeHtml(user.avatar)}" alt=""></div>`;
    const initial = (user.displayName || user.username || '?')[0].toUpperCase();
    return `<div class="avatar" style="width:${size||40}px;height:${size||40}px">${initial}</div>`;
  }

  const SVG = {
    logo: `<img src="/logo.png" alt="Pulse" style="width:100%;height:100%;object-fit:contain;border-radius:50%">`,
    home: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913h6.638c.511 0 .929-.41.929-.913v-7.075h3.008v7.075c0 .502.418.913.929.913h6.638c.511 0 .929-.41.929-.913V7.904c0-.301-.158-.584-.409-.758z"/></svg>`,
    explore: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z"/></svg>`,
    bell: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.993 9.042C19.48 5.017 16.054 2 11.996 2s-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.437-1.718 4.9-4h4.236l-1.143-8.958zM12 20c-1.306 0-2.417-.835-2.829-2h5.658c-.412 1.165-1.523 2-2.829 2zm-6.866-4l.847-6.698C6.364 6.272 8.941 4 11.996 4s5.627 2.268 6.013 5.295L18.858 16H5.134z"/></svg>`,
    msg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 3.638 8-3.636V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-8 3.636-8-3.638V18.5c0 .276.224.5.5.5h15c.276 0 .5-.224.5-.5v-8.037z"/></svg>`,
    bookmark: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"/></svg>`,
    profile: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5.651 19h12.698c-.337-1.8-1.023-3.21-1.945-4.19C15.318 13.65 13.838 13 12 13s-3.317.65-4.404 1.81c-.922.98-1.608 2.39-1.945 4.19zm.486-5.56C7.627 11.85 9.648 11 12 11s4.373.85 5.863 2.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H3.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46zM12 4c-1.105 0-2 .9-2 2s.895 2 2 2 2-.9 2-2-.895-2-2-2zM8 6c0-2.21 1.791-4 4-4s4 1.79 4 4-1.791 4-4 4-4-1.79-4-4z"/></svg>`,
    more: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>`,
    like: `<svg viewBox="0 0 24 24"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.806 1.11-.806-1.11c-1.211-1.65-2.668-2.22-3.89-2.16-1.248.06-2.35.71-2.35 2.1 0 3.09 4.09 6.14 6.65 7.69.26.15.55.15.81 0 2.56-1.55 6.65-4.6 6.65-7.69 0-1.39-1.102-2.04-2.35-2.1zM12 18.5l-3.5-2.15C5.58 14.13 3 11.73 3 9c0-1.96 1.59-3.6 3.55-3.6 1.29 0 2.54.68 3.45 1.83.91-1.15 2.16-1.83 3.45-1.83C15.41 5.4 17 7.04 17 9c0 2.73-2.58 5.13-5.5 7.35L12 18.5z" fill="currentColor"/></svg>`,
    likeFilled: `<svg viewBox="0 0 24 24"><path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.45-4.92-.334-6.98C3.907 4.7 6.194 3.6 8.627 4.55c1.22.47 2.1 1.23 2.763 2.11.664-.88 1.544-1.64 2.766-2.11 2.433-.95 4.72.05 6.33 1.66 1.115 2.06 1.025 4.48-.336 6.98z" fill="currentColor"/></svg>`,
    repost: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg>`,
    bookmarkSmall: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"/></svg>`,
    share: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.12 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"/></svg>`,
    reply: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/></svg>`,
    back: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z"/></svg>`,
    close: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/></svg>`,
    image: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10.54 1.75h2.92l1.57 2.36c.11.17.32.25.53.21l2.53-.59 2.17 1.26-.59 2.53c-.04.2.04.41.21.53l2.36 1.57v2.92l-2.36 1.57c-.17.11-.25.32-.21.53l.59 2.53-1.26 2.17-2.53-.59c-.2-.04-.41.04-.53.21l-1.57 2.36h-2.92l-1.58-2.36c-.11-.17-.32-.25-.52-.21l-2.54.59-2.17-1.26.59-2.53c.04-.2-.04-.41-.21-.53l-2.35-1.57v-2.92l2.35-1.57c.17-.11.25-.32.21-.53l-.59-2.53 1.26-2.17 2.54.59c.2.04.41-.04.52-.21l1.58-2.36zm1.43 3.5c-1.56 0-2.83 1.27-2.83 2.83s1.27 2.83 2.83 2.83 2.83-1.27 2.83-2.83-1.27-2.83-2.83-2.83z"/></svg>`,
    moreH: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>`,
    send: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
    search: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z"/></svg>`,
  };

  function postHtml(p, showReply = false) {
    const u = p.user;
    let replyIndicator = '';
    if (showReply && p.replyTo) {
      replyIndicator = `<div class="reply-indicator">В ответ <a href="#" onclick="event.stopPropagation();window.__post(${p.replyTo})">посту</a></div>`;
    }
    let imageHtml = '';
    if (p.image) {
      imageHtml = `<div class="post-image"><img src="${escapeHtml(p.image)}" alt="" loading="lazy"></div>`;
    }
    return `
      <div class="post" onclick="window.__post(${p.id})" data-id="${p.id}">
        <div onclick="event.stopPropagation();window.__profile('${escapeHtml(u.username)}')">
          ${avatarHtml(u)}
        </div>
        <div class="post-body">
          ${replyIndicator}
          <div class="post-header">
            <span class="name" onclick="event.stopPropagation();window.__profile('${escapeHtml(u.username)}')">${escapeHtml(u.displayName)}</span>
            <span class="username">@${escapeHtml(u.username)}</span>
            <span class="dot">·</span>
            <span class="time">${timeAgo(p.createdAt)}</span>
            ${state.user && state.user.id === u.id ? `<button class="more-btn" onclick="event.stopPropagation();window.__deletePost(${p.id})">${SVG.close}</button>` : ''}
          </div>
          <div class="post-content">${linkify(p.content)}</div>
          ${imageHtml}
          <div class="post-actions">
            <button class="post-action reply" onclick="event.stopPropagation();window.__reply(${p.id})">
              ${SVG.reply}<span class="count">${p.repliesCount || ''}</span>
            </button>
            <button class="post-action repost ${p.reposted ? 'active' : ''}" onclick="event.stopPropagation();window.__repost(${p.id})">
              ${SVG.repost}<span class="count">${p.repostsCount || ''}</span>
            </button>
            <button class="post-action like ${p.liked ? 'active' : ''}" onclick="event.stopPropagation();window.__like(${p.id})">
              ${p.liked ? SVG.likeFilled : SVG.like}<span class="count">${p.likesCount || ''}</span>
            </button>
            <button class="post-action bookmark ${p.bookmarked ? 'active' : ''}" onclick="event.stopPropagation();window.__bookmark(${p.id})">
              ${SVG.bookmarkSmall}
            </button>
            <button class="post-action share" onclick="event.stopPropagation();window.__share(${p.id})">
              ${SVG.share}
            </button>
          </div>
        </div>
      </div>`;
  }

  function feedPage() {
    return `
      <div class="layout">
        ${sidebarHtml()}
        <div class="main-content">
          <div class="page-header">
            <div class="page-header-tabs">
              <div class="page-header-tab active" data-tab="feed">Для вас</div>
              <div class="page-header-tab" data-tab="following">Подписки</div>
            </div>
          </div>
          ${composeHtml()}
          <div id="feed-posts"><div class="loading"><div class="spinner"></div></div></div>
        </div>
        ${rightSidebarHtml()}
      </div>`;
  }

  function explorePage() {
    return `
      <div class="layout">
        ${sidebarHtml()}
        <div class="main-content">
          <div class="page-header">
            <div class="page-header-title">Поиск</div>
          </div>
          <div id="explore-posts"><div class="loading"><div class="spinner"></div></div></div>
        </div>
        ${rightSidebarHtml()}
      </div>`;
  }

  function notificationsPage() {
    return `
      <div class="layout">
        ${sidebarHtml()}
        <div class="main-content">
          <div class="page-header">
            <div class="page-header-title">Уведомления</div>
          </div>
          <div id="notif-list"><div class="loading"><div class="spinner"></div></div></div>
        </div>
        ${rightSidebarHtml()}
      </div>`;
  }

  function messagesPage() {
    return `
      <div class="layout">
        ${sidebarHtml()}
        <div class="main-content">
          <div class="page-header">
            <div class="page-header-title">Сообщения</div>
          </div>
          <div id="conv-list"><div class="loading"><div class="spinner"></div></div></div>
        </div>
        ${rightSidebarHtml()}
      </div>`;
  }

  function bookmarksPage() {
    return `
      <div class="layout">
        ${sidebarHtml()}
        <div class="main-content">
          <div class="page-header">
            <div class="page-header-title">Закладки</div>
          </div>
          <div id="bm-posts"><div class="loading"><div class="spinner"></div></div></div>
        </div>
        ${rightSidebarHtml()}
      </div>`;
  }

  function searchPage(query) {
    return `
      <div class="layout">
        ${sidebarHtml()}
        <div class="main-content">
          <div class="page-header">
            <div class="page-header-back">
              <button onclick="window.__navigate('home')">${SVG.back}</button>
              <h2>Поиск</h2>
            </div>
          </div>
          <div id="search-results"><div class="loading"><div class="spinner"></div></div></div>
        </div>
        ${rightSidebarHtml()}
      </div>`;
  }

  function chatPage(userId) {
    return `
      <div class="layout">
        ${sidebarHtml()}
        <div class="main-content">
          <div class="chat-page">
            <div class="chat-back">
              <button onclick="window.__navigate('messages')">${SVG.back}</button>
              <div id="chat-header-info"></div>
            </div>
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-input">
              <input type="text" id="chat-input-field" placeholder="Написать сообщение..." onkeydown="if(event.key==='Enter')window.__sendMessage()">
              <button onclick="window.__sendMessage()">Отправить</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function composeHtml(replyTo = null, replyUser = null) {
    let replyIndicator = '';
    if (replyTo && replyUser) {
      replyIndicator = `<div class="reply-indicator">Ответ <a href="#" onclick="event.stopPropagation();window.__profile('${escapeHtml(replyUser.username)}')">@${escapeHtml(replyUser.username)}</a></div>`;
    }
    return `
      <div class="compose" id="compose-box" data-reply-to="${replyTo || ''}">
        <div onclick="window.__profile('${state.user?.username || ''}')">
          ${avatarHtml(state.user)}
        </div>
        <div class="compose-body">
          ${replyIndicator}
          <textarea class="compose-input" id="compose-input" placeholder="Что происходит?!" rows="1" oninput="window.__composeAutoResize(this)"></textarea>
          <div id="compose-image-preview"></div>
          <div class="compose-actions">
            <div class="compose-tools">
              <label class="compose-tool" title="Иззображение">
                ${SVG.image}
                <input type="file" accept="image/*" style="display:none" onchange="window.__composeImage(this)">
              </label>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <span class="char-count" id="compose-count"></span>
              <button class="compose-submit" id="compose-btn" onclick="window.__submitPost()" disabled>Пульснуть</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function sidebarHtml() {
    const u = state.user;
    const active = state.page;
    const notifCount = state.notifCount || 0;
    return `
      <div class="sidebar">
        <div class="sidebar-logo" onclick="window.__navigate('home')">${SVG.logo}</div>
        <nav class="sidebar-nav">
          <div class="nav-item ${active === 'home' ? 'active' : ''}" onclick="window.__navigate('home')">
            ${SVG.home}<span>Главная</span>
          </div>
          <div class="nav-item ${active === 'explore' ? 'active' : ''}" onclick="window.__navigate('explore')">
            ${SVG.explore}<span>Поиск</span>
          </div>
          <div class="nav-item ${active === 'notifications' ? 'active' : ''}" onclick="window.__navigate('notifications')">
            ${SVG.bell}${notifCount > 0 ? `<span class="badge">${notifCount}</span>` : ''}<span>Уведомления</span>
          </div>
          <div class="nav-item ${active === 'messages' ? 'active' : ''}" onclick="window.__navigate('messages')">
            ${SVG.msg}<span>Сообщения</span>
          </div>
          <div class="nav-item ${active === 'bookmarks' ? 'active' : ''}" onclick="window.__navigate('bookmarks')">
            ${SVG.bookmark}<span>Закладки</span>
          </div>
          <div class="nav-item ${active === 'profile' ? 'active' : ''}" onclick="window.__profile(u?.username || '')">
            ${SVG.profile}<span>Профиль</span>
          </div>
        </nav>
        <button class="nav-post-btn" onclick="window.__openComposeModal()"><span>Пульснуть</span><span style="display:none">${SVG.close}</span></button>
        <div class="sidebar-profile" onclick="window.__profile(u?.username || '')">
          ${avatarHtml(u, 40)}
          <div class="info">
            <div class="name">${escapeHtml(u?.displayName || '')}</div>
            <div class="username">@${escapeHtml(u?.username || '')}</div>
          </div>
          <span class="more">${SVG.moreH}</span>
        </div>
      </div>`;
  }

  function rightSidebarHtml() {
    return `
      <div class="sidebar-right">
        <div class="search-box">
          <input type="text" placeholder="Поиск в Pulse" id="search-input" onkeydown="if(event.key==='Enter')window.__doSearch(this.value)">
          ${SVG.search}
        </div>
        <div class="trends-card">
          <div class="card-title">В тренде</div>
          <div id="trends-list"><div class="loading" style="padding:16px"><div class="spinner"></div></div></div>
        </div>
        <div class="suggested-card">
          <div class="card-title">Кого читать</div>
          <div id="suggested-list"><div class="loading" style="padding:16px"><div class="spinner"></div></div></div>
        </div>
      </div>`;
  }

  function profilePage(userData) {
    const u = userData;
    const isMe = state.user && state.user.id === u.id;
    return `
      <div class="layout">
        ${sidebarHtml()}
        <div class="main-content profile-page">
          <div class="page-header">
            <div class="page-header-back">
              <button onclick="window.__navigate('home')">${SVG.back}</button>
              <div>
                <h2>${escapeHtml(u.displayName)}</h2>
                <div style="color:var(--text2);font-size:13px">${u.postsCount} пульсаций</div>
              </div>
            </div>
          </div>
          <div class="profile-banner">${u.cover ? `<img src="${escapeHtml(u.cover)}" alt="">` : ''}</div>
          <div class="profile-info">
            <div class="profile-avatar">${u.avatar ? `<img src="${escapeHtml(u.avatar)}" alt="">` : (u.displayName || u.username)[0].toUpperCase()}</div>
            <div class="profile-actions">
              ${isMe
                ? `<button class="btn-outline" onclick="window.__openEditProfile()">Редактировать профиль</button>`
                : `<button class="btn-follow ${u.isFollowing ? 'following' : 'not-following'}" onclick="window.__follow(${u.id})">${u.isFollowing ? 'Читаете' : 'Читать'}</button>`
              }
            </div>
            <div class="profile-name">${escapeHtml(u.displayName)}</div>
            <div class="profile-username">@${escapeHtml(u.username)}</div>
            ${u.bio ? `<div class="profile-bio">${linkify(u.bio)}</div>` : ''}
            <div class="profile-joined">📅 Зарегистрирован ${formatDate(u.createdAt)}</div>
            <div class="profile-follows">
              <a onclick="window.__showFollowers(${u.id})"><strong>${u.followingCount}</strong> читает</a>
              <a onclick="window.__showFollowing(${u.id})"><strong>${u.followersCount}</strong> читателей</a>
            </div>
          </div>
          <div class="page-header-tabs" style="margin-top:4px">
            <div class="page-header-tab active">Пульсации</div>
          </div>
          <div id="profile-posts"><div class="loading"><div class="spinner"></div></div></div>
        </div>
      </div>`;
  }

  function postDetailPage(postData) {
    const p = postData;
    const u = p.user;
    return `
      <div class="layout">
        ${sidebarHtml()}
        <div class="main-content detail-page">
          <div class="page-header">
            <div class="page-header-back">
              <button onclick="window.history.back()">${SVG.back}</button>
              <h2>Пульсация</h2>
            </div>
          </div>
          <div class="detail-post">
            <div class="post-header" style="margin-bottom:8px">
              <div onclick="window.__profile('${escapeHtml(u.username)}')" style="cursor:pointer;display:flex;align-items:center;gap:8px">
                ${avatarHtml(u, 48)}
                <div>
                  <div class="name">${escapeHtml(u.displayName)}</div>
                  <div class="username">@${escapeHtml(u.username)}</div>
                </div>
              </div>
            </div>
            <div class="post-content" style="font-size:23px;line-height:1.4">${linkify(p.content)}</div>
            ${p.image ? `<div class="post-image" style="margin-top:16px"><img src="${escapeHtml(p.image)}" alt=""></div>` : ''}
            <div class="post-time">${formatDate(p.createdAt)} · ${new Date(p.createdAt + 'Z').toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}</div>
            <div class="post-stats">
              <span><strong>${p.repostsCount || 0}</strong> репостов</span>
              <span><strong>${p.likesCount || 0}</strong> лайков</span>
              <span><strong>${p.repliesCount || 0}</strong> ответов</span>
            </div>
            <div class="post-actions">
              <button class="post-action reply" onclick="window.__reply(${p.id})">${SVG.reply}</button>
              <button class="post-action repost ${p.reposted ? 'active' : ''}" onclick="window.__repost(${p.id})">${SVG.repost}<span class="count">${p.repostsCount || ''}</span></button>
              <button class="post-action like ${p.liked ? 'active' : ''}" onclick="window.__like(${p.id})">${p.liked ? SVG.likeFilled : SVG.like}<span class="count">${p.likesCount || ''}</span></button>
              <button class="post-action bookmark ${p.bookmarked ? 'active' : ''}" onclick="window.__bookmark(${p.id})">${SVG.bookmarkSmall}</button>
              <button class="post-action share" onclick="window.__share(${p.id})">${SVG.share}</button>
            </div>
          </div>
          ${composeHtml(p.id, u)}
          <div id="replies-list"></div>
        </div>
      </div>`;
  }

  function notifHtml(n) {
    let icon = '';
    let text = '';
    if (n.type === 'like') { icon = SVG.likeFilled; text = 'лайкнул вашу пульсацию'; }
    else if (n.type === 'reply') { icon = SVG.reply; text = 'ответил на вашу пульсацию'; }
    else if (n.type === 'follow') { icon = SVG.profile; text = 'подписался на вас'; }
    else if (n.type === 'repost') { icon = SVG.repost; text = 'репостнул вашу пульсацию'; }

    return `
      <div class="post" onclick="${n.type === 'follow' ? `window.__profile('${escapeHtml(n.fromUser.username)}')` : `window.__post(${n.postId})`}" style="${!n.read ? 'background:var(--accent3)' : ''}">
        <div style="color:var(--accent);width:24px;display:flex;justify-content:center;flex-shrink:0">${icon}</div>
        <div style="display:flex;gap:8px;flex:1;min-width:0">
          ${avatarHtml(n.fromUser)}
          <div class="post-body">
            <div style="font-size:15px"><strong>${escapeHtml(n.fromUser.displayName)}</strong> ${text}</div>
            ${n.postId && n.type !== 'follow' ? `<div style="color:var(--text2);margin-top:4px">Пульсация #${n.postId}</div>` : ''}
            <div style="color:var(--text2);font-size:13px;margin-top:4px">${timeAgo(n.createdAt)}</div>
          </div>
        </div>
      </div>`;
  }

  // ===== RENDERING =====
  function render() {
    const page = state.page;
    let html = '';

    if (page === 'auth') {
      html = renderAuth();
    } else if (page === 'home') {
      html = feedPage();
    } else if (page === 'explore') {
      html = explorePage();
    } else if (page === 'notifications') {
      html = notificationsPage();
    } else if (page === 'messages') {
      html = messagesPage();
    } else if (page === 'bookmarks') {
      html = bookmarksPage();
    } else if (page === 'profile') {
      html = `<div id="profile-container"></div>`;
    } else if (page === 'post') {
      html = `<div id="post-container"></div>`;
    } else if (page === 'search') {
      html = searchPage(state.data.query);
    } else if (page === 'chat') {
      html = chatPage(state.data.chatUserId);
    } else if (page === 'followers' || page === 'following') {
      html = `<div id="follow-list-container"></div>`;
    }

    app.innerHTML = html;

    if (page === 'auth') initAuth();
    else if (page === 'home') initFeed();
    else if (page === 'explore') initExplore();
    else if (page === 'notifications') initNotifications();
    else if (page === 'messages') initMessages();
    else if (page === 'bookmarks') initBookmarks();
    else if (page === 'profile') initProfile();
    else if (page === 'post') initPostDetail();
    else if (page === 'search') initSearch();
    else if (page === 'chat') initChat();
    else if (page === 'followers' || page === 'following') initFollowList();
  }

  function renderAuth() {
    return `
      <div class="auth-page">
        <div class="auth-container">
          <div class="auth-logo">
            ${SVG.logo}
            <h1>Pulse</h1>
          </div>
          <div class="auth-card">
            <div class="auth-tabs">
              <button class="auth-tab active" data-tab="login">Вход</button>
              <button class="auth-tab" data-tab="register">Регистрация</button>
            </div>
            <div id="auth-error" class="error-msg" style="display:none"></div>
            <div id="auth-login-form">
              <div class="form-group">
                <label>Имя пользователя или Email</label>
                <input type="text" id="login-login" placeholder="Введите логин или email">
              </div>
              <div class="form-group">
                <label>Пароль</label>
                <input type="password" id="login-password" placeholder="Введите пароль">
              </div>
              <button class="btn-primary" id="login-btn">Войти</button>
            </div>
            <div id="auth-register-form" style="display:none">
              <div class="form-group">
                <label>Имя пользователя</label>
                <input type="text" id="reg-username" placeholder="Выберите username" maxlength="20">
              </div>
              <div class="form-group">
                <label>Отображаемое имя</label>
                <input type="text" id="reg-displayname" placeholder="Ваше имя">
              </div>
              <div class="form-group">
                <label>Email</label>
                <input type="email" id="reg-email" placeholder="Введите email">
              </div>
              <div class="form-group">
                <label>Пароль</label>
                <input type="password" id="reg-password" placeholder="Минимум 6 символов">
              </div>
              <button class="btn-primary" id="reg-btn">Зарегистрироваться</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function initAuth() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isLogin = tab.dataset.tab === 'login';
        document.getElementById('auth-login-form').style.display = isLogin ? 'block' : 'none';
        document.getElementById('auth-register-form').style.display = isLogin ? 'none' : 'block';
      });
    });

    document.getElementById('login-btn').addEventListener('click', async () => {
      const login = document.getElementById('login-login').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('auth-error');
      try {
        const data = await API.post('/api/auth/login', { login, password });
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem('pulse_token', data.token);
        state.page = 'home';
        render();
        startNotifCheck();
      } catch (e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
      }
    });

    document.getElementById('reg-btn').addEventListener('click', async () => {
      const username = document.getElementById('reg-username').value.trim();
      const displayName = document.getElementById('reg-displayname').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const errEl = document.getElementById('auth-error');
      try {
        const data = await API.post('/api/auth/register', { username, displayName, email, password });
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem('pulse_token', data.token);
        state.page = 'home';
        render();
        startNotifCheck();
      } catch (e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
      }
    });

    ['login-password', 'reg-password'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const activeTab = document.querySelector('.auth-tab.active').dataset.tab;
          if (activeTab === 'login') document.getElementById('login-btn').click();
          else document.getElementById('reg-btn').click();
        }
      });
    });
  }

  async function initFeed() {
    document.querySelectorAll('.page-header-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.page-header-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadFeed(tab.dataset.tab === 'following');
      });
    });
    loadFeed(false);
    loadTrends();
    loadSuggested();
  }

  async function loadFeed(followingOnly) {
    const container = document.getElementById('feed-posts');
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const posts = await API.get('/api/posts/feed');
      if (posts.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>Нет пульсаций</h3><p>Начните читать людей, чтобы видеть их пульсации здесь</p></div>`;
      } else {
        container.innerHTML = posts.map(p => postHtml(p)).join('');
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>Ошибка загрузки</p></div>`;
    }
  }

  async function initExplore() {
    loadTrends();
    loadSuggested();
    const container = document.getElementById('explore-posts');
    try {
      const posts = await API.get('/api/posts/explore');
      if (posts.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>Пока пусто</h3><p>Будьте первым кто запульсит!</p></div>`;
      } else {
        container.innerHTML = posts.map(p => postHtml(p)).join('');
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>Ошибка загрузки</p></div>`;
    }
  }

  async function initNotifications() {
    const container = document.getElementById('notif-list');
    try {
      const notifs = await API.get('/api/notifications');
      state.notifCount = 0;
      if (notifs.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>Нет уведомлений</h3><p>Когда кто-то взаимодействует с вашими пульсациями, вы увидите это здесь</p></div>`;
      } else {
        container.innerHTML = notifs.map(n => notifHtml(n)).join('');
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>Ошибка загрузки</p></div>`;
    }
  }

  async function initMessages() {
    const container = document.getElementById('conv-list');
    try {
      const convs = await API.get('/api/messages/conversations');
      if (convs.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>Нет сообщений</h3><p>Начните общение с другими пользователями</p></div>`;
      } else {
        container.innerHTML = convs.map(c => `
          <div class="conversation-item" onclick="window.__openChat(${c.user.id})">
            ${avatarHtml(c.user, 48)}
            <div class="info">
              <div class="top">
                <span class="name">${escapeHtml(c.user.displayName)}</span>
                <span class="time">${timeAgo(c.lastAt)}</span>
              </div>
              <div class="preview">${escapeHtml(c.lastMessage)}</div>
            </div>
            ${c.unread > 0 ? '<div class="unread-dot"></div>' : ''}
          </div>
        `).join('');
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>Ошибка загрузки</p></div>`;
    }
  }

  async function initBookmarks() {
    const container = document.getElementById('bm-posts');
    try {
      const posts = await API.get('/api/bookmarks');
      if (posts.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>Нет закладок</h3><p>Сохраняйте пульсации, чтобы не потерять</p></div>`;
      } else {
        container.innerHTML = posts.map(p => postHtml(p)).join('');
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>Ошибка загрузки</p></div>`;
    }
  }

  async function initProfile() {
    const container = document.getElementById('profile-container');
    const username = state.data.username;
    if (!username) return;
    try {
      const userData = await API.get('/api/users/' + encodeURIComponent(username));
      container.innerHTML = profilePage(userData);
      loadProfilePosts(userData.id);
    } catch (e) {
      container.innerHTML = `<div class="layout">${sidebarHtml()}<div class="main-content"><div class="not-found"><h2>Профиль не найден</h2><p>@${escapeHtml(username)} не существует</p></div></div></div>`;
    }
  }

  async function loadProfilePosts(userId) {
    const container = document.getElementById('profile-posts');
    if (!container) return;
    try {
      const posts = await API.get('/api/posts/user/' + userId);
      if (posts.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>Нет пульсаций</h3></div>`;
      } else {
        container.innerHTML = posts.map(p => postHtml(p)).join('');
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>Ошибка загрузки</p></div>`;
    }
  }

  async function initPostDetail() {
    const container = document.getElementById('post-container');
    const postId = state.data.postId;
    try {
      const post = await API.get('/api/posts/' + postId);
      container.innerHTML = postDetailPage(post);
      const repliesList = document.getElementById('replies-list');
      if (post.replies && post.replies.length > 0) {
        repliesList.innerHTML = post.replies.map(p => postHtml(p, true)).join('');
      } else {
        repliesList.innerHTML = '';
      }
    } catch (e) {
      container.innerHTML = `<div class="layout">${sidebarHtml()}<div class="main-content"><div class="not-found"><h2>Пост не найден</h2></div></div></div>`;
    }
  }

  async function initSearch() {
    const query = state.data.query;
    if (!query) return;
    const container = document.getElementById('search-results');
    try {
      const results = await API.get('/api/search?q=' + encodeURIComponent(query));
      let html = '';
      if (results.users.length > 0) {
        html += `<div class="search-section"><h3>Люди</h3>${results.users.map(u => `
          <div class="suggested-item" onclick="window.__profile('${escapeHtml(u.username)}')" style="cursor:pointer">
            ${avatarHtml(u)}
            <div class="info">
              <div class="name">${escapeHtml(u.displayName)}</div>
              <div class="username">@${escapeHtml(u.username)}</div>
            </div>
            ${state.user && state.user.id !== u.id ? `<button class="btn-follow not-following" onclick="event.stopPropagation()">Читать</button>` : ''}
          </div>
        `).join('')}</div>`;
      }
      if (results.posts.length > 0) {
        html += `<div class="search-section"><h3>Пульсации</h3>${results.posts.map(p => postHtml(p)).join('')}</div>`;
      }
      if (!html) {
        html = `<div class="empty-state"><h3>Ничего не найдено</h3><p>Попробуйте другой запрос</p></div>`;
      }
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>Ошибка поиска</p></div>`;
    }
  }

  async function initChat() {
    const userId = state.data.chatUserId;
    try {
      const user = await API.get('/api/users/' + userId);
      document.getElementById('chat-header-info').innerHTML = `
        <div style="display:flex;align-items:center;gap:8px">
          ${avatarHtml(user, 32)}
          <div>
            <div style="font-weight:700;font-size:15px">${escapeHtml(user.displayName)}</div>
            <div style="color:var(--text2);font-size:13px">@${escapeHtml(user.username)}</div>
          </div>
        </div>`;
      loadChatMessages(userId);
    } catch (e) {}
  }

  async function loadChatMessages(userId) {
    const container = document.getElementById('chat-messages');
    try {
      const messages = await API.get('/api/messages/' + userId);
      container.innerHTML = messages.map(m => `
        <div class="chat-msg ${m.fromUserId === state.user.id ? 'sent' : 'received'}">
          ${escapeHtml(m.content)}
          <div class="time">${timeAgo(m.createdAt)}</div>
        </div>
      `).join('');
      container.scrollTop = container.scrollHeight;
    } catch (e) {}
  }

  async function initFollowList() {
    const container = document.getElementById('follow-list-container');
    const userId = state.data.userId;
    const type = state.page;
    try {
      const users = await API.get(`/api/users/${userId}/${type}`);
      let html = `<div class="layout">${sidebarHtml()}<div class="main-content">
        <div class="page-header"><div class="page-header-back">
          <button onclick="window.history.back()">${SVG.back}</button>
          <h2>${type === 'followers' ? 'Читатели' : 'Читает'}</h2>
        </div></div>
        <div class="follow-list">`;
      if (users.length === 0) {
        html += `<div class="empty-state"><h3>Пусто</h3></div>`;
      } else {
        html += users.map(u => `
          <div class="suggested-item" onclick="window.__profile('${escapeHtml(u.username)}')" style="cursor:pointer">
            ${avatarHtml(u)}
            <div class="info">
              <div class="name">${escapeHtml(u.displayName)}</div>
              <div class="username">@${escapeHtml(u.username)}</div>
              ${u.bio ? `<div style="color:var(--text2);font-size:13px;margin-top:4px">${escapeHtml(u.bio)}</div>` : ''}
            </div>
          </div>
        `).join('');
      }
      html += '</div></div></div>';
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>Ошибка</p></div>`;
    }
  }

  async function loadTrends() {
    const container = document.getElementById('trends-list');
    if (!container) return;
    try {
      const trends = await API.get('/api/trends');
      if (trends.length === 0) {
        container.innerHTML = `<div style="padding:16px;color:var(--text2);font-size:14px">Пока нет трендов</div>`;
      } else {
        container.innerHTML = trends.map((t, i) => `
          <div class="trend-item" onclick="window.__search('${escapeHtml(t.content)}')">
            <div class="label">${i + 1} · В тренде</div>
            <div class="topic">${escapeHtml(t.content)}</div>
            <div class="count">${t.count} лайков</div>
          </div>
        `).join('');
      }
    } catch (e) {}
  }

  async function loadSuggested() {
    const container = document.getElementById('suggested-list');
    if (!container) return;
    try {
      const users = await API.get('/api/suggested');
      if (users.length === 0) {
        container.innerHTML = `<div style="padding:16px;color:var(--text2);font-size:14px">Пока нет рекомендаций</div>`;
      } else {
        container.innerHTML = users.map(u => `
          <div class="suggested-item">
            <div onclick="window.__profile('${escapeHtml(u.username)}')" style="cursor:pointer;display:flex;align-items:center;gap:12px;flex:1;min-width:0">
              ${avatarHtml(u)}
              <div class="info">
                <div class="name">${escapeHtml(u.displayName)}</div>
                <div class="username">@${escapeHtml(u.username)}</div>
              </div>
            </div>
            <button class="btn-follow not-following" onclick="window.__followSuggested(${u.id}, this)">Читать</button>
          </div>
        `).join('');
      }
    } catch (e) {}
  }

  // ===== GLOBAL ACTIONS =====
  window.__navigate = (page) => {
    state.page = page;
    render();
    window.scrollTo(0, 0);
  };

  window.__profile = (username) => {
    if (!username) return;
    state.page = 'profile';
    state.data = { username };
    render();
    window.scrollTo(0, 0);
  };

  window.__post = (id) => {
    state.page = 'post';
    state.data = { postId: id };
    render();
    window.scrollTo(0, 0);
  };

  window.__search = (q) => {
    if (!q) return;
    state.page = 'search';
    state.data = { query: q.replace(/^#/, '') };
    render();
    window.scrollTo(0, 0);
  };

  window.__doSearch = (q) => {
    if (!q.trim()) return;
    window.__search(q);
  };

  window.__reply = (postId) => {
    if (!state.user) return state.page = 'auth', render();
    state.page = 'post';
    state.data = { postId };
    render();
    setTimeout(() => {
      const input = document.getElementById('compose-input');
      if (input) { input.focus(); input.placeholder = 'Ответить...'; }
    }, 100);
  };

  window.__like = async (postId) => {
    if (!state.user) return state.page = 'auth', render();
    try {
      const res = await API.post(`/api/posts/${postId}/like`);
      const btn = document.querySelector(`.post[data-id="${postId}"] .like, .detail-post .like`);
      if (btn) {
        btn.classList.toggle('active', res.liked);
        btn.querySelector('svg').outerHTML = res.liked ? SVG.likeFilled : SVG.like;
        const countEl = btn.querySelector('.count');
        if (countEl) {
          const current = parseInt(countEl.textContent) || 0;
          countEl.textContent = res.liked ? current + 1 : Math.max(0, current - 1);
        }
      }
      const detailLike = document.querySelector('.detail-post .like');
      if (detailLike && detailLike.closest('.detail-post')) {
        const countEl = detailLike.querySelector('.count');
        if (countEl) {
          const current = parseInt(countEl.textContent) || 0;
          countEl.textContent = res.liked ? current + 1 : Math.max(0, current - 1);
        }
      }
    } catch (e) { toast('Ошибка'); }
  };

  window.__repost = async (postId) => {
    if (!state.user) return state.page = 'auth', render();
    try {
      const res = await API.post(`/api/posts/${postId}/repost`);
      toast(res.reposted ? 'Репостнуто!' : 'Репост убран');
    } catch (e) { toast('Ошибка'); }
  };

  window.__bookmark = async (postId) => {
    if (!state.user) return state.page = 'auth', render();
    try {
      const res = await API.post(`/api/posts/${postId}/bookmark`);
      toast(res.bookmarked ? 'Сохранено в закладки' : 'Убрано из закладок');
    } catch (e) { toast('Ошибка'); }
  };

  window.__share = (postId) => {
    const url = window.location.origin + '#post/' + postId;
    navigator.clipboard.writeText(url).then(() => toast('Ссылка скопирована')).catch(() => toast(url));
  };

  window.__deletePost = async (postId) => {
    if (!confirm('Удалить пульсацию?')) return;
    try {
      await API.del('/api/posts/' + postId);
      const el = document.querySelector(`.post[data-id="${postId}"]`);
      if (el) el.remove();
      else render();
      toast('Пульсация удалена');
    } catch (e) { toast('Ошибка'); }
  };

  window.__follow = async (userId) => {
    if (!state.user) return state.page = 'auth', render();
    try {
      const res = await API.post(`/api/users/${userId}/follow`);
      const btn = document.querySelector('.btn-follow');
      if (btn) {
        btn.className = `btn-follow ${res.following ? 'following' : 'not-following'}`;
        btn.textContent = res.following ? 'Читаете' : 'Читать';
      }
      toast(res.following ? 'Вы подписались!' : 'Вы отписались');
    } catch (e) { toast(e.message); }
  };

  window.__followSuggested = async (userId, btn) => {
    if (!state.user) return state.page = 'auth', render();
    try {
      const res = await API.post(`/api/users/${userId}/follow`);
      btn.className = `btn-follow ${res.following ? 'following' : 'not-following'}`;
      btn.textContent = res.following ? 'Читаете' : 'Читать';
      toast(res.following ? 'Вы подписались!' : 'Вы отписались');
    } catch (e) { toast(e.message); }
  };

  window.__showFollowers = (userId) => {
    state.page = 'followers';
    state.data = { userId };
    render();
  };

  window.__showFollowing = (userId) => {
    state.page = 'following';
    state.data = { userId };
    render();
  };

  window.__openChat = (userId) => {
    state.page = 'chat';
    state.data = { chatUserId: userId };
    render();
  };

  window.__sendMessage = async () => {
    const input = document.getElementById('chat-input-field');
    const content = input.value.trim();
    if (!content) return;
    const userId = state.data.chatUserId;
    try {
      await API.post(`/api/messages/${userId}`, { content });
      input.value = '';
      loadChatMessages(userId);
    } catch (e) { toast('Ошибка'); }
  };

  window.__profileFromAvatar = (username) => window.__profile(username);

  window.__composeAutoResize = (el) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
    const count = el.value.length;
    const countEl = document.getElementById('compose-count');
    const btn = document.getElementById('compose-btn');
    if (countEl) {
      countEl.textContent = count > 0 ? count + '/500' : '';
      countEl.className = 'char-count' + (count > 460 ? count > 500 ? ' over' : ' warning' : '');
    }
    if (btn) btn.disabled = count === 0 || count > 500;
  };

  let composeImageData = null;
  window.__composeImage = (input) => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      composeImageData = e.target.result;
      document.getElementById('compose-image-preview').innerHTML = `
        <div class="image-preview">
          <img src="${composeImageData}" alt="">
          <div class="remove" onclick="window.__removeComposeImage()">✕</div>
        </div>`;
    };
    reader.readAsDataURL(file);
  };

  window.__removeComposeImage = () => {
    composeImageData = null;
    document.getElementById('compose-image-preview').innerHTML = '';
  };

  window.__submitPost = async () => {
    const input = document.getElementById('compose-input');
    const content = input.value.trim();
    if (!content || content.length > 500) return;

    const btn = document.getElementById('compose-btn');
    btn.disabled = true;
    btn.textContent = '...';

    try {
      const replyTo = document.getElementById('compose-box')?.dataset.replyTo || null;
      const payload = { content };
      if (replyTo) payload.replyTo = parseInt(replyTo);
      if (composeImageData) payload.image = composeImageData;
      await API.post('/api/posts', payload);
      input.value = '';
      composeImageData = null;
      document.getElementById('compose-image-preview').innerHTML = '';
      if (state.page === 'home') loadFeed(false);
      else if (state.page === 'post') initPostDetail();
      else render();
      toast('Пульсация отправлена!');
    } catch (e) {
      toast(e.message);
    }
    btn.disabled = false;
    btn.textContent = 'Пульснуть';
  };

  window.__openComposeModal = () => {
    if (!state.user) return state.page = 'auth', render();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <button onclick="this.closest('.modal-overlay').remove()">${SVG.close}</button>
        </div>
        <div class="modal-body">
          ${composeHtml()}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('compose-input')?.focus(), 100);
  };

  window.__openEditProfile = async () => {
    if (!state.user) return;
    const me = await API.get('/api/auth/me');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal edit-modal">
        <div class="modal-header">
          <button onclick="this.closest('.modal-overlay').remove()">${SVG.close}</button>
          <h3>Редактировать профиль</h3>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Отображаемое имя</label>
            <input type="text" id="edit-name" value="${escapeHtml(me.displayName)}">
          </div>
          <div class="form-group">
            <label>О себе</label>
            <textarea id="edit-bio" rows="3">${escapeHtml(me.bio || '')}</textarea>
          </div>
          <button class="btn-primary" onclick="window.__saveProfile()">Сохранить</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  };

  window.__saveProfile = async () => {
    const displayName = document.getElementById('edit-name').value.trim();
    const bio = document.getElementById('edit-bio').value.trim();
    try {
      await API.put('/api/users/profile', { displayName, bio });
      state.user.displayName = displayName;
      document.querySelector('.modal-overlay')?.remove();
      render();
      toast('Профиль обновлён');
    } catch (e) { toast(e.message); }
  };

  window.__search = (q) => {
    if (!q) return;
    state.page = 'search';
    state.data = { query: q.replace(/^#/, '') };
    render();
    window.scrollTo(0, 0);
  };

  function startNotifCheck() {
    if (notifInterval) clearInterval(notifInterval);
    notifInterval = setInterval(async () => {
      if (!state.token || state.page === 'auth') return;
      try {
        const data = await API.get('/api/notifications/count');
        state.notifCount = data.count;
        const badge = document.querySelector('.nav-item .badge');
        if (badge) {
          badge.textContent = data.count;
          badge.style.display = data.count > 0 ? '' : 'none';
        }
      } catch (e) {}
    }, 15000);
  }

  // ===== INIT =====
  async function init() {
    if (state.token) {
      try {
        state.user = await API.get('/api/auth/me');
        state.page = 'home';
        render();
        startNotifCheck();
      } catch {
        localStorage.removeItem('pulse_token');
        state.token = null;
        state.page = 'auth';
        render();
      }
    } else {
      state.page = 'auth';
      render();
    }
  }

  init();
})();
