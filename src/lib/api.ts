import {ChangePasswordDto, CreateProblemDto, LoginResponse, Measurement, UpdateProfileDto,
  User, WaterBody, WaterBodyPassport, WaterProblem,} from '@/types';
import { authStorage } from './auth';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000';
//  'https://lakes-backend-iqu6.onrender.com';
// 'https://lakes-backend-eadc.onrender.com';

type RequestOptions = RequestInit & {
  token?: string;
  skipAuth?: boolean;
  retryOnUnauthorized?: boolean;
};

type ApiErrorData = {
  message?: string | string[];
  error?: string;
  details?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractErrorMessage(data: unknown, status: number): string {
  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (isObject(data)) {
    if (Array.isArray(data.message)) {
      return data.message.join(', ');
    }

    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }

    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }

    if (typeof data.details === 'string' && data.details.trim()) {
      return data.details;
    }
  }

  return `Request failed: ${status}`;
}

function normalizeProblemsResponse(data: unknown): WaterProblem[] {
  if (Array.isArray(data)) {
    return data as WaterProblem[];
  }

  if (isObject(data)) {
    const variants = [data.data, data.items, data.problems, data.rows];

    for (let i = 0; i < variants.length; i += 1) {
      if (Array.isArray(variants[i])) {
        return variants[i] as WaterProblem[];
      }
    }
  }

  return [];
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = authStorage.getRefreshToken();

  if (!refreshToken) {
    authStorage.clear();
    return null;
  }

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${refreshToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    authStorage.clear();
    return null;
  }

  const accessToken =
    typeof data?.accessToken === 'string'
      ? data.accessToken
      : typeof data?.tokens?.accessToken === 'string'
        ? data.tokens.accessToken
        : null;

  const newRefreshToken =
    typeof data?.refreshToken === 'string'
      ? data.refreshToken
      : typeof data?.tokens?.refreshToken === 'string'
        ? data.tokens.refreshToken
        : null;

  if (!accessToken || !newRefreshToken) {
    authStorage.clear();
    return null;
  }

  authStorage.setAccessToken(accessToken);
  authStorage.setRefreshToken(newRefreshToken);

  return accessToken;
}

async function request<T = unknown>(path: string, init: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };

  const shouldAttachAuth = !init.skipAuth;
  const token = init.token || (shouldAttachAuth ? authStorage.getAccessToken() : null);

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const canRetry =
      response.status === 401 &&
      shouldAttachAuth &&
      init.retryOnUnauthorized !== false;

    if (canRetry) {
      const nextAccessToken = await refreshAccessToken();

      if (nextAccessToken) {
        return request<T>(path, {
          ...init,
          token: nextAccessToken,
          retryOnUnauthorized: false,
        });
      }
    }

    if (response.status === 401) {
      authStorage.clear();

      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }

    throw new Error(extractErrorMessage(data, response.status));
  }

  return data as T;
}

async function tryRequest<T>(path: string): Promise<T | null> {
  try {
    return await request<T>(path, { method: 'GET' });
  } catch {
    return null;
  }
}

async function fetchAllProblems(): Promise<WaterProblem[]> {
  const endpoints = ['/problems', '/water-body-problems'];

  for (let i = 0; i < endpoints.length; i += 1) {
    try {
      const result = await request<unknown>(endpoints[i], {
        method: 'GET',
      });

      const normalized = normalizeProblemsResponse(result);

      if (Array.isArray(normalized)) {
        return normalized;
      }
    } catch {
      // пробуем следующий endpoint
    }
  }

  return [];
}

