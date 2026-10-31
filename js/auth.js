
/* DECODING HCM — AUTH + PROFILE HELPERS */

/* Site-wide branded replacement for native browser alert/confirm dialogs. */
(function installBrandedDialogs() {
  if (typeof window === 'undefined' || window.__decodingBrandedDialogsInstalled) return;
  window.__decodingBrandedDialogsInstalled = true;
  let dialogQueue = Promise.resolve();
  function showDialog(message, options = {}) {
    const isConfirm = options.confirm === true, text = String(message == null ? '' : message);
    const run = () => new Promise(resolve => {
      if (!document.body) { resolve(!isConfirm); return; }
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(8,18,40,.72);backdrop-filter:blur(7px);';
      const card = document.createElement('section');
      card.setAttribute('role','dialog'); card.setAttribute('aria-modal','true'); card.setAttribute('aria-labelledby','dch-dialog-title'); card.setAttribute('aria-describedby','dch-dialog-message');
      card.style.cssText = 'width:min(100%,460px);box-sizing:border-box;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 28px 90px rgba(0,0,0,.35);font-family:inherit;color:#0f172a;';
      const header = document.createElement('header'); header.style.cssText = 'padding:21px 24px;background:linear-gradient(120deg,#0c2461,#2563eb);color:#fff;';
      const eyebrow = document.createElement('p'); eyebrow.textContent='DECODING HCM'; eyebrow.style.cssText='margin:0 0 7px;font-size:.7rem;font-weight:800;letter-spacing:.14em;color:#dbeafe;';
      const title = document.createElement('h2'); title.id='dch-dialog-title'; title.textContent=isConfirm?'Please Confirm':'Message'; title.style.cssText='margin:0;font-size:1.35rem;line-height:1.3;color:#fff;';
      header.append(eyebrow,title);
      const body = document.createElement('div'); body.style.cssText='padding:23px 24px 20px;';
      const messageNode = document.createElement('p'); messageNode.id='dch-dialog-message'; messageNode.textContent=text; messageNode.style.cssText='margin:0;color:#1e293b;font-size:1rem;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;';
      const footer = document.createElement('div'); footer.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:24px;';
      const cancel = document.createElement('button'); cancel.type='button'; cancel.textContent='Cancel'; cancel.style.cssText='display:'+(isConfirm?'inline-flex':'none')+';align-items:center;justify-content:center;min-height:44px;padding:11px 18px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;font:inherit;font-weight:700;cursor:pointer;';
      const ok = document.createElement('button'); ok.type='button'; ok.textContent='OK'; ok.style.cssText='margin-left:auto;display:inline-flex;align-items:center;justify-content:center;min-width:86px;min-height:44px;padding:11px 20px;border:0;border-radius:10px;background:#1d4ed8;color:#fff;font:inherit;font-weight:750;cursor:pointer;box-shadow:0 4px 10px rgba(29,78,216,.2);';
      footer.append(cancel,ok); body.append(messageNode,footer); card.append(header,body); overlay.appendChild(card);
      const previousOverflow=document.body.style.overflow; document.body.style.overflow='hidden'; document.body.appendChild(overlay);
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;document.removeEventListener('keydown',onKeyDown,true);overlay.remove();document.body.style.overflow=previousOverflow;resolve(value);};
      const onKeyDown=event=>{if(event.key==='Escape'){event.preventDefault();finish(isConfirm?false:true);}else if(event.key==='Enter'&&event.target!==cancel){event.preventDefault();finish(true);}};
      ok.addEventListener('click',()=>finish(true),{once:true}); cancel.addEventListener('click',()=>finish(false),{once:true});
      overlay.addEventListener('click',event=>{if(event.target===overlay&&isConfirm)finish(false);});
      document.addEventListener('keydown',onKeyDown,true); ok.focus();
    });
    const result=dialogQueue.then(run,run); dialogQueue=result.then(()=>undefined,()=>undefined); return result;
  }
  window.showBrandedDialog=showDialog;
  window.alert=message=>{void showDialog(message);};
  window.confirm=message=>showDialog(message,{confirm:true});
})();


