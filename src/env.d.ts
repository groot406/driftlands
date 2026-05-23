/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DRIFTLANDS_LOOPERLANDS_API_URL?: string;
  readonly VITE_DRIFTLANDS_PLATFORM_API_URL?: string;
  readonly VITE_DRIFTLANDS_REUSE_PLATFORM_SESSION?: string;
  readonly VITE_DRIFTLANDS_SERVER_URL?: string;
  readonly VITE_DRIFTLANDS_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_API_URL: string;
  readonly VITE_LOOPERLANDS_API_URL?: string;
  readonly VITE_SERVER_URL?: string;
  readonly VITE_WC_PROJECT_ID: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
