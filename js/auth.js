// DECODING HCM — AUTH + PROFILE HELPERS
const AuthManager = {
    async getUser() {
        if (!supabaseClient) return null;
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        if (error) return null;
        return user;
    },
    async getProfile() {
        const user = await this.getUser();
        if (!user) return null;
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
        if (error) return null;
        return data;
    },
    async isVerifiedCandidate() {
        const user = await this.getUser();
        if (!user) return { ok:false, reason:'login' };
        if (!user.email_confirmed_at) return { ok:false, reason:'email' };
        const profile = await this.getProfile();
        if (!profile || profile.role !== 'candidate') return { ok:false, reason:'profile' };
        if (!profile.phone || !profile.phone_verified) return { ok:false, reason:'phone' };
        return { ok:true, user, profile };
    },
    async login(identifier, password) {
        const value = String(identifier || '').trim();
        const payload = value.includes('@') ? { email:value, password } : { phone:value, password };
        const { data, error } = await supabaseClient.auth.signInWithPassword(payload);
        if (error) throw error;
        return data;
    },
    async register({ email, phone, password, fullName }) {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
                data: { full_name: fullName.trim(), phone: phone.trim() },
                emailRedirectTo: `${window.location.origin}/login.html`
            }
        });
        if (error) throw error;
        // If email confirmation is disabled, immediately attach the phone and send OTP.
        if (data.user && data.session && phone) {
            const { error: phoneError } = await supabaseClient.auth.updateUser({ phone: phone.trim() });
            if (phoneError) throw phoneError;
        }
        return data;
    },
    async sendPhoneOtp(phone) {
        const { error } = await supabaseClient.auth.signInWithOtp({ phone: phone.trim(), options: { shouldCreateUser:false } });
        if (error) throw error;
    },
    async verifyPhoneOtp(phone, token) {
        const { data, error } = await supabaseClient.auth.verifyOtp({ phone: phone.trim(), token: token.trim(), type:'sms' });
        if (error) throw error;
        if (data.user) {
            await supabaseClient.from('profiles').update({ phone:phone.trim(), phone_verified:true }).eq('id', data.user.id);
        }
        return data;
    },
    async attachAndVerifyPhone(phone) {
        const value = phone.trim();
        const { error } = await supabaseClient.auth.updateUser({ phone:value });
        if (error) throw error;
        await supabaseClient.from('profiles').update({ phone:value, phone_verified:false }).eq('id', (await this.getUser()).id);
        return true;
    },
    async updateName(fullName) {
        const user = await this.getUser();
        if (!user) throw new Error('Please sign in again.');
        const { error } = await supabaseClient.from('profiles').update({ full_name:fullName.trim() }).eq('id', user.id);
        if (error) throw error;
        await supabaseClient.auth.updateUser({ data:{ full_name:fullName.trim() } });
    },
    async changeEmail(email) {
        const { error } = await supabaseClient.auth.updateUser({ email:email.trim().toLowerCase() });
        if (error) throw error;
    },
    async changePassword(password) {
        const { error } = await supabaseClient.auth.updateUser({ password });
        if (error) throw error;
    },
    async logout() {
        await supabaseClient.auth.signOut();
        window.location.href = '/login.html';
    },
    async requireCandidateGuard() {
        const status = await this.isVerifiedCandidate();
        if (status.ok) return status;
        if (status.reason === 'login') window.location.href = '/login.html';
        else if (status.reason === 'email' || status.reason === 'phone') window.location.href = '/verify.html';
        else window.location.href = '/login.html';
        return status;
    },
    async requireAdminGuard: async function () {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    // 1. Agar session hi nahi hai, to login page bhejo (Logout mat chalao)
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }

    // 2. Profile fetch karo
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

    // 3. Agar error ho ya role admin na ho
    if (error  !profile  profile.role !== 'admin') {
        console.error("Admin Access Denied:", error);
        window.location.href = 'login.html';
        return null;
    }

    return profile;
}
};
// js/auth.js ke sabse niche add karein
window.AuthManager = AuthManager;