export const api = {
  login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      skipAuth: true,
      retryOnUnauthorized: false,
      body: JSON.stringify({ email, password }),
    });
  },

  register(login: string, email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>('/auth/register', {
      method: 'POST',
      skipAuth: true,
      retryOnUnauthorized: false,
      body: JSON.stringify({
        login,
        email,
        password,
        role: 'CLIENT',
      }),
    });
  },

  async getProfile(): Promise<User> {
    const fromAuthMe = await tryRequest<User>('/auth/me');
    if (fromAuthMe) {
      authStorage.setUser(fromAuthMe);
      return fromAuthMe;
    }

    const fromAuthProfile = await tryRequest<User>('/auth/profile');
    if (fromAuthProfile) {
      authStorage.setUser(fromAuthProfile);
      return fromAuthProfile;
    }

    const fromUsersMe = await tryRequest<User>('/users/me');
    if (fromUsersMe) {
      authStorage.setUser(fromUsersMe);
      return fromUsersMe;
    }

    const storedUser = authStorage.getUser<User>();
    if (storedUser?.id) {
      const profile = await request<User>(`/users/${storedUser.id}`, {
        method: 'GET',
      });
      authStorage.setUser(profile);
      return profile;
    }

    throw new Error('Не удалось получить профиль пользователя');
  },

  async updateProfile(payload: UpdateProfileDto): Promise<User> {
    const endpoints = ['/users/me', '/auth/me', '/auth/profile'];

    for (let i = 0; i < endpoints.length; i += 1) {
      try {
        const updatedUser = await request<User>(endpoints[i], {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });

        authStorage.setUser(updatedUser);
        return updatedUser;
      } catch {
        // пробуем следующий endpoint
      }
    }

    throw new Error('Не удалось обновить профиль пользователя');
  },

  async changePassword(payload: ChangePasswordDto): Promise<{ message?: string }> {
    const endpoints = [
      '/users/change-password',
      '/auth/change-password',
      '/users/me/password',
    ];

    for (let i = 0; i < endpoints.length; i += 1) {
      try {
        return await request<{ message?: string }>(endpoints[i], {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } catch {
        // пробуем следующий endpoint
      }
    }

    throw new Error('Не удалось изменить пароль');
  },

  getWaterBodies(): Promise<WaterBody[]> {
    return request<WaterBody[]>('/water-bodies', {
      method: 'GET',
      skipAuth: true,
    });
  },

  getWaterBodyById(id: string): Promise<WaterBody> {
    return request<WaterBody>(`/water-bodies/${id}`, {
      method: 'GET',
      skipAuth: true,
    });
  },

  async getWaterBodyPassport(id: string): Promise<WaterBodyPassport | null> {
    const endpoints = [
      `/water-bodies/${id}/passport`,
      `/water-body-passports/water-body/${id}`,
    ];

    for (let i = 0; i < endpoints.length; i += 1) {
      const result = await tryRequest<WaterBodyPassport>(endpoints[i]);
      if (result) {
        return result;
      }
    }

    return null;
  },

  async getWaterBodyMeasurements(id: string): Promise<Measurement[]> {
    const endpoints = [
      `/water-bodies/${id}/measurements`,
      `/water-bodies/${id}/bioindication-records`,
      `/bioindication-records/water-body/${id}`,
    ];

    for (let i = 0; i < endpoints.length; i += 1) {
      const result = await tryRequest<Measurement[]>(endpoints[i]);
      if (result) {
        return result;
      }
    }

    throw new Error('Не удалось получить показатели водоёма');
  },

  async getWaterBodyProblems(id: string): Promise<WaterProblem[]> {
    const allProblems = await fetchAllProblems();

    return allProblems.filter((problem) => problem.waterBodyId === id);
  },

  getAllProblems(): Promise<WaterProblem[]> {
    return fetchAllProblems();
  },

  async createProblem(payload: CreateProblemDto): Promise<WaterProblem> {
    const endpoints = ['/problems', '/water-body-problems'];

    for (let i = 0; i < endpoints.length; i += 1) {
      try {
        return await request<WaterProblem>(endpoints[i], {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch {
        // пробуем следующий endpoint
      }
    }

    throw new Error('Не удалось создать проблему');
  },

  async getMyProblems(): Promise<WaterProblem[]> {
    let currentUser = authStorage.getUser<User>();

    if (!currentUser?.id) {
      currentUser = await this.getProfile();
    }

    if (!currentUser?.id) {
      return [];
    }

    const allProblems = await fetchAllProblems();

    return allProblems.filter((problem) => problem.userId === currentUser?.id);
  },

  logout(): void {
    authStorage.clear();

    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  },
};
