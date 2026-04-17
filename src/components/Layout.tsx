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
  Activity,
} from 'lucide-react';
import { cn } from '../lib/utils';

const navigation = [
  { name: '概览', href: '/', icon: LayoutDashboard },
  { name: '主题追踪', href: '/topics', icon: Tags },
  { name: '知识图谱', href: '/graph', icon: Network },
  { name: '分析报告', href: '/reports', icon: FileText },
  { name: '任务中心', href: '/tasks', icon: Activity },
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
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold',
        'transition-all duration-200 ease-out',
        isActive
          ? 'bg-[#1d1d1f] text-[#F7F7F7]'
          : 'text-[#888] hover:text-[#1d1d1f] hover:bg-[#1d1d1f]/5'
      )}
    >
      <Icon className={cn(
        'w-[18px] h-[18px] transition-colors duration-200',
        isActive ? 'text-[#F7F7F7]' : 'text-[#888] group-hover:text-[#1d1d1f]'
      )} />
      <span className="flex-1">{children}</span>
      {isActive && <ChevronRight className="w-4 h-4 opacity-40" />}
    </Link>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex">
      {/* Sidebar */}
      <aside className="w-60 bg-[#F7F7F7] flex flex-col fixed inset-y-0 left-0 z-40 border-r border-[#1d1d1f]">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-[#1d1d1f]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#1d1d1f] flex items-center justify-center">
              <Network className="w-4 h-4 text-[#F7F7F7]" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base tracking-tight text-[#1d1d1f] uppercase">TechPlan</span>
              <span className="text-[9px] font-mono text-[#888] -mt-0.5 tracking-wider">INTELLIGENCE</span>
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
          <div className="pt-3 border-t border-[#1d1d1f]/20">
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
        <div className="px-3 py-3 border-t border-[#1d1d1f]/20">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#1d1d1f]/5 transition-colors duration-200 cursor-pointer group">
            <div className="w-9 h-9 rounded-full bg-[#1d1d1f] flex items-center justify-center text-[#F7F7F7] font-bold text-sm">
              T
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#1d1d1f] truncate">TechPlan User</div>
              <div className="text-[10px] font-mono text-[#888]">ADMIN</div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#aaa] group-hover:text-[#1d1d1f] transition-colors duration-200" />
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
      </div>
    </div>
  );
}
