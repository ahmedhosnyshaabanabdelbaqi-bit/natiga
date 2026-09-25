import { CloseButton, TextInput, type TextInputProps } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface SearchInputProps extends Omit<TextInputProps, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  delay?: number;
}

/** Debounced search box whose committed value usually lives in the URL. */
export function SearchInput({ value, onChange, delay = 350, ...props }: SearchInputProps) {
  const { t } = useTranslation('common');
  const [text, setText] = useState(value);
  const [committed, setCommitted] = useState(value);
  if (value !== committed) {
    // External change (back/forward, reset filters).
    setCommitted(value);
    setText(value);
  }
  const commit = useDebouncedCallback((next: string) => {
    setCommitted(next.trim());
    onChange(next.trim());
  }, delay);

  return (
    <TextInput
      type="search"
      leftSection={<IconSearch size={16} aria-hidden />}
      placeholder={t('actions.search')}
      aria-label={props.label ? undefined : t('actions.search')}
      {...props}
      value={text}
      onChange={(e) => {
        setText(e.currentTarget.value);
        commit(e.currentTarget.value);
      }}
      rightSection={
        text ? (
          <CloseButton
            size="sm"
            aria-label={t('actions.clear')}
            onClick={() => {
              setText('');
              setCommitted('');
              onChange('');
            }}
          />
        ) : null
      }
    />
  );
}
