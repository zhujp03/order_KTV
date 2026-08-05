/**
 * Targeted tests for the Samsung Android employee app UI fixes.
 *
 * Covers: billing-mode switching, customer aggregation and totals, no
 * duplicate finished orders, dish notes, module-level component stability
 * across polling, merged/split rendering rules, settlement endpoints and
 * the absence of /checkout-status.
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import App, {
  DetailScreen,
  OrderCard,
  CustomerCard,
  buildCustomerGroups,
  customerPayableTotal,
  isPendingStatus,
  resolveBillingMode,
  canCheckoutFromUi,
  syncSelectedZoneFromZones,
  getZoneCustomerCounts,
  createStyles,
  useScale,
  DESIGN,
  I18N,
  formatMoney,
  formatTime,
  OverviewScreen,
  ZoneCard,
  getOverviewLayout,
} from '../App';
import type { Order, Zone, ZoneCheckoutStatus } from '../App';
import { Modal, ScrollView, Text } from 'react-native';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeOrder(overrides: Partial<Order> & { id: string }): Order {
  return {
    zoneId: 'zone-1',
    zoneLabel: 'VIP A1',
    customerName: 'test',
    handledByEmployeeUsername: 'staff1',
    items: [
      { itemId: 1001, name: 'Highball', quantity: 1, subtotal: 29.33, served: false },
    ],
    note: '',
    total: 29.33,
    status: 'new',
    createdAt: '2024-01-01T11:37:00Z',
    ...overrides,
  };
}

const zone: Zone = {
  id: 'zone-1',
  label: 'VIP A1',
  activeOrderCount: 2,
  activeOrderTotal: 61.33,
  billingMode: 'merged',
  sessionOpen: true,
  canCheckout: true,
  unsettledCustomerCount: 1,
};

const zoneCheckoutStatus: Record<string, ZoneCheckoutStatus> = {
  'zone-1': {
    settlements: {},
    billingMode: 'merged',
    sessionOpen: true,
    unsettledCustomerCount: 1,
    canCheckout: true,
  },
};

const dict = I18N.zh;
const colors = DESIGN.colors;

function StylesProvider({ children }: {
  children: (ctx: {
    scale: ReturnType<typeof useScale>;
    styles: ReturnType<typeof createStyles>;
    colors: typeof DESIGN.colors;
  }) => React.ReactElement;
}) {
  const scale = useScale();
  const styles = useMemo(() => createStyles(scale), [scale]);
  return children({ scale, styles, colors: DESIGN.colors });
}

function baseDetailProps(overrides: Record<string, unknown> = {}) {
  return {
    selectedZone: zone,
    zoneCheckoutStatus,
    zones: [zone],
    orders: [] as Order[],
    dict,
    lang: 'zh' as const,
    styles: {} as ReturnType<typeof createStyles>,
    colors,
    onBack: jest.fn(),
    onSwitchBillingMode: jest.fn().mockResolvedValue(undefined),
    onOpenSession: jest.fn().mockResolvedValue(undefined),
    onCheckoutZone: jest.fn().mockResolvedValue(undefined),
    onPrintReceipt: jest.fn().mockResolvedValue(undefined),
    onOpenBottomAddDish: jest.fn(),
    onUpdateOrderStatus: jest.fn().mockResolvedValue(undefined),
    onUpdateItemServed: jest.fn().mockResolvedValue(undefined),
    onUpdateItemQuantity: jest.fn().mockResolvedValue(undefined),
    onOpenAddDish: jest.fn(),
    onUpdateCustomerSettlement: jest.fn().mockResolvedValue(undefined),
    onPrintCustomerReceipt: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderDetail(overrides: Record<string, unknown> = {}): ReactTestRenderer {
  const selected = (overrides.selectedZone as Zone | undefined) || zone;
  const props = baseDetailProps({
    zoneCheckoutStatus: overrides.zoneCheckoutStatus ?? {
      settlements: {},
      billingMode: selected.billingMode || 'merged',
      sessionOpen: selected.sessionOpen,
      unsettledCustomerCount: selected.unsettledCustomerCount,
      canCheckout: selected.canCheckout,
    },
    ...overrides,
  });
  let instance!: ReactTestRenderer;
  act(() => {
    instance = renderer.create(
      <StylesProvider>
        {ctx => <DetailScreen {...props} styles={ctx.styles} />}
      </StylesProvider>,
    );
  });
  return instance;
}

function orderCardCount(root: ReactTestRenderer, orderId: string): number {
  return root.root.findAllByType(OrderCard).filter(card => card.props.order.id === orderId).length;
}

function customerCardCount(root: ReactTestRenderer): number {
  return root.root.findAllByType(CustomerCard).length;
}

function findPressableByTestID(root: ReactTestRenderer, testID: string) {
  const nodes = root.root.findAll(node => node.props && node.props.testID === testID);
  return nodes.find(n => 'disabled' in n.props) || nodes[0] || null;
}

function anyNodeWithTestID(root: ReactTestRenderer, testID: string): boolean {
  return root.root.findAll(node => node.props && node.props.testID === testID).length > 0;
}

function anyNodeWithTestIDPrefix(root: ReactTestRenderer, prefix: string): boolean {
  return root.root.findAll(node => {
    const testID = node.props && node.props.testID;
    return typeof testID === 'string' && testID.startsWith(prefix);
  }).length > 0;
}

function viewCount(root: ReactTestRenderer, testID: string): number {
  return root.root.findAll(node => (node.type as unknown as string) === 'View' && node.props.testID === testID).length;
}

function allStrings(root: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number') {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
    }
  };
  root.root.findAll(node => {
    const children = node.props && node.props.children;
    walk(children);
    return false;
  });
  return out;
}

// ---------------------------------------------------------------------------
// 1-4. Billing mode switching
// ---------------------------------------------------------------------------

describe('Billing mode switching', () => {
  test('clicking 分单 calls PATCH billing-mode with split and updates immediately', async () => {
    const onSwitch = jest.fn().mockResolvedValue(undefined);
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged' },
      onSwitchBillingMode: onSwitch,
    });

    const splitBtn = instance.root.findByProps({ testID: 'mode-split' });
    // Current mode is merged -> merged button active, split button is the switch target
    expect(StyleSheet.flatten(instance.root.findByProps({ testID: 'mode-merged' }).props.style).backgroundColor)
      .toBe(colors.primary);

    await act(async () => {
      splitBtn.props.onPress();
    });

    expect(onSwitch).toHaveBeenCalledWith('zone-1', 'split');

    // Simulate the parent applying the successful response: re-render with split
    act(() => {
      instance.update(
        <StylesProvider>
          {ctx => (
            <DetailScreen
              {...baseDetailProps({
                selectedZone: { ...zone, billingMode: 'split' },
                zoneCheckoutStatus: {
                  'zone-1': { settlements: {}, billingMode: 'split', sessionOpen: true, unsettledCustomerCount: 1, canCheckout: true },
                },
                onSwitchBillingMode: onSwitch,
              })}
              styles={ctx.styles}
            />
          )}
        </StylesProvider>,
      );
    });

    const splitAfter = findPressableByTestID(instance, 'mode-split');
    const mergedAfter = findPressableByTestID(instance, 'mode-merged');
    expect(StyleSheet.flatten(splitAfter.props.style).backgroundColor).toBe(colors.primary);
    expect(StyleSheet.flatten(mergedAfter.props.style).backgroundColor).not.toBe(colors.primary);
    // After the switch, split is the active (disabled) mode; merged is the switch target
    expect(splitAfter.props.disabled).toBe(true);
    expect(mergedAfter.props.disabled).toBe(false);
    // No full-screen overlay while switching: the detail screen is still rendered
    expect(instance.root.findByProps({ testID: 'detail-screen' })).toBeTruthy();
  });

  test('clicking 合单 sends merged and switches without leaving the page', async () => {
    const onSwitch = jest.fn().mockResolvedValue(undefined);
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      onSwitchBillingMode: onSwitch,
    });

    await act(async () => {
      instance.root.findByProps({ testID: 'mode-merged' }).props.onPress();
    });
    expect(onSwitch).toHaveBeenCalledWith('zone-1', 'merged');

    act(() => {
      instance.update(
        <StylesProvider>
          {ctx => (
            <DetailScreen
              {...baseDetailProps({
                selectedZone: { ...zone, billingMode: 'merged' },
                zoneCheckoutStatus: {
                  'zone-1': { settlements: {}, billingMode: 'merged', sessionOpen: true, unsettledCustomerCount: 0, canCheckout: true },
                },
                onSwitchBillingMode: onSwitch,
              })}
              styles={ctx.styles}
            />
          )}
        </StylesProvider>,
      );
    });

    const mergedAfter = findPressableByTestID(instance, 'mode-merged');
    expect(StyleSheet.flatten(mergedAfter.props.style).backgroundColor).toBe(colors.primary);
    // Still on the detail page (no need to re-enter from the overview)
    expect(instance.root.findByProps({ testID: 'detail-screen' })).toBeTruthy();
  });

  test('current mode button cannot be re-submitted', async () => {
    const onSwitch = jest.fn();
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged' },
      onSwitchBillingMode: onSwitch,
    });
    const mergedBtn = instance.root.findByProps({ testID: 'mode-merged' });
    expect(mergedBtn.props.disabled).toBe(true);
    await act(async () => {
      mergedBtn.props.onPress();
    });
    expect(onSwitch).not.toHaveBeenCalled();
  });

  test('mode toggle buttons have touch targets of at least 48', () => {
    const instance = renderDetail();
    const splitBtn = instance.root.findByProps({ testID: 'mode-split' });
    const style = StyleSheet.flatten(splitBtn.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });
});

// ---------------------------------------------------------------------------
// 5-13. Customer aggregation, totals, duplicate prevention, merged rules
// ---------------------------------------------------------------------------

describe('Customer aggregation in split mode', () => {
  const order1 = makeOrder({ id: 'order-1', customerName: 'test', total: 29.33, createdAt: '2024-01-01T11:37:00Z' });
  const order2 = makeOrder({
    id: 'order-2',
    customerName: 'test',
    total: 32.00,
    createdAt: '2024-01-01T11:39:00Z',
    items: [
      { itemId: 2001, name: 'Whiskey Sour', quantity: 1, subtotal: 32.00, served: false },
    ],
  });

  test('two orders with the same customer name produce a single CustomerCard', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      orders: [order1, order2],
    });

    expect(customerCardCount(instance)).toBe(1);
    const card = instance.root.findAllByType(CustomerCard)[0];
    expect(card.props.customerName).toBe('test');
  });

  test('customer total equals the sum of non-cancelled order totals', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      orders: [order1, order2],
    });
    const strings = allStrings(instance);
    expect(strings).toContain(formatMoney(29.33 + 32.00));
    expect(strings).toContain('$61.33');
  });

  test('both order times are preserved inside the same customer box', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      orders: [order1, order2],
    });
    const strings = allStrings(instance);
    expect(strings).toContain(formatTime(order1.createdAt));
    expect(strings).toContain(formatTime(order2.createdAt));
  });

  test('both orders and their items render inside the same box; no duplicate order ids', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      orders: [order1, order2],
    });
    expect(orderCardCount(instance, 'order-1')).toBe(1);
    expect(orderCardCount(instance, 'order-2')).toBe(1);

    const strings = allStrings(instance);
    expect(strings).toContain('Highball');
    expect(strings).toContain('Whiskey Sour');
  });

  test('served orders count toward the customer total', () => {
    const groups = buildCustomerGroups(
      [makeOrder({ id: 'a', status: 'served', total: 29.33 }), makeOrder({ id: 'b', status: 'served', total: 32.00 })],
      dict.guest,
    );
    expect(groups[0].total).toBeCloseTo(61.33, 2);
  });

  test('cancelled orders do not count toward the customer total', () => {
    const groups = buildCustomerGroups(
      [makeOrder({ id: 'a', status: 'new', total: 29.33 }), makeOrder({ id: 'b', status: 'cancelled', total: 32.00 })],
      dict.guest,
    );
    expect(groups[0].total).toBeCloseTo(29.33, 2);
    // cancelled order still lives inside the customer box (collapsible section)
    expect(groups[0].orders.map(o => o.id).sort()).toEqual(['a', 'b']);
  });

  test('each customer shows exactly one settlement button', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      orders: [order1, order2],
    });
    // One CustomerCard for the customer -> the settlement button is rendered once
    // (CustomerCard renders a single settlement + print action row).
    const cards = instance.root.findAllByType(CustomerCard);
    expect(cards.length).toBe(1);
    expect(anyNodeWithTestID(instance, 'customer-settlement-test')).toBe(true);
    expect(anyNodeWithTestID(instance, 'customer-print-test')).toBe(true);
  });

  test('merged mode shows no customer-level settlement buttons', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged' },
      orders: [order1, order2],
    });
    expect(anyNodeWithTestIDPrefix(instance, 'customer-settlement')).toBe(false);
  });

  test('grouping trims customer names and falls back to the guest label', () => {
    const groups = buildCustomerGroups(
      [
        makeOrder({ id: 'a', customerName: '  test  ' }),
        makeOrder({ id: 'b', customerName: '' }),
      ],
      dict.guest,
    );
    expect(groups.length).toBe(2);
    expect(groups.find(g => g.customerName === 'test')).toBeTruthy();
    expect(groups.find(g => g.customerName === dict.guest)).toBeTruthy();
  });

  test('customer orders are sorted by createdAt ascending', () => {
    const groups = buildCustomerGroups(
      [order2, order1],
      dict.guest,
    );
    expect(groups[0].orders[0].id).toBe('order-1');
    expect(groups[0].orders[1].id).toBe('order-2');
  });

  test('pure customer total helper ignores cancelled orders', () => {
    expect(customerPayableTotal([makeOrder({ id: 'a', status: 'served', total: 10 }), makeOrder({ id: 'b', status: 'cancelled', total: 99 })])).toBe(10);
  });

  test('status partitioning helper classifies pending and closed orders', () => {
    expect(isPendingStatus('new')).toBe(true);
    expect(isPendingStatus('preparing')).toBe(true);
    expect(isPendingStatus('ready')).toBe(true);
    expect(isPendingStatus('served')).toBe(false);
    expect(isPendingStatus('cancelled')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 14-16. Dish notes
// ---------------------------------------------------------------------------

describe('Dish notes', () => {
  test('order with a note shows the 餐品备注 label', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      orders: [makeOrder({ id: 'o1', note: '请少放冰' })],
    });
    expect(viewCount(instance, 'dish-note')).toBe(1);
    const strings = allStrings(instance);
    expect(strings).toContain(dict.dishNote);
    expect(strings).toContain('请少放冰');
  });

  test('note text style is at least 18sp and high contrast', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged' },
      orders: [makeOrder({ id: 'o1', note: 'please be quick' })],
    });
    const noteBlock = instance.root.findByProps({ testID: 'dish-note' });
    // Find the note body text node (not the label)
    const texts = noteBlock.findAll(node => (node.type as unknown as string) === 'Text' && typeof node.props.children === 'string');
    const body = texts.find(t => t.props.children === 'please be quick');
    expect(body).toBeTruthy();
    const flattened = StyleSheet.flatten(body!.props.style);
    expect(flattened.fontSize).toBeGreaterThanOrEqual(18);
    // Not the weak muted color; dark text on the light-yellow container
    expect(flattened.color).not.toBe(colors.textMuted);
  });

  test('orders without a note render no note area', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      orders: [makeOrder({ id: 'o1', note: '' })],
    });
    expect(viewCount(instance, 'dish-note')).toBe(0);
  });

  test('each order keeps its own note; notes are not merged', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      orders: [
        makeOrder({ id: 'o1', note: 'note-A' }),
        makeOrder({ id: 'o2', note: 'note-B' }),
      ],
    });
    const strings = allStrings(instance);
    expect(strings).toContain('note-A');
    expect(strings).toContain('note-B');
    expect(viewCount(instance, 'dish-note')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 17-18. Polling stability: no remount, collapse state preserved
// ---------------------------------------------------------------------------

describe('Polling stability', () => {
  test('DetailScreen, OrderCard and CustomerCard instances survive order updates', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      orders: [
        makeOrder({ id: 'o1', customerName: 'Alice' }),
        makeOrder({ id: 'o2', customerName: 'Bob' }),
      ],
    });

    const detailBefore = instance.root.findByType(DetailScreen);
    const orderCardBefore = instance.root.findAllByType(OrderCard).map(c => c);
    const customerCardBefore = instance.root.findAllByType(CustomerCard).map(c => c);

    // Simulate two poll cycles (orders/zones state refresh)
    act(() => {
      instance.update(
        <StylesProvider>
          {ctx => (
            <DetailScreen
              {...baseDetailProps({
                selectedZone: { ...zone, billingMode: 'split' },
                zoneCheckoutStatus: {
                  'zone-1': { settlements: {}, billingMode: 'split', sessionOpen: true, unsettledCustomerCount: 1, canCheckout: true },
                },
                orders: [
                  makeOrder({ id: 'o1', customerName: 'Alice', status: 'preparing' }),
                  makeOrder({ id: 'o2', customerName: 'Bob', status: 'ready' }),
                ],
              })}
              styles={ctx.styles}
            />
          )}
        </StylesProvider>,
      );
    });
    act(() => {
      instance.update(
        <StylesProvider>
          {ctx => (
            <DetailScreen
              {...baseDetailProps({
                selectedZone: { ...zone, billingMode: 'split' },
                zoneCheckoutStatus: {
                  'zone-1': { settlements: {}, billingMode: 'split', sessionOpen: true, unsettledCustomerCount: 1, canCheckout: true },
                },
                orders: [
                  makeOrder({ id: 'o1', customerName: 'Alice', status: 'preparing' }),
                  makeOrder({ id: 'o2', customerName: 'Bob', status: 'ready' }),
                  makeOrder({ id: 'o3', customerName: 'Carol', status: 'new' }),
                ],
              })}
              styles={ctx.styles}
            />
          )}
        </StylesProvider>,
      );
    });

    // Same component instances: nothing was unmounted/remounted
    expect(instance.root.findByType(DetailScreen)).toBe(detailBefore);
    const orderCardsNow = instance.root.findAllByType(OrderCard);
    expect(orderCardsNow).toContain(orderCardBefore[0]);
    expect(orderCardsNow).toContain(orderCardBefore[1]);
    const customerCardsNow = instance.root.findAllByType(CustomerCard);
    expect(customerCardsNow).toContain(customerCardBefore[0]);
    expect(customerCardsNow).toContain(customerCardBefore[1]);
    // Third customer joined after the poll
    expect(customerCardsNow.length).toBe(3);
  });

  test('customer closed-section collapse state survives two poll cycles', async () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      orders: [
        makeOrder({ id: 'o1', customerName: 'Alice', status: 'new' }),
        makeOrder({ id: 'o2', customerName: 'Alice', status: 'served' }),
      ],
    });

    // Expand the closed section of Alice's card
    await act(async () => {
      instance.root.findByProps({ testID: 'customer-closed-toggle-Alice' }).props.onPress();
    });
    expect(orderCardCount(instance, 'o2')).toBe(1);

    // Two poll cycles with updated orders
    for (let i = 0; i < 2; i += 1) {
      act(() => {
        instance.update(
          <StylesProvider>
            {ctx => (
              <DetailScreen
                {...baseDetailProps({
                  selectedZone: { ...zone, billingMode: 'split' },
                  zoneCheckoutStatus: {
                    'zone-1': { settlements: {}, billingMode: 'split', sessionOpen: true, unsettledCustomerCount: 0, canCheckout: true },
                  },
                  orders: [
                    makeOrder({ id: 'o1', customerName: 'Alice', status: 'preparing' }),
                    makeOrder({ id: 'o2', customerName: 'Alice', status: 'served' }),
                  ],
                })}
                styles={ctx.styles}
              />
            )}
          </StylesProvider>,
        );
      });
    }

    // Collapse state was NOT reset by polling: the served order is still visible
    expect(orderCardCount(instance, 'o2')).toBe(1);
  });

  test('merged closed section toggle also survives poll updates', async () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged' },
      orders: [makeOrder({ id: 'o1', status: 'new' }), makeOrder({ id: 'o2', status: 'served' })],
    });

    // Default collapsed: served order not rendered yet
    expect(orderCardCount(instance, 'o2')).toBe(0);
    await act(async () => {
      instance.root.findByProps({ testID: 'closed-orders-toggle' }).props.onPress();
    });
    expect(orderCardCount(instance, 'o2')).toBe(1);

    act(() => {
      instance.update(
        <StylesProvider>
          {ctx => (
            <DetailScreen
              {...baseDetailProps({
                selectedZone: { ...zone, billingMode: 'merged' },
                orders: [makeOrder({ id: 'o1', status: 'new' }), makeOrder({ id: 'o2', status: 'served' })],
              })}
              styles={ctx.styles}
            />
          )}
        </StylesProvider>,
      );
    });
    expect(orderCardCount(instance, 'o2')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Order card actions
// ---------------------------------------------------------------------------

describe('OrderCard actions', () => {
  test('accept button sends preparing and other status actions still call the API', async () => {
    const onUpdateStatus = jest.fn().mockResolvedValue(undefined);
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged' },
      onUpdateOrderStatus: onUpdateStatus,
      orders: [makeOrder({ id: 'o1', status: 'new' })],
    });
    await act(async () => {
      instance.root.findByProps({ testID: 'order-accept-o1' }).props.onPress();
    });
    expect(onUpdateStatus).toHaveBeenCalledWith('o1', 'preparing');
  });
});

// ---------------------------------------------------------------------------
// 19-20. Endpoints: customer-settlements PATCH, no /checkout-status
// ---------------------------------------------------------------------------

describe('API contract', () => {
  test('source uses GET/PATCH customer-settlements and never /checkout-status', () => {
    const fs = require('fs');
    const resolver = require as unknown as { resolve: (id: string) => string };
    const source = fs.readFileSync(resolver.resolve('../App.tsx'), 'utf8');

    // The forbidden path must not exist anywhere
    expect(source).not.toContain('/checkout-status');

    // customer-settlements must exist for both GET and PATCH
    expect(source).toContain('/api/employee/zones/${zoneId}/customer-settlements');
    const settlementBlocks = source.match(/customer-settlements[\s\S]{0,400}/g) || [];
    expect(settlementBlocks.length).toBeGreaterThanOrEqual(2);

    // No PUT usage for customer settlements
    expect(source).not.toContain("method: 'PUT'");

    // Explicit PATCH for settlements and billing mode
    expect(source).toContain("method: 'PATCH'");
  });

  test('CustomerCard settlement button triggers the customer-settlements callback', async () => {
    const onSettle = jest.fn().mockResolvedValue(undefined);
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split' },
      onUpdateCustomerSettlement: onSettle,
      orders: [makeOrder({ id: 'o1', customerName: 'test' })],
    });
    await act(async () => {
      instance.root.findByProps({ testID: 'customer-settlement-test' }).props.onPress();
    });
    expect(onSettle).toHaveBeenCalledWith('zone-1', 'test', true);
  });
});

// ---------------------------------------------------------------------------
// App shell still renders the login screen
// ---------------------------------------------------------------------------

describe('App shell', () => {
  test('renders the login screen when not authenticated', () => {
    let instance!: ReactTestRenderer;
    act(() => {
      instance = renderer.create(<App />);
    });
    const strings = allStrings(instance);
    expect(strings).toContain(dict.loginTitle);
    const inputs = instance.root.findAll(node => node.props && node.props.placeholder);
    expect(inputs.some(node => node.props.placeholder === dict.username)).toBe(true);
    expect(inputs.some(node => node.props.placeholder === dict.password)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issue 1: merged table total + whole-table checkout semantics
// ---------------------------------------------------------------------------

describe('Merged table total and checkout semantics', () => {
  test('merged mode shows the whole-room payable total once (served counts, cancelled not)', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged' },
      orders: [
        makeOrder({ id: 'a', customerName: 'Alice', status: 'new', total: 29.33 }),
        makeOrder({ id: 'b', customerName: 'Bob', status: 'served', total: 32.00 }),
        makeOrder({ id: 'c', customerName: 'Carol', status: 'cancelled', total: 99.99 }),
      ],
    });
    const value = instance.root.findByProps({ testID: 'table-total-value' });
    expect(value.props.children).toBe('$61.33');
    // exactly one table total row on the merged page
    expect(viewCount(instance, 'table-total-row')).toBe(1);
  });

  test('merged checkout is allowed even with unsettled customers, and never PATCHes settlements', async () => {
    const onCheckout = jest.fn().mockResolvedValue(undefined);
    const onSettle = jest.fn().mockResolvedValue(undefined);
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged', unsettledCustomerCount: 3 },
      zoneCheckoutStatus: {
        'zone-1': { settlements: {}, billingMode: 'merged', sessionOpen: true, unsettledCustomerCount: 3, canCheckout: true },
      },
      onCheckoutZone: onCheckout,
      onUpdateCustomerSettlement: onSettle,
      orders: [makeOrder({ id: 'a', customerName: 'Alice' })],
    });

    const btn = findPressableByTestID(instance, 'detail-checkout');
    expect(btn.props.disabled).toBe(false);
    await act(async () => {
      btn.props.onPress();
    });
    expect(onCheckout).toHaveBeenCalledWith('zone-1');
    expect(onSettle).not.toHaveBeenCalled();
  });

  test('split checkout is blocked when unsettled customers remain and checkout POST is never sent', async () => {
    const onCheckout = jest.fn();
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split', unsettledCustomerCount: 1 },
      zoneCheckoutStatus: {
        'zone-1': { settlements: {}, billingMode: 'split', sessionOpen: true, unsettledCustomerCount: 1, canCheckout: false },
      },
      onCheckoutZone: onCheckout,
      orders: [makeOrder({ id: 'a', customerName: 'Alice' })],
    });

    const btn = findPressableByTestID(instance, 'detail-checkout');
    expect(btn.props.disabled).toBe(true);
    // A disabled control does not fire onPress on a real device.
    if (!btn.props.disabled) {
      await act(async () => {
        btn.props.onPress();
      });
    }
    expect(onCheckout).not.toHaveBeenCalled();
  });

  test('split checkout is allowed once everyone is settled', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split', unsettledCustomerCount: 0 },
      zoneCheckoutStatus: {
        'zone-1': { settlements: {}, billingMode: 'split', sessionOpen: true, unsettledCustomerCount: 0, canCheckout: true },
      },
      orders: [makeOrder({ id: 'a', customerName: 'Alice' })],
    });
    expect(findPressableByTestID(instance, 'detail-checkout').props.disabled).toBe(false);
  });

  test('checkout button is disabled when the session is not open', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged', sessionOpen: false },
      zoneCheckoutStatus: {
        'zone-1': { settlements: {}, billingMode: 'merged', sessionOpen: false, unsettledCustomerCount: 0, canCheckout: true },
      },
      orders: [],
    });
    expect(findPressableByTestID(instance, 'detail-checkout').props.disabled).toBe(true);
  });

  test('canCheckoutFromUi and resolveBillingMode pure functions', () => {
    // merged: customer-level unsettled never blocks
    expect(canCheckoutFromUi(true, 'merged', 3)).toBe(true);
    expect(canCheckoutFromUi(true, 'merged', 0)).toBe(true);
    // split: any unsettled blocks
    expect(canCheckoutFromUi(true, 'split', 1)).toBe(false);
    expect(canCheckoutFromUi(true, 'split', 0)).toBe(true);
    // not open: always blocked
    expect(canCheckoutFromUi(false, 'merged', 0)).toBe(false);
    expect(canCheckoutFromUi(undefined, 'merged', 0)).toBe(false);

    const status: Record<string, ZoneCheckoutStatus> = { 'zone-1': { settlements: {}, billingMode: 'split' } };
    const zonesList: Zone[] = [{ ...zone, id: 'zone-1', billingMode: 'merged' }];
    expect(resolveBillingMode('zone-1', status, zonesList, null)).toBe('split');
    expect(resolveBillingMode('zone-1', {}, zonesList, null)).toBe('merged');
    // Unknown mode -> safe default split (backend default), never merged
    expect(resolveBillingMode('zone-1', {}, [], null)).toBe('split');
    expect(resolveBillingMode('zone-1', {}, [], { ...zone, id: 'zone-1', billingMode: 'split' })).toBe('split');
  });
});

// ---------------------------------------------------------------------------
// Issue 2: Room 1 / Room 2 race
// ---------------------------------------------------------------------------

describe('Room selection race (fetchZones)', () => {
  const room1: Zone = { id: 'room-1', label: 'Room 1', activeOrderCount: 1, activeOrderTotal: 10, billingMode: 'merged', sessionOpen: true, canCheckout: true, unsettledCustomerCount: 0 };
  const room2: Zone = { id: 'room-2', label: 'Room 2', activeOrderCount: 2, activeOrderTotal: 20, billingMode: 'merged', sessionOpen: true, canCheckout: true, unsettledCustomerCount: 0 };

  test('syncSelectedZoneFromZones never reverts to an old room', () => {
    // prev = Room 2, stale response still contains both rooms -> stays Room 2
    const result = syncSelectedZoneFromZones(room2, [room1, room2]);
    expect(result && result.id).toBe('room-2');
    // prev = null stays null
    expect(syncSelectedZoneFromZones(null, [room1, room2])).toBeNull();
    // prev id missing from the response -> keep prev
    expect(syncSelectedZoneFromZones(room2, [room1]) && syncSelectedZoneFromZones(room2, [room1])!.id).toBe('room-2');
    // normal case: fresh object for same id
    const fresh = syncSelectedZoneFromZones(room1, [{ ...room1, activeOrderTotal: 99 }]);
    expect(fresh && fresh.id).toBe('room-1');
    expect(fresh && fresh.activeOrderTotal).toBe(99);
  });

  test('stale Room 1 zones response cannot flip the title back from Room 2 (App integration)', async () => {
    jest.useFakeTimers();

    const zoneResolvers: Array<(zones: Zone[]) => void> = [];
    let autoResolveZones = false;
    const roomList = () => [room1, room2];

    const fetchMock = jest.fn((url: string, _init?: any) => {
      const path = String(url).replace('https://order.1383karaoke.ca', '');
      let body: Record<string, unknown> = {};
      if (path === '/api/employee/auth/login') {
        body = { token: 'test-token', employee: { username: 'staff' } };
        return Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => '' });
      }
      if (path === '/api/employee/zones') {
        return new Promise(resolve => {
          const resolver = (zones: Zone[]) => resolve({ ok: true, status: 200, json: async () => ({ zones }), text: async () => '' });
          zoneResolvers.push(resolver);
          if (autoResolveZones) resolver(roomList());
        });
      }
      if (path === '/api/employee/orders') body = { orders: [] };
      else if (path === '/api/employee/menu') body = { menu: [], categories: [] };
      else if (path.includes('/customer-settlements')) body = { settlements: {}, billingMode: 'merged', sessionOpen: true, unsettledCustomerCount: 0, canCheckout: true };
      else body = { ok: true };
      return Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => '' });
    });
    (globalThis as any).fetch = fetchMock;

    let root: ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<App />);
    });

    // Login
    const usernameInput = root!.root.findAll(node => node.props && node.props.placeholder === dict.username)[0];
    const passwordInput = root!.root.findAll(node => node.props && node.props.placeholder === dict.password)[0];
    await act(async () => {
      usernameInput.props.onChangeText('staff');
      passwordInput.props.onChangeText('123456');
    });
    const loginBtn = (() => {
      const textNode = root!.root.findAll(n => n.type === Text && n.props.children === dict.loginButton)[0];
      let node: any = textNode;
      while (node) {
        if (node.props && typeof node.props.onPress === 'function') return node;
        node = node.parent;
      }
      return null;
    })();
    await act(async () => {
      loginBtn.props.onPress();
    });

    // initial zones response
    await act(async () => {
      zoneResolvers.shift()!(roomList());
    });

    const findPressableByText = (text: string) => {
      const textNode = root!.root.findAll(n => n.type === Text && n.props.children === text)[0];
      let node: any = textNode;
      while (node) {
        if (node.props && typeof node.props.onPress === 'function') return node;
        node = node.parent;
      }
      return null;
    };

    // Enter Room 1 (its zones fetch stays pending = the stale request)
    await act(async () => {
      findPressableByText('Room 1')!.props.onPress();
    });
    expect(root!.root.findAll(n => n.type === Text && n.props.children === 'Room 1').length).toBeGreaterThan(0);

    // Back to overview (resolve its zones fetch)
    await act(async () => {
      findPressableByText(dict.back)!.props.onPress();
    });
    await act(async () => {
      if (zoneResolvers.length > 0) zoneResolvers.shift()!(roomList());
    });

    // Enter Room 2 (resolve its fetch)
    await act(async () => {
      findPressableByText('Room 2')!.props.onPress();
    });
    await act(async () => {
      if (zoneResolvers.length > 0) zoneResolvers.shift()!(roomList());
    });

    // Now the STALE Room 1 request finally completes with a response that also
    // contains Room 2. It must NOT flip the selection back to Room 1.
    autoResolveZones = true;
    await act(async () => {
      zoneResolvers.shift()!(roomList());
    });

    // At least two more poll cycles
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
    }

    const titles = root!.root.findAll(n => n.type === Text && (n.props.children === 'Room 1' || n.props.children === 'Room 2'));
    expect(titles.some(t => t.props.children === 'Room 2')).toBe(true);
    expect(titles.some(t => t.props.children === 'Room 1')).toBe(false);

    jest.useRealTimers();
    (globalThis as any).fetch = undefined as any;
  });

  test('polling interval is not recreated when selectedZone changes', async () => {
    jest.useFakeTimers();
    const intervalSpy = jest.spyOn(globalThis, 'setInterval');

    const fetchMock = jest.fn((url: string, _init?: any) => {
      const path = String(url).replace('https://order.1383karaoke.ca', '');
      let body: Record<string, unknown> = {};
      if (path === '/api/employee/auth/login') body = { token: 't', employee: { username: 'staff' } };
      else if (path === '/api/employee/zones') body = { zones: [room1, room2] };
      else if (path === '/api/employee/orders') body = { orders: [] };
      else if (path === '/api/employee/menu') body = { menu: [], categories: [] };
      else if (path.endsWith('/billing-mode')) body = { ok: true, billingMode: 'split', sessionOpen: true, unsettledCustomerCount: 1, canCheckout: false };
      else if (path.includes('/customer-settlements')) body = { settlements: {}, billingMode: 'split', sessionOpen: true, unsettledCustomerCount: 1, canCheckout: false };
      else body = { ok: true };
      return Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => '' });
    });
    (globalThis as any).fetch = fetchMock;

    let root: ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<App />);
    });
    const usernameInput = root!.root.findAll(node => node.props && node.props.placeholder === dict.username)[0];
    const passwordInput = root!.root.findAll(node => node.props && node.props.placeholder === dict.password)[0];
    await act(async () => {
      usernameInput.props.onChangeText('staff');
      passwordInput.props.onChangeText('123456');
    });
    const loginBtn = (() => {
      const textNode = root!.root.findAll(n => n.type === Text && n.props.children === dict.loginButton)[0];
      let node: any = textNode;
      while (node) {
        if (node.props && typeof node.props.onPress === 'function') return node;
        node = node.parent;
      }
      return null;
    })();
    await act(async () => {
      loginBtn.props.onPress();
    });

    const findPressableByText = (text: string) => {
      const textNode = root!.root.findAll(n => n.type === Text && n.props.children === text)[0];
      let node: any = textNode;
      while (node) {
        if (node.props && typeof node.props.onPress === 'function') return node;
        node = node.parent;
      }
      return null;
    };

    // enter detail -> screen change legitimately recreates the interval
    await act(async () => {
      findPressableByText('Room 1')!.props.onPress();
    });
    const intervalsAtDetail = intervalSpy.mock.calls.length;

    // switch billing mode -> selectedZone changes without a screen change
    await act(async () => {
      root!.root.findByProps({ testID: 'mode-split' }).props.onPress();
    });
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    // interval must NOT have been recreated by the selectedZone change
    expect(intervalSpy.mock.calls.length).toBe(intervalsAtDetail);

    intervalSpy.mockRestore();
    jest.useRealTimers();
    (globalThis as any).fetch = undefined as any;
  });
});

// ---------------------------------------------------------------------------
// Issue 3+4: room card layout compactness and people counts
// ---------------------------------------------------------------------------

describe('Homepage room cards (layout + people counts)', () => {
  test('grid styles carry no fixed card width/height (sizing comes from getOverviewLayout)', () => {
    const fakeScale = {
      scale: 1,
      screenWidth: 1280,
      screenHeight: 800,
      fontScale: 1,
      isLandscape: true,
      isSmallScreen: false,
      s: (n: number) => n,
      font: (n: number) => n,
      touch: (n: number) => Math.max(n, 48),
      btn: (n: number) => Math.max(n, 48),
    };
    const styles = createStyles(fakeScale as unknown as ReturnType<typeof useScale>);
    expect(styles.grid.flexDirection).toBe('row');
    expect(styles.grid.flexWrap).toBe('wrap');
    expect('flex' in styles.grid).toBe(false);
    // The slot style must not hardcode a card size.
    expect('width' in styles.gridItem).toBe(false);
    expect('height' in styles.gridItem).toBe(false);
    // The fill-screen variant exists for even vertical distribution.
    expect(styles.gridFills.flexGrow).toBe(1);
  });

  test('OverviewScreen renders all 5 rooms without stretching rows', () => {
    const rooms = Array.from({ length: 5 }, (_, i) => ({
      id: `room-${i + 1}`,
      label: `Room ${i + 1}`,
      activeOrderCount: 1,
      activeOrderTotal: 10,
      billingMode: 'merged' as const,
      sessionOpen: true,
      canCheckout: true,
      unsettledCustomerCount: 0,
    }));
    let instance!: ReactTestRenderer;
    act(() => {
      instance = renderer.create(
        <StylesProvider>
          {ctx => (
            <OverviewScreen
              zones={rooms}
              orders={[]}
              lastUpdate={null}
              dict={dict}
              scale={ctx.scale}
              styles={ctx.styles}
              colors={ctx.colors}
              onLogout={jest.fn()}
              onOpenZone={jest.fn()}
              onOpenSession={jest.fn()}
              onOpenHistory={jest.fn()}
            />
          )}
        </StylesProvider>,
      );
    });
    expect(instance.root.findAllByType(ZoneCard).length).toBe(5);
  });

  test('getZoneCustomerCounts dedupes names, clamps, and never returns negatives', () => {
    const orders = [
      makeOrder({ id: 'a', customerName: 'Alice' }),
      makeOrder({ id: 'b', customerName: '  Alice  ' }),
      makeOrder({ id: 'c', customerName: 'Bob' }),
      makeOrder({ id: 'd', customerName: '  ' }),
    ];
    expect(getZoneCustomerCounts(orders, 2, dict.guest)).toEqual({ customerCount: 3, unsettledCount: 2, settledCount: 1 });
    // unsettled larger than customerCount -> clamp
    expect(getZoneCustomerCounts(orders, 99, dict.guest).settledCount).toBe(0);
    expect(getZoneCustomerCounts(orders, 99, dict.guest).unsettledCount).toBe(3);
    // negative unsettled -> 0
    expect(getZoneCustomerCounts(orders, -5, dict.guest).unsettledCount).toBe(0);
    expect(getZoneCustomerCounts(orders, -5, dict.guest).settledCount).toBe(3);
    // empty room
    expect(getZoneCustomerCounts([], undefined, dict.guest)).toEqual({ customerCount: 0, unsettledCount: 0, settledCount: 0 });
    // served/cancelled orders still count as people
    expect(getZoneCustomerCounts([
      makeOrder({ id: 'a', customerName: 'Alice', status: 'served' }),
      makeOrder({ id: 'b', customerName: 'Bob', status: 'cancelled' }),
    ], 1, dict.guest)).toEqual({ customerCount: 2, unsettledCount: 1, settledCount: 1 });
  });

  test('room card displays 未结 2 人 / 已结 1 人 for open rooms', () => {
    let instance!: ReactTestRenderer;
    act(() => {
      instance = renderer.create(
        <StylesProvider>
          {ctx => (
            <OverviewScreen
              zones={[{ ...zone, id: 'room-x', label: 'Room X', sessionOpen: true, unsettledCustomerCount: 2 }]}
              orders={[
                makeOrder({ id: 'a', zoneId: 'room-x', customerName: 'Alice' }),
                makeOrder({ id: 'b', zoneId: 'room-x', customerName: 'Bob' }),
                makeOrder({ id: 'c', zoneId: 'room-x', customerName: 'Alice', status: 'served' }),
                makeOrder({ id: 'd', zoneId: 'room-x', customerName: 'Carol' }),
              ]}
              lastUpdate={null}
              dict={dict}
              scale={ctx.scale}
              styles={ctx.styles}
              colors={ctx.colors}
              onLogout={jest.fn()}
              onOpenZone={jest.fn()}
              onOpenSession={jest.fn()}
              onOpenHistory={jest.fn()}
            />
          )}
        </StylesProvider>,
      );
    });
    const unsettled = instance.root.findByProps({ testID: 'zone-unsettled-room-x' });
    const settled = instance.root.findByProps({ testID: 'zone-settled-room-x' });
    expect(unsettled.props.children.join('')).toBe('2 人');
    expect(settled.props.children.join('')).toBe('1 人');
    // merged rooms show the whole-table billing note, not per-customer splitting
    const strings = allStrings(instance);
    expect(strings).toContain(dict.tableCheckoutNote);
  });

  test('closed rooms show 未结 0 人 / 已结 0 人', () => {
    let instance!: ReactTestRenderer;
    act(() => {
      instance = renderer.create(
        <StylesProvider>
          {ctx => (
            <OverviewScreen
              zones={[{ ...zone, id: 'room-y', label: 'Room Y', sessionOpen: false, unsettledCustomerCount: undefined }]}
              orders={[]}
              lastUpdate={null}
              dict={dict}
              scale={ctx.scale}
              styles={ctx.styles}
              colors={ctx.colors}
              onLogout={jest.fn()}
              onOpenZone={jest.fn()}
              onOpenSession={jest.fn()}
              onOpenHistory={jest.fn()}
            />
          )}
        </StylesProvider>,
      );
    });
    const unsettled = instance.root.findByProps({ testID: 'zone-unsettled-room-y' });
    const settled = instance.root.findByProps({ testID: 'zone-settled-room-y' });
    expect(unsettled.props.children.join('')).toBe('0 人');
    expect(settled.props.children.join('')).toBe('0 人');
  });

  test('merged people counts never block the whole-table checkout', () => {
    // UI semantics: merged allows checkout regardless of unsettled count
    expect(canCheckoutFromUi(true, 'merged', 2)).toBe(true);
    // while split blocks
    expect(canCheckoutFromUi(true, 'split', 2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue 2b: back clears selection and add-dish modal
// ---------------------------------------------------------------------------

describe('Back from detail page', () => {
  test('going back clears selectedZone and closes the add-dish modal', async () => {
    jest.useFakeTimers();
    const roomA: Zone = { id: 'room-a', label: 'Room A', activeOrderCount: 1, activeOrderTotal: 10, billingMode: 'merged', sessionOpen: true, canCheckout: true, unsettledCustomerCount: 0 };
    const order = makeOrder({ id: 'o1', zoneId: 'room-a', customerName: 'Alice', status: 'new' });

    const fetchMock = jest.fn((url: string, _init?: any) => {
      const path = String(url).replace('https://order.1383karaoke.ca', '');
      let body: Record<string, unknown> = {};
      if (path === '/api/employee/auth/login') body = { token: 't', employee: { username: 'staff' } };
      else if (path === '/api/employee/zones') body = { zones: [roomA] };
      else if (path === '/api/employee/orders') body = { orders: [order] };
      else if (path === '/api/employee/menu') body = { menu: [], categories: [] };
      else if (path.includes('/customer-settlements')) body = { settlements: {}, billingMode: 'merged', sessionOpen: true, unsettledCustomerCount: 0, canCheckout: true };
      else body = { ok: true };
      return Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => '' });
    });
    (globalThis as any).fetch = fetchMock;

    let root: ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<App />);
    });
    const usernameInput = root!.root.findAll(node => node.props && node.props.placeholder === dict.username)[0];
    const passwordInput = root!.root.findAll(node => node.props && node.props.placeholder === dict.password)[0];
    await act(async () => {
      usernameInput.props.onChangeText('staff');
      passwordInput.props.onChangeText('123456');
    });
    const loginBtn = (() => {
      const textNode = root!.root.findAll(n => n.type === Text && n.props.children === dict.loginButton)[0];
      let node: any = textNode;
      while (node) {
        if (node.props && typeof node.props.onPress === 'function') return node;
        node = node.parent;
      }
      return null;
    })();
    await act(async () => {
      loginBtn.props.onPress();
    });

    const findPressableByText = (text: string) => {
      const textNode = root!.root.findAll(n => n.type === Text && n.props.children === text)[0];
      let node: any = textNode;
      while (node) {
        if (node.props && typeof node.props.onPress === 'function') return node;
        node = node.parent;
      }
      return null;
    };

    // Enter the room
    await act(async () => {
      findPressableByText('Room A')!.props.onPress();
    });

    // Open the add-dish modal from the bottom nav (single editable order -> opens directly)
    await act(async () => {
      findPressableByText(dict.addDish)!.props.onPress();
    });
    const modalBefore = root!.root.findAllByType(Modal).find(m => m.props.visible === true);
    expect(modalBefore).toBeTruthy();

    // Press back
    await act(async () => {
      findPressableByText(dict.back)!.props.onPress();
    });

    // Detail screen gone, overview shown, modal closed
    expect(root!.root.findAll(n => n.props && n.props.testID === 'detail-screen').length).toBe(0);
    const modalAfter = root!.root.findAllByType(Modal).find(m => m.props.visible === true);
    expect(modalAfter).toBeUndefined();
    const strings = allStrings(root!);
    expect(strings).toContain(dict.currentZones);

    jest.useRealTimers();
    (globalThis as any).fetch = undefined as any;
  });
});

// ---------------------------------------------------------------------------
// Effective billing mode consistency (stale cache vs selectedZone)
// ---------------------------------------------------------------------------

describe('Effective billing mode consistency', () => {
  test('stale cache split + selectedZone merged: page AND checkout both follow split', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged', unsettledCustomerCount: 1 },
      zoneCheckoutStatus: {
        'zone-1': { settlements: {}, billingMode: 'split', sessionOpen: true, unsettledCustomerCount: 1, canCheckout: false },
      },
      zones: [{ ...zone, billingMode: 'merged' }],
      orders: [
        makeOrder({ id: 'a', customerName: 'Alice' }),
        makeOrder({ id: 'b', customerName: 'Bob' }),
      ],
    });
    // Display follows the effective mode (split): customer cards, no table-total row
    expect(instance.root.findAllByType(CustomerCard).length).toBe(2);
    expect(viewCount(instance, 'table-total-row')).toBe(0);
    // Split mode with an unsettled customer: checkout is blocked
    expect(findPressableByTestID(instance, 'detail-checkout').props.disabled).toBe(true);
  });

  test('stale cache merged + selectedZone split: page AND checkout both follow merged', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'split', unsettledCustomerCount: 3 },
      zoneCheckoutStatus: {
        'zone-1': { settlements: {}, billingMode: 'merged', sessionOpen: true, unsettledCustomerCount: 3, canCheckout: true },
      },
      zones: [{ ...zone, billingMode: 'split', unsettledCustomerCount: 3 }],
      orders: [makeOrder({ id: 'a', customerName: 'Alice' })],
    });
    // Display follows the effective mode (merged): table-total row, no customer cards
    expect(viewCount(instance, 'table-total-row')).toBe(1);
    expect(instance.root.findAllByType(CustomerCard).length).toBe(0);
    // Merged + open: checkout enabled even though the cache reports 3 unsettled
    expect(findPressableByTestID(instance, 'detail-checkout').props.disabled).toBe(false);
  });

  test('mode toggle reflects the effective mode, not a stale selectedZone field', () => {
    const instance = renderDetail({
      selectedZone: { ...zone, billingMode: 'merged' },
      zoneCheckoutStatus: {
        'zone-1': { settlements: {}, billingMode: 'split', sessionOpen: true, unsettledCustomerCount: 1, canCheckout: false },
      },
      zones: [{ ...zone, billingMode: 'merged' }],
      orders: [makeOrder({ id: 'a', customerName: 'Alice' })],
    });
    // Effective mode is split -> split button is the active one
    const splitBtn = findPressableByTestID(instance, 'mode-split');
    const mergedBtn = findPressableByTestID(instance, 'mode-merged');
    expect(StyleSheet.flatten(splitBtn.props.style).backgroundColor).toBe(colors.primary);
    expect(StyleSheet.flatten(mergedBtn.props.style).backgroundColor).not.toBe(colors.primary);
    expect(splitBtn.props.disabled).toBe(true);
    expect(mergedBtn.props.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Responsive overview layout (getOverviewLayout)
// ---------------------------------------------------------------------------

const chrome = { topBarHeight: 64, statusBarHeight: 48, bottomNavHeight: 72 };

describe('getOverviewLayout (responsive homepage layout)', () => {
  test('Samsung-class landscape 1280x800 with 5 rooms -> 3 columns x 2 rows, cards fit', () => {
    const layout = getOverviewLayout({ width: 1280, height: 800, zoneCount: 5, fontScale: 1, ...chrome });
    expect(layout.isLandscape).toBe(true);
    expect(layout.columnCount).toBe(3);
    expect(layout.rowCount).toBe(2);
    expect(layout.requiresScroll).toBe(false);
    expect(layout.cardHeight).toBeGreaterThanOrEqual(layout.cardMinHeight);
    expect(layout.cardWidth).toBeGreaterThan(0);
    // Two rows of cards use the available height without a giant blank bottom
    const rowsUsed = layout.rowCount * layout.cardHeight + layout.verticalGap * (layout.rowCount - 1);
    expect(rowsUsed).toBeLessThanOrEqual(layout.availableContentHeight + 1);
  });

  test('large tablet 1920x1200 with 5 rooms -> 3 columns, no absurdly tall cards', () => {
    const layout = getOverviewLayout({ width: 1920, height: 1200, zoneCount: 5, fontScale: 1, ...chrome });
    expect(layout.columnCount).toBe(3);
    expect(layout.rowCount).toBe(2);
    expect(layout.requiresScroll).toBe(false);
    expect(layout.cardHeight).toBeGreaterThanOrEqual(layout.cardMinHeight);
    expect(layout.cardHeight).toBeLessThanOrEqual(400);
  });

  test('small landscape 1024x600 -> safe column count, min height kept, scrolls when needed', () => {
    const layout = getOverviewLayout({ width: 1024, height: 600, zoneCount: 5, fontScale: 1, ...chrome });
    expect(layout.isLandscape).toBe(true);
    // 1024dp is below the 1200dp 3-column breakpoint -> 2 columns
    expect(layout.columnCount).toBe(2);
    expect(layout.rowCount).toBe(3);
    // Not enough room for 3 rows at the content minimum -> scroll, never compress
    expect(layout.requiresScroll).toBe(true);
    expect(layout.cardHeight).toBe(layout.cardMinHeight);
  });

  test('portrait 800x1280 is NOT treated as landscape 1280x800', () => {
    const layout = getOverviewLayout({ width: 800, height: 1280, zoneCount: 5, fontScale: 1, ...chrome });
    expect(layout.isLandscape).toBe(false);
    expect(layout.columnCount).toBe(2);
    expect(layout.availableContentHeight).toBe(1280 - chrome.topBarHeight - chrome.statusBarHeight - chrome.bottomNavHeight - 24);
  });

  test('font scale 1.0 / 1.15 / 1.3 grows the content minimum height', () => {
    const min10 = getOverviewLayout({ width: 1280, height: 800, zoneCount: 5, fontScale: 1.0, ...chrome }).cardMinHeight;
    const min115 = getOverviewLayout({ width: 1280, height: 800, zoneCount: 5, fontScale: 1.15, ...chrome }).cardMinHeight;
    const min130 = getOverviewLayout({ width: 1280, height: 800, zoneCount: 5, fontScale: 1.3, ...chrome }).cardMinHeight;
    expect(min115).toBeGreaterThanOrEqual(min10);
    expect(min130).toBeGreaterThanOrEqual(min115);
    // At every font scale the card height never drops below the content minimum
    for (const fontScale of [1.0, 1.15, 1.3]) {
      const layout = getOverviewLayout({ width: 1024, height: 600, zoneCount: 5, fontScale, ...chrome });
      expect(layout.cardHeight).toBeGreaterThanOrEqual(layout.cardMinHeight);
    }
  });

  test('dimension changes recompute the layout', () => {
    const landscape = getOverviewLayout({ width: 1280, height: 800, zoneCount: 5, fontScale: 1, ...chrome });
    const larger = getOverviewLayout({ width: 1920, height: 1200, zoneCount: 5, fontScale: 1, ...chrome });
    const portrait = getOverviewLayout({ width: 800, height: 1280, zoneCount: 5, fontScale: 1, ...chrome });
    expect(larger.cardHeight).not.toBe(landscape.cardHeight);
    expect(portrait.columnCount).not.toBe(landscape.columnCount);
  });

  test('zero rooms does not crash and yields a single slot', () => {
    const layout = getOverviewLayout({ width: 1280, height: 800, zoneCount: 0, fontScale: 1, ...chrome });
    expect(layout.columnCount).toBe(1);
    expect(layout.rowCount).toBe(1);
    expect(layout.cardHeight).toBeGreaterThanOrEqual(layout.cardMinHeight);
  });
});

// ---------------------------------------------------------------------------
// Responsive homepage rendering (OverviewScreen)
// ---------------------------------------------------------------------------

function makeFakeScale(width: number, height: number, fontScale = 1) {
  return {
    scale: 1,
    screenWidth: width,
    screenHeight: height,
    fontScale,
    isLandscape: width >= height,
    isSmallScreen: width < 1200,
    s: (n: number) => n,
    font: (n: number) => n,
    touch: (n: number) => Math.max(n, 48),
    btn: (n: number) => Math.max(n, 48),
  } as unknown as ReturnType<typeof useScale>;
}

function makeRooms(count: number, open = true): Zone[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `room-${i + 1}`,
    label: `Room ${i + 1}`,
    activeOrderCount: 1,
    activeOrderTotal: 10,
    billingMode: 'merged' as const,
    sessionOpen: open,
    canCheckout: true,
    unsettledCustomerCount: 0,
  }));
}

function renderOverview(
  zones: Zone[],
  orders: Order[] = [],
  scale = makeFakeScale(1280, 800),
): ReactTestRenderer {
  let instance!: ReactTestRenderer;
  act(() => {
    instance = renderer.create(
      <StylesProvider>
        {ctx => (
          <OverviewScreen
            zones={zones}
            orders={orders}
            lastUpdate={null}
            dict={dict}
            scale={scale}
            styles={createStyles(scale)}
            colors={ctx.colors}
            onLogout={jest.fn()}
            onOpenZone={jest.fn()}
            onOpenSession={jest.fn()}
            onOpenHistory={jest.fn()}
          />
        )}
      </StylesProvider>,
    );
  });
  return instance;
}

describe('Responsive homepage rendering', () => {
  test('all 5 rooms render with consistent card sizes; Room 4 and Room 5 are present', () => {
    const instance = renderOverview(makeRooms(5));
    const cards = instance.root.findAllByType(ZoneCard);
    expect(cards.length).toBe(5);

    const strings = allStrings(instance);
    expect(strings).toContain('Room 4');
    expect(strings).toContain('Room 5');

    // every card slot has the same computed height
    const heights = cards.map(card => {
      const slot = card.parent;
      return StyleSheet.flatten(slot!.props.style).height;
    });
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBeGreaterThanOrEqual(
      getOverviewLayout({ width: 1280, height: 800, zoneCount: 5, fontScale: 1, ...chrome }).cardMinHeight,
    );
  });

  test('unsettled and settled counts still render on every open room card', () => {
    const instance = renderOverview(makeRooms(2));
    expect(anyNodeWithTestID(instance, 'zone-unsettled-room-1')).toBe(true);
    expect(anyNodeWithTestID(instance, 'zone-settled-room-1')).toBe(true);
    expect(anyNodeWithTestID(instance, 'zone-unsettled-room-2')).toBe(true);
    expect(anyNodeWithTestID(instance, 'zone-settled-room-2')).toBe(true);
  });

  test('open-session button stays on closed room cards', () => {
    const rooms = makeRooms(1, false);
    const instance = renderOverview(rooms);
    const strings = allStrings(instance);
    expect(strings).toContain(dict.openSession);
  });

  test('layout recomputes when the window dimensions change', () => {
    const small = renderOverview(makeRooms(5), [], makeFakeScale(1280, 800));
    const smallHeights = small.root.findAllByType(ZoneCard).map(card =>
      StyleSheet.flatten(card.parent!.props.style).height,
    );
    const large = renderOverview(makeRooms(5), [], makeFakeScale(1920, 1200));
    const largeHeights = large.root.findAllByType(ZoneCard).map(card =>
      StyleSheet.flatten(card.parent!.props.style).height,
    );
    expect(largeHeights[0]).not.toBe(smallHeights[0]);
    expect(largeHeights[0]).toBeGreaterThan(smallHeights[0]);
  });

  test('polling updates do not remount OverviewScreen, ScrollView or cards, and keep card size stable', () => {
    const rooms1 = makeRooms(5);
    const rooms2 = makeRooms(5);
    const scale = makeFakeScale(1280, 800);
    let instance!: ReactTestRenderer;
    act(() => {
      instance = renderer.create(
        <StylesProvider>
          {ctx => (
            <OverviewScreen
              zones={rooms1}
              orders={[makeOrder({ id: 'o1', zoneId: 'room-1' })]}
              lastUpdate={null}
              dict={dict}
              scale={scale}
              styles={createStyles(scale)}
              colors={ctx.colors}
              onLogout={jest.fn()}
              onOpenZone={jest.fn()}
              onOpenSession={jest.fn()}
              onOpenHistory={jest.fn()}
            />
          )}
        </StylesProvider>,
      );
    });

    const overviewBefore = instance.root.findByType(OverviewScreen);
    const scrollBefore = instance.root.findAllByType(ScrollView)[0];
    const zoneCardsBefore = instance.root.findAllByType(ZoneCard).map(c => c);
    const heightBefore = StyleSheet.flatten(zoneCardsBefore[0].parent!.props.style).height;

    // Simulate two poll cycles with refreshed orders/zones data
    act(() => {
      instance.update(
        <StylesProvider>
          {ctx => (
            <OverviewScreen
              zones={rooms2}
              orders={[
                makeOrder({ id: 'o1', zoneId: 'room-1', status: 'preparing' }),
                makeOrder({ id: 'o2', zoneId: 'room-2', status: 'ready' }),
              ]}
              lastUpdate={new Date()}
              dict={dict}
              scale={scale}
              styles={createStyles(scale)}
              colors={ctx.colors}
              onLogout={jest.fn()}
              onOpenZone={jest.fn()}
              onOpenSession={jest.fn()}
              onOpenHistory={jest.fn()}
            />
          )}
        </StylesProvider>,
      );
    });
    act(() => {
      instance.update(
        <StylesProvider>
          {ctx => (
            <OverviewScreen
              zones={rooms2}
              orders={[
                makeOrder({ id: 'o1', zoneId: 'room-1', status: 'preparing' }),
                makeOrder({ id: 'o2', zoneId: 'room-2', status: 'ready' }),
                makeOrder({ id: 'o3', zoneId: 'room-3', status: 'new' }),
              ]}
              lastUpdate={new Date()}
              dict={dict}
              scale={scale}
              styles={createStyles(scale)}
              colors={ctx.colors}
              onLogout={jest.fn()}
              onOpenZone={jest.fn()}
              onOpenSession={jest.fn()}
              onOpenHistory={jest.fn()}
            />
          )}
        </StylesProvider>,
      );
    });

    // Same instances: no remount, no key churn
    expect(instance.root.findByType(OverviewScreen)).toBe(overviewBefore);
    expect(instance.root.findAllByType(ScrollView)[0]).toBe(scrollBefore);
    const zoneCardsAfter = instance.root.findAllByType(ZoneCard);
    expect(zoneCardsAfter).toContain(zoneCardsBefore[0]);
    expect(zoneCardsAfter).toContain(zoneCardsBefore[4]);
    // Card size is identical after polling (no layout churn / flicker)
    const heightAfter = StyleSheet.flatten(zoneCardsAfter[0].parent!.props.style).height;
    expect(heightAfter).toBe(heightBefore);
  });
});
