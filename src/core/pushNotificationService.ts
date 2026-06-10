const PUSH_NOTIFICATION_SETTINGS_KEY = 'driftlands-native-push-notifications-v1';
const PUSH_NOTIFICATION_COOLDOWNS_KEY = 'driftlands-push-notification-last-send-v1';

const DEFAULT_COOLDOWN_MS = 45 * 60 * 1000;

type NativeNotificationMethod = (...args: unknown[]) => Promise<unknown> | void;

type NativeLocalNotificationPlugin = {
  requestPermissions?: NativeNotificationMethod;
  requestPermission?: NativeNotificationMethod;
  schedule?: NativeNotificationMethod;
  cancel?: NativeNotificationMethod;
  addListener?: NativeNotificationMethod;
};

type CapacitorHost = {
  Plugins?: Record<string, NativeLocalNotificationPlugin>;
  Plugin?: Record<string, NativeLocalNotificationPlugin>;
};

type ScheduledNotification = {
  title: string;
  body: string;
  tag: string;
  delayMs: number;
  data?: Record<string, unknown>;
};

type NotificationSchedule = {
  notificationId: number;
  title: string;
  body: string;
  schedule: {
    at: Date;
  };
  extra?: {
    data?: Record<string, unknown>;
    tag?: string;
  };
};

type PushContext = 'native' | 'web' | 'disabled';

function isBrowserContext(): boolean {
  return typeof window !== 'undefined';
}

function nowMs(): number {
  return Date.now();
}

function getNowIsoDate(ms: number): string {
  return new Date(ms).toISOString();
}

