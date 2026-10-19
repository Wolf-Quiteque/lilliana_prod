import type { SocialPlatform } from "@/lib/content/types";

export function SocialIcon({ platform }: { platform: SocialPlatform }) {
  switch (platform) {
    case "facebook":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" width="18" height="18" fill="currentColor">
          <path d="M18.2 28V17.1h3.7l.5-4.2h-4.2v-2.7c0-1.2.4-2.1 2.1-2.1h2.3V4.3c-.4-.1-1.8-.2-3.3-.2-3.3 0-5.6 2-5.6 5.8v3h-3.8v4.2h3.8V28h4.5Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.4">
          <rect x="4.5" y="4.5" width="23" height="23" rx="6.5" />
          <circle cx="16" cy="16" r="5.3" />
          <circle cx="23.2" cy="8.9" r="1.25" fill="currentColor" stroke="none" />
        </svg>
      );
    case "tiktok":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" width="18" height="18" fill="currentColor">
          <path d="M21.6 4h-4.3v16.2a3.7 3.7 0 1 1-3.1-3.6v-4.4a8 8 0 1 0 7.4 8V12.3a10 10 0 0 0 5.4 1.6V9.6a5.5 5.5 0 0 1-5.4-5.6Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" width="20" height="20" fill="currentColor">
          <path d="M28.4 10.2a3.3 3.3 0 0 0-2.3-2.3C24 7.3 16 7.3 16 7.3s-8 0-10.1.6a3.3 3.3 0 0 0-2.3 2.3C3 12.3 3 16 3 16s0 3.7.6 5.8a3.3 3.3 0 0 0 2.3 2.3c2.1.6 10.1.6 10.1.6s8 0 10.1-.6a3.3 3.3 0 0 0 2.3-2.3c.6-2.1.6-5.8.6-5.8s0-3.7-.6-5.8ZM13.4 19.9v-7.8l6.7 3.9-6.7 3.9Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" width="17" height="17" fill="currentColor">
          <path d="M8.6 27H4.3V12h4.3v15ZM6.4 10a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM28 27h-4.3v-7.3c0-1.8 0-4-2.4-4s-2.8 1.9-2.8 3.9V27h-4.3V12h4.1v2h.1a4.5 4.5 0 0 1 4-2.2c4.3 0 5.1 2.8 5.1 6.5V27Z" />
        </svg>
      );
    case "x":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" width="16" height="16" fill="currentColor">
          <path d="M23.9 4h4.2l-9.2 10.5L29.8 28h-8.5l-6.6-8.7L7.1 28H2.9l9.8-11.2L2.3 4H11l6 7.9L23.9 4Zm-1.5 21.6h2.3L9.7 6.3H7.2l15.2 19.3Z" />
        </svg>
      );
  }
}
