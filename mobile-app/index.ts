// IMPORTANT: Install crypto polyfill FIRST, before any other imports
// This provides crypto.randomBytes() and other crypto APIs for tweetnacl
import 'react-native-quick-crypto';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
