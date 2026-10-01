import { DefaultValue } from './PreviewField';
import type { FieldData } from './fieldData';

interface WebhookPreviewProps {
  title: FieldData;
  message: FieldData;
}

export function WebhookPreview({ title, message }: WebhookPreviewProps) {
  const rows = [
    { key: 'automation.title', value: title.text },
    { key: 'automation.message', value: message.text },
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map((row) => (
        <div key={row.key} className="contents">
          <dt className="text-muted-foreground font-mono">{row.key}</dt>
          <dd className="min-w-0 font-mono break-words whitespace-pre-line">
            {row.value ?? <DefaultValue hint={false} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}
