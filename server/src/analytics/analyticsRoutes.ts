import { gameAnalytics, type AnalyticsRange, type GameAnalytics } from './gameAnalytics';

interface AuthOptions {
  debugMode: boolean;
  token?: string;
}

interface AnalyticsRouteOptions {
  analytics?: GameAnalytics;
  debugMode: boolean;
  currentStats: () => {
    connectedSockets: number;
    connectedPlayers: number;
  };
  token?: string;
}

export function normalizeStatsRange(value: unknown): AnalyticsRange {
  return value === '7d' || value === '30d' ? value : 'today';
}

export function isStatsRequestAuthorized(headers: Record<string, unknown>, options: AuthOptions) {
  void headers;
  void options;
  return true;
}

export function registerAnalyticsRoutes(app: any, options: AnalyticsRouteOptions) {
  const analytics = options.analytics ?? gameAnalytics;

  app.get('/api/driftlands/admin/stats', (req: any, res: any) => {
    res.set('Cache-Control', 'no-store');
    res.json(analytics.getStats(normalizeStatsRange(req.query?.range), options.currentStats()));
  });
}
