import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Server, SettingsResponse } from '@tracearr/shared';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    settings: { get: vi.fn(), update: vi.fn() },
    servers: { list: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { api } from '@/lib/api';
import { toast } from 'sonner';
import { MemberLogin } from './MemberLogin';

const REFUSAL = 'That would leave the owner with no way to sign in.';

const settings = {
  loginMethods: { local: true, plex: false, oidc: true, member: false },
  memberServerActivity: false,
  oidcConfigured: true,
} as SettingsResponse;

function makeServer(overrides: Partial<Server>): Server {
  return {
    id: 's1',
    name: 'Home',
    type: 'jellyfin',
    url: 'http://home',
    color: '#4488ff',
    allowMemberLogin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <MemberLogin />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const switchFor = (name: string) => screen.findByRole('switch', { name });

describe('Sign-in settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.settings.get).mockResolvedValue(settings);
    vi.mocked(api.settings.update).mockResolvedValue(settings);
    vi.mocked(api.servers.list).mockResolvedValue([
      makeServer({ id: 's1', name: 'Home' }),
      makeServer({ id: 's2', name: 'Den', type: 'emby', allowMemberLogin: true }),
      makeServer({ id: 's3', name: 'Old', historicalAt: '2026-01-01T00:00:00.000Z' }),
    ]);
  });

  it('sends only the switch that changed', async () => {
    renderPage();

    await userEvent.click(await switchFor('memberLogin.signIn.plex'));

    await waitFor(() =>
      expect(api.settings.update).toHaveBeenCalledWith({ loginMethods: { plex: true } })
    );
  });

  it('shows the refusal under the switch and snaps it back', async () => {
    vi.mocked(api.settings.update).mockRejectedValue(new Error(REFUSAL));
    renderPage();

    const oidc = await switchFor('memberLogin.signIn.oidc');
    expect(oidc).toBeChecked();
    await userEvent.click(oidc);

    expect(await screen.findByText(REFUSAL)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'memberLogin.signIn.oidc' })).toBeChecked();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('lists live servers only, each with its own switch', async () => {
    renderPage();

    expect(await screen.findByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Den')).toBeInTheDocument();
    expect(screen.queryByText('Old')).toBeNull();
    expect(document.getElementById('allowMemberLogin-s2')).toBeChecked();
  });

  it('saves a server switch through the server update and stays quiet about it', async () => {
    vi.mocked(api.servers.update).mockResolvedValue(makeServer({}));
    renderPage();
    await screen.findByText('Home');

    await userEvent.click(document.getElementById('allowMemberLogin-s1') as HTMLElement);

    await waitFor(() =>
      expect(api.servers.update).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ allowMemberLogin: true })
      )
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('offers single sign-on only when the deployment has it configured', async () => {
    vi.mocked(api.settings.get).mockResolvedValue({ ...settings, oidcConfigured: false });
    renderPage();

    await switchFor('memberLogin.signIn.plex');
    expect(screen.queryByRole('switch', { name: 'memberLogin.signIn.oidc' })).toBeNull();
  });

  it('lists the server rows under the admins and members switch', async () => {
    renderPage();

    const rows = (await screen.findByText('Home')).closest('.border-l');
    expect(rows).not.toBeNull();
    expect(within(rows as HTMLElement).getByText('Den')).toBeInTheDocument();
    expect(
      within(rows as HTMLElement).queryByRole('switch', { name: 'memberLogin.signIn.media' })
    ).toBeNull();
  });

  it('points to Connections when there are no servers', async () => {
    vi.mocked(api.servers.list).mockResolvedValue([]);
    renderPage();

    const note = await screen.findByText('memberLogin.noServers');
    expect(within(note).getByRole('link')).toHaveAttribute('href', '/settings/servers/connections');
  });
});
