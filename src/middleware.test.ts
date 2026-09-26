import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('middleware.ts', () => {
  describe('config', () => {
    it('should have matcher covering / and /admin/:path*', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../middleware.ts'), 'utf8');
      expect(content).toContain("matcher: ['/admin/:path*', '/']");
    });

    it('should not match /api/* or /auth/*', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../middleware.ts'), 'utf8');
      // Ensure no /api/ or /auth/ patterns in matcher
      const matcherLine = content.match(/matcher:\s*(.*?)\n/)?.[1] || '';
      expect(matcherLine).not.toContain("'/api/");
      expect(matcherLine).not.toContain("'/auth/");
    });
  });

  describe('admin protection', () => {
    beforeEach(() => {
      vi.resetModules();
      process.env.ADMIN_SECRET = 'admin-secret';
    });

    const createMockRequest = (overrides: any) => ({
      nextUrl: {
        pathname: overrides.pathname || '/',
        searchParams: overrides.searchParams || new URLSearchParams(),
      },
      cookies: {
        getAll: overrides.cookiesGetAll || (() => []),
        get: overrides.cookiesGet || (() => undefined),
      },
      url: overrides.url || 'http://localhost:3000',
    });

    it('should redirect /admin without cookie to /', async () => {
      const { middleware } = await import('../middleware');
      const mockRequest = createMockRequest({
        pathname: '/admin/dashboard',
        url: 'http://localhost:3000/admin/dashboard',
      }) as any;
      const response = await middleware(mockRequest);
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://localhost:3000/');
    });

    it('should allow /admin with valid cookie', async () => {
      const { middleware } = await import('../middleware');
      const mockRequest = createMockRequest({
        pathname: '/admin/dashboard',
        cookiesGetAll: () => [{ name: 'ast-admin', value: 'true' }],
        cookiesGet: () => ({ value: 'true' }),
        url: 'http://localhost:3000/admin/dashboard',
      }) as any;
      const response = await middleware(mockRequest);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should set cookie when secret query param matches', async () => {
      const { middleware } = await import('../middleware');
      const mockRequest = createMockRequest({
        pathname: '/admin',
        searchParams: new URLSearchParams({ secret: 'admin-secret' }),
        url: 'http://localhost:3000/admin?secret=admin-secret',
      }) as any;
      const response = await middleware(mockRequest);
      expect(response.headers.get('location')).toBe('http://localhost:3000/admin');
    });

    it('should not set cookie when secret query param does not match', async () => {
      const { middleware } = await import('../middleware');
      const mockRequest = createMockRequest({
        pathname: '/admin',
        searchParams: new URLSearchParams({ secret: 'wrong' }),
        url: 'http://localhost:3000/admin?secret=wrong',
      }) as any;
      const response = await middleware(mockRequest);
      expect(response.headers.get('location')).toBe('http://localhost:3000/');
    });
  });

  describe('root path auth', () => {
    beforeEach(() => {
      vi.resetModules();
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    });

    it('should redirect / to /auth/login when no session', async () => {
      const mockGetSession = vi.fn().mockResolvedValue({ data: { session: null } });
      vi.doMock('@supabase/ssr', () => ({
        createServerClient: vi.fn(() => ({
          auth: {
            getSession: mockGetSession,
          },
        })),
      }));
      const { middleware } = await import('../middleware');
      const mockRequest = {
        nextUrl: {
          pathname: '/',
          searchParams: new URLSearchParams(),
        },
        cookies: {
          getAll: () => [],
        },
        url: 'http://localhost:3000/',
      } as any;
      const response = await middleware(mockRequest);
      expect(response.headers.get('location')).toBe('http://localhost:3000/auth/login');
    });

    it('should allow / when session exists', async () => {
      const mockGetSession = vi.fn().mockResolvedValue({ data: { session: { user: {} } } });
      vi.doMock('@supabase/ssr', () => ({
        createServerClient: vi.fn(() => ({
          auth: {
            getSession: mockGetSession,
          },
        })),
      }));
      const { middleware } = await import('../middleware');
      const mockRequest = {
        nextUrl: {
          pathname: '/',
          searchParams: new URLSearchParams(),
        },
        cookies: {
          getAll: () => [],
        },
        url: 'http://localhost:3000/',
      } as any;
      const response = await middleware(mockRequest);
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('unaffected paths', () => {
    it('should not match /api/*', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../middleware.ts'), 'utf8');
      const matcherLine = content.match(/matcher:\s*(.*?)\n/)?.[1] || '';
      expect(matcherLine).not.toContain("'/api/");
    });

    it('should not match /auth/*', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../middleware.ts'), 'utf8');
      const matcherLine = content.match(/matcher:\s*(.*?)\n/)?.[1] || '';
      expect(matcherLine).not.toContain("'/auth/");
    });
  });

  describe('type checking', () => {
    it('should pass tsc --noEmit', async () => {
      const { execSync } = require('child_process');
      // Run tsc on middleware.ts only, skip lib errors
      execSync('npx tsc --noEmit --skipLibCheck middleware.ts', { stdio: 'pipe' });
      // If no error thrown, test passes
      expect(true).toBe(true);
    });
  });
});