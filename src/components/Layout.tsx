import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Tags,
  Network,
  FileText,
  Settings,
  Target,
} from 'lucide-react';
import { cn } from '../lib/utils';
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

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex">
      {/* Sidebar */}
      <div className="w-60 bg-white/80 backdrop-blur-xl flex flex-col fixed inset-y-0 left-0 z-40">
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-[#f5f5f7]">
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-[#0071e3]" />
            <span className="font-bold text-base tracking-tight text-[#1d1d1f]">TechPlan</span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[#f5f5f7] text-[#1d1d1f]'
                    : 'text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]'
                )}
              >
                <item.icon className={cn('w-[18px] h-[18px]', isActive ? 'text-[#0071e3]' : '')} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom nav */}
        <div className="px-3 py-2 border-t border-[#f5f5f7]">
          {bottomNavigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[#f5f5f7] text-[#1d1d1f]'
                    : 'text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]'
                )}
              >
                <item.icon className={cn('w-[18px] h-[18px]', isActive ? 'text-[#0071e3]' : '')} />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* User avatar */}
        <div className="px-3 py-3 border-t border-[#f5f5f7]">
          <div className="flex items-center gap-2.5 px-3 py-1.5">
            <div className="w-7 h-7 rounded-full bg-[#0071e3]/8 flex items-center justify-center text-[#0071e3] font-semibold text-xs">
              T
            </div>
            <span className="text-xs text-[#86868b]">TechPlan User</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 ml-60 flex flex-col min-w-0">
        <main className="flex-1 overflow-auto px-10 py-8 pb-28">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>

        {/* Global skill task bar */}
        <SkillTaskBar />
      </div>
    </div>
  );
}
