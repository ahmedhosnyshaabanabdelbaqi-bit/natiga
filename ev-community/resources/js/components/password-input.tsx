import { Eye, EyeOff } from 'lucide-react';
import type { ComponentProps, Ref } from 'react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Password input with a keyboard-reachable show/hide toggle (placed at the inline end in both directions). */
export default function PasswordInput({
    className,
    ref,
    ...props
}: Omit<ComponentProps<'input'>, 'type'> & { ref?: Ref<HTMLInputElement> }) {
    const [showPassword, setShowPassword] = useState(false);
    const label = showPassword ? t('ui.password.hide') : t('ui.password.show');

    return (
        <div className="relative">
            <Input
                type={showPassword ? 'text' : 'password'}
                className={cn('pe-10', className)}
                ref={ref}
                {...props}
            />
            <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 end-0 flex items-center rounded-e-md px-3 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                aria-label={label}
                aria-pressed={showPassword}
                aria-controls={props.id}
                title={label}
                disabled={props.disabled}
            >
                {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                    <Eye className="size-4" aria-hidden="true" />
                )}
            </button>
        </div>
    );
}
