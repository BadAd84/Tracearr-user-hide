import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initI18n } from '@tracearr/translations';
import { NotificationTextField } from './NotificationTextField';

beforeAll(async () => {
  await initI18n({ lng: 'en' });
});

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NotificationTextField
        id="body"
        value={value}
        onChange={setValue}
        variables={['user.username', 'server.name']}
        multiline
        maxLength={2000}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('NotificationTextField', () => {
  it('inserts a chosen variable at the cursor', async () => {
    const user = userEvent.setup();
    render(<Harness initial="hi " />);
    const box = screen.getByRole('textbox');
    await user.click(box);
    await user.keyboard('{End}');
    await user.click(screen.getByRole('button', { name: 'Insert variable' }));
    await user.click(await screen.findByRole('option', { name: /Account username/ }));
    expect(screen.getByTestId('value').textContent).toBe('hi {{ user.username }}');
  });

  it('opens the list on {{ and replaces the braces with the choice', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox'), 'on {{{{');
    await user.click(await screen.findByRole('option', { name: /Server name/ }));
    expect(screen.getByTestId('value').textContent).toBe('on {{ server.name }}');
  });
});
