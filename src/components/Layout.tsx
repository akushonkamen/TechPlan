import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { ForwardRefExoticComponent } from 'react';
import {
  LayoutDashboard,
  Tags,
  Network,
  FileText,
  Settings,
  Target,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { COLORS } from '../lib/design';
import SkillTaskBar from './SkillTaskBar';

const navigation = [
  { name: '概览', href: '/', icon: LayoutDashboard },
  { name: '主题追踪', href: '/topics', icon: Tags },
  { name: '知识图谱', href: '/graph', icon: Network },
  { name: '分析报告', href: '/reports', icon: FileText },
  { name: '决策分析', href: '/decision', icon: Target },
];

const bottomNavigation = [
  { name: '设置', href: '/settings', icon: Settings },
];

interface NavLinkProps {
  href: string;
  icon: ForwardRefExoticComponent<any>;
  children: string;
  isActive: boolean;
  key?: string;
}

function NavLink({ href, icon: Icon, children, isActive }: NavLinkProps) {
  return (
    <Link
      to={href}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium',
        'transition-all duration-200 ease-out',
        isActive
          ? 'bg-[#0071e3] text-white shadow-sm'
          : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'
      )}
    >
      <Icon className={cn(
        'w-[18px] h-[18px] transition-colors duration-200',
        isActive ? 'text-white' : 'text-[#86868b] group-hover:text-[#1d1d1f]'
      )} />
      <span className="flex-1">{children}</span>
      {isActive && <ChevronRight className="w-4 h-4 opacity-60" />}
    </Link>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white/95 backdrop-blur-xl flex flex-col fixed inset-y-0 left-0 z-40 border-r border-[#e5e5ea]">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-[#f5f5f7]/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0071e3] to-[#0055b3] flex items-center justify-center shadow-sm">
              <Network className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-[#1d1d1f]">TechPlan</span>
              <span className="text-[10px] text-[#86868b] -mt-0.5">技术情报平台</span>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-6 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.name}
                href={item.href}
                icon={item.icon}
                isActive={isActive}
              >
                {item.name}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom nav */}
        <div className="px-3 pb-3">
          <div className="pt-3 border-t border-[#f5f5f7]/80">
            {bottomNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <NavLink
                  key={item.name}
                  href={item.href}
                  icon={item.icon}
                  isActive={isActive}
                >
                  {item.name}
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* User profile */}
        <div className="px-3 py-3 border-t border-[#f5f5f7]/80">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#f5f5f7] transition-colors duration-200 cursor-pointer group">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0071e3] to-[#5ac8fa] flex items-center justify-center text-white font-semibold text-sm shadow-sm">
              T
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#1d1d1f] truncate">TechPlan User</div>
              <div className="text-xs text-[#86868b]">管理员</div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#c7c7cc] group-hover:text-[#86868b] transition-colors duration-200" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-60 flex flex-col min-w-0">
        <main className="flex-1 overflow-auto px-10 py-10">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        {/* Global skill task bar */}
        <SkillTaskBar />
      </div>
    </div>
  );
}
