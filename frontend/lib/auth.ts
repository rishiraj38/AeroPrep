const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// Token management
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

// Not a credential. It only tells the server whether to render the landing page or the
// dashboard shell for "/", so signed-out visitors (and search engines) get real HTML.
export const SIGNED_IN_COOKIE = 'ap_signed_in';

export function markSignedIn(): void {
  document.cookie = `${SIGNED_IN_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
}

export function clearSignedIn(): void {
  document.cookie = `${SIGNED_IN_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  markSignedIn();
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  clearSignedIn();
}

export function getUser(): any | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

export function setUser(user: any): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

// API calls
// A network failure, as opposed to an answer from the server
async function post(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
}

export async function register(name: string, email: string, password: string) {
  const response = await post('/auth/register', { name, email, password });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Registration failed');
  }
  
  return response.json();
}

export async function login(email: string, password: string) {
  const response = await post('/auth/login', { email, password });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Login failed');
  }
  
  const data = await response.json();
  
  // Save token and user
  setToken(data.token);
  setUser(data.user);
  
  return data;
}

export async function logout() {
  if (typeof window !== 'undefined') {
    localStorage.clear();
    clearSignedIn();
  }
}

export async function getCurrentUser() {
  const token = getToken();
  if (!token) return null;
  
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    removeToken();
    return null;
  }
  
  const data = await response.json();
  setUser(data.user);
  return data.user;
}

// Authenticated fetch helper
export async function authFetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  
  const headers: any = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers
  });
}
