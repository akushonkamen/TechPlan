import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Tags,
  Network,
  FileText,
  Database,
  CheckSquare,
  Bell,
  Settings,
  Target
} from 'lucide-react';
import { cn } from '../lib/utils';

const navigation = [
  { name: '仪表盘', href: '/', icon: LayoutDashboard },
  { name: '主题管理', href: '/topics', icon: Tags },
  { name: '知识图谱', href: '/graph', icon: Network },
  { name: '决策支持', href: '/decision', icon: Target },
  { name: '分析报告', href: '/reports', icon: FileText },
  { name: '数据源采集', href: '/sources', icon: Database },
  { name: '审核台', href: '/review', icon: CheckSquare },
];

const bottomNavigation = [
  { name: '系统设置', href: '/settings', icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div className="flex items-center gap-2 text-indigo-600">
            <Network className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight">TechPlan</span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-indigo-700" : "text-gray-400")} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="px-4 py-4 border-t border-gray-200">
          {bottomNavigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-indigo-700" : "text-gray-400")} />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
              TP
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">规划代表</p>
              <p className="text-xs text-gray-500 truncate">admin@techplan.local</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8">
          <h1 className="text-xl font-semibold text-gray-900">
            {[...navigation, ...bottomNavigation].find(n => n.href === location.pathname)?.name || 'TechPlan'}
          </h1>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-gray-400 hover:text-gray-500 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
          </div>
        </header>
        
        <main className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
