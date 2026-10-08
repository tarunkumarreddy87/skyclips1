"use client";

import { useStudioDraft } from "@/lib/studio-draft";
import { useSubscriptionStore } from "@/lib/billing/subscription";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export type SessionLike = {
  user: AuthUser;
};

function toAuthUser(user: User): AuthUser {
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    user.email?.split("@")[0] ||
    null;
  const image =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;
  return {
    id: user.id,
    email: user.email ?? "",
    name,
    image,
  };
}

/** Better Auth–compatible session hook backed by Supabase Auth. */
export function useSession() {
  const [data, setData] = useState<SessionLike | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    if (!isSupabaseAuthConfigured()) {
      setData(null);
      setIsPending(false);
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    // INITIAL_SESSION supplies display state without an extra network request.
    // Authorization remains the responsibility of the server, not this UI hook.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const nextUserId = session?.user.id;
      if (useSubscriptionStore.getState().userId !== nextUserId) {
        useSubscriptionStore.getState().reset();
      }
      setData(session?.user ? { user: toAuthUser(session.user) } : null);
      setIsPending(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { data, isPending };
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signUpWithPassword(input: {
  email: string;
  password: string;
  name?: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.name ?? input.email.split("@")[0] },
    },
  });
  return { data, error };
}

export async function signOut() {
  if (!isSupabaseAuthConfigured()) {
    useSubscriptionStore.getState().reset();
    useStudioDraft.getState().clear();
    return;
  }
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  useSubscriptionStore.getState().reset();
  useStudioDraft.getState().clear();
}

export { getAccessToken } from "@/lib/supabase/access-token";
