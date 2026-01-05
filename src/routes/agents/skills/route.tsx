import { createFileRoute } from '@tanstack/react-router';
import { listSkillsStore } from '~/server/function/skills.server';
import { SkillsPageComponent } from '~/components/skills/skills-page';

export const Route = createFileRoute('/agents/skills')({
  loader: async () => {
    const skills = await listSkillsStore();
    return { skills };
  },
  component: () => {
    const { skills } = Route.useLoaderData();
    return <SkillsPageComponent skills={skills} />;
  },
});
