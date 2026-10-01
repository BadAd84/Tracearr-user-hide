import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Braces } from 'lucide-react';
import type { TemplateVariable } from '@tracearr/shared';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { variableGroup, type VariableGroup } from '@/lib/automations';
import { cn } from '@/lib/utils';

interface NotificationTextFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  variables: readonly TemplateVariable[];
  multiline: boolean;
  maxLength: number;
  invalid?: boolean;
  'aria-labelledby'?: string;
}

/** Where a chosen variable goes: the selection, or the `{{` the reader just typed. */
interface Insertion {
  start: number;
  end: number;
}

export function NotificationTextField({
  id,
  value,
  onChange,
  variables,
  multiline,
  maxLength,
  invalid,
  'aria-labelledby': labelledBy,
}: NotificationTextFieldProps) {
  const { t } = useTranslation('pages');
  const box = useRef<HTMLTextAreaElement>(null);
  const [insertion, setInsertion] = useState<Insertion | null>(null);

  const groups = new Map<VariableGroup, TemplateVariable[]>();
  for (const name of variables) {
    const group = variableGroup(name);
    groups.set(group, [...(groups.get(group) ?? []), name]);
  }

  const openAtSelection = () => {
    const el = box.current;
    setInsertion({
      start: el?.selectionStart ?? value.length,
      end: el?.selectionEnd ?? value.length,
    });
  };

  const choose = (name: TemplateVariable) => {
    if (!insertion) return;
    const token = `{{ ${name} }}`;
    onChange(value.slice(0, insertion.start) + token + value.slice(insertion.end));
    setInsertion(null);
    const caret = insertion.start + token.length;
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="space-y-1.5">
      <Popover open={insertion !== null} onOpenChange={(open) => !open && setInsertion(null)}>
        <PopoverAnchor asChild>
          <Textarea
            ref={box}
            id={id}
            aria-labelledby={labelledBy}
            aria-invalid={invalid || undefined}
            value={value}
            maxLength={maxLength}
            rows={multiline ? 3 : 1}
            className={cn('font-mono text-sm', !multiline && 'min-h-9')}
            onChange={(event) => {
              const next = event.target.value;
              onChange(multiline ? next : next.replace(/\r?\n/g, ' '));
              const caret = event.target.selectionStart;
              if (next.slice(caret - 2, caret) === '{{') {
                setInsertion({ start: caret - 2, end: caret });
              }
            }}
          />
        </PopoverAnchor>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder={t('automations.message.searchVariables')} />
            <CommandList>
              <CommandEmpty>{t('automations.message.noVariables')}</CommandEmpty>
              {[...groups].map(([group, names]) => (
                <CommandGroup key={group} heading={t(`automations.variableGroups.${group}`)}>
                  {names.map((name) => (
                    <CommandItem key={name} value={name} onSelect={() => choose(name)}>
                      <span className="font-mono text-xs">{name}</span>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {t(`automations.variables.${name}`)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {multiline && (
        <Button type="button" variant="outline" size="sm" onClick={openAtSelection}>
          <Braces />
          {t('automations.message.insertVariable')}
        </Button>
      )}
    </div>
  );
}
