/**
 * Order System - Employee Android App
 * Samsung Tablet Optimized UI
 *
 * Design Principles:
 * 1. Zero-scroll: All actions within one screen
 * 2. Unified scaling: Same layout on all devices, just scaled
 * 3. Forced landscape: All devices use tablet layout
 * 4. Touch-first: Minimum 48dp touch targets
 *
 * Page flow: Overview (current zones) -> Detail (zone workspace) -> History (read-only)
 * DetailScreen / OrderCard / CustomerCard are module-level components (no nested
 * component definitions inside App) so polling updates never remount them.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SoundPlayer from 'react-native-sound-player';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';

// ============================================================================
// BASELINE DESIGN CONSTANTS (Based on Samsung 11" tablet 1920x1200)
// ============================================================================
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1200;

// Design tokens
const DESIGN = {
  colors: {
    // Background
    bgPrimary: '#0f172a',
    bgCard: '#1e293b',
    bgElevated: '#334155',

    // Status colors
    statusNew: '#ef4444',        // Red
    statusPreparing: '#f59e0b',   // Amber
    statusReady: '#10b981',       // Green
    statusServed: '#64748b',      // Slate
    statusCancelled: '#475569',   // Dark slate

    // Actions
    primary: '#3b82f6',
    danger: '#dc2626',
    success: '#22c55e',
    warning: '#f59e0b',

    // Text
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',

    // Borders
    border: '#334155',
    borderLight: '#475569',
    noteBackground: '#fef3c7',   // Light yellow for notes
    noteBorder: '#f59e0b',       // Amber border
    noteText: '#78350f',         // Dark amber text on light yellow background
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 28,
    display: 32,
  },

  components: {
    topBarHeight: 64,
    bottomBarHeight: 72,
    statusBarHeight: 48,
    cardRadius: 12,
    buttonHeight: 56,
    buttonHeightSm: 44,
    iconSize: 24,
    iconSizeLg: 32,
  },
};

// ============================================================================
// SCALING SYSTEM
// ============================================================================
function useScale() {
  const { width, height, fontScale } = useWindowDimensions();

  // Use the ACTUAL current window dimensions (logical dp). Never assume the
  // device is always landscape by swapping width/height.
  return useMemo(() => {
    const screenWidth = width;
    const screenHeight = height;
    const isLandscape = width >= height;

    // Scale ratio against the 1920x1200 design canvas (fonts/chrome baseline).
    const scaleX = screenWidth / BASE_WIDTH;
    const scaleY = screenHeight / BASE_HEIGHT;
    const scale = Math.min(scaleX, scaleY);

    // Minimum scale protection for chrome/fonts (touch targets are floored
    // separately at 48dp so they never shrink below the accessibility minimum).
    const finalScale = Math.max(scale, 0.45);

    return {
      scale: finalScale,
      screenWidth,
      screenHeight,
      fontScale,
      isLandscape,
      isSmallScreen: screenWidth < 1200,

      // Helper functions (stable identities while dimensions are unchanged)
      s: (size: number) => Math.round(size * finalScale),
      font: (size: number) => Math.round(size * Math.max(finalScale, 0.65)),
      touch: (size: number = 48) => Math.max(Math.round(size * finalScale), 48),
      btn: (size: number = 56) => Math.max(Math.round(size * finalScale), 48),
    };
  }, [width, height, fontScale]);
}

// ============================================================================
// TYPES
// ============================================================================
export type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';

export type Zone = {
  id: string;
  label: string;
  activeOrderCount: number;
  activeOrderTotal: number;
  billingMode?: 'split' | 'merged';
  sessionOpen?: boolean;
  canCheckout?: boolean;
  unsettledCustomerCount?: number;
};

export type OrderItem = {
  itemId: number;
  name: string;
  quantity: number;
  subtotal: number;
  served?: boolean;
};

export type Order = {
  id: string;
  zoneId: string;
  zoneLabel: string;
  customerName?: string;
  handledByEmployeeUsername?: string;
  items: OrderItem[];
  note: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
};

export type HistoryBatch = {
  batchKey: string;
  legacy: boolean;
  zoneId: string;
  zoneLabel: string;
  checkoutAt: string | null;
  customerCount: number;
  orderCount: number;
  itemLineCount: number;
  itemQuantity: number;
  total: number;
  handledByEmployeeUsernames: string[];
  orders: Array<Order & { archivedAt?: string; checkoutAt?: string | null }>;
};

export type CustomerSettlementInfo = {
  settled: boolean;
  updatedAt?: string;
  updatedByEmployeeUsername?: string;
};

export type CustomerSettlementsMap = Record<string, CustomerSettlementInfo>;

export type ZoneCheckoutStatus = {
  settlements: CustomerSettlementsMap;
  billingMode?: 'split' | 'merged';
  sessionOpen?: boolean;
  periodStartAt?: string;
  unsettledCustomerNames?: string[];
  unsettledCustomerCount?: number;
  canCheckout?: boolean;
};

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category?: string;
  description?: string;
  available?: boolean;
};

export type Lang = 'zh' | 'en';

// ============================================================================
// CONFIG
// ============================================================================
const BASE_URL = 'https://order.1383karaoke.ca';
const POLL_MS = 2000;

// ============================================================================
// I18N
// ============================================================================
const I18N = {
  zh: {
    loginTitle: '员工登录',
    username: '用户名',
    password: '密码',
    loginButton: '登录',
    languageToggle: '中文 / EN',
    loginRequired: '请输入用户名和密码',
    loginFailed: '登录失败',
    currentZones: '当前桌台',
    historyOrders: '历史订单',
    back: '返回',
    logout: '退出',
    opened: '已开台',
    closed: '未开台',
    split: '分单',
    merged: '合单',
    note: '餐品备注',
    dishNote: '餐品备注',
    newOrder: '新单',
    preparing: '制作中',
    ready: '待上菜',
    served: '已完成',
    cancelled: '已取消',
    acceptOrder: '接单',
    completePreparing: '制作完成',
    completeServing: '整单完成',
    addDish: '加菜',
    cancel: '取消',
    more: '更多',
    markServed: '已送',
    markUnserved: '未送',
    printReceipt: '打印小票',
    checkout: '结单并清台',
    openSession: '开台',
    settled: '已结',
    unsettled: '未结',
    markSettled: '标记已结',
    markUnsettled: '标记未结',
    totalAmount: '金额',
    orderAmount: '订单金额',
    customerTotalLabel: '顾客合计',
    unservedItems: '未送',
    noCategory: '未分类',
    noEditableOrder: '当前没有可加菜的订单',
    selectOrder: '选择加菜订单',
    newOrders: '新单',
    preparingOrders: '制作中',
    readyOrders: '待上菜',
    checkoutConfirm: '结单后该桌所有订单将归档，确认吗？',
    cannotCheckout: '还有未结顾客，无法结单',
    printSuccess: '打印任务已发送',
    sessionExpired: '登录已过期，请重新登录',
    historyEmpty: '暂无历史订单',
    historyLoadFailed: '历史订单加载失败',
    loadMore: '加载更多',
    allLoaded: '已加载全部',
    batch: '批次',
    legacy: '旧版记录',
    guest: '顾客',
    items: '项',
    portions: '份',
    orders: '单',
    refresh: '刷新',
    lastUpdate: '更新',
    loadSettlementFailed: '读取包厢状态失败',
    loadOrdersFailed: '读取订单失败',
    loadMenuFailed: '读取菜单失败',
    statusFailed: '更新状态失败',
    quantityFailed: '修改数量失败',
    addItemFailed: '加菜失败',
    updateSettlementFailed: '更新结算状态失败',
    updateModeFailed: '切换模式失败',
    openSessionFailed: '开台失败',
    checkoutFailed: '结单失败',
    printFailed: '打印失败',
    failed: '失败',
    checkoutTitle: '确认结单',
    cancelButton: '取消',
    confirmCheckout: '确认结单',
    checkoutNeedSettled: '还有 {count} 位顾客未结',
    printCustomerSent: '{name} 的小票已发送',
    printMergedSent: '整桌小票已发送',
    loginSuccess: '登录成功',
    loginInProgress: '登录中...',
    closedSectionTitle: '已完成 / 已取消（{count}）',
    unservedReminder: '⚠ 有未送菜品待处理',
    tableTotal: '整桌总金额',
    tableCheckoutNote: '合单 / 整桌结账',
    customerCountLabel: '顾客人数',
    unsettledCountLabel: '未结人数',
    settledCountLabel: '已结人数',
    peopleUnit: '人',
  },
  en: {
    loginTitle: 'Staff Login',
    username: 'Username',
    password: 'Password',
    loginButton: 'Login',
    languageToggle: '中文 / EN',
    loginRequired: 'Please enter username and password',
    loginFailed: 'Login failed',
    currentZones: 'Current Zones',
    historyOrders: 'History',
    back: 'Back',
    logout: 'Logout',
    opened: 'Open',
    closed: 'Closed',
    split: 'Split',
    merged: 'Merged',
    note: 'Dish Note',
    dishNote: 'Dish Note',
    newOrder: 'New',
    preparing: 'Preparing',
    ready: 'Ready',
    served: 'Completed',
    cancelled: 'Cancelled',
    acceptOrder: 'Accept',
    completePreparing: 'Done Prep',
    completeServing: 'Complete',
    addDish: 'Add',
    cancel: 'Cancel',
    more: 'More',
    markServed: 'Served',
    markUnserved: 'Unserved',
    printReceipt: 'Print',
    checkout: 'Checkout',
    openSession: 'Open',
    settled: 'Settled',
    unsettled: 'Unsettled',
    markSettled: 'Mark Settled',
    markUnsettled: 'Mark Unsettled',
    totalAmount: 'Total',
    orderAmount: 'Order total',
    customerTotalLabel: 'Customer total',
    unservedItems: 'Unserved',
    noCategory: 'Uncategorized',
    noEditableOrder: 'No editable order available',
    selectOrder: 'Select order to add dish',
    newOrders: 'New',
    preparingOrders: 'Preparing',
    readyOrders: 'Ready',
    checkoutConfirm: 'Checkout will archive all orders. Continue?',
    cannotCheckout: 'Cannot checkout: unsettled customers remain',
    printSuccess: 'Print job sent',
    sessionExpired: 'Session expired, please login again',
    historyEmpty: 'No history',
    historyLoadFailed: 'Failed to load history',
    loadMore: 'Load more',
    allLoaded: 'All loaded',
    batch: 'Batch',
    legacy: 'Legacy',
    guest: 'Guest',
    items: 'items',
    portions: 'portions',
    orders: 'orders',
    refresh: 'Refresh',
    lastUpdate: 'Updated',
    loadSettlementFailed: 'Failed to load zone status',
    loadOrdersFailed: 'Failed to load orders',
    loadMenuFailed: 'Failed to load menu',
    statusFailed: 'Failed to update status',
    quantityFailed: 'Failed to update quantity',
    addItemFailed: 'Failed to add item',
    updateSettlementFailed: 'Failed to update settlement',
    updateModeFailed: 'Failed to switch mode',
    openSessionFailed: 'Failed to open session',
    checkoutFailed: 'Failed to checkout',
    printFailed: 'Failed to print',
    failed: 'Failed',
    checkoutTitle: 'Confirm Checkout',
    cancelButton: 'Cancel',
    confirmCheckout: 'Confirm',
    checkoutNeedSettled: '{count} customers still unsettled',
    printCustomerSent: '{name} receipt sent',
    printMergedSent: 'Merged receipt sent',
    loginSuccess: 'Login successful',
    loginInProgress: 'Logging in...',
    closedSectionTitle: 'Completed / Cancelled ({count})',
    unservedReminder: '⚠ Unserved items need attention',
    tableTotal: 'Table Total',
    tableCheckoutNote: 'Merged / Table checkout',
    customerCountLabel: 'Customers',
    unsettledCountLabel: 'Unsettled',
    settledCountLabel: 'Settled',
    peopleUnit: 'people',
  },
};

export type Dict = typeof I18N.zh;

// ============================================================================
// UTILS
// ============================================================================
export function formatMoney(amount: number): string {
  return `$${Number(amount || 0).toFixed(2)}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function getStatusColor(status: OrderStatus): string {
  switch (status) {
    case 'new': return DESIGN.colors.statusNew;
    case 'preparing': return DESIGN.colors.statusPreparing;
    case 'ready': return DESIGN.colors.statusReady;
    case 'served': return DESIGN.colors.statusServed;
    case 'cancelled': return DESIGN.colors.statusCancelled;
    default: return DESIGN.colors.textMuted;
  }
}

export function getStatusText(status: OrderStatus, lang: Lang): string {
  const dict = I18N[lang];
  switch (status) {
    case 'new': return dict.newOrder;
    case 'preparing': return dict.preparing;
    case 'ready': return dict.ready;
    case 'served': return dict.served;
    case 'cancelled': return dict.cancelled;
    default: return status;
  }
}

/** Orders still being worked on (not archived and not cancelled). */
export function isPendingStatus(status: OrderStatus): boolean {
  return status === 'new' || status === 'preparing' || status === 'ready';
}

