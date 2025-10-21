/**
 * Server Connection Screen
 * Connect to WebSocket relay server
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useConnectionStore } from '../state/useConnectionStore';
import { DEFAULT_WEBSOCKET_URL } from '../utils/constants';

export default function ServerConnectionScreen({ navigation }: any) {
  const { isConnected, setServerUrl, connect } = useConnectionStore();
  // Strip ws:// or wss:// prefix from default URL for display
  const displayUrl = DEFAULT_WEBSOCKET_URL.replace(/^wss?:\/\//, '');
  const [url, setUrl] = useState(displayUrl);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setIsConnecting(false);
      navigation.replace('DeviceList');
    }
  }, [isConnected]);

  const handleConnect = async () => {
    if (!url.trim()) {
      return;
    }

    // Auto-prepend ws:// if not present
    let serverUrl = url.trim();
    if (!serverUrl.startsWith('ws://') && !serverUrl.startsWith('wss://')) {
      serverUrl = `ws://${serverUrl}`;
    }

    setIsConnecting(true);
    setServerUrl(serverUrl);

    try {
      await connect();
    } catch (error) {
      console.error('Connection error:', error);
      setIsConnecting(false);
      // Could show an alert here
      return;
    }

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!isConnected) {
        setIsConnecting(false);
      }
    }, 10000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Connect to Server</Text>
        <Text style={styles.subtitle}>
          Enter your relay server address
        </Text>

        <TextInput
          style={styles.input}
          placeholder="192.168.3.189:8080"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!isConnecting}
        />

        <TouchableOpacity
          style={[styles.button, isConnecting && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Connect</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Make sure your relay server is running and accessible
        </Text>
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
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#6750A4',
    padding: 16,
    borderRadius: 8,
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
  hint: {
    marginTop: 16,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
