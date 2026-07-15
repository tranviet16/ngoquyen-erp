"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // Omit baseURL so client uses same-origin relative paths.
  // This makes auth work whether accessed via localhost, Tailscale, or any other host.
  plugins: [usernameClient()],
});

export const { signIn, signOut, useSession } = authClient;
