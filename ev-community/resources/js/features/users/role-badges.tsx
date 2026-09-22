import { Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RoleOption } from '@/features/users/types';
import { localized } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function roleName(slug: string, roles: RoleOption[]): string {
    const role = roles.find((candidate) => candidate.slug === slug);
    return role ? localized(role, 'name') || slug : slug;
}

/** Role chips (member role hidden: it is managed by membership, not by the admin). */
export function RoleBadges({ slugs, roles, className }: { slugs: string[]; roles: RoleOption[]; className?: string }) {
    const visible = slugs.filter((slug) => slug !== 'member');
    if (visible.length === 0) {
        return <span className="text-muted-foreground">—</span>;
    }
    return (
        <span className={cn('flex flex-wrap gap-1', className)}>
            {visible.map((slug) => {
                const role = roles.find((candidate) => candidate.slug === slug);
                return (
                    <Badge key={slug} variant={role?.is_super ? 'default' : 'secondary'} className="gap-1 font-normal">
                        {role?.is_super ? <Crown className="size-3" aria-hidden="true" /> : null}
                        {roleName(slug, roles)}
                    </Badge>
                );
            })}
        </span>
    );
}
