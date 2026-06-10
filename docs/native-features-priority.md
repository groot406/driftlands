# Native iOS/macOS Feature Priorities

## Prioritized list (performance -> graphics -> fun/experience)

1. Adaptive performance profile + battery/thermal throttling  
   Use existing `RenderConfig` and native lifecycle signals (app background/foreground, thermal state) to auto-switch quality tiers. Prevent drops on older iPads/Macs.

2. Native haptics for core feedback events  
   Add tap/impact/success haptics through native iOS APIs for UI + gameplay cues to improve game feel quickly.

3. Game Center achievements + leaderboards  
   Add auth, ranking, and challenge systems (daily streaks, best times, etc.) to boost retention and competitiveness.

4. Cloud save with iCloud/CloudKit (or signed API sync tied to Apple ID)  
   Sync progression, settings, and preferences across iOS + macOS for seamless cross-device continuation.

5. Native controller support (Game Controller / MFi / Xbox/PlayStation)  
   Add controller mappings to existing input systems for iPad and macOS gameplay improvements.

6. Advanced push notifications (event, reward, comeback loops)  
   Use local and remote notifications for daily rewards, event reminders, and re-engagement.

7. Share and save clip pipeline  
   Add native screenshot/video capture with share sheet and album integration for social sharing.

8. Native fullscreen + display/profile handling on macOS  
   Improve fullscreen/window controls, aspect behavior, scaling, and multi-display readiness for native feel.

9. Accessibility upgrades via native APIs  
   Add VoiceOver labels, Dynamic Type support, reduced motion, high-contrast, and better focus navigation.

10. Crash and performance telemetry bridge (native + web)  
    Emit native-level memory/device diagnostics and link them with in-web markers to speed optimization on real hardware.

11. Offline and background-aware networking behavior  
    Improve resilience with better queueing/retry behavior when network is weak and robust pause/resume with foreground state.

12. Native onboarding/session hardening (Sign in with Apple / biometrics)  
    Add stronger account flows and optional biometric confirmation for sensitive actions.

13. Metal-accelerated custom path (gradual migration)  
    Keep web game core but move selected heavy visuals to native acceleration where feasible for long-term graphics uplift.

14. Multiplayer-native communication features  
    Add invite/friend discovery flows using allowed native capabilities to improve social gameplay loops.
