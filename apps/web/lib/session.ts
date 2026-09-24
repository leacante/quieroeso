import "server-only";

import { DomainError } from "@quieroeso/domain";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type SessionResolver = (headers: Headers) => Promise<SessionUser | null>;

export const resolveSessionUser: SessionResolver = async (requestHeaders) => {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
};

/**
 * Builds `requireUser` for route handlers: resolves the session from the request
 * headers and throws a 401 DomainError (never a redirect) when it is missing.
 */
export function createRequireUser(resolve: SessionResolver = resolveSessionUser) {
  return async function requireUser(request: Request): Promise<SessionUser> {
    const user = await resolve(request.headers);
    if (!user) {
      throw new DomainError("UNAUTHENTICATED", "Necesitás iniciar sesión para continuar.");
    }
    return user;
  };
}

export const requireUser = createRequireUser();

/** Current user for Server Components, memoized per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return resolveSessionUser(await headers());
});

/** For Server Components: redirects to the login page when there is no session. */
export async function requirePageUser(returnTo = "/dashboard"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }
  return user;
}
