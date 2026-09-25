import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
import type { Money } from '@/api/types';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable, type DataTableColumn, type SortState } from './DataTable';
import { LocalizedTextInputs } from './LocalizedTextInputs';
import { MoneyInput } from './MoneyInput';
import { SourceReliabilityBadge } from './SourceReliabilityBadge';
import { ErrorState } from './StateViews';
import { StatusBadge } from './StatusBadge';
import { UnitInput } from './UnitInput';

function wrap(ui: ReactNode) {
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
}

interface Row {
  id: string;
  name: string;
}

describe('<DataTable>', () => {
  const columns: DataTableColumn<Row>[] = [
    { key: 'name', header: 'Name', sortable: true, render: (r) => r.name },
    { key: 'id', header: 'ID', render: (r) => r.id },
  ];

  it('renders rows, range text and cycles sorting asc → desc → none', async () => {
    const onSort = vi.fn();
    function Harness() {
      const [sort, setSort] = useState<SortState | null>(null);
      return (
        <DataTable
          caption="Things"
          columns={columns}
          rows={[
            { id: '1', name: 'Alpha' },
            { id: '2', name: 'Beta' },
          ]}
          rowKey={(r) => r.id}
          total={42}
          page={2}
          pageSize={20}
          onPageChange={() => undefined}
          sort={sort}
          onSortChange={(s) => {
            onSort(s);
            setSort(s);
          }}
        />
      );
    }
    wrap(<Harness />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('21–40 of 42')).toBeInTheDocument();
    const user = userEvent.setup();
    const header = screen.getByRole('button', { name: /Name/ });
    await user.click(header);
    await user.click(screen.getByRole('button', { name: /Name/ }));
    await user.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSort.mock.calls.map((c) => c[0])).toEqual([
      { field: 'name', direction: 'asc' },
      { field: 'name', direction: 'desc' },
      null,
    ]);
  });

  it('shows the empty state and the error state', () => {
    const { rerender } = wrap(
      <DataTable
        caption="x"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        total={0}
        page={1}
        pageSize={20}
        onPageChange={() => undefined}
      />,
    );
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    rerender(
      <MantineProvider env="test">
        <DataTable
          caption="x"
          columns={columns}
          rows={undefined}
          rowKey={(r) => r.id}
          page={1}
          pageSize={20}
          onPageChange={() => undefined}
          error={
            new ApiError({
              status: 403,
              code: 'FORBIDDEN',
              message: 'Missing permission users.read',
            })
          }
        />
      </MantineProvider>,
    );
    expect(screen.getByText('Missing permission users.read')).toBeInTheDocument();
  });

  it('supports keyboard row activation', async () => {
    const onRow = vi.fn();
    wrap(
      <DataTable
        caption="x"
        columns={columns}
        rows={[{ id: '1', name: 'Alpha' }]}
        rowKey={(r) => r.id}
        total={1}
        page={1}
        pageSize={20}
        onPageChange={() => undefined}
        onRowClick={onRow}
      />,
    );
    const row = screen.getByText('Alpha').closest('tr')!;
    row.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(onRow).toHaveBeenCalledWith({ id: '1', name: 'Alpha' });
  });
});

describe('<ConfirmDialog>', () => {
  it('requires typing the confirmation text and closes after an async confirm', async () => {
    const onConfirm = vi.fn(async () => undefined);
    const onClose = vi.fn();
    wrap(
      <ConfirmDialog
        opened
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete?"
        message="Gone forever"
        danger
        requireText="DELETE"
        confirmLabel="Delete"
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.click(confirm);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('stays open when the action fails', async () => {
    const onClose = vi.fn();
    wrap(
      <ConfirmDialog
        opened
        onClose={onClose}
        onConfirm={() => Promise.reject(new Error('boom'))}
        title="t"
        message="m"
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('<MoneyInput>', () => {
  it('emits decimal strings, null for empty, and accepts Arabic digits', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<Money | null>(null);
      return (
        <MoneyInput
          label="Price"
          value={value}
          currencies={['EGP', 'SAR']}
          onChange={(v) => {
            onChange(v);
            setValue(v);
          }}
        />
      );
    }
    wrap(<Harness />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('Price');
    await user.type(input, '١٢٥٠٫٥');
    expect(onChange).toHaveBeenLastCalledWith({ amount: '1250.5', currency: 'EGP' });
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
    await user.type(input, '1.234');
    expect(screen.getByText('Enter a number with up to 2 decimals')).toBeInTheDocument();
  });
});

describe('<UnitInput>', () => {
  it('keeps empty as null and shows the canonical unit', async () => {
    const onChange = vi.fn();
    wrap(<UnitInput label="Range" unit="km" value={null} onChange={onChange} />);
    expect(screen.getByText('km')).toBeInTheDocument();
    const user = userEvent.setup();
    const input = screen.getByLabelText('Range');
    await user.type(input, '450');
    expect(onChange).toHaveBeenLastCalledWith(450, { originalValue: 450, originalUnit: 'km' });
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null, { originalValue: null, originalUnit: 'km' });
  });
});

describe('<LocalizedTextInputs>', () => {
  it('renders Arabic RTL and English LTR fields side by side', async () => {
    const onChange = vi.fn();
    wrap(
      <LocalizedTextInputs
        label="Name"
        value={{ ar: '', en: '' }}
        onChange={onChange}
        required={['ar']}
      />,
    );
    const ar = screen.getByLabelText(/Name \(العربية\)/);
    const en = screen.getByLabelText(/Name \(English\)/);
    // Mantine sets `dir` on the input wrapper; the input inherits it.
    expect(ar.closest('[dir]')).toHaveAttribute('dir', 'rtl');
    expect(ar).toHaveAttribute('lang', 'ar');
    expect(ar).toBeRequired();
    expect(en.closest('[dir]')).toHaveAttribute('dir', 'ltr');
    expect(en).not.toBeRequired();
    await userEvent.setup().type(en, 'X');
    expect(onChange).toHaveBeenLastCalledWith({ ar: '', en: 'X' });
  });
});

describe('badges and states', () => {
  it('StatusBadge labels workflow states with text (not colour only)', () => {
    wrap(
      <>
        <StatusBadge status="in_review" />
        <StatusBadge status="published" />
      </>,
    );
    expect(screen.getByText('In review')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('SourceReliabilityBadge treats a missing value as unverified', () => {
    wrap(
      <>
        <SourceReliabilityBadge
          reliability="manufacturer_claim"
          sourceName="BYD press kit"
          verifiedAt="2026-05-01"
        />
        <SourceReliabilityBadge reliability={null} />
      </>,
    );
    expect(screen.getByText('Manufacturer claim')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });

  it('ErrorState shows network errors with a retry and the request id for server errors', async () => {
    const retry = vi.fn();
    const { rerender } = wrap(
      <ErrorState
        error={new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'x' })}
        onRetry={retry}
      />,
    );
    expect(screen.getByText('Cannot reach the server')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    rerender(
      <MantineProvider env="test">
        <ErrorState
          error={
            new ApiError({ status: 500, code: 'INTERNAL', message: 'HTTP 500', requestId: 'rid-9' })
          }
        />
      </MantineProvider>,
    );
    expect(screen.getByText('The server failed to process the request.')).toBeInTheDocument();
    expect(screen.getByText('rid-9')).toBeInTheDocument();
  });
});