const AuthManager = {
  async getUser() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      throw new Error('Supabase client is not initialized.');
    }

    const { data, error } = await supabaseClient.auth.getUser();

    if (error) {
      console.error('getUser failed:', error);
      return null;
    }

    return data?.user || null;
  },

  async getProfile(userId = null) {
    const user = userId ? null : await this.getUser();
    const id = userId || user?.id;

    if (!id) return null;

    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, full_name, phone, phone_verified, email, role, account_status')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('getProfile failed:', error);
      throw error;
    }

    return data || null;
  },

  async isVerifiedCandidate() {
    const user = await this.getUser();

    if (!user) {
      return { ok: false, reason: 'login' };
    }

    if (!user.email_confirmed_at) {
      return { ok: false, reason: 'email' };
    }

    let profile;

    try {
      profile = await this.getProfile(user.id);
    } catch {
      return { ok: false, reason: 'profile' };
    }

    if (!profile || profile.role !== 'candidate') {
      return { ok: false, reason: 'profile' };
    }
    if (profile.account_status && profile.account_status !== 'active') {
      await supabaseClient.auth.signOut();
      return { ok: false, reason: profile.account_status };
    }

    // Enable this check if phone verification is mandatory.
    // if (!profile.phone || !profile.phone_verified) {
    //   return { ok: false, reason: 'phone' };
    // }

    return { ok: true, user, profile };
  },

  async getAccessSettings() {
    const { data, error } = await supabaseClient
      .from('site_access_settings')
      .select('registration_enabled, registration_paused_message')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    return data || { registration_enabled: true, registration_paused_message: 'New account creation is temporarily paused. Please try again later.' };
  },

  async sendMagicLink(email) {
    const value = String(email || '').trim().toLowerCase();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error('Enter the email address linked to your existing account.');
    }
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: value,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + '/login.html?magic=1'
      }
    });
    if (error) throw error;
    return true;
  },

  async resendConfirmation(email) {
    const value = String(email || '').trim().toLowerCase();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error('Enter a valid email address first.');
    }
    const { error } = await supabaseClient.auth.resend({
      type: 'signup',
      email: value,
      options: { emailRedirectTo: window.location.origin + '/login.html' }
    });
    if (error) throw error;
    return true;
  },

  async login(identifier, password) {
    const value = String(identifier || '').trim();

    if (!value || !password) {
      throw new Error('Enter your email/phone and password.');
    }

    // Phone login requires a phone number in the format
    // configured for your Supabase project, usually E.164.
    const payload = value.includes('@')
      ? { email: value.toLowerCase(), password }
      : { phone: value, password };

    const { data, error } =
      await supabaseClient.auth.signInWithPassword(payload);

    if (error) throw error;
    const profile = data?.user?.id ? await this.getProfile(data.user.id) : null;
    if (profile?.account_status && profile.account_status !== 'active') {
      await supabaseClient.auth.signOut();
      throw new Error(profile.account_status === 'banned'
        ? 'This account has been banned. Contact support if you believe this is a mistake.'
        : profile.account_status === 'removed'
          ? 'This account has been removed from active users. Contact support if you believe this is a mistake.'
          : 'This account is temporarily suspended. Contact support for assistance.');
    }
    return data;
  },

  async register({ email, phone, password, fullName = '' }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();
    const normalizedName = String(fullName || '').trim() || normalizedEmail.split('@')[0];
    const accessSettings = await this.getAccessSettings();
    if (!accessSettings.registration_enabled) {
      throw new Error(accessSettings.registration_paused_message || 'New account creation is temporarily paused. Please try again later.');
    }

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !normalizedPhone || !password) {
      throw new Error('Enter a valid email, mobile number and password.');
    }
    if (String(password).length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    // The phone is stored as profile metadata only. Do not call updateUser({phone})
    // here: Supabase treats that as a phone change and may require SMS OTP.
    const { data, error } = await supabaseClient.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: normalizedName,
          phone: normalizedPhone
        },
        emailRedirectTo: `${window.location.origin}/login.html`
      }
    });

    if (error) throw error;
    return data;
  },

  // OTP for phone sign-in. This is NOT the phone-change verification flow.
  async sendPhoneOtp(phone) {
    const value = String(phone || '').trim();
    if (!value) throw new Error('Enter your phone number.');

    const { error } = await supabaseClient.auth.signInWithOtp({
      phone: value,
      options: { shouldCreateUser: false }
    });

    if (error) throw error;
  },

  // Verify an OTP sent for phone sign-in.
  async verifyPhoneOtp(phone, token) {
    const value = String(phone || '').trim();
    const otp = String(token || '').trim();

    if (!value || !otp) {
      throw new Error('Phone number and OTP are required.');
    }

    const { data, error } = await supabaseClient.auth.verifyOtp({
      phone: value,
      token: otp,
      type: 'sms'
    });

    if (error) throw error;
    return data;
  },

  // Attach/update the phone on the currently signed-in account.
  async attachAndVerifyPhone(phone) {
    const value = String(phone || '').trim();

    if (!value) throw new Error('Enter your phone number.');

    const user = await this.getUser();
    if (!user) throw new Error('Please sign in again.');

    const { error } = await supabaseClient.auth.updateUser({
      phone: value
    });

    if (error) throw error;

    // Do not mark the phone verified before OTP confirmation.
    // The profile phone is informational only until Supabase Auth confirms
    // the phone-change OTP. Do not let browser code write phone_verified.
    const { error: profileError } = await supabaseClient
      .from('profiles')
      .update({ phone: value })
      .eq('id', user.id);

    if (profileError) throw profileError;

    return true;
  },

  // Verify the OTP sent after updateUser({ phone }).
  async verifyPhoneChangeOtp(phone, token) {
    const value = String(phone || '').trim();
    const otp = String(token || '').trim();

    if (!value || !otp) {
      throw new Error('Phone number and OTP are required.');
    }

    const { data, error } = await supabaseClient.auth.verifyOtp({
      phone: value,
      token: otp,
      type: 'phone_change'
    });

    if (error) throw error;

    const user = data?.user || await this.getUser();

    if (!user) throw new Error('Please sign in again.');

    // The database verifies auth.users.phone_confirmed_at before updating
    // the profile flag; never trust a client-supplied phone_verified boolean.
    const { error: profileError } = await supabaseClient.rpc('sync_verified_phone');

    if (profileError) {
      console.error('Phone verified but profile sync failed:', profileError);
      throw new Error(
        'Phone verification succeeded, but the profile could not be synced. Please contact support.'
      );
    }

    return data;
  },

  async updateName(fullName) {
    const name = String(fullName || '').trim();

    if (!name) throw new Error('Enter your full name.');

    const user = await this.getUser();
    if (!user) throw new Error('Please sign in again.');

    // Update the profile table first.
    const { data, error } = await supabaseClient
      .from('profiles')
      .update({ full_name: name })
      .eq('id', user.id)
      .select('id')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        'Profile was not updated. Check your profile and database permissions.'
      );
    }

    // Keep Supabase Auth metadata in sync.
    const { error: authError } =
      await supabaseClient.auth.updateUser({
        data: { full_name: name }
      });

    if (authError) {
      console.error('Auth metadata update failed:', authError);
      throw new Error(
        'Profile name was saved, but account metadata could not be updated.'
      );
    }

    return true;
  },

  async changeEmail(email) {
    const value = String(email || '').trim().toLowerCase();

    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error('Enter a valid email address.');
    }

    const { error } = await supabaseClient.auth.updateUser({
      email: value
    });

    if (error) throw error;
    return true;
  },

  async changePassword(password) {
    if (typeof password !== 'string' || !password) {
      throw new Error('Enter a new password.');
    }

    const { error } = await supabaseClient.auth.updateUser({
      password
    });

    if (error) throw error;
    return true;
  },

  async logout() {
    // All logout entry points share one branded confirmation. Candidate-specific
    // admin messages are intentionally limited to the targeted candidate's login.
    if (typeof window.showBrandedDialog === 'function') {
      const confirmed = await window.showBrandedDialog('Are you sure you want to log out?', { confirm: true });
      if (!confirmed) return false;
    }

    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      console.error('Logout failed:', error);
      throw error;
    }
    window.location.href = '/login.html';
    return true;
  },

  async requireCandidateGuard() {
    let status;
    try {
      status = await this.isVerifiedCandidate();
    } catch (error) {
      console.error('Candidate guard failed:', error);
      status = { ok: false, reason: 'error' };
    }
    if (status.ok) return status;
    if (status.reason === 'email' || status.reason === 'phone') {
      window.location.href = '/verify.html';
      return status;
    }
    const message = 'Is feature ko use karne ke liye login zaroori hai. OK dabane par Login page khulega. Cancel dabane par aap Home page par rahenge.';
    if (await window.showBrandedDialog(message, { confirm: true })) {
      const returnTo = window.location.pathname.slice(1) + window.location.search + window.location.hash;
      window.location.href = '/login.html?redirect=' + encodeURIComponent(returnTo);
    } else {
      window.location.href = '/index.html';
    }
    return status;
  },

  async requireAdminGuard() {
    const user = await this.getUser();

    if (!user) {
      window.location.href = '/login.html';
      return null;
    }

    let profile;

    try {
      profile = await this.getProfile(user.id);
    } catch (error) {
      console.error('Admin profile lookup failed:', error);
      window.location.href = '/login.html';
      return null;
    }

    if (!profile || profile.role !== 'admin') {
      window.location.href = '/index.html';
      return null;
    }

    return { user, profile };
  }
};


