
/* DECODING HCM — AUTH + PROFILE HELPERS */

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
      .select('id, full_name, phone, phone_verified, email, role')
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

  async signInWithGoogle() {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/login.html?oauth=1',
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) throw error;
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
    return data;
  },

  async register({ email, phone, password, fullName }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedName = String(fullName || '').trim();
    const normalizedPhone = String(phone || '').trim();
    const accessSettings = await this.getAccessSettings();
    if (!accessSettings.registration_enabled) {
      throw new Error(accessSettings.registration_paused_message || 'New account creation is temporarily paused. Please try again later.');
    }

    if (!normalizedEmail || !normalizedName || !password) {
      throw new Error('Name, email and password are required.');
    }

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

    // Only update the Auth phone when a session exists.
    // Supabase may require a separate phone-change OTP confirmation.
    if (data.user && data.session && normalizedPhone) {
      const { error: phoneError } =
        await supabaseClient.auth.updateUser({
          phone: normalizedPhone
        });

      if (phoneError) throw phoneError;
    }

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
    const user = await this.getUser().catch(() => null);
    let logoutMessage = 'You’re signing out of Decoding HCM. Thank you for being part of our learning community. Wishing you continued success!';
    let showCandidateNotice = false;

    if (user) {
      try {
        const profile = await this.getProfile(user.id);
        if (profile?.role === 'candidate') {
          showCandidateNotice = true;
          const { data } = await supabaseClient.from('candidate_login_messages')
            .select('message,enabled').eq('user_id', profile.id).maybeSingle();
          if (data?.enabled && data.message) logoutMessage = data.message;
        }
      } catch (e) {
        console.debug('Could not load personalized logout message:', e?.message || e);
      }
    }

    if (showCandidateNotice && typeof document !== 'undefined' && document.body) {
      await new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.id = 'candidate-logout-note';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(8,18,40,.72);backdrop-filter:blur(7px);';
        const card = document.createElement('section');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-labelledby', 'candidate-logout-title');
        card.style.cssText = 'width:min(100%,480px);box-sizing:border-box;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 28px 90px rgba(0,0,0,.35);font-family:inherit;';
        const header = document.createElement('header');
        header.style.cssText = 'padding:24px 26px;background:linear-gradient(120deg,#0c2461,#2563eb);color:#fff;';
        const eyebrow = document.createElement('p');
        eyebrow.textContent = 'DECODING HCM · A PERSONAL NOTE';
        eyebrow.style.cssText = 'margin:0 0 10px;font-size:.72rem;font-weight:800;letter-spacing:.12em;';
        const title = document.createElement('h2');
        title.id = 'candidate-logout-title';
        title.textContent = 'Before You Go';
        title.style.cssText = 'margin:0;font-size:1.55rem;color:#fff;';
        header.append(eyebrow, title);
        const body = document.createElement('div');
        body.style.cssText = 'padding:24px 26px 26px;';
        const message = document.createElement('p');
        message.textContent = logoutMessage;
        message.style.cssText = 'margin:0;color:#1e293b;font-size:1rem;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;';
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;margin-top:22px;';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Sign out securely';
        button.style.cssText = 'border:0;border-radius:10px;padding:12px 18px;min-height:44px;background:#1d4ed8;color:#fff;font:inherit;font-weight:750;cursor:pointer;';
        footer.appendChild(button);
        body.append(message, footer);
        card.append(header, body);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const finish = () => {
          overlay.remove();
          document.body.style.overflow = previousOverflow;
          resolve();
        };
        button.addEventListener('click', finish, { once: true });
        button.focus();
      });
    }

    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      console.error('Logout failed:', error);
      throw error;
    }
    window.location.href = '/login.html';
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
    if (window.confirm(message)) {
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