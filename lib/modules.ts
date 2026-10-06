/**
 * Workspace modules. New modules (Content, Campaign, Assets, …) are enabled by
 * switching their status and adding a route under /dashboard.
 */
export type ModuleStatus = "active" | "coming-soon";

export interface WorkspaceModule {
  id: "ai-image" | "content" | "campaign" | "assets";
  label: string;
  href: string;
  status: ModuleStatus;
  description: string;
}

export const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    id: "ai-image",
    label: "AI Image",
    href: "/dashboard",
    status: "active",
    description: "Turn your idea into an Intelligo ID visual.",
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