// Candidate presence tracking: one activity session is shared across page
// navigations; last_seen_at determines whether the account is currently online.
(function initCandidateActivityTracking() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  let busy = false;
  async function heartbeat() {
    if (busy || !supabaseClient) return;
    busy = true;
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user || !user.email_confirmed_at) return;
      const profile = await AuthManager.getProfile(user.id);
      if (!profile || profile.role !== 'candidate') return;
      const now = new Date();
      let sessionId = null;
      try { sessionId = localStorage.getItem('decoding_hcm_activity_session_id'); } catch {}
      let row = null;
      if (sessionId) {
        const { data } = await supabaseClient.from('candidate_activity_sessions')
          .select('id,started_at,ended_at')
          .eq('id', sessionId).eq('user_id', user.id).maybeSingle();
        if (data && !data.ended_at) row = data;
      }
      if (!row) {
        const { data, error } = await supabaseClient.from('candidate_activity_sessions')
          .insert({
            user_id: user.id,
            started_at: now.toISOString(),
            last_seen_at: now.toISOString(),
            user_agent: String(navigator.userAgent || '').slice(0, 500),
            last_page_path: String(location.pathname || '').slice(0, 300)
          }).select('id,started_at').single();
        if (error) throw error;
        row = data;
        try { localStorage.setItem('decoding_hcm_activity_session_id', row.id); } catch {}
      } else {
        const duration = Math.max(0, Math.floor((now.getTime() - new Date(row.started_at).getTime()) / 1000));
        const { error } = await supabaseClient.from('candidate_activity_sessions').update({
          last_seen_at: now.toISOString(),
          duration_seconds: duration,
          last_page_path: String(location.pathname || '').slice(0, 300)
        }).eq('id', row.id).eq('user_id', user.id);
        if (error) throw error;
      }
    } catch (e) {
      console.debug('Candidate activity heartbeat skipped:', e?.message || e);
    } finally {
      busy = false;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', heartbeat, { once: true });
  else heartbeat();
  window.addEventListener('pageshow', heartbeat);
  window.addEventListener('focus', heartbeat);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) heartbeat(); });
  window.setInterval(() => { if (!document.hidden) heartbeat(); }, 60000);
})();