import { X, RotateCcw, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SkillVersion } from '../hooks/useSkillApi';

interface SkillVersionHistoryProps {
  skillName: string;
  displayName: string;
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => void;
}

export default function SkillVersionHistory({
  skillName,
  displayName,
  isOpen,
  onClose,
  onRestored,
}: SkillVersionHistoryProps) {
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  // Fetch versions when modal opens
  const fetchVersions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (version: string) => {
    setRestoring(version);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}/restore/${version}`, {
        method: 'POST',
      });
      if (res.ok) {
        onRestored();
        onClose();
      }
    } finally {
      setRestoring(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, skillName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#f5f5f7]">
          <h2 className="text-lg font-semibold text-[#1d1d1f]">版本历史 — {displayName}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-[#0071e3] animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-[#86868b] text-center py-8">暂无版本历史</p>
          ) : (
            <div className="space-y-3">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-4 bg-[#f5f5f7] rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#1d1d1f]">v{v.version}</span>
                      <span className="text-xs text-[#86868b]">
                        {new Date(v.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    {v.changelog && (
                      <p className="text-sm text-[#86868b] mt-1 truncate">{v.changelog}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRestore(v.version)}
                    disabled={restoring === v.version}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#0071e3] hover:bg-[#0071e3]/5 rounded-lg transition-all disabled:opacity-50"
                  >
                    {restoring === v.version ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    恢复
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
