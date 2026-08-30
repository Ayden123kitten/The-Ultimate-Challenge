// ==========================================
// AUTH HELPER
// Shared by app.js and players.js. Include this
// script BEFORE app.js / players.js in the HTML.
// ==========================================
const AUTH = {
    getToken: () => localStorage.getItem('ap_auth_token') || '',
    getName: () => localStorage.getItem('ap_async_player') || '',

    isLoggedIn: () => !!AUTH.getToken() && !!AUTH.getName(),

    setSession(name, token) {
        localStorage.setItem('ap_async_player', name);
        localStorage.setItem('ap_auth_token', token);
    },

    clearSession() {
        localStorage.removeItem('ap_async_player');
        localStorage.removeItem('ap_auth_token');
    },

    authHeader() {
        return { 'Authorization': `Bearer ${AUTH.getToken()}` };
    },

    async signup(name, password, pfpLink) {
        const res = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password, pfpLink })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Signup failed');
        AUTH.setSession(data.name, data.token);
        return data;
    },

    async login(name, password) {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        AUTH.setSession(data.name, data.token);
        return data;
    },

    logout() {
        AUTH.clearSession();
        window.location.reload();
    }
};
