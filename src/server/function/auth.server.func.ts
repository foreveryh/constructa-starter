import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "../auth.server";

/**
 * Server function to get the current session
 * Verifies cookie, checks token expiry, and handles refresh tokens
 */
export const getSession = createServerFn({ method: "GET" }).handler(
	async () => {
		try {
			console.log('[getSession] Fetching session...');
			const { headers } = getRequest();
			console.log('[getSession] Headers:', Object.fromEntries(headers.entries()));

			const session = await auth.api.getSession({
				headers,
			});

			console.log('[getSession] Auth session result:', {
				hasSession: !!session,
				hasUser: !!session?.user,
				user: session?.user,
			});

			// Dev mode: return mock user for easier testing
			if (!session?.user && process.env.NODE_ENV !== 'production') {
				console.log('[getSession] Dev mode: returning mock user');
				return {
					user: {
						id: 'dev-user-123',
						email: 'dev@example.com',
						name: 'Dev User',
						image: null,
						emailVerified: true,
					},
				};
			}

			if (!session?.user) {
				console.log('[getSession] No user in session, returning null');
				return null;
			}

			const result = {
				user: {
					id: session.user.id,
					email: session.user.email,
					name: session.user.name,
					image: session.user.image,
					emailVerified: session.user.emailVerified,
				},
			};
			console.log('[getSession] Returning user:', result);
			return result;
		} catch (error) {
			console.error("[getSession] Session verification failed:", error);
			return null;
		}
	},
);
