// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ModalShell from '../components/ModalShell';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

function Demo({ onClose = () => {}, closeOnBackdrop = true }) {
  return (
    <ModalShell
      onClose={onClose}
      titleId="demo-title"
      closeOnBackdrop={closeOnBackdrop}
      backdropClassName="bg-slate-950/60 flex items-center justify-center p-4"
      panelClassName="bg-white rounded-3xl"
    >
      <h2 id="demo-title">Judul Demo</h2>
      <button type="button">Pertama</button>
      <button type="button">Terakhir</button>
    </ModalShell>
  );
}

function getBackdrop() {
  return screen.getByRole('dialog').parentElement;
}

describe('ModalShell', () => {
  it('merender dialog dengan ARIA yang benar dan kelas lama dipertahankan', () => {
    render(<Demo />);
    const dialog = screen.getByRole('dialog');

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('demo-title');
    expect(document.getElementById('demo-title').textContent).toBe('Judul Demo');
    expect(dialog.className).toContain('bg-white');
    expect(getBackdrop().className).toContain('fixed inset-0 z-50');
    expect(getBackdrop().className).toContain('bg-slate-950/60');
  });

  it('memakai aria-label bila tidak ada titleId', () => {
    render(
      <ModalShell onClose={() => {}} label="Pratinjau foto">
        <button type="button">X</button>
      </ModalShell>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Pratinjau foto');
    expect(dialog.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('menutup lewat tombol Escape', () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('memindahkan fokus awal ke panel dialog', () => {
    render(<Demo />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('menjebak Tab di elemen terakhir dan Shift+Tab di elemen pertama', () => {
    render(<Demo />);
    const [first, last] = screen.getAllByRole('button');

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('mengembalikan fokus ke pemicu saat ditutup', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Buka modal';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<Demo />);
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('mengunci scroll body dan memulihkannya', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = render(<Demo />);

    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('menutup saat backdrop diklik, tetapi tidak saat panel diklik', () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(getBackdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('tidak menutup saat backdrop diklik bila closeOnBackdrop=false (Escape tetap menutup)', () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} closeOnBackdrop={false} />);

    fireEvent.click(getBackdrop());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hanya modal teratas yang menangani Escape saat bertumpuk', () => {
    const bottomClose = vi.fn();
    const topClose = vi.fn();
    render(
      <>
        <ModalShell onClose={bottomClose} label="Modal bawah" panelClassName="bg-white">
          <button type="button">Bawah</button>
        </ModalShell>
        <ModalShell onClose={topClose} label="Modal atas" panelClassName="bg-white">
          <button type="button">Atas</button>
        </ModalShell>
      </>,
    );

    const dialogs = screen.getAllByRole('dialog');
    expect(document.activeElement).toBe(dialogs[1]);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(topClose).toHaveBeenCalledTimes(1);
    expect(bottomClose).not.toHaveBeenCalled();
  });
});