/** Sort orders by createdAt ascending (FIFO), stable by id. */
export function sortOrdersByCreatedAt<T extends Order>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const aMs = new Date(a.createdAt || '').getTime();
    const bMs = new Date(b.createdAt || '').getTime();
    if (aMs !== bMs) return aMs - bMs;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/**
 * Customer payable total: sum of order.total for every non-cancelled order.
 * Served orders still count; cancelled orders never count.
 */
export function customerPayableTotal(orders: Order[]): number {
  return orders.reduce((sum, order) => {
    if (order.status === 'cancelled') return sum;
    return sum + Number(order.total || 0);
  }, 0);
}

/**
 * Group orders by trimmed customerName (empty falls back to guest label).
 * One group per customer; orders sorted by createdAt ascending;
 * total = payable total of non-cancelled orders.
 */
export function buildCustomerGroups(
  orders: Order[],
  guestLabel: string,
): Array<{ customerName: string; orders: Order[]; total: number }> {
  const map = new Map<string, Order[]>();
  for (const order of orders) {
    const key = (order.customerName || '').trim() || guestLabel;
    const arr = map.get(key) || [];
    arr.push(order);
    map.set(key, arr);
  }
  const result: Array<{ customerName: string; orders: Order[]; total: number }> = [];
  for (const [name, arr] of map.entries()) {
    const sorted = sortOrdersByCreatedAt(arr);
    result.push({
      customerName: name,
      orders: sorted,
      total: customerPayableTotal(sorted),
    });
  }
  return result;
}


/**
 * Resolve the effective billing mode for a zone:
 * 1. zoneCheckoutStatus[zoneId].billingMode (authoritative)
 * 2. the currently selected zone (if it matches zoneId)
 * 3. the zones list entry
 * 4. merged as the safe default (matches backend checkout semantics).
 */
export function resolveBillingMode(
  zoneId: string,
  zoneCheckoutStatus: Record<string, ZoneCheckoutStatus>,
  zones: Zone[],
  selectedZone: Zone | null,
): 'split' | 'merged' {
  const fromStatus = zoneCheckoutStatus[zoneId]?.billingMode;
  if (fromStatus === 'split' || fromStatus === 'merged') return fromStatus;
  if (selectedZone && selectedZone.id === zoneId) {
    const fromSelected = selectedZone.billingMode;
    if (fromSelected === 'split' || fromSelected === 'merged') return fromSelected;
  }
  const fromList = zones.find(z => z.id === zoneId)?.billingMode;
  if (fromList === 'split' || fromList === 'merged') return fromList;
  // Safe default: the backend default mode is split. Split semantics require
  // every customer to be settled before checkout, so an unknown mode can
  // never wrongly allow a whole-table checkout.
  return 'split';
}

/**
 * Single source of truth for whether the checkout button may be enabled
 * and whether checkoutZone() may proceed. Used by both the DetailScreen
 * UI and the App-level checkout handler so the two can never disagree.
 *
 * - Not open: never checkout.
 * - split: every customer must be settled (unsettledCustomerCount must be 0).
 * - merged: whole-table checkout; customer-level unsettled counts do NOT block.
 */
export function canCheckoutFromUi(
  sessionOpen: boolean | undefined,
  billingMode: 'split' | 'merged',
  unsettledCustomerCount: number | undefined,
): boolean {
  if (sessionOpen !== true) return false;
  if (billingMode === 'split') {
    return !(Number(unsettledCustomerCount || 0) > 0);
  }
  return true;
}

/**
 * Latest-zone sync without closure staleness: looks up prev.id inside the
 * freshest zones response via a functional update. A stale response for an
 * old room can never overwrite the currently selected room.
 */
export function syncSelectedZoneFromZones(prev: Zone | null, zonesList: Zone[]): Zone | null {
  if (!prev) return null;
  const updated = zonesList.find(z => z.id === prev.id);
  return updated || prev;
}

/**
 * Current-session people counts for a room card:
 * - customerCount: unique trimmed customer names (empty falls back to guest label)
 * - unsettledCount: backend unsettledCustomerCount, safely clamped to [0, customerCount]
 * - settledCount: max(customerCount - unsettledCount, 0)
 */
export function getZoneCustomerCounts(
  zoneOrders: Order[],
  unsettledCustomerCount: number | undefined,
  guestLabel: string,
): { customerCount: number; unsettledCount: number; settledCount: number } {
  const names = new Set<string>();
  zoneOrders.forEach(order => {
    const key = (order.customerName || '').trim() || guestLabel;
    names.add(key);
  });
  const customerCount = names.size;
  const rawUnsettled = Number(unsettledCustomerCount || 0);
  const unsettledCount = Math.max(0, Math.min(rawUnsettled, customerCount));
  const settledCount = Math.max(customerCount - unsettledCount, 0);
  return { customerCount, unsettledCount, settledCount };
}

// ============================================================================
// STYLES GENERATOR
// ============================================================================
// ============================================================================
// RESPONSIVE OVERVIEW LAYOUT
// ============================================================================
export type OverviewLayout = {
  isLandscape: boolean;
  columnCount: number;
  rowCount: number;
  horizontalGap: number;
  verticalGap: number;
  horizontalPadding: number;
  verticalPadding: number;
  cardWidth: number;
  cardHeight: number;
  cardMinHeight: number;
  availableContentHeight: number;
  requiresScroll: boolean;
};

/**
 * Pure, testable layout calculation for the current-rooms homepage.
 *
 * Uses the ACTUAL window dimensions (logical dp) - never a swapped/forced
 * orientation - plus the Android fontScale and the real chrome heights.
 *
 * Rules:
 * - Landscape: >=1200dp -> 3 columns, >=800dp -> 2 columns, else 1 column.
 * - Portrait:  >=700dp  -> 2 columns, else 1 column.
 * - rowCount = ceil(zoneCount / columnCount).
 * - Card height is clamped between a content-driven minimum (grows with
 *   fontScale) and a reasonable maximum, and prefers to fill the available
 *   row height so cards are neither tiny nor absurdly tall.
 * - When the available row height is below the content minimum, the page
 *   must scroll (requiresScroll = true) instead of compressing content.
 */
export function getOverviewLayout(params: {
  width: number;
  height: number;
  zoneCount: number;
  fontScale: number;
  topBarHeight: number;
  statusBarHeight: number;
  bottomNavHeight: number;
}): OverviewLayout {
  const {
    width,
    height,
    zoneCount,
    fontScale,
    topBarHeight,
    statusBarHeight,
    bottomNavHeight,
  } = params;

  const isLandscape = width >= height;
  const safeFontScale = Math.max(fontScale || 1, 1);

  // --- Column selection -----------------------------------------------------
  let columnCount: number;
  if (isLandscape) {
    if (width >= 1200) columnCount = 3;
    else if (width >= 800) columnCount = 2;
    else columnCount = 1;
  } else {
    if (width >= 700) columnCount = 2;
    else columnCount = 1;
  }
  columnCount = Math.min(columnCount, Math.max(zoneCount, 1));
  const rowCount = Math.max(1, Math.ceil(zoneCount / columnCount));

  // --- Spacing (dp) ---------------------------------------------------------
  const horizontalPadding = 12;
  const verticalPadding = 12;
  const horizontalGap = 12;
  const verticalGap = 12;

  // --- Content-driven minimum card height -----------------------------------
  // Mirrors the ZoneCard stack: header (title+badge), amount, mode,
  // unsettled, settled, footer buttons, plus paddings and row gaps.
  // All lines scale with the Android fontScale so bigger fonts yield taller
  // minimums instead of overflow.
  const line = (sp: number) => Math.round(sp * safeFontScale) + 4;
  const titleLine = line(24);    // room name / badge
  const amountLine = line(28);   // amount
  const textLine = line(16);     // mode / unsettled / settled rows
  const cardPadding = 24;        // 12 top + 12 bottom
  const rowGapTotal = 5 * 8;     // five inter-row gaps of 8dp
  const footerGap = 12;
  const buttonHeight = 48;       // minimum touch target
  const requiredContentMinHeight =
    cardPadding + titleLine + amountLine + textLine * 3 + rowGapTotal + footerGap + buttonHeight;

  // --- Available content height ---------------------------------------------
  const availableContentHeight = Math.max(
    0,
    height - topBarHeight - statusBarHeight - bottomNavHeight - verticalPadding * 2,
  );

  const availableRowHeight =
    (availableContentHeight - verticalGap * (rowCount - 1)) / rowCount;

  // Reasonable ceiling so a 1920x1200 tablet does not produce absurdly tall
  // cards; grows with the content minimum (fonts/buttons/spacing).
  const maxReasonableCardHeight = Math.round(Math.min(
    availableRowHeight,
    requiredContentMinHeight * 1.55,
  ));

  const cardHeight = Math.max(
    requiredContentMinHeight,
    Math.min(availableRowHeight, maxReasonableCardHeight),
  );

  const cardWidth = Math.max(
    0,
    (width - horizontalPadding * 2 - horizontalGap * (columnCount - 1)) / columnCount,
  );

  return {
    isLandscape,
    columnCount,
    rowCount,
    horizontalGap,
    verticalGap,
    horizontalPadding,
    verticalPadding,
    cardWidth,
    cardHeight,
    cardMinHeight: requiredContentMinHeight,
    availableContentHeight,
    requiresScroll: availableRowHeight < requiredContentMinHeight,
  };
}

