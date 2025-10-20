/**
 * Utter Mobile App
 * Cross-platform E2E encrypted text input
 */

import 'react-native-gesture-handler';
import './src/utils/cryptoPolyfill';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}
