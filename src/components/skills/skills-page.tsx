import { FC, useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Zap, Code, Palette, Plug, CheckCircle, Circle } from 'lucide-react';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { useSkillsStore } from '~/lib/skills-store';
import type { SkillInfo } from '~/server/skills/types';
import type { SkillDetail } from '~/server/skills/detail-types';
import { getSkillDetailFn } from '~/server/function/skills.server';
import { SkillsSidebar } from './skills-sidebar';
import { SkillsGrid } from './skills-grid';
import { SkillDetailDialog } from './skill-detail-dialog';

interface CategoryItem {
  id: string;
  label: string;
  icon: FC<{ className?: string }>;
}

const CATEGORIES: CategoryItem[] = [
  { id: 'all', label: 'All Skills', icon: Zap },
  { id: 'development', label: 'Development', icon: Code },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'productivity', label: 'Productivity', icon: Zap },
  { id: 'integration', label: 'Integration', icon: Plug },
  { id: 'installed', label: 'Installed', icon: CheckCircle },
];

export const SkillsPageComponent: FC<{ skills: SkillInfo[] }> = ({ skills }) => {
  const { enabledSkills, loadEnabledSkills, enableSkill, disableSkill } = useSkillsStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedSkillSlug, setSelectedSkillSlug] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Query for skill detail
  const { data: skillDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['skill-detail', selectedSkillSlug],
    queryFn: async () => {
      if (!selectedSkillSlug) return null;
      return await getSkillDetailFn({ data: { skillSlug: selectedSkillSlug } });
    },
    enabled: !!selectedSkillSlug && isDetailOpen,
  });

  // Get user ID from auth - for now use a simple approach
  // In production, you'd use useSession() or similar
  useEffect(() => {
    // Placeholder: in production, get actual user ID from auth
    setUserId('user-placeholder');
    loadEnabledSkills('user-placeholder');
  }, [loadEnabledSkills]);

  // Handle toggle skill
  const handleToggleSkill = async (skillSlug: string) => {
    if (!userId) return;
    const isEnabled = enabledSkills.includes(skillSlug);

    try {
      if (isEnabled) {
        await disableSkill(userId, skillSlug);
      } else {
        await enableSkill(userId, skillSlug);
      }
    } catch (error) {
      console.error('Failed to toggle skill:', error);
    }
  };

  // Handle view details
  const handleViewDetails = (skillSlug: string) => {
    setSelectedSkillSlug(skillSlug);
    setIsDetailOpen(true);
  };

  // Handle close detail dialog
  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    setSelectedSkillSlug(null);
  };

  // Filter skills based on search and category
  const filteredSkills = useMemo(() => {
    let result = skills;

    // Apply category filter
    if (activeFilter === 'installed') {
      result = result.filter((skill) => enabledSkills.includes(skill.slug));
    } else if (activeFilter !== 'all') {
      result = result.filter((skill) => skill.category === activeFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          (skill.description && skill.description.toLowerCase().includes(query))
      );
    }

    return result;
  }, [skills, activeFilter, searchQuery, enabledSkills]);

  // Get category counts
  const getCategoryCount = (categoryId: string) => {
    if (categoryId === 'all') return skills.length;
    if (categoryId === 'installed') return enabledSkills.length;
    return skills.filter((s) => s.category === categoryId).length;
  };

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))]">
      {/* Left Sidebar */}
      <SkillsSidebar
        categories={CATEGORIES}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        getCategoryCount={getCategoryCount}
      />

      {/* Right Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            {activeFilter === 'all'
              ? 'All Skills'
              : CATEGORIES.find((c) => c.id === activeFilter)?.label || 'Skills'}
            <span className="ml-2 text-muted-foreground">
              • {filteredSkills.length}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills..."
                className="w-64 pl-9"
              />
            </div>
          </div>
        </div>

        {/* Skills Grid */}
        <div className="flex-1 overflow-auto p-6">
          {filteredSkills.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Circle className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">No skills found</p>
                <p className="text-sm text-muted-foreground/70">
                  Try adjusting your search or filter
                </p>
              </div>
            </div>
          ) : (
            <SkillsGrid
              skills={filteredSkills}
              enabledSkills={enabledSkills}
              onToggleSkill={handleToggleSkill}
              onViewDetails={handleViewDetails}
            />
          )}
        </div>
      </main>

      {/* Skill Detail Dialog */}
      <SkillDetailDialog
        skill={skillDetail ?? null}
        isOpen={isDetailOpen}
        onClose={handleCloseDetail}
      />
    </div>
  );
};