function createStyles(scale: ReturnType<typeof useScale>) {
  const { s, font, touch, btn, colors } = { ...scale, colors: DESIGN.colors };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
    },

    topBar: {
      height: s(DESIGN.components.topBarHeight),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: s(DESIGN.spacing.lg),
      backgroundColor: colors.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    topBarTitle: {
      fontSize: font(DESIGN.fontSize.xl),
      fontWeight: '700',
      color: colors.textPrimary,
    },
    topBarButton: {
      paddingHorizontal: s(DESIGN.spacing.md),
      paddingVertical: s(DESIGN.spacing.sm),
      borderRadius: s(8),
      backgroundColor: colors.bgElevated,
    },
    topBarButtonText: {
      fontSize: font(DESIGN.fontSize.md),
      color: colors.textPrimary,
      fontWeight: '600',
    },

    modeToggleRow: {
      flexDirection: 'row',
      gap: s(8),
    },
    modeToggleBtn: {
      minHeight: touch(48),
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: s(16),
      borderRadius: s(8),
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    modeToggleBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    modeToggleText: {
      fontSize: font(DESIGN.fontSize.md),
      fontWeight: '700',
      color: colors.textSecondary,
    },
    modeToggleTextActive: {
      color: '#fff',
    },

    statusBar: {
      height: s(DESIGN.components.statusBarHeight),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: s(DESIGN.spacing.lg),
      backgroundColor: colors.bgElevated,
    },
    statusBarText: {
      fontSize: font(DESIGN.fontSize.md),
      color: colors.textSecondary,
    },
    statusBarValue: {
      fontSize: font(DESIGN.fontSize.lg),
      fontWeight: '700',
      color: colors.textPrimary,
    },

    content: {
      flex: 1,
      padding: s(DESIGN.spacing.md),
    },

    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
      alignContent: 'flex-start',
    },
    // Applied when the content fits on one screen: the grid fills the
    // viewport and rows are distributed evenly (no giant bottom whitespace).
    gridFills: {
      flexGrow: 1,
      alignContent: 'space-between',
    },
    // Static part of each card slot; width/height come from the responsive
    // layout calculation (getOverviewLayout), never a fixed value.
    gridItem: {
      padding: s(DESIGN.spacing.sm),
    },

    card: {
      flex: 1,
      backgroundColor: colors.bgCard,
      borderRadius: s(DESIGN.components.cardRadius),
      padding: s(DESIGN.spacing.lg),
    },
    cardInner: {
      flex: 1,
      borderLeftWidth: s(6),
      borderLeftColor: colors.border,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: s(DESIGN.spacing.sm),
    },
    cardTitle: {
      fontSize: font(DESIGN.fontSize.xxl),
      fontWeight: '700',
      color: colors.textPrimary,
    },
    cardBadge: {
      paddingHorizontal: s(DESIGN.spacing.sm),
      paddingVertical: s(DESIGN.spacing.xs),
      borderRadius: s(4),
      backgroundColor: colors.bgElevated,
    },
    cardBadgeText: {
      fontSize: font(DESIGN.fontSize.sm),
      fontWeight: '600',
      color: colors.textSecondary,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: s(DESIGN.spacing.xs),
      gap: s(DESIGN.spacing.sm),
    },
    // No fixed label width: long labels such as "合单 / 整桌结账" take their
    // natural width instead of wrapping inside a narrow fixed column.
    cardLabel: {
      fontSize: font(DESIGN.fontSize.sm),
      color: colors.textMuted,
      flexShrink: 0,
    },
    cardValue: {
      fontSize: font(DESIGN.fontSize.md),
      color: colors.textSecondary,
      fontWeight: '600',
      flex: 1,
      textAlign: 'right',
    },
    cardPrice: {
      fontSize: font(DESIGN.fontSize.xxxl),
      fontWeight: '800',
      color: colors.textPrimary,
      marginLeft: 'auto',
    },

    tableTotalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bgElevated,
      borderRadius: s(DESIGN.components.cardRadius),
      paddingHorizontal: s(DESIGN.spacing.lg),
      paddingVertical: s(DESIGN.spacing.md),
      marginBottom: s(DESIGN.spacing.md),
    },
    tableTotalLabel: {
      fontSize: font(DESIGN.fontSize.xl),
      fontWeight: '700',
      color: colors.textPrimary,
    },
    tableTotalValue: {
      fontSize: font(DESIGN.fontSize.xxxl),
      fontWeight: '800',
      color: colors.success,
    },
    cardFooter: {
      flexDirection: 'row',
      marginTop: 'auto',
      paddingTop: s(DESIGN.spacing.md),
      gap: s(DESIGN.spacing.sm),
      flexWrap: 'wrap',
    },

    button: {
      height: btn(DESIGN.components.buttonHeight),
      borderRadius: s(8),
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: s(DESIGN.spacing.lg),
    },
    buttonPrimary: {
      backgroundColor: colors.primary,
    },
    buttonSuccess: {
      backgroundColor: colors.success,
    },
    buttonDanger: {
      backgroundColor: colors.danger,
    },
    buttonSecondary: {
      backgroundColor: colors.bgElevated,
    },
    buttonText: {
      fontSize: font(DESIGN.fontSize.md),
      fontWeight: '700',
      color: colors.textPrimary,
    },
    buttonTextPrimary: {
      color: '#fff',
    },

    buttonSm: {
      height: btn(DESIGN.components.buttonHeightSm),
      borderRadius: s(6),
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: s(DESIGN.spacing.md),
    },
    buttonSmText: {
      fontSize: font(DESIGN.fontSize.sm),
      fontWeight: '600',
      color: colors.textPrimary,
    },

    iconButton: {
      width: touch(48),
      height: touch(48),
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: s(8),
      backgroundColor: colors.bgElevated,
    },
    iconButtonText: {
      fontSize: font(DESIGN.fontSize.lg),
      color: colors.textPrimary,
    },

    bottomNav: {
      height: s(DESIGN.components.bottomBarHeight),
      flexDirection: 'row',
      backgroundColor: colors.bgCard,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    bottomNavItem: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    bottomNavItemActive: {
      backgroundColor: colors.bgElevated,
    },
    bottomNavText: {
      fontSize: font(DESIGN.fontSize.md),
      color: colors.textMuted,
      fontWeight: '600',
      marginTop: s(4),
    },
    bottomNavTextActive: {
      color: colors.primary,
    },

    loginContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: s(DESIGN.spacing.xl),
    },
    loginCard: {
      width: '100%',
      maxWidth: s(480),
      backgroundColor: colors.bgCard,
      borderRadius: s(DESIGN.components.cardRadius),
      padding: s(DESIGN.spacing.xxl),
    },
    loginTitle: {
      fontSize: font(DESIGN.fontSize.xxxl),
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: s(DESIGN.spacing.xl),
    },
    loginInput: {
      height: btn(56),
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: s(8),
      backgroundColor: colors.bgElevated,
      color: colors.textPrimary,
      fontSize: font(DESIGN.fontSize.md),
      paddingHorizontal: s(DESIGN.spacing.md),
      marginBottom: s(DESIGN.spacing.md),
    },
    loginButton: {
      height: btn(56),
      backgroundColor: colors.primary,
      borderRadius: s(8),
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: s(DESIGN.spacing.md),
    },
    loginButtonText: {
      fontSize: font(DESIGN.fontSize.lg),
      fontWeight: '700',
      color: '#fff',
    },
    loginLangToggle: {
      marginTop: s(DESIGN.spacing.lg),
      alignSelf: 'center',
      padding: s(DESIGN.spacing.sm),
    },
    loginLangText: {
      fontSize: font(DESIGN.fontSize.md),
      color: colors.textSecondary,
    },

    orderCard: {
      backgroundColor: colors.bgCard,
      borderRadius: s(DESIGN.components.cardRadius),
      padding: s(DESIGN.spacing.md),
      marginBottom: s(DESIGN.spacing.md),
    },
    orderCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: s(DESIGN.spacing.sm),
    },
    orderCardTitle: {
      fontSize: font(DESIGN.fontSize.lg),
      fontWeight: '700',
      color: colors.textPrimary,
      flexShrink: 1,
    },
    orderCardStatus: {
      paddingHorizontal: s(DESIGN.spacing.sm),
      paddingVertical: s(DESIGN.spacing.xs),
      borderRadius: s(4),
      marginLeft: s(DESIGN.spacing.sm),
    },
    orderCardStatusText: {
      fontSize: font(DESIGN.fontSize.sm),
      fontWeight: '700',
    },
    orderCardTime: {
      fontSize: font(DESIGN.fontSize.sm),
      color: colors.textMuted,
      marginBottom: s(DESIGN.spacing.sm),
    },

    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: s(DESIGN.spacing.sm),
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    itemName: {
      flex: 1,
      fontSize: font(DESIGN.fontSize.md),
      color: colors.textPrimary,
    },
    itemPrice: {
      fontSize: font(DESIGN.fontSize.md),
      color: colors.textSecondary,
      marginRight: s(DESIGN.spacing.md),
    },
    itemActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(DESIGN.spacing.xs),
    },

    customerCard: {
      backgroundColor: colors.bgCard,
      borderRadius: s(DESIGN.components.cardRadius),
      padding: s(DESIGN.spacing.md),
      margin: s(DESIGN.spacing.sm),
    },
    customerCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: s(DESIGN.spacing.sm),
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: s(DESIGN.spacing.sm),
    },
    customerCardName: {
      fontSize: font(DESIGN.fontSize.xl),
      fontWeight: '700',
      color: colors.textPrimary,
      flexShrink: 1,
    },
    customerCardTotal: {
      fontSize: font(DESIGN.fontSize.xxl),
      fontWeight: '800',
      color: colors.textPrimary,
    },
    customerCardMeta: {
      fontSize: font(DESIGN.fontSize.sm),
      color: colors.textMuted,
      marginBottom: s(DESIGN.spacing.sm),
    },
    customerCardActions: {
      flexDirection: 'row',
      gap: s(DESIGN.spacing.sm),
      marginTop: s(DESIGN.spacing.sm),
    },

    historyCard: {
      backgroundColor: colors.bgCard,
      borderRadius: s(DESIGN.components.cardRadius),
      padding: s(DESIGN.spacing.md),
      marginBottom: s(DESIGN.spacing.md),
    },
    historyCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: s(DESIGN.spacing.sm),
    },
    historyCardTitle: {
      fontSize: font(DESIGN.fontSize.lg),
      fontWeight: '700',
      color: colors.textPrimary,
      flexShrink: 1,
    },
    historyCardMeta: {
      fontSize: font(DESIGN.fontSize.sm),
      color: colors.textMuted,
    },

    modalOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.7)',
    },
    modalContent: {
      position: 'absolute',
      top: '10%',
      left: '10%',
      right: '10%',
      bottom: '10%',
      backgroundColor: colors.bgCard,
      borderRadius: s(DESIGN.components.cardRadius),
      padding: s(DESIGN.spacing.lg),
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: s(DESIGN.spacing.md),
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: s(DESIGN.spacing.md),
    },
    modalTitle: {
      fontSize: font(DESIGN.fontSize.xxl),
      fontWeight: '700',
      color: colors.textPrimary,
    },
    modalClose: {
      width: touch(48),
      height: touch(48),
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCloseText: {
      fontSize: font(DESIGN.fontSize.xxl),
      color: colors.textSecondary,
    },

    menuCategory: {
      marginBottom: s(DESIGN.spacing.md),
    },
    menuCategoryTitle: {
      fontSize: font(DESIGN.fontSize.lg),
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: s(DESIGN.spacing.sm),
    },
    menuItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: s(DESIGN.spacing.md),
      backgroundColor: colors.bgElevated,
      borderRadius: s(8),
      marginBottom: s(DESIGN.spacing.sm),
    },
    menuItemName: {
      fontSize: font(DESIGN.fontSize.md),
      color: colors.textPrimary,
    },
    menuItemPrice: {
      fontSize: font(DESIGN.fontSize.md),
      color: colors.textSecondary,
    },
    quantitySelector: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(DESIGN.spacing.md),
    },
    quantityText: {
      fontSize: font(DESIGN.fontSize.lg),
      fontWeight: '700',
      color: colors.textPrimary,
      minWidth: s(40),
      textAlign: 'center',
    },

    detailContainer: {
      flex: 1,
    },
    detailTitle: {
      fontSize: font(DESIGN.fontSize.xxl),
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: s(DESIGN.spacing.md),
    },
    detailSubtitle: {
      fontSize: font(DESIGN.fontSize.md),
      color: colors.textSecondary,
      marginBottom: s(DESIGN.spacing.md),
    },
    detailActions: {
      flexDirection: 'row',
      gap: s(DESIGN.spacing.sm),
      marginTop: s(DESIGN.spacing.md),
    },

    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyStateText: {
      fontSize: font(DESIGN.fontSize.lg),
      color: colors.textMuted,
    },

    noteContainer: {
      backgroundColor: DESIGN.colors.noteBackground,
      borderLeftWidth: 4,
      borderLeftColor: DESIGN.colors.noteBorder,
      borderRadius: s(8),
      padding: s(DESIGN.spacing.md),
      marginBottom: s(DESIGN.spacing.md),
      marginTop: s(DESIGN.spacing.sm),
    },
    noteTitle: {
      fontSize: font(DESIGN.fontSize.md),
      fontWeight: '700',
      color: DESIGN.colors.noteText,
      marginBottom: s(DESIGN.spacing.xs),
    },
    noteText: {
      fontSize: Math.max(font(DESIGN.fontSize.lg), 18),
      fontWeight: '600',
      color: DESIGN.colors.noteText,
      lineHeight: Math.max(font(24), 24),
    },

    closedSection: {
      marginTop: s(16),
    },
    closedSectionToggle: {
      minHeight: touch(48),
      justifyContent: 'center',
      alignItems: 'flex-start',
      paddingHorizontal: s(16),
      paddingVertical: s(12),
      borderRadius: s(8),
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.border,
    },
    closedSectionToggleText: {
      fontSize: font(DESIGN.fontSize.md),
      fontWeight: '700',
      color: colors.textPrimary,
    },
    unservedReminder: {
      fontSize: font(DESIGN.fontSize.sm),
      fontWeight: '700',
      color: DESIGN.colors.warning,
      marginTop: s(4),
    },

    orderFooterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: s(12),
    },
    orderFooterActions: {
      flexDirection: 'row',
      gap: s(8),
      flexWrap: 'wrap',
    },
    orderTotalText: {
      fontSize: font(DESIGN.fontSize.lg),
      fontWeight: '700',
      color: colors.textPrimary,
    },
    orderWarningText: {
      fontSize: font(DESIGN.fontSize.sm),
      color: DESIGN.colors.warning,
      marginTop: s(4),
    },
    customerOrdersList: {
      gap: 12,
    },
  });
}

