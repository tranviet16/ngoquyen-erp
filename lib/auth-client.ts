"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Omit baseURL so client uses same-origin relative paths.
  // This makes auth work whether accessed via localhost, Tailscale, or any other host.
});

export const { signIn, signOut, useSession } = authClient;
