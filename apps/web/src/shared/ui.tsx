import type { ReactNode } from 'react';
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  ComboBox,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  DialogTrigger,
  Group,
  Heading,
  I18nProvider,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Modal,
  ModalOverlay,
  Popover,
  Select,
  SelectValue,
  type Key,
} from 'react-aria-components';
import { parseAbsoluteToLocal, type ZonedDateTime } from '@internationalized/date';
import { CalendarBlank, CaretDown } from '@phosphor-icons/react';

export type Option = { value: string; label: string };

// On a mouse/keyboard screen, lists longer than this get type-to-search. Touch screens always get
// the plain scrollable list: React Aria does not open a search box's list on tap (it waits for
// typing), and a list needs no on-screen keyboard.
const SEARCH_FROM = 8;
const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

const listItem =
  'cursor-pointer rounded-md px-3 py-2.5 text-sm outline-none data-focused:bg-brand-50 data-selected:font-semibold data-selected:text-brand-800 data-disabled:opacity-50';
const popover =
  'min-w-(--trigger-width) max-w-[calc(100vw-2rem)] rounded-lg border border-stone-200 bg-white shadow-lg';

/**
 * Single-choice dropdown. Searchable (type to filter) when the list is long, a plain list
 * otherwise. `value` '' means nothing picked; `emptyLabel` adds a pickable "nothing" entry.
 */
export function Choice({
  label,
  hideLabel,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  emptyLabel,
  isDisabled,
  isRequired,
  className = '',
}: {
  label: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  emptyLabel?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  className?: string;
}) {
  const items = emptyLabel ? [{ value: '', label: emptyLabel }, ...options] : options;
  const labelEl = <Label className={hideLabel ? 'sr-only' : 'label'}>{label}</Label>;
  const change = (key: Key | null) => onChange(key == null ? '' : String(key));
  const list = (
    <Popover className={popover}>
      <ListBox
        className="max-h-72 overflow-auto p-1 outline-none"
        items={items}
        renderEmptyState={() => <p className="muted px-3 py-2">No match</p>}
      >
        {(o) => (
          <ListBoxItem id={o.value} textValue={o.label} className={listItem}>
            {o.label}
          </ListBoxItem>
        )}
      </ListBox>
    </Popover>
  );

  if (options.length > SEARCH_FROM && !touch) {
    return (
      <ComboBox
        className={className}
        selectedKey={value || null}
        onSelectionChange={change}
        defaultItems={items}
        isDisabled={isDisabled}
        isRequired={isRequired}
        menuTrigger="focus"
      >
        {labelEl}
        <div className="relative">
          <Input className="input pr-10 data-disabled:bg-stone-50" placeholder={placeholder} />
          <Button
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-stone-500"
            aria-label="Show options"
          >
            <CaretDown size={16} aria-hidden />
          </Button>
        </div>
        {list}
      </ComboBox>
    );
  }

  return (
    <Select
      className={className}
      selectedKey={value || (emptyLabel ? '' : null)}
      onSelectionChange={change}
      isDisabled={isDisabled}
      isRequired={isRequired}
      placeholder={placeholder}
    >
      {labelEl}
      <Button className="input flex items-center justify-between gap-2 text-left data-disabled:bg-stone-50 data-disabled:text-stone-500">
        <SelectValue className="truncate data-placeholder:text-stone-500" />
        <CaretDown size={16} className="shrink-0 text-stone-500" aria-hidden />
      </Button>
      {list}
    </Select>
  );
}

/** Date and time in the browser's time zone. `value` and `onChange` use ISO strings. */
export function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  // en-IN: day/month/year whatever the browser's language, matching fmt() elsewhere.
  return (
    <I18nProvider locale="en-IN">
      <DatePicker
        value={value ? parseAbsoluteToLocal(value) : null}
        onChange={(v: ZonedDateTime | null) => v && onChange(v.toDate().toISOString())}
        granularity="minute"
        hideTimeZone
        hourCycle={12}
        isRequired
      >
        <Label className="label">{label}</Label>
        <Group className="input flex items-center gap-1 py-1 pr-1">
          <DateInput className="flex flex-1 flex-wrap tabular-nums">
            {(segment) => (
              <DateSegment
                segment={segment}
                className="rounded px-0.5 py-1 outline-none data-focused:bg-brand-100 data-focused:text-brand-900 data-placeholder:text-stone-400"
              />
            )}
          </DateInput>
          <Button
            className="flex size-9 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100"
            aria-label="Open calendar"
          >
            <CalendarBlank size={18} aria-hidden />
          </Button>
        </Group>
        <Popover className={`${popover} p-3`}>
          <Dialog className="outline-none">
            <Calendar>
              <header className="mb-2 flex items-center justify-between">
                <Button slot="previous" className="btn min-h-9 px-3" aria-label="Previous month">
                  ‹
                </Button>
                <Heading className="text-sm font-semibold" />
                <Button slot="next" className="btn min-h-9 px-3" aria-label="Next month">
                  ›
                </Button>
              </header>
              <CalendarGrid className="border-separate border-spacing-0.5">
                {(date) => (
                  <CalendarCell
                    date={date}
                    className="flex size-10 cursor-pointer items-center justify-center rounded-md text-sm outline-none hover:bg-stone-100 data-disabled:text-stone-300 data-focused:ring-2 data-focused:ring-brand-300 data-outside-month:invisible data-selected:bg-brand-700 data-selected:text-white"
                  />
                )}
              </CalendarGrid>
            </Calendar>
          </Dialog>
        </Popover>
      </DatePicker>
    </I18nProvider>
  );
}

/** Accessible replacement for window.confirm(): a button that asks before calling onConfirm. */
export function ConfirmButton({
  children,
  title,
  message,
  confirmLabel,
  onConfirm,
  className = 'btn btn-danger',
}: {
  children: ReactNode;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}) {
  return (
    <DialogTrigger>
      <Button className={className}>{children}</Button>
      <ModalOverlay
        isDismissable
        className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      >
        <Modal className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
          <Dialog role="alertdialog" className="outline-none">
            {({ close }) => (
              <>
                <Heading slot="title" className="card-title">
                  {title}
                </Heading>
                <p className="mt-2 text-sm text-stone-700">{message}</p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button className="btn" onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    className="btn btn-danger"
                    onPress={() => {
                      close();
                      onConfirm();
                    }}
                  >
                    {confirmLabel}
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
