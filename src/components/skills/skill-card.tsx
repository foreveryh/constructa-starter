import { FC } from 'react';
import { CheckCircle, Circle, Eye } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import type { SkillInfo } from '~/server/skills/types';

interface SkillCardProps {
  skill: SkillInfo;
  isEnabled: boolean;
  onToggle: () => void;
  onViewDetails: () => void;
}

export const SkillCard: FC<SkillCardProps> = ({
  skill,
  isEnabled,
  onToggle,
  onViewDetails,
}) => {
  return (
    <div className="group relative rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{skill.name}</h3>
            {isEnabled ? (
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground capitalize">
            {skill.category}
          </p>
        </div>
      </div>

      {/* Description */}
      {skill.description && (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {skill.description}
        </p>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <Button
          variant={isEnabled ? 'outline' : 'default'}
          size="sm"
          onClick={onToggle}
          className="flex-1"
        >
          {isEnabled ? 'Disable' : 'Enable'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewDetails}
          className="shrink-0"
          title="View details"
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
