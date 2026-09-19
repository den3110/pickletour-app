/**
 * Example RN app sử dụng imou-rn-native.
 *
 * Demo flow:
 *   1. Mount <ImouCaptcha /> ở root (sẽ tự popup khi Imou yêu cầu Geetest)
 *   2. Login bằng phone/password — modal sẽ hiện nếu cần captcha
 *   3. List devices → user pick
 *   4. Tab: Live | Playback
 *      - Live: startLive(deviceId) → <ImouVideoView sessionId>
 *      - Playback: list recordings of today → tap → startPlayback
 *
 * Setup:
 *   yarn add imou-rn-native react-native-webview
 *   cd ios && pod install
 *   (Android tự pick up qua autolinking)
 */

import React, { useEffect, useState } from 'react';
import {
  SafeAreaView, View, Text, Button, TextInput, FlatList,
  StyleSheet, ActivityIndicator, Alert, Pressable,
} from 'react-native';
import ImouNative, {
  ImouCaptcha, ImouVideoView,
  Camera, Recording, Session,
} from 'imou-rn-native';

type Screen = 'login' | 'devices' | 'view';
type ViewMode = 'live' | 'playback';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCam, setSelectedCam] = useState<Camera | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const [session, setSession] = useState<Session | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);

  // Restore session on cold start
  useEffect(() => {
    ImouNative.isLoggedIn().then((ok) => {
      if (ok) loadDevices();
    });
    const errSub = ImouNative.onError((e) => {
      console.warn('[imou] error', e);
      Alert.alert('Stream error', `${e.code}: ${e.message}`);
    });
    return () => { errSub.remove(); };
  }, []);

  async function loadDevices() {
    setLoading(true);
    try {
      const cams = await ImouNative.listDevices();
      setCameras(cams);
      setScreen('devices');
    } catch (e: any) {
      Alert.alert('Load devices failed', `${e.message ?? e}`);
    } finally { setLoading(false); }
  }

  // ─── Login screen ─────────────────────────────────────────────────────
  if (screen === 'login') return <LoginScreen onLoggedIn={loadDevices} />;

  // ─── Devices list ─────────────────────────────────────────────────────
  if (screen === 'devices') {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.h1}>Cameras</Text>
        {loading && <ActivityIndicator />}
        <FlatList
          data={cameras}
          keyExtractor={(c) => c.deviceId}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, !item.online && { opacity: 0.4 }]}
              onPress={() => {
                setSelectedCam(item); setViewMode('live'); setScreen('view');
              }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSub}>{item.model} · {item.online ? 'online' : 'offline'}</Text>
            </Pressable>
          )}
        />
        <Button title="Log out" onPress={async () => {
          await ImouNative.logout();
          setScreen('login');
        }} />
      </SafeAreaView>
    );
  }

  // ─── View screen (Live or Playback) ───────────────────────────────────
  return (
    <ViewScreen
      cam={selectedCam!}
      mode={viewMode}
      onChangeMode={(m) => { setViewMode(m); }}
      session={session}
      setSession={setSession}
      recordings={recordings}
      setRecordings={setRecordings}
      onBack={() => {
        if (session) ImouNative.stopSession(session.sessionId).catch(() => {});
        setSession(null); setScreen('devices');
      }}
    />
  );
}

// ─── Login ────────────────────────────────────────────────────────────────
function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [areaCode, setAreaCode] = useState('84');
  const [busy, setBusy] = useState(false);

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.h1}>Imou login</Text>
      <TextInput style={styles.input} placeholder="Phone (no leading 0)"
                 value={phone} onChangeText={setPhone}
                 keyboardType="phone-pad" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Password"
                 value={password} onChangeText={setPassword}
                 secureTextEntry />
      <TextInput style={styles.input} placeholder="Area code (84)"
                 value={areaCode} onChangeText={setAreaCode}
                 keyboardType="phone-pad" />
      <Button title={busy ? '...' : 'Login'} disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await ImouNative.login({ phone, password, areaCode });
            onLoggedIn();
          } catch (e: any) {
            Alert.alert('Login failed', `${e.message ?? e}`);
          } finally { setBusy(false); }
        }} />
      {/* ImouCaptcha mounted at root — auto-shows when native fires
          `captchaRequired` event, then calls submitCaptcha. */}
      <ImouCaptcha />
    </SafeAreaView>
  );
}

// ─── View ─────────────────────────────────────────────────────────────────
interface ViewScreenProps {
  cam: Camera;
  mode: ViewMode;
  onChangeMode: (m: ViewMode) => void;
  session: Session | null;
  setSession: (s: Session | null) => void;
  recordings: Recording[];
  setRecordings: (r: Recording[]) => void;
  onBack: () => void;
}

function ViewScreen(p: ViewScreenProps) {
  // Start a session whenever mode changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (p.session) {
        await ImouNative.stopSession(p.session.sessionId).catch(() => {});
      }
      try {
        if (p.mode === 'live') {
          const s = await ImouNative.startLive(p.cam.deviceId);
          if (!cancelled) p.setSession(s);
        }
      } catch (e: any) {
        Alert.alert('Start live failed', `${e.message ?? e}`);
      }
    })();
    return () => { cancelled = true; };
  }, [p.mode, p.cam.deviceId]);

  // Load today's recordings when entering playback tab
  useEffect(() => {
    if (p.mode !== 'playback') return;
    const today = new Date().toISOString().slice(0, 10);
    ImouNative.listRecordings(p.cam.deviceId, today).then(p.setRecordings)
      .catch((e) => Alert.alert('Recordings load failed', `${e.message}`));
  }, [p.mode]);

  async function playRecording(r: Recording) {
    if (p.session) await ImouNative.stopSession(p.session.sessionId).catch(() => {});
    try {
      const s = await ImouNative.startPlayback(p.cam.deviceId, r.begin, r.end);
      p.setSession(s);
    } catch (e: any) {
      Alert.alert('Playback failed', `${e.message ?? e}`);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <Button title="←" onPress={p.onBack} />
        <Text style={styles.h2}>{p.cam.name}</Text>
        <View style={{ flexDirection: 'row' }}>
          <Pressable style={[styles.tab, p.mode === 'live' && styles.tabActive]}
            onPress={() => p.onChangeMode('live')}>
            <Text>Live</Text>
          </Pressable>
          <Pressable style={[styles.tab, p.mode === 'playback' && styles.tabActive]}
            onPress={() => p.onChangeMode('playback')}>
            <Text>Playback</Text>
          </Pressable>
        </View>
      </View>

      {p.session && (
        <ImouVideoView
          sessionId={p.session.sessionId}
          style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}
          resizeMode="contain"
        />
      )}

      {p.mode === 'playback' && (
        <FlatList
          data={p.recordings}
          keyExtractor={(r) => r.begin}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => playRecording(item)}>
              <Text style={styles.rowTitle}>
                {item.begin.slice(9, 11)}:{item.begin.slice(11, 13)}:{item.begin.slice(13, 15)}
                {' — '}{item.durationS}s
              </Text>
              <Text style={styles.rowSub}>{item.typeName}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: '#fff' },
  h1: { fontSize: 24, fontWeight: '600', marginBottom: 16 },
  h2: { fontSize: 18, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
           padding: 12, marginBottom: 12 },
  topBar: { flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 12 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
         backgroundColor: '#eee', marginLeft: 6 },
  tabActive: { backgroundColor: '#4a90e2' },
  row: { padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowSub: { fontSize: 12, color: '#888', marginTop: 2 },
});
