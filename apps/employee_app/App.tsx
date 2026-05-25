import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SoundPlayer from 'react-native-sound-player';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';

type Zone = {
  id: string;
  label: string;
  accessCode: string;
  activeOrderCount: number;
  activeOrderTotal: number;
};

type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';

type OrderItem = {
  name: string;
  quantity: number;
  subtotal: number;
};

type Order = {
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

const BASE_URL = 'https://order.1383karaoke.ca';
const POLL_MS = 1000;

function money(v: number) {
  return `$${Number(v || 0).toFixed(2)}`;
}

function shortId(id: string) {
  return `#${(id || '').slice(0, 8)}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '';
  return d.toLocaleString();
}

function statusLabel(status: OrderStatus) {
  if (status === 'new') return '新单';
  if (status === 'preparing') return '制作中';
  if (status === 'ready') return '待上桌';
  if (status === 'served') return '已完成';
  if (status === 'cancelled') return '已取消';
  return status;
}

export default function App() {
  const [employeeToken, setEmployeeToken] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMsg, setLoginMsg] = useState('');

  const [zones, setZones] = useState<Zone[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [zonePanelVisible, setZonePanelVisible] = useState(false);
  const [newOrderNotice, setNewOrderNotice] = useState('');

  const panelAnim = useRef(new Animated.Value(0)).current;
  const prevNewCountRef = useRef(0);
  const hasInitNewCountRef = useRef(false);

  const buildAuthHeaders = useCallback((extra: Record<string, string> = {}) => {
    const base: Record<string, string> = { ...extra };
    if (employeeToken) {
      base['X-Employee-Session'] = employeeToken;
    }
    return base;
  }, [employeeToken]);

  const fetchData = useCallback(async () => {
    if (!employeeToken) return;
    if (!hasLoadedOnce) setLoading(true);
    try {
      const [zonesRes, ordersRes] = await Promise.all([
        fetch(`${BASE_URL}/api/employee/zones`, { headers: buildAuthHeaders() }),
        fetch(`${BASE_URL}/api/employee/orders`, { headers: buildAuthHeaders() }),
      ]);

      if (zonesRes.status === 401 || ordersRes.status === 401) {
        setEmployeeToken('');
        setEmployeeName('');
        setZones([]);
        setOrders([]);
        setHasLoadedOnce(false);
        setLoginMsg('登录已过期，请重新登录');
        return;
      }

      if (!zonesRes.ok) throw new Error(`包厢接口失败: ${zonesRes.status}`);
      if (!ordersRes.ok) throw new Error(`订单接口失败: ${ordersRes.status}`);

      const zonesJson = await zonesRes.json();
      const ordersJson = await ordersRes.json();
      setZones(Array.isArray(zonesJson.zones) ? zonesJson.zones : []);
      setOrders(Array.isArray(ordersJson.orders) ? ordersJson.orders : []);
      setError('');
      setHasLoadedOnce(true);
    } catch (e: any) {
      setError(e?.message || '请求失败');
    } finally {
      if (!hasLoadedOnce) setLoading(false);
    }
  }, [buildAuthHeaders, employeeToken, hasLoadedOnce]);

  useEffect(() => {
    if (!employeeToken) return;
    fetchData();
    const timer = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timer);
  }, [employeeToken, fetchData]);

  useEffect(() => {
    const nextNewCount = orders.filter((o) => o.status === 'new').length;
    if (!hasInitNewCountRef.current) {
      prevNewCountRef.current = nextNewCount;
      hasInitNewCountRef.current = true;
      return;
    }
    if (nextNewCount > prevNewCountRef.current) {
      try {
        SoundPlayer.playSoundFile('uber_eats', 'mp3');
      } catch {
        Vibration.vibrate(180);
      }
      setNewOrderNotice(`有新订单（${nextNewCount}）`);
      setTimeout(() => setNewOrderNotice(''), 2000);
    }
    prevNewCountRef.current = nextNewCount;
  }, [orders]);

  const loginEmployee = useCallback(async () => {
    const username = loginUsername.trim();
    const password = loginPassword.trim();
    if (!username || !password) {
      setLoginMsg('请输入用户名和密码');
      return;
    }
    setLoginMsg('登录中...');
    try {
      const res = await fetch(`${BASE_URL}/api/employee/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登录失败');
      setEmployeeToken(data.token || '');
      setEmployeeName(data.employee?.username || username);
      setLoginPassword('');
      setLoginMsg('登录成功');
      hasInitNewCountRef.current = false;
      setHasLoadedOnce(false);
    } catch (e: any) {
      setLoginMsg(e?.message || '登录失败');
    }
  }, [loginPassword, loginUsername]);

  const logoutEmployee = useCallback(async () => {
    try {
      if (employeeToken) {
        await fetch(`${BASE_URL}/api/employee/auth/logout`, {
          method: 'POST',
          headers: buildAuthHeaders(),
        });
      }
    } catch {
      // ignore
    }
    setEmployeeToken('');
    setEmployeeName('');
    setZones([]);
    setOrders([]);
    setSelectedZoneId('');
    setHasLoadedOnce(false);
  }, [buildAuthHeaders, employeeToken]);

  const updateOrderStatus = useCallback(async (orderId: string, status: OrderStatus) => {
    try {
      setBusy(true);
      const res = await fetch(`${BASE_URL}/api/employee/orders/${orderId}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '状态更新失败');
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status, handledByEmployeeUsername: employeeName } : o)));
      await fetchData();
    } catch (e: any) {
      Alert.alert('失败', e?.message || '状态更新失败');
    } finally {
      setBusy(false);
    }
  }, [buildAuthHeaders, employeeName, fetchData]);

  const checkoutZone = useCallback(async (zoneId: string) => {
    Alert.alert('确认结单', '是否清空该包厢当前 session？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认结单',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusy(true);
            const res = await fetch(`${BASE_URL}/api/employee/zones/${zoneId}/checkout`, {
              method: 'POST',
              headers: buildAuthHeaders(),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || '结单失败');
            await fetchData();
          } catch (e: any) {
            Alert.alert('失败', e?.message || '结单失败');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [buildAuthHeaders, fetchData]);

  const selectedZone = useMemo(() => zones.find((z) => z.id === selectedZoneId) || null, [selectedZoneId, zones]);

  const visibleOrders = useMemo(() => {
    const activeOnly = orders.filter((o) => o.status !== 'served' && o.status !== 'cancelled');
    if (!selectedZoneId) return activeOnly;
    return activeOnly.filter((o) => o.zoneId === selectedZoneId);
  }, [orders, selectedZoneId]);

  const selectedZoneOrders = useMemo(() => orders.filter((o) => o.zoneId === selectedZoneId), [orders, selectedZoneId]);

  const selectedZoneOrdersByCustomer = useMemo(() => {
    const groups = new Map<string, Order[]>();
    for (const order of selectedZoneOrders) {
      const key = (order.customerName || '').trim() || '未填写';
      const arr = groups.get(key) || [];
      arr.push(order);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).map(([customerName, groupOrders]) => ({
      customerName,
      orders: groupOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }));
  }, [selectedZoneOrders]);

  const openZonePanel = useCallback((zoneId: string) => {
    setSelectedZoneId(zoneId);
    setZonePanelVisible(true);
    panelAnim.setValue(0);
    Animated.timing(panelAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [panelAnim]);

  const closeZonePanel = useCallback(() => {
    Animated.timing(panelAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setZonePanelVisible(false);
    });
  }, [panelAnim]);

  if (!employeeToken) {
    return (
      <SafeAreaView style={styles.page}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loginWrap}>
          <Text style={styles.h1}>员工登录</Text>
          <Text style={styles.sub}>登录后才能进入接单页面</Text>
          <View style={styles.loginCard}>
            <Text style={styles.loginLabel}>用户名</Text>
            <TextInput style={styles.loginInput} value={loginUsername} onChangeText={setLoginUsername} placeholder="请输入用户名" placeholderTextColor="#7b8ca8" autoCapitalize="none" />
            <Text style={styles.loginLabel}>密码</Text>
            <TextInput style={styles.loginInput} value={loginPassword} onChangeText={setLoginPassword} placeholder="请输入密码" placeholderTextColor="#7b8ca8" secureTextEntry />
            <Pressable style={styles.loginBtn} onPress={loginEmployee}>
              <Text style={styles.loginBtnText}>登录</Text>
            </Pressable>
            {!!loginMsg && <Text style={styles.sub}>{loginMsg}</Text>}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />
      <View style={styles.layout}>
        <View style={styles.leftPanel}>
          <Text style={styles.h1}>包厢列表</Text>
          <Text style={styles.sub}>点击包厢可查看该包厢订单</Text>
          <ScrollView>
            <Pressable style={[styles.zoneCard, !selectedZoneId && styles.zoneCardSelected]} onPress={() => setSelectedZoneId('')}>
              <Text style={styles.zoneName}>全部包厢</Text>
              <Text style={styles.zoneMeta}>显示全部进行中订单</Text>
            </Pressable>
            {zones.map((zone) => (
              <Pressable key={zone.id} style={[styles.zoneCard, selectedZoneId === zone.id && styles.zoneCardSelected]} onPress={() => openZonePanel(zone.id)}>
                <Text style={styles.zoneName}>{zone.label}</Text>
                <Text style={styles.zoneMeta}>访问码：{zone.accessCode || '-'}</Text>
                <Text style={styles.zoneMeta}>订单：{zone.activeOrderCount} 单 · 未结：{money(zone.activeOrderTotal)}</Text>
                <Pressable style={styles.checkoutBtn} onPress={() => checkoutZone(zone.id)} disabled={busy}>
                  <Text style={styles.checkoutBtnText}>结单清零</Text>
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.rightPanel}>
          <View style={styles.topRow}>
            <Text style={styles.h1}>{selectedZone ? `${selectedZone.label} 来单` : '来单信息'}</Text>
            <View style={styles.rowEnd}>
              <Text style={styles.employeeTag}>当前员工：{employeeName}</Text>
              <Pressable style={styles.logoutBtn} onPress={logoutEmployee}><Text style={styles.actionText}>退出</Text></Pressable>
              {busy ? <ActivityIndicator /> : null}
            </View>
          </View>
          {newOrderNotice ? <Text style={styles.notice}>{newOrderNotice}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!hasLoadedOnce && loading ? (
            <ActivityIndicator size="large" />
          ) : (
            <FlatList
              data={visibleOrders}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.orderList}
              renderItem={({ item }) => (
                <View style={styles.orderCard}>
                  <View style={styles.orderHead}>
                    <Text style={styles.orderId}>{item.zoneLabel} · {shortId(item.id)}</Text>
                    <Text style={styles.badge}>{statusLabel(item.status)}</Text>
                  </View>
                  <Text style={styles.orderMeta}>{formatTime(item.createdAt)}</Text>
                  <Text style={styles.orderMeta}>下单人：{item.customerName?.trim() || '未填写'}</Text>
                  <Text style={styles.orderMeta}>接单员工：{item.handledByEmployeeUsername || '-'}</Text>
                  {item.items.map((it, idx) => (
                    <Text key={`${item.id}-${idx}`} style={styles.itemLine}>• {it.name} x {it.quantity} ({money(it.subtotal)})</Text>
                  ))}
                  <Text style={styles.total}>Total: {money(item.total)}</Text>
                  <Text style={styles.orderMeta}>备注：{item.note || '无'}</Text>
                  <View style={styles.actions}>
                    <Pressable style={styles.actionBtn} onPress={() => updateOrderStatus(item.id, 'preparing')}><Text style={styles.actionText}>制作中</Text></Pressable>
                    <Pressable style={styles.actionBtn} onPress={() => updateOrderStatus(item.id, 'ready')}><Text style={styles.actionText}>待上桌</Text></Pressable>
                    <Pressable style={styles.actionBtn} onPress={() => updateOrderStatus(item.id, 'served')}><Text style={styles.actionText}>已完成</Text></Pressable>
                    <Pressable style={[styles.actionBtn, styles.cancelBtn]} onPress={() => updateOrderStatus(item.id, 'cancelled')}><Text style={styles.actionText}>已取消</Text></Pressable>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.sub}>当前筛选下没有订单。</Text>}
            />
          )}
        </View>
      </View>

      <Modal animationType="none" transparent visible={zonePanelVisible} onRequestClose={closeZonePanel}>
        <Pressable style={styles.modalBackdrop} onPress={closeZonePanel} />
        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [
                {
                  translateX: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [700, 0] }),
                },
              ],
            },
          ]}
        >
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>{selectedZone ? `${selectedZone.label} 当前 Session` : '包厢'}</Text>
            <Pressable style={styles.closeBtn} onPress={closeZonePanel}><Text style={styles.closeBtnText}>×</Text></Pressable>
          </View>
          <Text style={styles.zoneMeta}>访问码：{selectedZone?.accessCode || '-'}</Text>
          <Text style={styles.zoneMeta}>当前未结总额：{money(selectedZone?.activeOrderTotal || 0)}</Text>

          <ScrollView contentContainerStyle={styles.drawerBody}>
            {selectedZoneOrdersByCustomer.map((group) => (
              <View key={group.customerName} style={styles.customerGroup}>
                <Text style={styles.customerGroupTitle}>{group.customerName}</Text>
                {group.orders.map((item) => (
                  <View key={item.id} style={styles.orderCard}>
                    <View style={styles.orderHead}>
                      <Text style={styles.orderId}>{shortId(item.id)}</Text>
                      <Text style={styles.badge}>{statusLabel(item.status)}</Text>
                    </View>
                    <Text style={styles.orderMeta}>{formatTime(item.createdAt)}</Text>
                    <Text style={styles.orderMeta}>接单员工：{item.handledByEmployeeUsername || '-'}</Text>
                    {item.items.map((it, idx) => (
                      <Text key={`${item.id}-drawer-${idx}`} style={styles.itemLine}>• {it.name} x {it.quantity} ({money(it.subtotal)})</Text>
                    ))}
                    <Text style={styles.total}>Total: {money(item.total)}</Text>
                    <Text style={styles.orderMeta}>备注：{item.note || '无'}</Text>
                  </View>
                ))}
              </View>
            ))}
            {!selectedZoneOrders.length ? <Text style={styles.sub}>当前包厢 session 暂无订单。</Text> : null}
          </ScrollView>

          <Pressable style={styles.drawerCheckoutBtn} onPress={() => selectedZone && checkoutZone(selectedZone.id)} disabled={!selectedZone || busy}>
            <Text style={styles.drawerCheckoutText}>结单清零</Text>
          </Pressable>
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#091426' },
  layout: { flex: 1, flexDirection: 'row' },
  leftPanel: { width: 340, borderRightWidth: 1, borderRightColor: '#1f304d', padding: 14 },
  rightPanel: { flex: 1, padding: 14 },
  h1: { color: '#e8f0ff', fontSize: 28, fontWeight: '700', marginBottom: 8 },
  sub: { color: '#9fb4d8', marginBottom: 10 },
  zoneCard: { backgroundColor: '#11203a', borderColor: '#1f3458', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  zoneCardSelected: { borderColor: '#4ea2ff', borderWidth: 2 },
  zoneName: { color: '#fff', fontSize: 20, fontWeight: '700' },
  zoneMeta: { color: '#c8d8f3', marginTop: 4 },
  checkoutBtn: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#b63d4d', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  checkoutBtnText: { color: '#fff', fontWeight: '700' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  employeeTag: { color: '#c8d8f3', fontWeight: '700' },
  logoutBtn: { backgroundColor: '#27456d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  error: { color: '#ff9ca7', marginBottom: 10 },
  notice: { color: '#0f2f07', backgroundColor: '#b7f5af', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10, fontWeight: '700' },
  orderList: { paddingBottom: 80 },
  orderCard: { backgroundColor: '#11203a', borderColor: '#1f3458', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  orderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { color: '#fff', fontSize: 20, fontWeight: '700' },
  badge: { color: '#091426', backgroundColor: '#9ac7ff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden', fontWeight: '700' },
  orderMeta: { color: '#bdd2f5', marginTop: 4 },
  itemLine: { color: '#fff', marginTop: 8, fontSize: 18 },
  total: { color: '#fff', marginTop: 10, fontSize: 28, fontWeight: '800' },
  actions: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { backgroundColor: '#2b4c7e', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  cancelBtn: { backgroundColor: '#8c2f3b' },
  actionText: { color: '#fff', fontWeight: '700' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(3, 8, 16, 0.55)' },
  drawer: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '72%', backgroundColor: '#0d1a31', borderLeftColor: '#263b60', borderLeftWidth: 1, padding: 14 },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  drawerTitle: { color: '#fff', fontSize: 28, fontWeight: '800' },
  closeBtn: { width: 48, height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#44628f', justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { color: '#fff', fontSize: 28, lineHeight: 28, marginTop: -2 },
  drawerBody: { paddingTop: 12, paddingBottom: 120 },
  customerGroup: { marginBottom: 12, borderWidth: 1, borderColor: '#2a456f', borderRadius: 12, padding: 10, backgroundColor: '#0b1a31' },
  customerGroupTitle: { color: '#b8dcff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  drawerCheckoutBtn: { position: 'absolute', left: 14, right: 14, bottom: 24, backgroundColor: '#b63d4d', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  drawerCheckoutText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  loginWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginCard: { width: '100%', maxWidth: 520, backgroundColor: '#11203a', borderColor: '#1f3458', borderWidth: 1, borderRadius: 12, padding: 14 },
  loginLabel: { color: '#c8d8f3', marginBottom: 6, marginTop: 6 },
  loginInput: { borderColor: '#37527d', borderWidth: 1, borderRadius: 8, color: '#fff', paddingHorizontal: 10, paddingVertical: 10, marginBottom: 8 },
  loginBtn: { marginTop: 8, backgroundColor: '#2b4c7e', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  loginBtnText: { color: '#fff', fontWeight: '700' },
});
