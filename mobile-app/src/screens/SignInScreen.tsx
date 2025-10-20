/**
 * Sign In Screen
 * Google OAuth authentication
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';

export default function SignInScreen({ navigation }: any) {
  const { isAuthenticated, signIn, request } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigation.replace('ServerConnection');
    }
  }, [isAuthenticated]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to Utter</Text>
        <Text style={styles.subtitle}>
          Secure cross-device text input with end-to-end encryption
        </Text>

        <TouchableOpacity
          style={[styles.button, !request && styles.buttonDisabled]}
          onPress={signIn}
          disabled={!request}
        >
          {!request ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in with Google</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 48,
    maxWidth: 300,
  },
  button: {
    backgroundColor: '#6750A4',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9E9E9E',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
