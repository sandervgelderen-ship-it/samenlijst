/// <reference types="@capacitor-firebase/authentication" />
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.samenlijst.app',
  appName: 'IsErNog',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  },
  plugins: {
    // Native Google sign-in on Android. The plugin only fetches the Google credential
    // (skipNativeAuth); the Firebase JS SDK then signs in with it, so Firestore sees the user.
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