function readJsonStorage<T>(key: string, fallback: T): T {
  if (!isBrowserContext() || typeof window.localStorage === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as T;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function writeJsonStorage<T>(key: string, value: T): void {
  if (!isBrowserContext() || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

class PushNotificationService {
  private readonly cooldowns = readJsonStorage<Record<string, number>>(PUSH_NOTIFICATION_COOLDOWNS_KEY, {});
  private readonly inMemoryTimers = new Map<string, number>();
  private isEnabled = true;

  isCapable(): boolean {
    return this.getContext() !== 'disabled';
  }

  isAvailable(): boolean {
    return isBrowserContext() && this.getContext() !== 'disabled';
  }

  getContext(): PushContext {
    if (!isBrowserContext()) {
      return 'disabled';
    }

    if (this.getNativePlugin()) {
      return 'native';
    }

    const NotificationCtor = (globalThis as { Notification?: Notification }).Notification;
    if (typeof NotificationCtor !== 'undefined') {
      return 'web';
    }

    return 'disabled';
  }

  async enableNotifications(): Promise<boolean> {
    if (!isBrowserContext()) {
      return false;
    }

    if (!this.isCapable()) {
      return false;
    }

    this.isEnabled = true;
    this.persistSettings();

    return this.requestPermission();
  }

  disableNotifications(): void {
    this.isEnabled = false;
    this.clearScheduled('all');
    this.persistSettings();
  }

  async requestPermission(): Promise<boolean> {
    if (!isBrowserContext() || !this.isEnabled) {
      return false;
    }

    if (this.getContext() === 'native') {
      return this.requestNativePermission();
    }

    const webPermission = await this.requestWebPermission();
    return webPermission;
  }

  async notifySeasonMilestone(params: {
    seasonId: string;
    playerId: string;
    title: string;
    body: string;
    cooldownMs?: number;
    delayMs?: number;
  }): Promise<void> {
    const key = `season-milestone:${params.seasonId}:${params.playerId}`;
    const delayMs = Math.max(0, params.delayMs ?? 0);
    const cooldownMs = params.cooldownMs ?? 30 * 60 * 1000;

    await this.schedule({
      title: params.title,
      body: params.body,
      tag: key,
      delayMs,
      data: {
        kind: 'season_milestone',
        seasonId: params.seasonId,
        playerId: params.playerId,
      },
    }, key, cooldownMs);
  }

  async notifyEvent(params: {
    eventId: string;
    title: string;
    body: string;
    cooldownMs?: number;
    delayMs?: number;
  }): Promise<void> {
    await this.schedule({
      title: params.title,
      body: params.body,
      tag: `event:${params.eventId}`,
      delayMs: Math.max(0, params.delayMs ?? 0),
      data: {
        kind: 'event',
        eventId: params.eventId,
      },
    }, `event:${params.eventId}`, params.cooldownMs ?? DEFAULT_COOLDOWN_MS);
  }

  async notifyReward(params: {
    seasonId: string;
    playerId: string;
    title: string;
    body: string;
    delayMs?: number;
  }): Promise<void> {
    const key = `reward:${params.seasonId}:${params.playerId}`;
    await this.schedule({
      title: params.title,
      body: params.body,
      tag: key,
      delayMs: Math.max(0, params.delayMs ?? 0),
      data: {
        kind: 'reward',
        seasonId: params.seasonId,
        playerId: params.playerId,
      },
    }, key, 6 * 60 * 60 * 1000);
  }

  async scheduleComebackReminder(params: {
    reminderId: string;
    title: string;
    body: string;
    delayMs: number;
  }): Promise<void> {
    await this.schedule({
      title: params.title,
      body: params.body,
      tag: `comeback:${params.reminderId}`,
      delayMs: Math.max(0, params.delayMs),
      data: {
        kind: 'comeback',
        reminderId: params.reminderId,
      },
    }, `comeback:${params.reminderId}`, 3 * 60 * 60 * 1000);
  }

  private canNotifyNow(tag: string, cooldownMs: number): boolean {
    const lastSent = this.cooldowns[tag] ?? 0;
    return nowMs() - lastSent >= cooldownMs;
  }

  private markSent(tag: string): void {
    this.cooldowns[tag] = nowMs();
    writeJsonStorage(PUSH_NOTIFICATION_COOLDOWNS_KEY, this.cooldowns);
  }

  private async schedule(payload: ScheduledNotification, cooldownKey: string, cooldownMs: number): Promise<void> {
    if (!isBrowserContext() || !this.isEnabled) {
      return;
    }

    if (!this.canNotifyNow(cooldownKey, cooldownMs)) {
      return;
    }

    const permitted = await this.requestPermission();
    if (!permitted) {
      return;
    }

    const context = this.getContext();
    if (context === 'native') {
      const scheduled = nowMs() + payload.delayMs;
      await this.scheduleNative({
        notificationId: this.buildNotificationId(payload.tag, scheduled),
        title: payload.title,
        body: payload.body,
        schedule: { at: new Date(scheduled) },
        extra: {
          data: payload.data,
          tag: payload.tag,
        },
      });
      this.markSent(cooldownKey);
      return;
    }

    this.scheduleWebNotification(payload);
    this.markSent(cooldownKey);
  }

  private scheduleWebNotification(notification: ScheduledNotification): void {
    this.clearScheduled(notification.tag);

    const notify = () => {
      try {
        const notificationCtor = (globalThis as { Notification?: Notification }).Notification;
        if (!notificationCtor) {
          return;
        }

        const options: NotificationOptions = {
          body: notification.body,
          tag: notification.tag,
          silent: false,
        };

        if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
          options.data = {
            ...notification.data,
            driftlandsNotificationId: window.crypto.randomUUID(),
            createdAt: getNowIsoDate(nowMs()),
          };
        }

        new notificationCtor(notification.title, options);
      } catch {
      }
    };

    if (notification.delayMs <= 0) {
      if (document.visibilityState !== 'visible') {
        notify();
      }
      return;
    }

    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') {
        notify();
      }
      this.inMemoryTimers.delete(notification.tag);
    }, notification.delayMs);
    this.inMemoryTimers.set(notification.tag, timer);
  }

  private clearScheduled(tag: string): void {
    if (tag !== 'all') {
      const timerId = this.inMemoryTimers.get(tag);
      if (typeof timerId === 'number') {
        window.clearTimeout(timerId);
      }
      this.inMemoryTimers.delete(tag);
      return;
    }

    for (const timerId of this.inMemoryTimers.values()) {
      window.clearTimeout(timerId);
    }
    this.inMemoryTimers.clear();
  }

  private async requestNativePermission(): Promise<boolean> {
    const plugin = this.getNativePlugin();
    if (!plugin) {
      return false;
    }

    if (typeof plugin.requestPermissions === 'function') {
      try {
        const result = await plugin.requestPermissions();
        const value = typeof result === 'object' && result !== null ? result : null;
        if (!value) {
          return true;
        }

        if ('receive' in (value as { receive?: string })) {
          return (value as { receive?: string }).receive === 'granted';
        }

        if ('granted' in (value as { granted?: boolean })) {
          return (value as { granted?: boolean }).granted === true;
        }

        if ('value' in (value as { value?: string })) {
          return (value as { value?: string }).value === 'granted';
        }

        return true;
      } catch {
        return false;
      }
    }

    if (typeof plugin.requestPermission !== 'function') {
      return true;
    }

    try {
      const result = await plugin.requestPermission();
      const value = typeof result === 'object' && result !== null ? result : null;
      if (!value) {
        return true;
      }

      if ('receive' in (value as { receive?: string })) {
        return (value as { receive?: string }).receive === 'granted';
      }

      if ('granted' in (value as { granted?: boolean })) {
        return (value as { granted?: boolean }).granted === true;
      }

      if ('value' in (value as { value?: string })) {
        return (value as { value?: string }).value === 'granted';
      }

      return true;
    } catch {
      return false;
    }
  }

  private async requestWebPermission(): Promise<boolean> {
    try {
      if (typeof Notification === 'undefined') {
        return false;
      }

      if (Notification.permission === 'granted') {
        return true;
      }
      if (Notification.permission === 'denied') {
        return false;
      }

      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }

  private async scheduleNative(notification: NotificationSchedule): Promise<void> {
    const plugin = this.getNativePlugin();
    if (!plugin || typeof plugin.schedule !== 'function') {
      return;
    }

    const payload = {
      notifications: [
        {
          id: notification.notificationId,
          title: notification.title,
          body: notification.body,
          schedule: notification.schedule,
          extra: notification.extra,
          sound: 'default',
          channelId: 'driftlands-general',
          smallIcon: 'ic_stat_icon',
        },
      ],
    };

    try {
      await plugin.schedule(payload);
    } catch {
    }
  }

  private getNativePlugin(): NativeLocalNotificationPlugin | null {
    if (!isBrowserContext()) {
      return null;
    }

    const host = (window as unknown as { Capacitor?: CapacitorHost }).Capacitor;
    if (!host) {
      return null;
    }

    return host.Plugins?.LocalNotifications
      ?? host.Plugin?.LocalNotifications
      ?? host.Plugins?.Notifications
      ?? host.Plugin?.Notifications
      ?? null;
  }

  private buildNotificationId(tag: string, at: number): number {
    let hash = 0;
    for (let i = 0; i < tag.length; i += 1) {
      hash = (hash * 31 + tag.charCodeAt(i)) & 0x7fffffff;
    }
    return Number(`${String(Math.abs(hash)).slice(0, 9)}${String(Math.max(1, (at % 1000))).padStart(3, '0')}`);
  }

  private persistSettings(): void {
    writeJsonStorage(PUSH_NOTIFICATION_SETTINGS_KEY, {
      enabled: this.isEnabled,
    });
  }

  loadSettings(): void {
    const state = readJsonStorage<{ enabled: boolean }>(PUSH_NOTIFICATION_SETTINGS_KEY, { enabled: true });
    this.isEnabled = state.enabled;
  }
}

export const pushNotificationService = new PushNotificationService();
pushNotificationService.loadSettings();

export type { PushContext };
