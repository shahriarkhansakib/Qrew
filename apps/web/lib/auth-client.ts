import {
  adminClient,
  inferAdditionalFields,
  magicLinkClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "../../api/src/infra/lib/auth";

const serverBaseUrl =
  (process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/+$/, "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : serverBaseUrl,
  plugins: [
    adminClient(),
    magicLinkClient(),
    twoFactorClient(),
    organizationClient(),
    inferAdditionalFields<Auth>(),
  ],
});

export const { useSession, signIn, signUp, signOut, requestPasswordReset, resetPassword } =
  authClient;
