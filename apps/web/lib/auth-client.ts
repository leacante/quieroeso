"use client";

import { createAuthClient } from "better-auth/react";

/** Browser auth client. Same-origin, so no base URL is needed. */
export const authClient = createAuthClient();
