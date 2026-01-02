import { Link } from '@tanstack/react-router';
import type * as React from 'react';
import { NavMain } from '~/components/nav-main';
import { NavUser } from '~/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '~/components/ui/sidebar';
import DashboardIcon from 'virtual:icons/ri/dashboard-line';
import ChatIcon from 'virtual:icons/ri/chat-3-line';
import TerminalIcon from 'virtual:icons/ri/terminal-box-line';
import ImageIcon from 'virtual:icons/ri/image-line';
import FileTextIcon from 'virtual:icons/ri/file-text-line';
import FlowChartIcon from 'virtual:icons/ri/flow-chart';
import HomeSmileIcon from 'virtual:icons/ri/home-smile-line';
import SparklingIcon from 'virtual:icons/ri/sparkling-line';
import { FEATURE_CONFIG } from '~/config/features';

const navData = {
  navMain: [
    {
      title: 'Dashboard',
      url: '/agents/charts',
      icon: DashboardIcon,
      enabled: FEATURE_CONFIG.dashboard,
    },
    {
      title: 'Chat',
      url: '/agents/chat',
      icon: ChatIcon,
      enabled: FEATURE_CONFIG.chat,
    },
    {
      title: 'Agent Chat',
      url: '/agents/agent-chat',
      icon: TerminalIcon,
      enabled: FEATURE_CONFIG.agentChat,
    },
    {
      title: 'Claude Chat',
      url: '/agents/claude-chat',
      icon: SparklingIcon,
      enabled: FEATURE_CONFIG.claudeChat,
    },
    {
      title: 'Image Chat',
      url: '/agents/image-chat',
      icon: ImageIcon,
      enabled: FEATURE_CONFIG.imageChat,
    },
    {
      title: 'Documents',
      url: '/agents/documents',
      icon: FileTextIcon,
      enabled: FEATURE_CONFIG.documents,
    },
    {
      title: 'Workflow',
      url: '/agents/workflow',
      icon: FlowChartIcon,
      enabled: FEATURE_CONFIG.workflow,
    },
  ].filter((item) => item.enabled),

  // navClouds section - temporarily hidden per feature configuration
  // Uncomment when cloud features are needed
  /*
  navClouds: [
    {
      title: 'Capture',
      icon: CameraIcon,
      isActive: true,
      url: '#',
      items: [
        {
          title: 'Active Proposals',
          url: '#',
        },
        {
          title: 'Archived',
          url: '#',
        },
      ],
    },
    {
      title: 'Proposal',
      icon: FileListIcon,
      url: '#',
      items: [
        {
          title: 'Active Proposals',
          url: '#',
        },
        {
          title: 'Archived',
          url: '#',
        },
      ],
    },
    {
      title: 'Prompts',
      icon: FileCodeIcon,
      url: '#',
      items: [
        {
          title: 'Active Proposals',
          url: '#',
        },
        {
          title: 'Archived',
          url: '#',
        },
      ],
    },
  ].filter((item) => item.enabled ?? false),
  */
};

type SidebarUser = {
  name?: string | null;
  email: string;
  image?: string | null;
};

export function AppSidebar({ user, ...props }: React.ComponentProps<typeof Sidebar> & { user: SidebarUser }) {
  const resolvedUser = {
    name: user.name ?? user.email,
    email: user.email,
    avatar: user.image ?? '/avatars/shadcn.svg',
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link to="/">
                <HomeSmileIcon className="!size-5" />
                <span className="font-semibold text-base">ex0 AI</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navData.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={resolvedUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
