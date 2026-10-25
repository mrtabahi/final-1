/* Admin-only login greetings and registration controls. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when = value => { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(); };

  window.renderLoginsModule = async function () {
    const root = $('view-module');
    if (!root) return;
    root.innerHTML = `
      <div class="admin-page-heading"><div><div class="admin-kicker">AUTHENTICATION CONTROLS</div><h1>Logins &amp; Registration</h1><p>Set candidate welcome messages and pause or resume public account creation.</p></div><button class="admin-btn admin-btn-secondary" id="login-controls-refresh" type="button">↻ Refresh</button></div>
      <section class="admin-panel"><div class="admin-panel-heading"><div><h2>New account creation</h2><p>When paused, the signup screen displays your explanation.</p></div></div>
        <form id="registration-settings-form" class="account-admin-card">
          <label style="display:flex;gap:.6rem;align-items:center"><input id="registration-enabled" type="checkbox"> Allow new accounts</label>
          <label>Message shown while registration is paused<textarea id="registration-message" rows="3" maxlength="500" required placeholder="Explain why new account creation is temporarily paused."></textarea></label>
          <p class="admin-form-message" id="registration-status" role="status" aria-live="polite"></p>
          <button class="admin-btn admin-btn-primary" type="submit">Save registration settings</button>
        </form>
      </section>
      <section class="admin-panel" style="margin-top:1.25rem"><div class="admin-panel-heading"><div><h2>Personalized login popup</h2><p>Assign a welcome message to one candidate profile ID. The message appears after a successful sign-in.</p></div></div>
        <form id="login-message-form" class="account-admin-card">
          <label>Candidate profile ID<input id="login-message-user-id" required placeholder="UUID from Candidates → View profile"></label>
          <label>Popup message<textarea id="login-message-text" rows="3" maxlength="500" required placeholder="Hey Saurabh, welcome back! Bahut din baad aaye ho."></textarea></label>
          <label style="display:flex;gap:.6rem;align-items:center"><input id="login-message-enabled" type="checkbox" checked> Show popup on login</label>
          <p class="admin-form-message" id="login-message-status" role="status" aria-live="polite"></p>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="admin-btn admin-btn-primary" type="submit">Save popup message</button><button class="admin-btn admin-btn-secondary" id="login-message-clear" type="button">Clear form</button></div>
        </form>
      </section>
      <section class="admin-panel" style="margin-top:1.25rem"><div class="admin-panel-heading"><div><h2>Configured login messages</h2><p>Remove or edit a candidate-specific popup.</p></div><span class="site-content-count" id="login-message-count">Loading…</span></div><div id="login-message-list"><div class="admin-empty">Loading saved messages…</div></div></section>`;
    $('login-controls-refresh').addEventListener('click', window.renderLoginsModule);
    $('login-message-clear').addEventListener('click', () => $('login-message-form').reset());
    $('registration-settings-form').addEventListener('submit', saveRegistration);
    $('login-message-form').addEventListener('submit', saveMessage);
    $('login-message-list').addEventListener('click', removeMessage);
    await loadSettingsAndMessages();
  };

  async function loadSettingsAndMessages() {
    const list = $('login-message-list');
    try {
      const [{ data: settings, error: settingsError }, { data: messages, error: messagesError }] = await Promise.all([
        supabaseClient.from('site_access_settings').select('*').eq('id', 1).maybeSingle(),
        supabaseClient.from('candidate_login_messages').select('user_id,message,enabled,updated_at,profiles(full_name,email)').order('updated_at', { ascending: false }).limit(500)
      ]);
      if (settingsError) throw settingsError;
      if (messagesError) throw messagesError;
      $('registration-enabled').checked = settings?.registration_enabled !== false;
      $('registration-message').value = settings?.registration_paused_message || 'New account creation is temporarily paused. Please try again later.';
      $('registration-status').textContent = settings?.registration_enabled === false ? 'Registration is currently paused.' : 'Registration is currently enabled.';
      const rows = messages || [];
      $('login-message-count').textContent = rows.length + ' message' + (rows.length === 1 ? '' : 's');
      list.innerHTML = rows.length ? '<div class="candidate-list">' + rows.map(row => `
        <article class="candidate-row"><div class="candidate-avatar">✉</div><div class="candidate-main"><strong>${esc(row.profiles?.full_name || 'Candidate')}</strong><span>${esc(row.profiles?.email || row.user_id)}</span><small>Updated ${esc(when(row.updated_at))} · ID ${esc(row.user_id)}</small><p>${esc(row.message)}</p></div><div class="candidate-row-meta"><span class="candidate-status ${row.enabled ? 'is-verified' : 'is-pending'}">${row.enabled ? 'Popup enabled' : 'Popup disabled'}</span><button type="button" class="admin-btn admin-btn-secondary" data-remove-login-message="${esc(row.user_id)}">Remove</button></div></article>`).join('') + '</div>' : '<div class="admin-empty">No personalized login messages configured yet.</div>';
    } catch (error) {
      list.innerHTML = '<div class="admin-error">Could not load login controls: ' + esc(error.message) + '</div>';
    }
  }

  async function saveRegistration(event) {
    event.preventDefault();
    const status = $('registration-status');
    const enabled = $('registration-enabled').checked;
    const message = $('registration-message').value.trim();
    if (!enabled && !message) { status.textContent = 'Describe why account creation is paused.'; return; }
    const { data: userData } = await supabaseClient.auth.getUser();
    status.textContent = 'Saving…';
    const { error } = await supabaseClient.from('site_access_settings').upsert({
      id: 1, registration_enabled: enabled, registration_paused_message: message,
      updated_at: new Date().toISOString(), updated_by: userData?.user?.id || null
    }, { onConflict: 'id' });
    if (error) { status.textContent = 'Save failed: ' + error.message; return; }
    status.textContent = enabled ? 'New account creation is enabled.' : 'Registration paused. The signup page will show your message.';
  }

  async function saveMessage(event) {
    event.preventDefault();
    const status = $('login-message-status');
    const userId = $('login-message-user-id').value.trim();
    const message = $('login-message-text').value.trim();
    if (!userId || !message) { status.textContent = 'Enter a candidate ID and popup message.'; return; }
    const { data: userData } = await supabaseClient.auth.getUser();
    status.textContent = 'Saving…';
    const { error } = await supabaseClient.from('candidate_login_messages').upsert({
      user_id: userId, message, enabled: $('login-message-enabled').checked,
      updated_at: new Date().toISOString(), updated_by: userData?.user?.id || null
    }, { onConflict: 'user_id' });
    if (error) { status.textContent = 'Save failed: ' + error.message; return; }
    status.textContent = 'Popup message saved.';
    await loadSettingsAndMessages();
  }

  async function removeMessage(event) {
    const button = event.target.closest('[data-remove-login-message]');
    if (!button) return;
    const userId = button.getAttribute('data-remove-login-message');
    if (!confirm('Remove this candidate login popup?')) return;
    const { error } = await supabaseClient.from('candidate_login_messages').delete().eq('user_id', userId);
    if (error) { alert('Could not remove message: ' + error.message); return; }
    await loadSettingsAndMessages();
  }
})();