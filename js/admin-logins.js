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
      <div class="admin-page-heading"><div><div class="admin-kicker">AUTHENTICATION CONTROLS</div><h1>Logins &amp; Registration</h1><p>Set a personalized message for the targeted candidate's sign-in only, and manage public account creation.</p></div><button class="admin-btn admin-btn-secondary" id="login-controls-refresh" type="button">↻ Refresh</button></div>
      <section class="admin-panel"><div class="admin-panel-heading"><div><h2>New account creation</h2><p>When paused, the signup screen displays your explanation.</p></div></div>
        <form id="registration-settings-form" class="account-admin-card">
          <label style="display:flex;gap:.6rem;align-items:center"><input id="registration-enabled" type="checkbox"> Allow new accounts</label>
          <label>Message shown while registration is paused<textarea id="registration-message" rows="3" maxlength="500" required placeholder="Explain why new account creation is temporarily paused."></textarea></label>
          <p class="admin-form-message" id="registration-status" role="status" aria-live="polite"></p>
          <button class="admin-btn admin-btn-primary" type="submit">Save registration settings</button>
        </form>
      </section>
      <section class="admin-panel" style="margin-top:1.25rem"><div class="admin-panel-heading"><div><h2>Personalized login popup</h2><p>Enter the candidate's email address instead of a UUID. This message appears only after the specified candidate successfully signs in.</p></div></div>
        <form id="login-message-form" class="account-admin-card">
          <label>Candidate email address<input id="login-message-email" type="email" autocomplete="email" required placeholder="candidate@example.com"></label>
          <label>Popup message<textarea id="login-message-text" rows="3" maxlength="500" required placeholder="Hey, welcome back! Bahut din baad aaye ho."></textarea></label>
          <label style="display:flex;gap:.6rem;align-items:center"><input id="login-message-enabled" type="checkbox" checked> Show popup after login only</label>
          <p class="admin-form-message" id="login-message-status" role="status" aria-live="polite"></p>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="admin-btn admin-btn-primary" type="submit">Save popup message</button><button class="admin-btn admin-btn-secondary" id="login-message-clear" type="button">Clear form</button></div>
        </form>
      </section>
      <section class="admin-panel" style="margin-top:1.25rem"><div class="admin-panel-heading"><div><h2>Configured login messages</h2><p>Review or remove a candidate-specific sign-in message.</p></div><span class="site-content-count" id="login-message-count">Loading…</span></div><div id="login-message-list"><div class="admin-empty">Loading saved messages…</div></div></section>`;
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
        supabaseClient.from('candidate_login_messages').select('user_id,message,enabled,updated_at,profiles!candidate_login_messages_user_id_fkey(full_name,email)').order('updated_at', { ascending: false }).limit(500)
      ]);
      if (settingsError) throw settingsError;
      if (messagesError) throw messagesError;
      $('registration-enabled').checked = settings?.registration_enabled !== false;
      $('registration-message').value = settings?.registration_paused_message || 'New account creation is temporarily paused. Please try again later.';
      $('registration-status').textContent = settings?.registration_enabled === false ? 'Registration is currently paused.' : 'Registration is currently enabled.';
      const rows = messages || [];
      // profiles.email may be empty on older accounts; resolve the authoritative
      // email from Supabase Auth using the admin-only RPC, as in the save form.
      const emailById = new Map(rows.map(row => [String(row.user_id), String(row.profiles?.email || '').trim()]));
      if (rows.length) {
        const { data: authEmails, error: rpcError } = await supabaseClient.rpc(
          'admin_get_candidate_emails',
          { p_user_ids: rows.map(row => row.user_id) }
        );
        if (!rpcError) {
          for (const item of authEmails || []) {
            if (item.email) emailById.set(String(item.user_id), String(item.email).trim());
          }
        } else {
          console.warn('Could not load authoritative candidate emails for configured messages:', rpcError);
        }
      }
      $('login-message-count').textContent = rows.length + ' message' + (rows.length === 1 ? '' : 's');
      list.innerHTML = rows.length ? '<div class="candidate-list">' + rows.map(row => `
        <article class="candidate-row"><div class="candidate-avatar">✉</div><div class="candidate-main"><strong>${esc(row.profiles?.full_name || 'Candidate')}</strong><span>${esc(emailById.get(String(row.user_id)) || 'Email not available')}</span><small>Updated ${esc(when(row.updated_at))}</small><p>${esc(row.message)}</p></div><div class="candidate-row-meta"><span class="candidate-status ${row.enabled ? 'is-verified' : 'is-pending'}">${row.enabled ? 'Popup enabled' : 'Popup disabled'}</span><button type="button" class="admin-btn admin-btn-secondary" data-remove-login-message="${esc(row.user_id)}">Remove</button></div></article>`).join('') + '</div>' : '<div class="admin-empty">No personalized login messages configured yet.</div>';
    } catch (error) {
      list.innerHTML = '<div class="admin-error">Could not load login controls: ' + esc(error.message) + '</div>';
    }
  }

  async function resolveCandidateIdByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) throw new Error('Enter the candidate email address.');

    const { data: profiles, error } = await supabaseClient
      .from('profiles')
      .select('id,email,role')
      .eq('role', 'candidate')
      .limit(2000);
    if (error) throw new Error('Could not search candidate accounts: ' + error.message);

    const candidates = profiles || [];
    let emailById = new Map(candidates.map(candidate => [String(candidate.id), String(candidate.email || '').trim().toLowerCase()]));

    // Some older accounts have an empty profile email. Use the admin-only RPC
    // to resolve their authoritative Supabase Auth email without exposing UUIDs in the UI.
    if (candidates.length) {
      const { data: authEmails, error: rpcError } = await supabaseClient.rpc(
        'admin_get_candidate_emails',
        { p_user_ids: candidates.map(candidate => candidate.id) }
      );
      if (!rpcError) {
        for (const row of authEmails || []) {
          const id = String(row.user_id);
          if (row.email) emailById.set(id, String(row.email).trim().toLowerCase());
        }
      } else {
        console.warn('Could not resolve authoritative candidate emails:', rpcError);
      }
    }

    const match = candidates.find(candidate => emailById.get(String(candidate.id)) === normalizedEmail);
    if (!match) throw new Error('No candidate account found for this email. Check the spelling or confirm the account exists.');
    return match.id;
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
    const email = $('login-message-email').value.trim();
    const message = $('login-message-text').value.trim();
    if (!email || !message) { status.textContent = 'Enter the candidate email and popup message.'; return; }
    status.textContent = 'Finding candidate account by email…';
    try {
      const userId = await resolveCandidateIdByEmail(email);
      const { data: userData } = await supabaseClient.auth.getUser();
      status.textContent = 'Saving popup message…';
      const { error } = await supabaseClient.from('candidate_login_messages').upsert({
        user_id: userId, message, enabled: $('login-message-enabled').checked,
        updated_at: new Date().toISOString(), updated_by: userData?.user?.id || null
      }, { onConflict: 'user_id' });
      if (error) throw error;
      status.textContent = 'Popup message saved for ' + email + '.';
      await loadSettingsAndMessages();
    } catch (error) {
      status.textContent = 'Save failed: ' + (error.message || 'Could not save popup message.');
    }
  }

  async function removeMessage(event) {
    const button = event.target.closest('[data-remove-login-message]');
    if (!button) return;
    const userId = button.getAttribute('data-remove-login-message');
    if (!await window.showBrandedDialog('Remove this candidate login popup?', {confirm:true})) return;
    const { error } = await supabaseClient.from('candidate_login_messages').delete().eq('user_id', userId);
    if (error) { alert('Could not remove message: ' + error.message); return; }
    await loadSettingsAndMessages();
  }
})();