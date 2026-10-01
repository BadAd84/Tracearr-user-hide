import { useTranslation } from 'react-i18next';
import {
  DESTINATION_TEXT_PROFILES,
  DESTINATION_TYPES,
  SEND_BODY_MAX,
  SEND_TITLE_MAX,
  VARIABLE_SAMPLES,
  escapeFor,
  fitText,
  renderText,
  resolveVariable,
  type DestinationKind,
  type DestinationTextProfile,
  type TextLimit,
} from '@tracearr/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDestinations } from '@/hooks/queries/useDestinations';

interface NotificationPreviewProps {
  title?: string;
  body?: string;
  to: readonly string[];
}

const PLAIN: DestinationTextProfile = {
  escape: 'none',
  title: { max: SEND_TITLE_MAX, unit: 'chars' },
  body: { max: SEND_BODY_MAX, unit: 'chars' },
};

const samples: Record<string, string> = VARIABLE_SAMPLES;
const lookup = (name: string) => samples[resolveVariable(name)];
const identity = (value: string) => value;
const sizeOf = (text: string, unit: TextLimit['unit']) =>
  unit === 'bytes' ? new TextEncoder().encode(text).length : [...text].length;

/** The text as it would arrive, rendered from sample values in the browser. */
export function NotificationPreview({ title, body, to }: NotificationPreviewProps) {
  const { t } = useTranslation('pages');
  const { data: destinations } = useDestinations();
  const kinds = [
    ...new Set(
      (destinations ?? [])
        .filter((destination) => to.includes(destination.id))
        .map((destination) => destination.type)
        .filter((kind): kind is Exclude<DestinationKind, 'json_webhook'> => kind !== 'json_webhook')
    ),
  ];
  const tabs: { key: string; label: string; profile: DestinationTextProfile }[] =
    kinds.length === 0
      ? [{ key: 'plain', label: t('automations.message.plainTab'), profile: PLAIN }]
      : kinds.map((kind) => ({
          key: kind,
          label: t(`settings.destinations.types.${DESTINATION_TYPES[kind].label}`),
          profile: DESTINATION_TEXT_PROFILES[kind],
        }));
  const first = tabs[0]?.key ?? 'plain';

  const show = (text: string | undefined, limit: TextLimit | null) => {
    if (text === undefined) return undefined;
    const rendered = renderText(text, lookup, identity);
    const out = limit ? fitText(rendered, limit) : rendered;
    return out.trim() === '' ? undefined : out;
  };

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-medium">
        {t('automations.message.preview')}
      </p>
      <Tabs defaultValue={first}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => {
          const shownTitle = show(title, tab.profile.title);
          const shownBody = show(body, tab.profile.body);
          const sent = body === undefined ? '' : renderText(body, lookup, escapeFor(tab.profile));
          const limit = tab.profile.body;
          return (
            <TabsContent
              key={tab.key}
              value={tab.key}
              className="bg-muted/40 rounded-md border p-3"
            >
              <p className={shownTitle ? 'font-medium' : 'text-muted-foreground'}>
                {shownTitle ?? t('automations.message.previewDefault')}
              </p>
              <p
                className={
                  shownBody ? 'text-sm whitespace-pre-line' : 'text-muted-foreground text-sm'
                }
              >
                {shownBody ?? t('automations.message.previewDefault')}
              </p>
              {limit && (
                <p className="text-muted-foreground mt-2 text-right text-xs tabular-nums">
                  {t('automations.message.previewCount', {
                    used: Math.min(sizeOf(sent, limit.unit), limit.max),
                    max: limit.max,
                    unit:
                      limit.unit === 'bytes'
                        ? t('automations.message.unitBytes')
                        : t('automations.message.unitChars'),
                  })}
                </p>
              )}
              {(tab.key === 'discord' || tab.key === 'email') && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('automations.message.addedByTracearr')}
                </p>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
