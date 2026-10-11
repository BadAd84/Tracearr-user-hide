import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { KeyRound } from 'lucide-react';
import type { LoginMethods, Server } from '@tracearr/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError, FieldGroup } from '@/components/ui/field';
import { AutosaveSwitchField } from '@/components/ui/autosave-field';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaServerIcon } from '@/components/icons/MediaServerIcon';
import { ServerBadge } from '@/components/server/ServerBadge';
import { SettingsSection } from '@/components/settings/shell/SettingsSection';
import { useServers, useSettings, useUpdateServer, useUpdateSettings } from '@/hooks/queries';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useMutationSaveStatus } from '@/hooks/useMutationSaveStatus';

interface LoginMethodSwitchProps {
  method: keyof LoginMethods;
  label: string;
  description?: string;
  checked: boolean;
}

// The server can refuse a switch (the last way in for the owner), so the value comes from the
// cache, which the mutation rolls back, rather than from local state that would keep it flipped.
function LoginMethodSwitch({ method, label, description, checked }: LoginMethodSwitchProps) {
  const update = useUpdateSettings({ silent: true });
  const status = useMutationSaveStatus(update);

  return (
    <AutosaveSwitchField
      id={`loginMethods-${method}`}
      label={label}
      description={description}
      checked={checked}
      onChange={(next) => update.mutate({ loginMethods: { [method]: next } })}
      status={status}
      errorMessage={update.error?.message}
      onReset={update.reset}
    />
  );
}

function ServerLoginSwitch({ server }: { server: Server }) {
  const update = useUpdateServer({ silent: true });
  const status = useMutationSaveStatus(update);
  const checked = update.isPending
    ? (update.variables?.allowMemberLogin ?? false)
    : (server.allowMemberLogin ?? false);

  return (
    <AutosaveSwitchField
      id={`allowMemberLogin-${server.id}`}
      label={
        <span className="flex min-w-0 items-center gap-2">
          <MediaServerIcon type={server.type} alt="" className="size-4 shrink-0" />
          <ServerBadge server={server} />
        </span>
      }
      checked={checked}
      onChange={(next) => update.mutate({ id: server.id, allowMemberLogin: next })}
      status={status}
      errorMessage={update.error?.message}
      onReset={update.reset}
    />
  );
}

function ServerRows() {
  const { t } = useTranslation('settings');
  const { data: servers, isLoading, isError } = useServers();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (isError) return <FieldError>{t('memberLogin.serversLoadFailed')}</FieldError>;

  // A historical server is no longer contacted, so it cannot sign anyone in
  const live = (servers ?? []).filter((server) => !server.historicalAt);

  if (live.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t('memberLogin.noServers')}{' '}
        <Link to="/settings/servers/connections" className="text-foreground underline">
          {t('memberLogin.addServer')}
        </Link>
      </p>
    );
  }

  return (
    <FieldGroup>
      {live.map((server) => (
        <ServerLoginSwitch key={server.id} server={server} />
      ))}
    </FieldGroup>
  );
}

export function MemberLogin() {
  const { t } = useTranslation(['settings', 'common']);
  const { data: settings } = useSettings();
  const serverActivity = useDebouncedSave('memberServerActivity', settings?.memberServerActivity);

  const methods = settings?.loginMethods;

  return (
    <SettingsSection
      title={t('nav.sections.memberLogin')}
      description={t('nav.descriptions.memberLogin')}
    >
      {!methods ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                {t('memberLogin.signIn.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <LoginMethodSwitch
                  method="local"
                  label={t('memberLogin.signIn.local')}
                  description={t('memberLogin.signIn.localDesc')}
                  checked={methods.local}
                />
                {settings?.oidcConfigured && (
                  <LoginMethodSwitch
                    method="oidc"
                    label={t('memberLogin.signIn.oidc')}
                    description={t('memberLogin.signIn.oidcDesc')}
                    checked={methods.oidc}
                  />
                )}
                <LoginMethodSwitch
                  method="plex"
                  label={t('memberLogin.signIn.plex')}
                  description={t('memberLogin.signIn.plexDesc')}
                  checked={methods.plex}
                />
                <LoginMethodSwitch
                  method="member"
                  label={t('memberLogin.signIn.media')}
                  description={t('memberLogin.signIn.mediaDesc')}
                  checked={methods.member}
                />
                <div className="ml-6 space-y-3 border-l pl-4">
                  <p className="text-muted-foreground text-sm">{t('memberLogin.signIn.servers')}</p>
                  <ServerRows />
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <AutosaveSwitchField
                id="memberServerActivity"
                label={t('memberLogin.serverActivity')}
                description={t('memberLogin.serverActivityDesc')}
                checked={serverActivity.value ?? false}
                onChange={serverActivity.setValue}
                status={serverActivity.status}
                errorMessage={serverActivity.errorMessage}
                onRetry={serverActivity.retry}
                onReset={serverActivity.reset}
              />
            </CardContent>
          </Card>
        </>
      )}
    </SettingsSection>
  );
}
