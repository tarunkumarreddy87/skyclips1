import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0c0c0e] text-white p-8 max-w-3xl mx-auto">
      <Link href="/sign-in" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white mb-8">
        <ArrowLeft className="size-3.5" /> Back to Sign in
      </Link>
      <h1 className="text-2xl font-bold mb-4">Privacy Policy</h1>
      <p className="text-sm text-zinc-400 leading-relaxed">
        SkyClip AI respects your creative privacy. Your uploaded scripts, voice assets, and video drafts are encrypted and private to your workspace.
      </p>
    </div>
  );
}
