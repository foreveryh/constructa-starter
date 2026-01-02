import { auth } from '~/server/auth.server';

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
};

export async function optionalUser(request: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await optionalUser(request);
  if (user) return user;

  // Dev mode: return mock user for easier testing
  if (process.env.NODE_ENV !== 'production') {
    return {
      id: 'dev-user-123',
      email: 'dev@example.com',
      name: 'Dev User',
    };
  }

  throw new Response('Unauthorized', { status: 401 });
}
