import type { SVGProps } from "react";

export type PlatformId = "youtube" | "facebook" | "instagram" | "linkedin";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function YoutubeIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...props}>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.75 15.5v-7l6.5 3.5-6.5 3.5z" />
    </svg>
  );
}

function FacebookIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...props}>
      <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1z" />
    </svg>
  );
}

function InstagramIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...props}>
      <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm11 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </svg>
  );
}

function LinkedinIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...props}>
      <path d="M6.5 9.5H3.7V20h2.8V9.5zM5.1 4a1.65 1.65 0 1 0 0 3.3 1.65 1.65 0 0 0 0-3.3zM20.3 20h-2.8v-5.6c0-1.5-.5-2.5-1.8-2.5-1 0-1.5.7-1.8 1.3-.1.2-.1.5-.1.8V20h-2.8s0-9.1 0-10.5h2.8v1.5c.4-.6 1.2-1.7 3-1.7 2.2 0 3.8 1.4 3.8 4.5V20z" />
    </svg>
  );
}

export const SOCIAL_PLATFORMS = [
  {
    id: "youtube" as const,
    name: "YouTube",
    blurb: "Upload as unlisted or public · Google account",
    connect: "Connect Google",
    Icon: YoutubeIcon,
  },
  {
    id: "facebook" as const,
    name: "Facebook",
    blurb: "Page or profile post · Meta login",
    connect: "Connect Meta",
    Icon: FacebookIcon,
  },
  {
    id: "instagram" as const,
    name: "Instagram",
    blurb: "Reels / feed via Meta · coming with Facebook",
    connect: "Connect Meta",
    Icon: InstagramIcon,
  },
  {
    id: "linkedin" as const,
    name: "LinkedIn",
    blurb: "Company or personal page",
    connect: "Connect LinkedIn",
    Icon: LinkedinIcon,
  },
];

export function platformLabel(id: PlatformId): string {
  return SOCIAL_PLATFORMS.find((p) => p.id === id)?.name ?? id;
}

export const ACCOUNTS_STORAGE_KEY = "hanuman_social_accounts";
export const SCHEDULE_STORAGE_KEY = "hanuman_social_schedule_queue";

export interface ConnectedAccount {
  platformId: PlatformId;
  handle: string;
  connectedAt: string;
}

export interface ScheduledPost {
  id: string;
  projectId: string;
  projectTitle: string;
  platforms: PlatformId[];
  title: string;
  caption: string;
  scheduledAt: string;
  createdAt: string;
  status: "scheduled" | "posted" | "failed";
  visibility: "public" | "unlisted" | "private";
}

export function loadConnectedAccounts(): ConnectedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConnectedAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConnectedAccounts(items: ConnectedAccount[]) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(items));
}

export function loadScheduleQueue(): ScheduledPost[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScheduledPost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScheduleQueue(items: ScheduledPost[]) {
  localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(items));
}

export function toDatetimeLocalValue(isoOrDate: Date | string): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultScheduleWhen(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toDatetimeLocalValue(d);
}
