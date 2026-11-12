/**
 * Workspace modules. New modules (Content, Campaign, Assets, …) are enabled by
 * switching their status and adding a route under /dashboard.
 */
export type ModuleStatus = "active" | "coming-soon";

export interface WorkspaceModule {
  id: "ai-image" | "email" | "email-db" | "content" | "campaign" | "assets";
  label: string;
  href: string;
  status: ModuleStatus;
  description: string;
}

export const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    id: "ai-image",
    label: "AI IMAGE",
    href: "/dashboard",
    status: "active",
    description: "Turn your idea into an Intelligo ID visual.",
  },
  {
    id: "email",
    label: "EMAIL MARKETING",
    href: "/dashboard/email",
    status: "active",
    description: "Email marketing via Resend: draft, test send and broadcast to segments.",
  },
  {
    id: "email-db",
    label: "DATABASE EMAIL",
    href: "/dashboard/email/database",
    status: "active",
    description: "Kontak email dengan kategori & tag, import CSV.",
  },
  {
    id: "content",
    label: "Content",
    href: "/dashboard/content",
    status: "coming-soon",
    description: "Captions, hooks, CTAs and copy for Instagram, LinkedIn and WhatsApp.",
  },
  {
    id: "campaign",
    label: "Campaign",
    href: "/dashboard/campaign",
    status: "coming-soon",
    description: "Campaign strategy, creative angles and visual concepts.",
  },
  {
    id: "assets",
    label: "Assets",
    href: "/dashboard/assets",
    status: "coming-soon",
    description: "Official logo, brand fonts, program assets and templates.",
  },
];
