"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_PROFILE_NAME_LENGTH, useBrandProfileStore } from "@/lib/brand-profiles";
import { toast } from "sonner";

type CreateBrandProfileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateBrandProfileDialog({ open, onOpenChange }: CreateBrandProfileDialogProps) {
  const router = useRouter();
  const createProfile = useBrandProfileStore((s) => s.createProfile);
  const validateName = useBrandProfileStore((s) => s.validateName);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  function handleNext() {
    const err = validateName(name);
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    try {
      const profile = createProfile(name);
      toast.success("Brand profile created", {
        description: "Set voice, theme, and compliance next.",
      });
      onOpenChange(false);
      router.push(`/brand-profiles/${profile.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create profile");
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-bp-title"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#161618] text-white shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 id="create-bp-title" className="text-base font-semibold tracking-tight">
                Create new brand profile
              </h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-white"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              <p className="text-sm text-zinc-400">
                To create a new brand profile, first enter a profile name.
              </p>
              <div className="space-y-2">
                <Label htmlFor="bp-name" className="text-xs font-medium text-zinc-400">
                  Brand profile&apos;s name
                </Label>
                <Input
                  id="bp-name"
                  autoFocus
                  value={name}
                  maxLength={MAX_PROFILE_NAME_LENGTH}
                  placeholder="Enter name"
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNext();
                  }}
                  className="h-11 rounded-lg border-white/10 bg-white/4 text-white placeholder:text-zinc-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/30"
                />
                {error ? <p className="text-xs text-red-400">{error}</p> : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/8 px-5 py-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                className="rounded-lg bg-zinc-800 text-white hover:bg-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleNext}
                disabled={submitting || !name.trim()}
                className="gap-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
              >
                Next
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
