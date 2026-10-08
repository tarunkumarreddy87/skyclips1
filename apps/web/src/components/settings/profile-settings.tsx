"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { SettingsShell } from "@/components/settings/settings-shell";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { useSession } from "@/lib/auth-client";
import { createClient } from "@/lib/supabase/client";

export function ProfileSettings() {
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setName(session?.user.name ?? ""); }, [session?.user.id, session?.user.name]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const { error } = await createClient().auth.updateUser({ data: { full_name: name.trim() } });
      if (error) throw error;
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your profile."); }
    finally { setSaving(false); }
  }
  return <SettingsShell title="Your profile" description="Your name and account preferences.">
    <section className="rounded-2xl border border-border bg-card p-6">
      <form onSubmit={save} className="flex flex-col gap-6">
        <FieldGroup>
          <Field><FieldLabel htmlFor="display-name">Display name</FieldLabel><Input id="display-name" value={name} disabled={isPending || saving} required maxLength={100} onChange={e => { setName(e.target.value); setSaved(false); }} /></Field>
          <Field><FieldLabel htmlFor="profile-email">Email</FieldLabel><Input id="profile-email" type="email" value={session?.user.email ?? ""} readOnly /></Field>
        </FieldGroup>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end"><Button disabled={saving || isPending || !session || !name.trim()} type="submit">{saving ? "Saving…" : saved ? "Saved" : "Save changes"}</Button></div>
      </form>
    </section>
    <AppearanceSettings />
  </SettingsShell>;
}