// ============================================================================
// MENU / ADD-ITEM MODAL
// ============================================================================
type MenuCategory = {
  id?: string;
  name: string;
  sortIndex?: number;
};

type AddItemModalProps = {
  visible: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
  orderedCategories: MenuCategory[];
  categoryMap: Map<string, MenuItem[]>;
  fallbackItems: MenuItem[];
  fallbackName: string;
  lang: Lang;
  scale: ReturnType<typeof useScale>;
  styles: ReturnType<typeof createStyles>;
  colors: typeof DESIGN.colors;
  selectedMenuItems: Record<string, number>;
  onQuantityChange: (itemId: string, delta: number) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
};

const AddItemModalComponent = ({
  visible,
  onClose,
  menuItems,
  orderedCategories,
  categoryMap,
  fallbackItems,
  fallbackName,
  lang,
  scale,
  styles,
  colors,
  selectedMenuItems,
  onQuantityChange,
  onSubmit,
  isSubmitting = false,
}: AddItemModalProps) => {
  const { s, font } = scale;
  const dict = I18N[lang];

  const totalSelected = useMemo(() => {
    return Object.entries(selectedMenuItems).reduce((sum, [id, qty]) => {
      const item = menuItems.find(i => i.id === id);
      return sum + (item ? item.price * qty : 0);
    }, 0);
  }, [menuItems, selectedMenuItems]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{dict.addDish}</Text>
            <Pressable style={styles.modalClose} onPress={onClose}>
              <Text style={styles.modalCloseText}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }}>
            {menuItems.length === 0 ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: font(DESIGN.fontSize.lg), color: colors.textMuted }}>
                  暂无菜单或加载中...
                </Text>
              </View>
            ) : (
              orderedCategories.map(cat => {
                const items = categoryMap.get(cat.name) || [];
                if (items.length === 0) return null;
                return (
                  <View key={cat.id || cat.name} style={styles.menuCategory}>
                    <Text style={styles.menuCategoryTitle}>{cat.name}</Text>
                    {items.map(item => (
                      <View key={item.id} style={styles.menuItem}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.menuItemName}>{item.name}</Text>
                          <Text style={{ fontSize: font(DESIGN.fontSize.sm), color: colors.textMuted }}>
                            {formatMoney(item.price)}
                          </Text>
                        </View>
                        <View style={styles.quantitySelector}>
                          <Pressable style={styles.iconButton} onPress={() => onQuantityChange(item.id, -1)}>
                            <Text style={styles.iconButtonText}>-</Text>
                          </Pressable>
                          <Text style={styles.quantityText}>{selectedMenuItems[item.id] || 0}</Text>
                          <Pressable style={styles.iconButton} onPress={() => onQuantityChange(item.id, 1)}>
                            <Text style={styles.iconButtonText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })
            )}
            {fallbackItems.length > 0 && (
              <View style={styles.menuCategory}>
                <Text style={styles.menuCategoryTitle}>{fallbackName}</Text>
                {fallbackItems.map(item => (
                  <View key={item.id} style={styles.menuItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuItemName}>{item.name}</Text>
                      <Text style={{ fontSize: font(DESIGN.fontSize.sm), color: colors.textMuted }}>
                        {formatMoney(item.price)}
                      </Text>
                    </View>
                    <View style={styles.quantitySelector}>
                      <Pressable style={styles.iconButton} onPress={() => onQuantityChange(item.id, -1)}>
                        <Text style={styles.iconButtonText}>-</Text>
                      </Pressable>
                      <Text style={styles.quantityText}>{selectedMenuItems[item.id] || 0}</Text>
                      <Pressable style={styles.iconButton} onPress={() => onQuantityChange(item.id, 1)}>
                        <Text style={styles.iconButtonText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: s(16), paddingTop: s(16), borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ fontSize: font(DESIGN.fontSize.xl), fontWeight: '700', color: colors.textPrimary }}>
              {dict.totalAmount}: {formatMoney(totalSelected)}
            </Text>
            <View style={{ flexDirection: 'row', gap: s(12) }}>
              <Pressable style={[styles.button, styles.buttonSecondary]} onPress={onClose} disabled={isSubmitting}>
                <Text style={styles.buttonText}>{dict.cancel}</Text>
              </Pressable>
              <Pressable
                testID="add-item-submit"
                style={[styles.button, styles.buttonSuccess, isSubmitting ? { opacity: 0.5 } : null]}
                onPress={onSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{dict.addDish}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ============================================================================
// MODULE-LEVEL ORDER CARD COMPONENT
// ============================================================================
export const OrderCard = ({
  order,
  dict,
  lang,
  styles,
  colors,
  onUpdateOrderStatus,
  onUpdateItemServed,
  onUpdateItemQuantity,
  onOpenAddDish,
}: {
  order: Order;
  dict: Dict;
  lang: Lang;
  styles: ReturnType<typeof createStyles>;
  colors: typeof DESIGN.colors;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onUpdateItemServed: (orderId: string, itemId: number, served: boolean) => Promise<void>;
  onUpdateItemQuantity: (orderId: string, itemId: number, delta: number) => Promise<void>;
  onOpenAddDish: (orderId: string) => void;
}) => {
  const statusColor = getStatusColor(order.status);
  const canAccept = order.status === 'new';
  const canCompletePrep = order.status === 'preparing';
  const canCompleteServe = order.status === 'ready';
  const editable = order.status !== 'served' && order.status !== 'cancelled';
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    if (isUpdating) return;
    try {
      setIsUpdating(true);
      await onUpdateOrderStatus(order.id, newStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleServed = async (itemId: number, served: boolean) => {
    if (isUpdating) return;
    try {
      setIsUpdating(true);
      await onUpdateItemServed(order.id, itemId, served);
    } catch (e) {
      console.error('Failed to toggle served status:', e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleQuantityChange = async (itemId: number, delta: number) => {
    if (isUpdating) return;
    try {
      setIsUpdating(true);
      await onUpdateItemQuantity(order.id, itemId, delta);
    } catch (e) {
      console.error('Failed to update quantity:', e);
    } finally {
      setIsUpdating(false);
    }
  };

  const hasUnservedItems = order.items.some(item => !item.served);

  return (
    <View style={styles.orderCard} testID={`order-card-${order.id}`}>
      <View style={styles.orderCardHeader}>
        <Text style={styles.orderCardTitle}>
          {order.customerName?.trim() || dict.guest} - {formatTime(order.createdAt)}
        </Text>
        <View style={[styles.orderCardStatus, { backgroundColor: statusColor + '33' }]}>
          <Text style={[styles.orderCardStatusText, { color: statusColor }]}>
            {getStatusText(order.status, lang)}
          </Text>
        </View>
      </View>

      {/* Dish note: bold label + large high-contrast text, above the item list */}
      {order.note && order.note.trim() !== '' && (
        <View style={styles.noteContainer} testID="dish-note">
          <Text style={styles.noteTitle}>{dict.dishNote}</Text>
          <Text style={styles.noteText}>{order.note}</Text>
        </View>
      )}

      {order.items.map((item, idx) => (
        <View key={idx} style={styles.itemRow}>
          <Text style={styles.itemName}>{item.name} x{item.quantity}</Text>
          <Text style={styles.itemPrice}>{formatMoney(item.subtotal)}</Text>
          {editable && (
            <View style={styles.itemActions}>
              <Pressable
                style={[styles.iconButton, { backgroundColor: item.served ? colors.success : colors.bgElevated, opacity: isUpdating ? 0.5 : 1 }]}
                onPress={() => handleToggleServed(item.itemId, !item.served)}
                disabled={isUpdating}
              >
                <Text style={styles.iconButtonText}>{item.served ? '✓' : '○'}</Text>
              </Pressable>
              <Pressable
                style={[styles.iconButton, { opacity: isUpdating ? 0.5 : 1 }]}
                onPress={() => handleQuantityChange(item.itemId, -1)}
                disabled={isUpdating || item.served === true}
              >
                <Text style={styles.iconButtonText}>-</Text>
              </Pressable>
              <Pressable
                style={[styles.iconButton, { opacity: isUpdating ? 0.5 : 1 }]}
                onPress={() => handleQuantityChange(item.itemId, 1)}
                disabled={isUpdating || item.served === true}
              >
                <Text style={styles.iconButtonText}>+</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}

      <Text style={styles.orderCardTime}>({formatTime(order.createdAt)})</Text>

      <View style={styles.orderFooterRow}>
        <View>
          <Text style={styles.orderTotalText}>
            {dict.orderAmount}: {formatMoney(order.total)}
          </Text>
          {order.status === 'served' && hasUnservedItems && (
            <Text style={styles.orderWarningText}>
              {dict.unservedItems}: {order.items.filter(item => item.served === false).length}
            </Text>
          )}
        </View>

        <View style={styles.orderFooterActions}>
          {canAccept && (
            <Pressable
              testID={`order-accept-${order.id}`}
              style={[styles.buttonSm, styles.buttonPrimary, isUpdating ? { opacity: 0.5 } : null]}
              onPress={() => handleUpdateStatus('preparing')}
              disabled={isUpdating}
            >
              <Text style={[styles.buttonSmText, styles.buttonTextPrimary]}>{dict.acceptOrder}</Text>
            </Pressable>
          )}
          {canCompletePrep && (
            <Pressable
              style={[styles.buttonSm, styles.buttonSuccess, isUpdating ? { opacity: 0.5 } : null]}
              onPress={() => handleUpdateStatus('ready')}
              disabled={isUpdating}
            >
              <Text style={[styles.buttonSmText, styles.buttonTextPrimary]}>{dict.completePreparing}</Text>
            </Pressable>
          )}
          {canCompleteServe && (
            <Pressable
              style={[styles.buttonSm, styles.buttonSuccess, isUpdating ? { opacity: 0.5 } : null]}
              onPress={() => handleUpdateStatus('served')}
              disabled={isUpdating}
            >
              <Text style={[styles.buttonSmText, styles.buttonTextPrimary]}>{dict.completeServing}</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.buttonSm, styles.buttonSecondary]}
            onPress={() => onOpenAddDish(order.id)}
            disabled={!editable || isUpdating}
          >
            <Text style={styles.buttonSmText}>{dict.addDish}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// MODULE-LEVEL CUSTOMER CARD COMPONENT
// ============================================================================
export const CustomerCard = ({
  zoneId,
  customerName,
  customerOrders,
  customerTotal,
  settlement,
  dict,
  lang,
  styles,
  colors,
  onUpdateOrderStatus,
  onUpdateItemServed,
  onUpdateItemQuantity,
  onOpenAddDish,
  onUpdateCustomerSettlement,
  onPrintCustomerReceipt,
}: {
  zoneId: string;
  customerName: string;
  customerOrders: Order[];
  customerTotal: number;
  settlement?: CustomerSettlementInfo;
  dict: Dict;
  lang: Lang;
  styles: ReturnType<typeof createStyles>;
  colors: typeof DESIGN.colors;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onUpdateItemServed: (orderId: string, itemId: number, served: boolean) => Promise<void>;
  onUpdateItemQuantity: (orderId: string, itemId: number, delta: number) => Promise<void>;
  onOpenAddDish: (orderId: string) => void;
  onUpdateCustomerSettlement: (zoneId: string, customerName: string, settled: boolean) => Promise<void>;
  onPrintCustomerReceipt: (zoneId: string, customerName: string) => Promise<void>;
}) => {
  const isSettled = settlement?.settled || false;
  const [isSettling, setIsSettling] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [closedVisible, setClosedVisible] = useState(false);

  const pendingOrders = useMemo(() => customerOrders.filter(o => isPendingStatus(o.status)), [customerOrders]);
  const closedOrders = useMemo(() => customerOrders.filter(o => !isPendingStatus(o.status)), [customerOrders]);
  const closedHasUnserved = useMemo(() => closedOrders.some(o => o.items.some(item => !item.served)), [closedOrders]);

  const totalPortions = customerOrders.reduce((sum, o) => sum + o.items.reduce((s2, i) => s2 + Number(i.quantity || 0), 0), 0);
  const unservedCount = customerOrders.reduce((sum, o) => sum + o.items.filter(item => !item.served).length, 0);

  const handleToggleSettled = async () => {
    if (isSettling) return;
    try {
      setIsSettling(true);
      await onUpdateCustomerSettlement(zoneId, customerName, !isSettled);
    } catch (e) {
      console.error('Failed to update customer settlement:', e);
    } finally {
      setIsSettling(false);
    }
  };

  const handlePrint = async () => {
    if (isPrinting) return;
    try {
      setIsPrinting(true);
      await onPrintCustomerReceipt(zoneId, customerName);
    } catch (e) {
      console.error('Failed to print customer receipt:', e);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <View style={styles.customerCard} testID={`customer-card-${customerName}`}>
      <View style={styles.customerCardHeader}>
        <Text style={styles.customerCardName}>{customerName}</Text>
        <Text style={styles.customerCardTotal}>{formatMoney(customerTotal)}</Text>
      </View>

      <Text style={styles.customerCardMeta}>
        {dict.customerTotalLabel}: {formatMoney(customerTotal)} · {customerOrders.length} {dict.orders} · {totalPortions} {dict.portions}
        {unservedCount > 0 ? ` · ${dict.unservedItems}: ${unservedCount}` : ''}
      </Text>

      <View style={styles.customerOrdersList}>
        {pendingOrders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            dict={dict}
            lang={lang}

            styles={styles}
            colors={colors}
            onUpdateOrderStatus={onUpdateOrderStatus}
            onUpdateItemServed={onUpdateItemServed}
            onUpdateItemQuantity={onUpdateItemQuantity}
            onOpenAddDish={onOpenAddDish}
          />
        ))}

        {closedOrders.length > 0 && (
          <View style={styles.closedSection}>
            <Pressable
              testID={`customer-closed-toggle-${customerName}`}
              style={styles.closedSectionToggle}
              onPress={() => setClosedVisible(prev => !prev)}
            >
              <Text style={styles.closedSectionToggleText}>
                {dict.closedSectionTitle.replace('{count}', String(closedOrders.length))}
                {closedVisible ? ' ▾' : ' ▸'}
              </Text>
              {closedHasUnserved && !closedVisible && (
                <Text style={styles.unservedReminder}>{dict.unservedReminder}</Text>
              )}
            </Pressable>
            {closedVisible && closedOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                dict={dict}
                lang={lang}

                styles={styles}
                colors={colors}
                onUpdateOrderStatus={onUpdateOrderStatus}
                onUpdateItemServed={onUpdateItemServed}
                onUpdateItemQuantity={onUpdateItemQuantity}
                onOpenAddDish={onOpenAddDish}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.customerCardActions}>
        <Pressable
          testID={`customer-settlement-${customerName}`}
          style={[styles.buttonSm, isSettled ? styles.buttonSuccess : styles.buttonSecondary, isSettling ? { opacity: 0.5 } : null]}
          onPress={handleToggleSettled}
          disabled={isSettling}
        >
          {isSettling ? (
            <ActivityIndicator color={isSettled ? '#fff' : colors.textPrimary} />
          ) : (
            <Text style={styles.buttonSmText}>
              {isSettled ? dict.settled : dict.unsettled}
            </Text>
          )}
        </Pressable>

        <Pressable
          testID={`customer-print-${customerName}`}
          style={[styles.buttonSm, styles.buttonPrimary, isPrinting ? { opacity: 0.5 } : null]}
          onPress={handlePrint}
          disabled={isPrinting}
        >
          <Text style={[styles.buttonSmText, styles.buttonTextPrimary]}>{dict.printReceipt}</Text>
        </Pressable>
      </View>
    </View>
  );
};

// ============================================================================
// MODULE-LEVEL DETAIL SCREEN COMPONENT
// ============================================================================
type DetailScreenProps = {
  selectedZone: Zone;
  zoneCheckoutStatus: Record<string, ZoneCheckoutStatus>;
  zones: Zone[];
  orders: Order[];
  dict: Dict;
  lang: Lang;
  styles: ReturnType<typeof createStyles>;
  colors: typeof DESIGN.colors;
  onBack: () => void;
  onSwitchBillingMode: (zoneId: string, billingMode: 'split' | 'merged') => Promise<void>;
  onOpenSession: (zoneId: string) => Promise<void>;
  onCheckoutZone: (zoneId: string) => Promise<void>;
  onPrintReceipt: (zoneId: string, customerName?: string) => Promise<void>;
  onOpenBottomAddDish: () => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onUpdateItemServed: (orderId: string, itemId: number, served: boolean) => Promise<void>;
  onUpdateItemQuantity: (orderId: string, itemId: number, delta: number) => Promise<void>;
  onOpenAddDish: (orderId: string) => void;
  onUpdateCustomerSettlement: (zoneId: string, customerName: string, settled: boolean) => Promise<void>;
  onPrintCustomerReceipt: (zoneId: string, customerName: string) => Promise<void>;
};

export const DetailScreen = ({
  selectedZone,
  zoneCheckoutStatus,
  zones,
  orders,
  dict,
  lang,
  styles,
  colors,
  onBack,
  onSwitchBillingMode,
  onOpenSession,
  onCheckoutZone,
  onPrintReceipt,
  onOpenBottomAddDish,
  onUpdateOrderStatus,
  onUpdateItemServed,
  onUpdateItemQuantity,
  onOpenAddDish,
  onUpdateCustomerSettlement,
  onPrintCustomerReceipt,
}: DetailScreenProps) => {
  const [isSwitching, setIsSwitching] = useState(false);
  const [isExecutingCheckout, setIsExecutingCheckout] = useState(false);
  const [closedVisible, setClosedVisible] = useState(false);

  // Zone-scoped orders, always recomputed from latest props (polling safe).
  const zoneOrders = useMemo(
    () => sortOrdersByCreatedAt(orders.filter(o => o.zoneId === selectedZone.id)),
    [orders, selectedZone.id],
  );

  const pendingOrders = useMemo(() => zoneOrders.filter(o => isPendingStatus(o.status)), [zoneOrders]);
  const closedOrders = useMemo(() => zoneOrders.filter(o => !isPendingStatus(o.status)), [zoneOrders]);
  const closedHasUnserved = useMemo(() => closedOrders.some(o => o.items.some(item => !item.served)), [closedOrders]);

  // Split mode: group by trimmed customer name; each customer appears exactly once.
  const customerGroups = useMemo(
    () => buildCustomerGroups(zoneOrders, dict.guest),
    [zoneOrders, dict.guest],
  );

  const zoneStatus = zoneCheckoutStatus[selectedZone.id];

  // ONE effective mode drives page display AND the checkout button, so the
  // page can never show "merged" while the checkout logic runs in "split"
  // (or vice versa) even when the cached status is stale.
  const effectiveBillingMode = useMemo(
    () => resolveBillingMode(selectedZone.id, zoneCheckoutStatus, zones, selectedZone),
    [selectedZone, zoneCheckoutStatus, zones],
  );
  const isMerged = effectiveBillingMode === 'merged';

  // Whole-room payable total: sum of non-cancelled order.total (same口径 as customer totals).
  const tableTotal = useMemo(() => customerPayableTotal(zoneOrders), [zoneOrders]);

  // UI enable/disable and the real checkout execution share canCheckoutFromUi.
  const canCheckout = useMemo(() => {
    const unsettled = zoneStatus?.unsettledCustomerCount ?? selectedZone.unsettledCustomerCount;
    return canCheckoutFromUi(selectedZone.sessionOpen, effectiveBillingMode, unsettled);
  }, [effectiveBillingMode, selectedZone, zoneStatus]);

  const handleSwitchBillingMode = async (billingMode: 'split' | 'merged') => {
    if (isSwitching || effectiveBillingMode === billingMode) return;
    setIsSwitching(true);
    try {
      await onSwitchBillingMode(selectedZone.id, billingMode);
    } catch (e) {
      console.error('Failed to switch billing mode:', e);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleCheckout = async () => {
    setIsExecutingCheckout(true);
    try {
      await onCheckoutZone(selectedZone.id);
    } finally {
      setIsExecutingCheckout(false);
    }
  };

  return (
    <View style={styles.container} testID="detail-screen">
      <View style={styles.topBar}>
        <Pressable style={styles.topBarButton} onPress={onBack}>
          <Text style={styles.topBarButtonText}>{dict.back}</Text>
        </Pressable>
        <Text style={styles.topBarTitle}>{selectedZone.label}</Text>
        <View style={styles.modeToggleRow}>
          <Pressable
            testID="mode-merged"
            style={[
              styles.modeToggleBtn,
              isMerged ? styles.modeToggleBtnActive : null,
              isSwitching ? { opacity: 0.5 } : null,
            ]}
            onPress={() => handleSwitchBillingMode('merged')}
            disabled={isSwitching || isMerged}
          >
            <Text style={[styles.modeToggleText, isMerged ? styles.modeToggleTextActive : null]}>
              {dict.merged}
            </Text>
          </Pressable>
          <Pressable
            testID="mode-split"
            style={[
              styles.modeToggleBtn,
              !isMerged ? styles.modeToggleBtnActive : null,
              isSwitching ? { opacity: 0.5 } : null,
            ]}
            onPress={() => handleSwitchBillingMode('split')}
            disabled={isSwitching || !isMerged}
          >
            <Text style={[styles.modeToggleText, !isMerged ? styles.modeToggleTextActive : null]}>
              {dict.split}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statusBar}>
        <Text style={styles.statusBarText}>
          {selectedZone.sessionOpen ? dict.opened : dict.closed}
        </Text>
        {zoneStatus?.unsettledCustomerCount !== undefined && (
          <Text style={styles.statusBarText}>
            {dict.unsettled}: <Text style={styles.statusBarValue}>{zoneStatus.unsettledCustomerCount}</Text>
          </Text>
        )}
      </View>

      <View style={styles.content}>
        {!selectedZone.sessionOpen ? (
          <View style={styles.emptyState}>
            <Pressable
              style={styles.button}
              onPress={() => onOpenSession(selectedZone.id)}
              disabled={isSwitching}
            >
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{dict.openSession}</Text>
            </Pressable>
          </View>
        ) : !isMerged ? (
          /* ============ SPLIT MODE: grouped by customer, one card per customer ============ */
          <ScrollView>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {customerGroups.map(group => (
                <View key={group.customerName} style={{ width: customerGroups.length === 1 ? '100%' : '50%' }}>
                  <CustomerCard
                    zoneId={selectedZone.id}
                    customerName={group.customerName}
                    customerOrders={group.orders}
                    customerTotal={group.total}
                    settlement={zoneStatus?.settlements?.[group.customerName]}
                    dict={dict}
                    lang={lang}
                    styles={styles}
                    colors={colors}
                    onUpdateOrderStatus={onUpdateOrderStatus}
                    onUpdateItemServed={onUpdateItemServed}
                    onUpdateItemQuantity={onUpdateItemQuantity}
                    onOpenAddDish={onOpenAddDish}
                    onUpdateCustomerSettlement={onUpdateCustomerSettlement}
                    onPrintCustomerReceipt={onPrintCustomerReceipt}
                  />
                </View>
              ))}
            </View>
            {zoneOrders.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>{dict.historyEmpty}</Text>
              </View>
            )}
          </ScrollView>
        ) : (
          /* ============ MERGED MODE: whole-room order flow ============ */
          <ScrollView>
            <View style={styles.tableTotalRow} testID="table-total-row">
              <Text style={styles.tableTotalLabel}>{dict.tableTotal}</Text>
              <Text style={styles.tableTotalValue} testID="table-total-value">{formatMoney(tableTotal)}</Text>
            </View>
            {pendingOrders.length === 0 && closedOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>当前会话暂无订单</Text>
              </View>
            ) : (
              <>
                {pendingOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    dict={dict}
                    lang={lang}

                    styles={styles}
                    colors={colors}
                    onUpdateOrderStatus={onUpdateOrderStatus}
                    onUpdateItemServed={onUpdateItemServed}
                    onUpdateItemQuantity={onUpdateItemQuantity}
                    onOpenAddDish={onOpenAddDish}
                  />
                ))}

                {closedOrders.length > 0 && (
                  <View style={styles.closedSection}>
                    <Pressable
                      testID="closed-orders-toggle"
                      style={styles.closedSectionToggle}
                      onPress={() => setClosedVisible(prev => !prev)}
                    >
                      <Text style={styles.closedSectionToggleText}>
                        {dict.closedSectionTitle.replace('{count}', String(closedOrders.length))}
                        {closedVisible ? ' ▾' : ' ▸'}
                      </Text>
                      {closedHasUnserved && !closedVisible && (
                        <Text style={styles.unservedReminder}>{dict.unservedReminder}</Text>
                      )}
                    </Pressable>
                    {closedVisible && closedOrders.map(order => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        dict={dict}
                        lang={lang}

                        styles={styles}
                        colors={colors}
                        onUpdateOrderStatus={onUpdateOrderStatus}
                        onUpdateItemServed={onUpdateItemServed}
                        onUpdateItemQuantity={onUpdateItemQuantity}
                        onOpenAddDish={onOpenAddDish}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>

      <View style={styles.bottomNav}>
        <Pressable style={styles.bottomNavItem} onPress={onOpenBottomAddDish}>
          <Text style={styles.bottomNavText}>{dict.addDish}</Text>
        </Pressable>
        <Pressable style={styles.bottomNavItem} onPress={() => onPrintReceipt(selectedZone.id)}>
          <Text style={styles.bottomNavText}>{dict.printReceipt}</Text>
        </Pressable>
        <Pressable
          testID="detail-checkout"
          style={[
            styles.bottomNavItem,
            canCheckout ? null : { opacity: 0.5 },
            isExecutingCheckout ? { opacity: 0.5 } : null,
          ]}
          onPress={handleCheckout}
          disabled={!canCheckout || isExecutingCheckout}
        >
          <Text style={[styles.bottomNavText, { color: colors.danger }]}>{dict.checkout}</Text>
        </Pressable>
      </View>
    </View>
  );
};

// ============================================================================
// MODULE-LEVEL PRESENTATIONAL COMPONENTS (Overview / History)
// ============================================================================
type ZoneCardProps = {
  zone: Zone;
  zoneOrders: Order[];
  dict: Dict;
  styles: ReturnType<typeof createStyles>;
  colors: typeof DESIGN.colors;
  onOpenZone: (zone: Zone) => void;
  onOpenSession: (zoneId: string) => void;
};

const ZoneCard = ({ zone, zoneOrders, dict, styles, colors, onOpenZone, onOpenSession }: ZoneCardProps) => {
  const newCount = zoneOrders.filter(o => o.status === 'new').length;
  const preparingCount = zoneOrders.filter(o => o.status === 'preparing').length;
  const readyCount = zoneOrders.filter(o => o.status === 'ready').length;
  const status = zone.sessionOpen ? 'opened' : 'closed';
  const mode = zone.billingMode === 'split' ? 'split' : 'merged';
  const people = getZoneCustomerCounts(zoneOrders, zone.unsettledCustomerCount, dict.guest);

  return (
    <Pressable style={styles.card} onPress={() => onOpenZone(zone)}>
      <View style={[styles.cardInner, { borderLeftColor: zone.sessionOpen ? colors.success : colors.border }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{zone.label}</Text>
          <View style={styles.cardBadge}>
            <Text style={styles.cardBadgeText}>{dict[status]}</Text>
          </View>
        </View>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{dict.totalAmount}</Text>
          <Text style={styles.cardPrice}>{formatMoney(zone.activeOrderTotal)}</Text>
        </View>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{mode === 'split' ? dict.split : dict.tableCheckoutNote}</Text>
          <Text style={styles.cardValue}>{zone.activeOrderCount} {dict.orders}</Text>
        </View>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{dict.unsettledCountLabel}</Text>
          <Text style={styles.cardValue} testID={`zone-unsettled-${zone.id}`}>
            {people.unsettledCount} {dict.peopleUnit}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{dict.settledCountLabel}</Text>
          <Text style={styles.cardValue} testID={`zone-settled-${zone.id}`}>
            {people.settledCount} {dict.peopleUnit}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          {!zone.sessionOpen && (
            <Pressable
              style={[styles.buttonSm, { backgroundColor: colors.primary }]}
              onPress={(e) => {
                e.stopPropagation();
                onOpenSession(zone.id);
              }}
            >
              <Text style={[styles.buttonSmText, { color: '#fff' }]}>{dict.openSession}</Text>
            </Pressable>
          )}
          {newCount > 0 && (
            <View style={[styles.buttonSm, { backgroundColor: colors.statusNew }]}>
              <Text style={styles.buttonSmText}>{newCount}</Text>
            </View>
          )}
          {preparingCount > 0 && (
            <View style={[styles.buttonSm, { backgroundColor: colors.statusPreparing }]}>
              <Text style={styles.buttonSmText}>{preparingCount}</Text>
            </View>
          )}
          {readyCount > 0 && (
            <View style={[styles.buttonSm, { backgroundColor: colors.statusReady }]}>
              <Text style={styles.buttonSmText}>{readyCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const HistoryCard = ({ batch, dict, scale, styles, colors }: {
  batch: HistoryBatch;
  dict: Dict;
  scale: ReturnType<typeof useScale>;
  styles: ReturnType<typeof createStyles>;
  colors: typeof DESIGN.colors;
}) => {
  const { s, font } = scale;
  return (
    <View style={styles.historyCard}>
      <View style={styles.historyCardHeader}>
        <Text style={styles.historyCardTitle}>
          {batch.zoneLabel} - {batch.legacy ? dict.legacy : `${dict.batch} ${batch.batchKey.slice(-6)}`}
        </Text>
        <Text style={styles.historyCardMeta}>
          {batch.checkoutAt ? formatTime(batch.checkoutAt) : ''}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: s(24), marginTop: s(8) }}>
        <View>
          <Text style={{ fontSize: font(DESIGN.fontSize.sm), color: colors.textMuted }}>{dict.totalAmount}</Text>
          <Text style={{ fontSize: font(DESIGN.fontSize.xl), fontWeight: '700', color: colors.textPrimary }}>
            {formatMoney(batch.total)}
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: font(DESIGN.fontSize.sm), color: colors.textMuted }}>{dict.guest}</Text>
          <Text style={{ fontSize: font(DESIGN.fontSize.xl), fontWeight: '700', color: colors.textPrimary }}>
            {batch.customerCount}
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: font(DESIGN.fontSize.sm), color: colors.textMuted }}>{dict.orders}</Text>
          <Text style={{ fontSize: font(DESIGN.fontSize.xl), fontWeight: '700', color: colors.textPrimary }}>
            {batch.orderCount}
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: font(DESIGN.fontSize.sm), color: colors.textMuted }}>{dict.portions}</Text>
          <Text style={{ fontSize: font(DESIGN.fontSize.xl), fontWeight: '700', color: colors.textPrimary }}>
            {batch.itemQuantity}
          </Text>
        </View>
      </View>
    </View>
  );
};

const OverviewScreen = ({ zones, orders, lastUpdate, dict, scale, styles, colors, onLogout, onOpenZone, onOpenSession, onOpenHistory }: {
  zones: Zone[];
  orders: Order[];
  lastUpdate: Date | null;
  dict: Dict;
  scale: ReturnType<typeof useScale>;
  styles: ReturnType<typeof createStyles>;
  colors: typeof DESIGN.colors;
  onLogout: () => void;
  onOpenZone: (zone: Zone) => void;
  onOpenSession: (zoneId: string) => void;
  onOpenHistory: () => void;
}) => {
  const { s, font } = scale;
  const totalNew = orders.filter(o => o.status === 'new').length;
  const totalPreparing = orders.filter(o => o.status === 'preparing').length;
  const totalReady = orders.filter(o => o.status === 'ready').length;

  // Responsive layout from the ACTUAL window dimensions (dp) and font scale.
  // Recomputed only when the dimensions, font scale or zone count change, so
  // the 2s polling never re-creates the layout or resizes the cards.
  const layout = useMemo(
    () => getOverviewLayout({
      width: scale.screenWidth,
      height: scale.screenHeight,
      fontScale: scale.fontScale,
      zoneCount: zones.length,
      topBarHeight: scale.s(DESIGN.components.topBarHeight),
      statusBarHeight: scale.s(DESIGN.components.statusBarHeight),
      bottomNavHeight: scale.s(DESIGN.components.bottomBarHeight),
    }),
    [scale, zones.length],
  );

  const gridItemStyle = useMemo(
    () => ({
      width: `${100 / layout.columnCount}%` as `${number}%`,
      height: layout.cardHeight,
    }),
    [layout.columnCount, layout.cardHeight],
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{dict.currentZones}</Text>
        <Pressable style={styles.topBarButton} onPress={onLogout}>
          <Text style={styles.topBarButtonText}>{dict.logout}</Text>
        </Pressable>
      </View>

      <View style={styles.statusBar}>
        <View style={{ flexDirection: 'row', gap: s(24) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            <View style={{ width: s(12), height: s(12), borderRadius: s(6), backgroundColor: colors.statusNew }} />
            <Text style={styles.statusBarText}>{dict.newOrders}: <Text style={styles.statusBarValue}>{totalNew}</Text></Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            <View style={{ width: s(12), height: s(12), borderRadius: s(6), backgroundColor: colors.statusPreparing }} />
            <Text style={styles.statusBarText}>{dict.preparingOrders}: <Text style={styles.statusBarValue}>{totalPreparing}</Text></Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            <View style={{ width: s(12), height: s(12), borderRadius: s(6), backgroundColor: colors.statusReady }} />
            <Text style={styles.statusBarText}>{dict.readyOrders}: <Text style={styles.statusBarValue}>{totalReady}</Text></Text>
          </View>
        </View>
        <Text style={{ fontSize: font(DESIGN.fontSize.sm), color: colors.textMuted }}>
          {lastUpdate ? `${dict.lastUpdate}: ${formatTime(lastUpdate.toISOString())}` : ''}
        </Text>
      </View>

      <View style={styles.content}>
        <ScrollView
          contentContainerStyle={[styles.grid, layout.requiresScroll ? null : styles.gridFills]}
        >
          {zones.map(zone => (
            <View key={zone.id} style={[styles.gridItem, gridItemStyle]}>
              <ZoneCard
                zone={zone}
                zoneOrders={orders.filter(o => o.zoneId === zone.id)}
                dict={dict}
                styles={styles}
                colors={colors}
                onOpenZone={onOpenZone}
                onOpenSession={onOpenSession}
              />
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.bottomNav}>
        <Pressable style={[styles.bottomNavItem, styles.bottomNavItemActive]}>
          <Text style={[styles.bottomNavText, styles.bottomNavTextActive]}>{dict.currentZones}</Text>
        </Pressable>
        <Pressable style={styles.bottomNavItem} onPress={onOpenHistory}>
          <Text style={styles.bottomNavText}>{dict.historyOrders}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const HistoryScreen = ({ history, historyError, hasMoreHistory, dict, scale, styles, colors, onBack, onLoadMore, onRetry }: {
  history: HistoryBatch[];
  historyError: string | null;
  hasMoreHistory: boolean;
  dict: Dict;
  scale: ReturnType<typeof useScale>;
  styles: ReturnType<typeof createStyles>;
  colors: typeof DESIGN.colors;
  onBack: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) => {
  const { s, font } = scale;
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.topBarButton} onPress={onBack}>
          <Text style={styles.topBarButtonText}>{dict.back}</Text>
        </Pressable>
        <Text style={styles.topBarTitle}>{dict.historyOrders}</Text>
        <View style={{ width: s(80) }} />
      </View>

      <View style={styles.content}>
        {historyError ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{dict.historyLoadFailed}</Text>
            <Pressable style={[styles.button, { marginTop: s(16) }]} onPress={onRetry}>
              <Text style={styles.buttonText}>{dict.refresh}</Text>
            </Pressable>
          </View>
        ) : history.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{dict.historyEmpty}</Text>
          </View>
        ) : (
          <ScrollView>
            {history.map((batch, idx) => (
              <HistoryCard key={`${batch.batchKey}-${idx}`} batch={batch} dict={dict} scale={scale} styles={styles} colors={colors} />
            ))}
            {hasMoreHistory ? (
              <Pressable style={styles.button} onPress={onLoadMore}>
                <Text style={styles.buttonText}>{dict.loadMore}</Text>
              </Pressable>
            ) : (
              <Text style={{ fontSize: font(DESIGN.fontSize.sm), color: colors.textMuted, textAlign: 'center', marginTop: s(8) }}>
                {dict.allLoaded}
              </Text>
            )}
          </ScrollView>
        )}
      </View>

      <View style={styles.bottomNav}>
        <Pressable style={styles.bottomNavItem} onPress={onBack}>
          <Text style={styles.bottomNavText}>{dict.currentZones}</Text>
        </Pressable>
        <Pressable style={[styles.bottomNavItem, styles.bottomNavItemActive]}>
          <Text style={[styles.bottomNavText, styles.bottomNavTextActive]}>{dict.historyOrders}</Text>
        </Pressable>
      </View>
    </View>
  );
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
export default function App() {
  const scale = useScale();
  const styles = useMemo(() => createStyles(scale), [scale]);
  const { colors } = { ...scale, colors: DESIGN.colors };

  // State
  const [lang, setLang] = useState<Lang>('zh');
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [screen, setScreen] = useState<'login' | 'overview' | 'detail' | 'history'>('login');
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<HistoryBatch[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [zoneCheckoutStatus, setZoneCheckoutStatus] = useState<Record<string, ZoneCheckoutStatus>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [addItemOrderId, setAddItemOrderId] = useState('');
  const [addItemSubmitting, setAddItemSubmitting] = useState(false);
  const [selectedMenuItems, setSelectedMenuItems] = useState<Record<string, number>>({});
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const dict = I18N[lang];
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyCursorRef = useRef('');

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  const apiFetch = useCallback(async (endpoint: string, options?: RequestInit) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      // Use X-Employee-Session header for compatibility with existing backend
      headers['X-Employee-Session'] = token;
    }

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...((options?.headers as Record<string, string>) || {}) },
    });

    if (res.status === 401) {
      setToken(null);
      setScreen('login');
      Alert.alert('', dict.sessionExpired);
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || res.statusText);
    }

    return res.json();
  }, [token, dict]);

  const login = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('', dict.loginRequired);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/employee/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      setToken(data.token);
      setScreen('overview');
      Alert.alert('', dict.loginSuccess);
    } catch (e) {
      console.error('Login failed:', e);
      Alert.alert(dict.loginFailed, '');
    } finally {
      setLoading(false);
    }
  }, [username, password, dict]);

  const logout = useCallback(() => {
    setToken(null);
    setScreen('login');
    setZones([]);
    setOrders([]);
    setHistory([]);
    setSelectedZone(null);
    setZoneCheckoutStatus({});
    historyCursorRef.current = '';
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchZones = useCallback(async () => {
    try {
      const data = await apiFetch('/api/employee/zones');
      const zonesList: Zone[] = data.zones || [];
      setZones(zonesList);

      // Sync the CURRENT selection with the freshest zone for the same id via a
      // functional update. Never read selectedZone from the closure: a stale
      // response for an old room cannot overwrite the room chosen later.
      setSelectedZone(prev => syncSelectedZoneFromZones(prev, zonesList));

      setLastUpdate(new Date());
    } catch (e) {
      console.error('Failed to fetch zones:', e);
    }
  }, [apiFetch]);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await apiFetch('/api/employee/orders');
      setOrders(data.orders || []);

      // Check for new orders and play sound
      const newOrders = (data.orders || []).filter((o: Order) => o.status === 'new');
      if (newOrders.length > 0) {
        try {
          SoundPlayer.playSoundFile('new_order', 'mp3');
        } catch {
          Vibration.vibrate(500);
        }
      }
    } catch (e) {
      console.error('Failed to fetch orders:', e);
    }
  }, [apiFetch]);

  const fetchHistory = useCallback(async (reset: boolean = false) => {
    try {
      setHistoryError(null);
      const params = new URLSearchParams();
      params.set('limit', '30');
      if (!reset && historyCursorRef.current) params.set('cursor', historyCursorRef.current);
      params.set('tzOffsetMinutes', String(new Date().getTimezoneOffset()));

      const data = await apiFetch(`/api/employee/orders/history?${params.toString()}`);
      const batchList: HistoryBatch[] = Array.isArray(data.history) ? data.history : [];

      setHistory(prev => {
        if (reset) return batchList;
        const seen = new Set(prev.map(b => b.batchKey));
        return [...prev, ...batchList.filter(b => !seen.has(b.batchKey))];
      });
      historyCursorRef.current = typeof data.nextCursor === 'string' && data.nextCursor ? data.nextCursor : '';
      setHasMoreHistory(data.hasMore !== false && !!data.nextCursor);
    } catch (e) {
      console.error('Failed to fetch history:', e);
      setHistoryError(dict.historyLoadFailed);
      setHistory([]);
    }
  }, [apiFetch, dict.historyLoadFailed]);

  const fetchMenu = useCallback(async () => {
    try {
      const data = await apiFetch('/api/employee/menu');
      setMenuItems(data.menu || []);
      setCategories(data.categories || []);
    } catch (e) {
      console.error('Failed to fetch menu:', e);
    }
  }, [apiFetch]);

  const loadZoneCustomerSettlements = useCallback(async (zoneId: string) => {
    try {
      const data = await apiFetch(`/api/employee/zones/${zoneId}/customer-settlements`);
      setZoneCheckoutStatus(prev => ({ ...prev, [zoneId]: data }));
    } catch (e) {
      console.error('Failed to load zone customer settlements:', e);
    }
  }, [apiFetch]);

  const updateOrderStatus = useCallback(async (orderId: string, status: OrderStatus) => {
    try {
      await apiFetch(`/api/employee/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await fetchOrders();
      await fetchZones();
    } catch (e) {
      console.error('Failed to update order status:', e);
      Alert.alert('', dict.statusFailed);
    }
  }, [apiFetch, fetchOrders, fetchZones, dict]);

  const updateItemQuantity = useCallback(async (orderId: string, itemId: number, delta: number) => {
    try {
      await apiFetch(`/api/employee/orders/${orderId}/items/${itemId}/quantity`, {
        method: 'PATCH',
        body: JSON.stringify({ delta }),
      });
      await fetchOrders();
      await fetchZones();
    } catch (e) {
      console.error('Failed to update item quantity:', e);
      Alert.alert('', dict.quantityFailed);
    }
  }, [apiFetch, fetchOrders, fetchZones, dict]);

  const submitAddItems = useCallback(async () => {
    if (!addItemOrderId || addItemSubmitting) return;
    const items = Object.entries(selectedMenuItems)
      .filter(([, qty]) => qty > 0)
      .map(([menuId, quantity]) => ({ menuId, quantity }));
    if (items.length === 0) return;

    try {
      setAddItemSubmitting(true);
      for (const item of items) {
        for (let i = 0; i < item.quantity; i += 1) {
          await apiFetch(`/api/employee/orders/${addItemOrderId}/items`, {
            method: 'POST',
            body: JSON.stringify({ menuId: item.menuId }),
          });
        }
      }
      await fetchOrders();
      setAddItemModalVisible(false);
      setAddItemOrderId('');
      setSelectedMenuItems({});
    } catch (e) {
      console.error('Failed to add items:', e);
      Alert.alert('', dict.addItemFailed);
    } finally {
      setAddItemSubmitting(false);
    }
  }, [addItemOrderId, addItemSubmitting, apiFetch, dict.addItemFailed, fetchOrders, selectedMenuItems]);

  const updateItemServed = useCallback(async (orderId: string, itemId: number, served: boolean) => {
    try {
      await apiFetch(`/api/employee/orders/${orderId}/items/${itemId}/served`, {
        method: 'PATCH',
        body: JSON.stringify({ served }),
      });
      await fetchOrders();
      await fetchZones();
    } catch (e) {
      console.error('Failed to update item served status:', e);
      Alert.alert('', dict.statusFailed);
    }
  }, [apiFetch, fetchOrders, fetchZones, dict]);

  const updateCustomerSettlement = useCallback(async (zoneId: string, customerName: string, settled: boolean) => {
    try {
      const data = await apiFetch(`/api/employee/zones/${zoneId}/customer-settlements`, {
        method: 'PATCH',
        body: JSON.stringify({ customerName, settled }),
      });
      setZoneCheckoutStatus(prev => ({ ...prev, [zoneId]: data }));
      setSelectedZone(prev => prev && prev.id === zoneId ? {
        ...prev,
        billingMode: data.billingMode || prev.billingMode,
        sessionOpen: data.sessionOpen === true,
        canCheckout: data.canCheckout !== false,
        unsettledCustomerCount: typeof data.unsettledCustomerCount === 'number' ? data.unsettledCustomerCount : prev.unsettledCustomerCount,
      } : prev);
    } catch (e) {
      console.error('Failed to update customer settlement:', e);
      Alert.alert('', dict.updateSettlementFailed);
    }
  }, [apiFetch, dict]);

  const switchBillingMode = useCallback(async (zoneId: string, billingMode: 'split' | 'merged') => {
    try {
      const response = await apiFetch(`/api/employee/zones/${zoneId}/billing-mode`, {
        method: 'PATCH',
        body: JSON.stringify({ billingMode }),
      });

      // Use the target billingMode as fallback when the response omits it.
      const data = typeof response === 'object' && response !== null ? response : {};
      const nextMode: 'split' | 'merged' = data.billingMode === 'split' || data.billingMode === 'merged'
        ? data.billingMode
        : billingMode;

      // 1. zoneCheckoutStatus[zoneId] = full checkout status from the response
      setZoneCheckoutStatus(prev => ({
        ...prev,
        [zoneId]: {
          ...(prev[zoneId] || {}),
          ...data,
          billingMode: nextMode,
        },
      }));

      // 2. selectedZone: billingMode / sessionOpen / canCheckout / unsettledCustomerCount
      setSelectedZone(prev => prev && prev.id === zoneId ? {
        ...prev,
        billingMode: nextMode,
        sessionOpen: data.sessionOpen !== undefined ? data.sessionOpen === true : prev.sessionOpen,
        canCheckout: data.canCheckout !== undefined ? data.canCheckout !== false : prev.canCheckout,
        unsettledCustomerCount: typeof data.unsettledCustomerCount === 'number'
          ? data.unsettledCustomerCount
          : prev.unsettledCustomerCount,
      } : prev);

      // 3. zones list: same zoneId object
      setZones(prev => prev.map(z => {
        if (z.id !== zoneId) return z;
        return {
          ...z,
          billingMode: nextMode,
          sessionOpen: data.sessionOpen !== undefined ? data.sessionOpen === true : z.sessionOpen,
          canCheckout: data.canCheckout !== undefined ? data.canCheckout !== false : z.canCheckout,
          unsettledCustomerCount: typeof data.unsettledCustomerCount === 'number'
            ? data.unsettledCustomerCount
            : z.unsettledCustomerCount,
        };
      }));

      // 4. Refresh authoritative data (also re-syncs selectedZone from zones)
      await fetchZones();
      await loadZoneCustomerSettlements(zoneId);
    } catch (e) {
      console.error('Failed to switch billing mode:', e);
      Alert.alert('', dict.updateModeFailed);
    }
  }, [apiFetch, fetchZones, loadZoneCustomerSettlements, dict]);

  const openSession = useCallback(async (zoneId: string) => {
    try {
      await apiFetch(`/api/employee/zones/${zoneId}/open-session`, {
        method: 'POST',
      });
      await fetchZones();
      await loadZoneCustomerSettlements(zoneId);
    } catch (e) {
      console.error('Failed to open session:', e);
      Alert.alert('', dict.openSessionFailed);
    }
  }, [apiFetch, fetchZones, loadZoneCustomerSettlements, dict]);

  const checkoutZone = useCallback(async (zoneId: string) => {
    const status = zoneCheckoutStatus[zoneId];
    const mode = resolveBillingMode(zoneId, zoneCheckoutStatus, zones, selectedZone);
    const sessionOpen = status?.sessionOpen ?? selectedZone?.sessionOpen ?? zones.find(z => z.id === zoneId)?.sessionOpen;
    const unsettled = status?.unsettledCustomerCount ?? selectedZone?.unsettledCustomerCount ?? zones.find(z => z.id === zoneId)?.unsettledCustomerCount;

    // Same predicate as the DetailScreen button: UI state and execution can never diverge.
    if (!canCheckoutFromUi(sessionOpen, mode, unsettled)) {
      Alert.alert('', dict.cannotCheckout);
      return;
    }

    Alert.alert(
      dict.checkoutTitle,
      dict.checkoutConfirm,
      [
        { text: dict.cancelButton, style: 'cancel' },
        {
          text: dict.confirmCheckout,
          onPress: async () => {
            try {
              await apiFetch(`/api/employee/zones/${zoneId}/checkout`, {
                method: 'POST',
              });
              await fetchZones();
              await fetchOrders();
              setAddItemModalVisible(false);
              setAddItemOrderId('');
              setSelectedZone(null);
              setScreen('overview');
            } catch (e) {
              console.error('Failed to checkout zone:', e);
              Alert.alert('', dict.checkoutFailed);
            }
          },
        },
      ]
    );
  }, [apiFetch, zoneCheckoutStatus, zones, selectedZone, fetchZones, fetchOrders, dict]);

  const printReceipt = useCallback(async (zoneId: string, customerName?: string) => {
    try {
      await apiFetch(`/api/employee/zones/${zoneId}/receipt/print`, {
        method: 'POST',
        body: JSON.stringify({ customerName }),
      });
      Alert.alert('', customerName ? dict.printCustomerSent.replace('{name}', customerName) : dict.printMergedSent);
    } catch (e) {
      console.error('Failed to print receipt:', e);
      Alert.alert('', dict.printFailed);
    }
  }, [apiFetch, dict]);

  // ============================================================================
  // POLLING
  // ============================================================================

  useEffect(() => {
    if (token && screen !== 'login') {
      fetchZones();
      fetchOrders();

      if (pollRef.current) {
        clearInterval(pollRef.current);
      }

      pollRef.current = setInterval(() => {
        fetchZones();
        fetchOrders();
      }, POLL_MS);

      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
        }
      };
    }
  }, [token, screen, fetchZones, fetchOrders]);

  useEffect(() => {
    if (token && screen === 'history' && history.length === 0) {
      fetchHistory(true);
    }
  }, [token, screen, history.length, fetchHistory]);

  useEffect(() => {
    if (token && menuItems.length === 0) {
      fetchMenu();
    }
  }, [token, menuItems.length, fetchMenu]);

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const menuGroups = useMemo(() => {
    const orderedCategories = categories.slice().sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
    const categoryMap = new Map<string, MenuItem[]>();
    orderedCategories.forEach(cat => categoryMap.set(cat.name, []));
    const fallbackItems: MenuItem[] = [];
    menuItems.forEach(item => {
      if (item.available === false) return;
      const name = item.category?.trim();
      if (name && categoryMap.has(name)) categoryMap.get(name)!.push(item);
      else fallbackItems.push(item);
    });
    return { orderedCategories, categoryMap, fallbackItems, fallbackName: dict.noCategory };
  }, [categories, dict.noCategory, menuItems]);

  const updateQuantity = useCallback((itemId: string, delta: number) => {
    setSelectedMenuItems(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const nextState = { ...prev };
        delete nextState[itemId];
        return nextState;
      }
      return { ...prev, [itemId]: next };
    });
  }, []);

  const closeAddItemModal = useCallback(() => {
    setAddItemModalVisible(false);
    setAddItemOrderId('');
  }, []);

  // Back from the detail page: clear the selection and any open add-dish modal,
  // but keep zones/orders data intact (no flicker, no data loss).
  const goBackToOverview = useCallback(() => {
    setAddItemModalVisible(false);
    setAddItemOrderId('');
    setSelectedZone(null);
    setScreen('overview');
  }, []);

  const openAddDish = useCallback((orderId: string) => {
    setAddItemOrderId(orderId);
    setAddItemModalVisible(true);
  }, []);

  const openBottomAddDish = useCallback(() => {
    if (!selectedZone) return;
    const editableOrders = orders.filter(order => order.zoneId === selectedZone.id && order.status !== 'served' && order.status !== 'cancelled');
    if (editableOrders.length === 0) {
      Alert.alert('', dict.noEditableOrder);
      return;
    }
    if (editableOrders.length === 1) {
      openAddDish(editableOrders[0].id);
      return;
    }
    Alert.alert(
      dict.selectOrder,
      '',
      [
        { text: dict.cancelButton, style: 'cancel' },
        ...editableOrders.map(order => ({
          text: `${order.customerName || dict.guest} - ${formatTime(order.createdAt)}`,
          onPress: () => openAddDish(order.id),
        })),
      ]
    );
  }, [dict, openAddDish, orders, selectedZone]);

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  // For login screen, render directly without wrapping in a component
  // This prevents input focus loss when state changes
  if (screen === 'login') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.loginContainer}
        >
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>{dict.loginTitle}</Text>

            <TextInput
              style={styles.loginInput}
              placeholder={dict.username}
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              returnKeyType="next"
              blurOnSubmit={false}
            />

            <TextInput
              style={styles.loginInput}
              placeholder={dict.password}
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="done"
            />

            {loading ? (
              <View style={styles.loginButton}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <Pressable style={styles.loginButton} onPress={login}>
                <Text style={styles.loginButtonText}>{dict.loginButton}</Text>
              </Pressable>
            )}

            <Pressable style={styles.loginLangToggle} onPress={() => setLang(prev => prev === 'zh' ? 'en' : 'zh')}>
              <Text style={styles.loginLangText}>{dict.languageToggle}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (screen === 'overview') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />
        <OverviewScreen
          zones={zones}
          orders={orders}
          lastUpdate={lastUpdate}
          dict={dict}
          scale={scale}
          styles={styles}
          colors={colors}
          onLogout={logout}
          onOpenZone={(zone) => {
            setSelectedZone(zone);
            loadZoneCustomerSettlements(zone.id);
            setScreen('detail');
          }}
          onOpenSession={openSession}
          onOpenHistory={() => setScreen('history')}
        />
        <AddItemModalComponent
          visible={addItemModalVisible}
          onClose={closeAddItemModal}
          menuItems={menuItems}
          orderedCategories={menuGroups.orderedCategories}
          categoryMap={menuGroups.categoryMap}
          fallbackItems={menuGroups.fallbackItems}
          fallbackName={menuGroups.fallbackName}
          lang={lang}
          scale={scale}
          styles={styles}
          colors={colors}
          selectedMenuItems={selectedMenuItems}
          onQuantityChange={updateQuantity}
          onSubmit={submitAddItems}
          isSubmitting={addItemSubmitting}
        />
      </View>
    );
  }

  if (screen === 'history') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />
        <HistoryScreen
          history={history}
          historyError={historyError}
          hasMoreHistory={hasMoreHistory}
          dict={dict}
          scale={scale}
          styles={styles}
          colors={colors}
          onBack={() => setScreen('overview')}
          onLoadMore={() => fetchHistory(false)}
          onRetry={() => fetchHistory(true)}
        />
      </View>
    );
  }

  if (screen === 'detail' && selectedZone) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />
        <DetailScreen
          selectedZone={selectedZone}
          zoneCheckoutStatus={zoneCheckoutStatus}
          zones={zones}
          orders={orders}
          dict={dict}
          lang={lang}
          styles={styles}
          colors={colors}
          onBack={goBackToOverview}
          onSwitchBillingMode={switchBillingMode}
          onOpenSession={openSession}
          onCheckoutZone={checkoutZone}
          onPrintReceipt={printReceipt}
          onOpenBottomAddDish={openBottomAddDish}
          onUpdateOrderStatus={updateOrderStatus}
          onUpdateItemServed={updateItemServed}
          onUpdateItemQuantity={updateItemQuantity}
          onOpenAddDish={openAddDish}
          onUpdateCustomerSettlement={updateCustomerSettlement}
          onPrintCustomerReceipt={printReceipt}
        />
        <AddItemModalComponent
          visible={addItemModalVisible}
          onClose={closeAddItemModal}
          menuItems={menuItems}
          orderedCategories={menuGroups.orderedCategories}
          categoryMap={menuGroups.categoryMap}
          fallbackItems={menuGroups.fallbackItems}
          fallbackName={menuGroups.fallbackName}
          lang={lang}
          scale={scale}
          styles={styles}
          colors={colors}
          selectedMenuItems={selectedMenuItems}
          onQuantityChange={updateQuantity}
          onSubmit={submitAddItems}
          isSubmitting={addItemSubmitting}
        />
      </View>
    );
  }

  return null;
}

// Exports for automated tests
export { createStyles, useScale, DESIGN, I18N, ZoneCard, OverviewScreen, HistoryCard, HistoryScreen };
