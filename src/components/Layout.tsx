import { Link, useLocation } from 'react-router-dom';
import { useState, useCallback, type ReactNode } from 'react';
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
  ShieldCheck,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '../lib/utils';

const navigation = [
  { name: '概览', href: '/', icon: LayoutDashboard },
  { name: '主题追踪', href: '/topics', icon: Tags },
  { name: '知识图谱', href: '/graph', icon: Network },
  { name: '分析报告', href: '/reports', icon: FileText },
  { name: '任务中心', href: '/tasks', icon: Activity },
  { name: '审核中心', href: '/review', icon: ShieldCheck },
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
  collapsed?: boolean;
  key?: string;
}

function NavLink({ href, icon: Icon, children, isActive, collapsed }: NavLinkProps) {
  return (
    <Link
      to={href}
      title={collapsed ? children : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-xl text-[13px] font-semibold',
        'transition-all duration-200 ease-out',
        collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5',
        isActive
          ? 'bg-[#1d1d1f] text-[#F7F7F7]'
          : 'text-[#888] hover:text-[#1d1d1f] hover:bg-[#1d1d1f]/5'
      )}
    >
      <Icon className={cn(
        'w-[18px] h-[18px] shrink-0 transition-colors duration-200',
        isActive ? 'text-[#F7F7F7]' : 'text-[#888] group-hover:text-[#1d1d1f]'
      )} />
      {!collapsed && <span className="flex-1 truncate">{children}</span>}
      {!collapsed && isActive && <ChevronRight className="w-4 h-4 opacity-40" />}
    </Link>
  );
}

function SidebarContent({
  onNavigate,
  showClose,
  collapsed,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  showClose?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const location = useLocation();

  return (
    <>
      {/* Logo */}
      <div className={cn('h-16 flex items-center border-b border-[#1d1d1f]', collapsed ? 'justify-center px-0' : 'justify-between px-5')}>
        <div className={cn('flex items-center min-w-0', collapsed ? '' : 'gap-3')}>
          <div className="w-8 h-8 rounded-xl bg-[#1d1d1f] flex items-center justify-center shrink-0">
            <Network className="w-4 h-4 text-[#F7F7F7]" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-base tracking-tight text-[#1d1d1f] uppercase truncate">TechPlan</span>
              <span className="text-[9px] font-mono text-[#888] -mt-0.5 tracking-wider">INTELLIGENCE</span>
            </div>
          )}
        </div>
        {showClose && (
          <button
            type="button"
            onClick={onNavigate}
            className="p-2 text-[#888] hover:text-[#1d1d1f] rounded-lg hover:bg-[#1d1d1f]/5"
            aria-label="关闭导航"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {!showClose && !collapsed && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-2 text-[#888] hover:text-[#1d1d1f] rounded-lg hover:bg-[#1d1d1f]/5 transition-colors"
            title="收起侧栏"
            aria-label="收起侧栏"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className={cn('flex-1 py-6 space-y-1 overflow-y-auto', collapsed ? 'px-2' : 'px-3')}>
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <div key={item.name} onClick={onNavigate}>
              <NavLink
                href={item.href}
                icon={item.icon}
                isActive={isActive}
                collapsed={collapsed}
              >
                {item.name}
              </NavLink>
            </div>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className={cn('pb-3', collapsed ? 'px-2' : 'px-3')}>
        <div className="pt-3 border-t border-[#1d1d1f]/20">
          {bottomNavigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <div key={item.name} onClick={onNavigate}>
                <NavLink
                  href={item.href}
                  icon={item.icon}
                  isActive={isActive}
                  collapsed={collapsed}
                >
                  {item.name}
                </NavLink>
              </div>
            );
          })}
        </div>
      </div>

      {/* User profile */}
      <div className={cn('py-3 border-t border-[#1d1d1f]/20', collapsed ? 'px-2' : 'px-3')}>
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-full flex justify-center py-2 text-[#888] hover:text-[#1d1d1f] rounded-xl hover:bg-[#1d1d1f]/5 transition-colors"
            title="展开侧栏"
            aria-label="展开侧栏"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#1d1d1f]/5 transition-colors duration-200 cursor-pointer group">
            <div className="w-9 h-9 rounded-full bg-[#1d1d1f] flex items-center justify-center text-[#F7F7F7] font-bold text-sm shrink-0">
              YP
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#1d1d1f] truncate">Yalun Peng</div>
              <div className="text-[10px] font-mono text-[#888]">ADMIN</div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#aaa] group-hover:text-[#1d1d1f] transition-colors duration-200 shrink-0" />
          </div>
        )}
      </div>
    </>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleCollapse = useCallback(() => setSidebarCollapsed(c => !c), []);

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex">
      <header className="lg:hidden fixed inset-x-0 top-0 z-40 h-16 bg-[#F7F7F7] border-b border-[#1d1d1f] flex items-center justify-between px-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#1d1d1f] flex items-center justify-center shrink-0">
            <Network className="w-4 h-4 text-[#F7F7F7]" />
          </div>
          <span className="font-extrabold text-base tracking-tight text-[#1d1d1f] uppercase truncate">TechPlan</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="p-2 text-[#1d1d1f] rounded-lg hover:bg-[#1d1d1f]/5"
          aria-label="打开导航"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {mobileNavOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 z-40 bg-[#1d1d1f]/30"
          onClick={() => setMobileNavOpen(false)}
          aria-label="关闭导航遮罩"
        />
      )}

      {/* Mobile drawer */}
      <aside className={`lg:hidden w-60 bg-[#F7F7F7] flex flex-col fixed inset-y-0 left-0 z-50 border-r border-[#1d1d1f] transition-transform duration-200 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent onNavigate={() => setMobileNavOpen(false)} showClose />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex bg-[#F7F7F7] flex-col fixed inset-y-0 left-0 z-40 border-r border-[#1d1d1f] transition-[width] duration-200 ${sidebarCollapsed ? 'w-14' : 'w-60'}`}
      >
        <SidebarContent collapsed={sidebarCollapsed} onToggleCollapse={toggleCollapse} />
      </aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0 pt-16 lg:pt-0 transition-[margin] duration-200 ${sidebarCollapsed ? 'lg:ml-14' : 'lg:ml-60'}`}>
        <main className="flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
