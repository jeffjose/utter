/**
 * Device List Screen
 * Shows available devices for sending text
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useConnectionStore } from '../state/useConnectionStore';
import type { Device } from '../types/device';

export default function DeviceListScreen({ navigation }: any) {
  const { devices, isConnected, disconnect } = useConnectionStore();

  useEffect(() => {
    if (!isConnected) {
      navigation.replace('ServerConnection');
    }
  }, [isConnected]);

  const handleDevicePress = (device: Device) => {
    navigation.navigate('TextInput', {
      deviceId: device.id,
      deviceName: device.name,
      publicKey: device.publicKey,
    });
  };

  const handleDisconnect = () => {
    disconnect();
    navigation.replace('ServerConnection');
  };

  const renderDevice = ({ item }: { item: Device }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => handleDevicePress(item)}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{item.name}</Text>
        <Text style={styles.deviceType}>{item.type}</Text>
      </View>
      <View style={[styles.statusDot, item.online && styles.statusOnline]} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Device</Text>
        <TouchableOpacity onPress={handleDisconnect}>
          <Text style={styles.disconnectButton}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {devices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6750A4" />
          <Text style={styles.emptyText}>Waiting for devices...</Text>
          <Text style={styles.emptySubtext}>
            Make sure other devices are connected to the relay server
          </Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          renderItem={renderDevice}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  disconnectButton: {
    color: '#6750A4',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  deviceType: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ccc',
  },
  statusOnline: {
    backgroundColor: '#4CAF50',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
