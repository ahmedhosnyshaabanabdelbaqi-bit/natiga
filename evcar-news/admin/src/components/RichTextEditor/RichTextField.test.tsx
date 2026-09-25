import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { allowedImageUrl, allowedVideoUrl, isAllowedLink } from './embeds';
import { RichTextField } from './RichTextField';

describe('embed allowlists', () => {
  it('accepts only YouTube video URLs over https', () => {
    expect(allowedVideoUrl('https://www.youtube.com/watch?v=abc123')).toBe(
      'https://www.youtube.com/watch?v=abc123',
    );
    expect(allowedVideoUrl('https://youtu.be/abc123')).toBe('https://youtu.be/abc123');
    expect(allowedVideoUrl('https://www.youtube.com/embed/abc123')).not.toBeNull();
    expect(allowedVideoUrl('http://www.youtube.com/watch?v=abc123')).toBeNull();
    expect(allowedVideoUrl('https://evil.example/watch?v=abc')).toBeNull();
    expect(allowedVideoUrl('https://www.youtube.com.evil.example/watch?v=abc')).toBeNull();
    expect(allowedVideoUrl('https://www.youtube.com/')).toBeNull();
  });
  it('accepts https images only and rejects script links', () => {
    expect(allowedImageUrl('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
    expect(allowedImageUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(allowedImageUrl('http://cdn.example/a.jpg')).toBeNull();
    expect(isAllowedLink('javascript:alert(1)')).toBe(false);
    expect(isAllowedLink('https://evcar.news')).toBe(true);
    expect(isAllowedLink('mailto:news@evcar.news')).toBe(true);
  });
});

describe('<RichTextField>', () => {
  it('renders an RTL editing area for Arabic content with a localized toolbar', async () => {
    render(
      <MantineProvider env="test">
        <RichTextField label="Body" lang="ar" value="<p>مرحبا</p>" onChange={() => undefined} />
      </MantineProvider>,
    );
    const area = await screen.findByLabelText('Body', { selector: '[contenteditable]' });
    expect(area).toHaveAttribute('dir', 'rtl');
    expect(area).toHaveTextContent('مرحبا');
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Embed video' })).toBeInTheDocument();
  });

  it('refuses non-allow-listed video hosts and embeds YouTube via youtube-nocookie', async () => {
    const onChange = vi.fn();
    render(
      <MantineProvider env="test">
        <RichTextField label="Body" lang="en" value="<p>Intro</p>" onChange={onChange} />
      </MantineProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Embed video' }));
    const dialog = await screen.findByRole('dialog');
    const url = within(dialog).getByLabelText('URL');
    await user.type(url, 'https://evil.example/video');
    await user.click(within(dialog).getByRole('button', { name: 'Insert' }));
    expect(
      within(dialog).getByText('This video host is not allowed. Use a YouTube video link.'),
    ).toBeInTheDocument();

    await user.clear(url);
    await user.type(url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await user.click(within(dialog).getByRole('button', { name: 'Insert' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const html = onChange.mock.calls.at(-1)![0] as string;
    expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('requires alt text for images', async () => {
    render(
      <MantineProvider env="test">
        <RichTextField label="Body" lang="en" value="" onChange={() => undefined} />
      </MantineProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Insert image' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('URL'), 'https://cdn.example/car.jpg');
    await user.click(within(dialog).getByRole('button', { name: 'Insert' }));
    expect(within(dialog).getByText('Alternative text is required')).toBeInTheDocument();
  });
});
