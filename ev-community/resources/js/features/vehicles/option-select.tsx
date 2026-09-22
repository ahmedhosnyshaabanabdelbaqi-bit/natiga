import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = {
    value: string | null | undefined;
    options: SelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    /** Injected by FormField. */
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    'aria-required'?: boolean;
    'aria-label'?: string;
};

/** Thin wrapper over the shadcn Select for string option lists (labels/aria wired through FormField). */
export function OptionSelect({
    value,
    options,
    onChange,
    placeholder,
    disabled,
    className,
    id,
    ...aria
}: Props) {
    return (
        <Select
            value={value ?? ''}
            onValueChange={onChange}
            disabled={disabled}
        >
            <SelectTrigger
                id={id}
                className={cn('w-full', className)}
                {...aria}
            >
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
                {options.map((option) => (
                    <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                    >
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
