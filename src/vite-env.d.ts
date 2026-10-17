/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** 'firebase' = no own server: AI runs through Firebase AI Logic (web version on GitHub Pages). */
  readonly VITE_AI_MODE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
