import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import {
  testCryptoRoundtrip,
  testUtterdCompatibility,
  generateX25519KeyPair,
} from './CryptoTest';

export default function App() {
  const [logs, setLogs] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<'idle' | 'running' | 'success' | 'failure'>('idle');
  const [utterdPublicKey, setUtterdPublicKey] = useState('');

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, message]);
  };

  const clearLogs = () => {
    setLogs([]);
    setTestResult('idle');
  };

  // Override console.log to capture logs
  const originalLog = console.log;
  console.log = (...args) => {
    originalLog(...args);
    const message = args.map((arg) => String(arg)).join(' ');
    addLog(message);
  };

  const runRoundtripTest = async () => {
    clearLogs();
    setTestResult('running');
    addLog('Starting crypto roundtrip test...\n');

    try {
      const success = await testCryptoRoundtrip();
      setTestResult(success ? 'success' : 'failure');
    } catch (error) {
      addLog(`ERROR: ${error}`);
      setTestResult('failure');
    }
  };

  const runKeyGenerationTest = async () => {
    clearLogs();
    setTestResult('running');
    addLog('Testing X25519 key generation...\n');

    try {
      const keyPair = await generateX25519KeyPair();
      addLog(`\nPublic Key: ${keyPair.publicKey}`);
      addLog(`Private Key: ${keyPair.privateKey.substring(0, 20)}... (truncated)`);
      addLog('\n✅ Key generation successful!');
      setTestResult('success');
    } catch (error) {
      addLog(`ERROR: ${error}`);
      setTestResult('failure');
    }
  };

  const runUtterdCompatibilityTest = async () => {
    clearLogs();
    setTestResult('running');
    addLog('Testing utterd compatibility...\n');

    try {
      await testUtterdCompatibility(utterdPublicKey || undefined);
      setTestResult('success');
    } catch (error) {
      addLog(`ERROR: ${error}`);
      setTestResult('failure');
    }
  };

  const getStatusColor = () => {
    switch (testResult) {
      case 'running':
        return '#FFA500';
      case 'success':
        return '#4CAF50';
      case 'failure':
        return '#F44336';
      default:
        return '#666';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🔐 Crypto Spike</Text>
        <Text style={styles.subtitle}>Phase 0: X25519 + AES-GCM Test</Text>
        <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
      </View>

      {/* Test Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={runKeyGenerationTest}>
          <Text style={styles.buttonText}>1️⃣ Test Key Generation</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={runRoundtripTest}>
          <Text style={styles.buttonText}>2️⃣ Test Roundtrip</Text>
        </TouchableOpacity>

        <View style={styles.utterdSection}>
          <Text style={styles.label}>Utterd Public Key (optional):</Text>
          <TextInput
            style={styles.input}
            placeholder="Base64 public key..."
            value={utterdPublicKey}
            onChangeText={setUtterdPublicKey}
            multiline
          />
          <TouchableOpacity style={styles.button} onPress={runUtterdCompatibilityTest}>
            <Text style={styles.buttonText}>3️⃣ Test Utterd Compat</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.clearButton} onPress={clearLogs}>
          <Text style={styles.clearButtonText}>Clear Logs</Text>
        </TouchableOpacity>
      </View>

      {/* Logs Display */}
      <ScrollView style={styles.logsContainer}>
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>Tap a button above to run tests</Text>
        ) : (
          logs.map((log, index) => (
            <Text key={index} style={styles.logText}>
              {log}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 50,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 10,
  },
  buttonContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  button: {
    backgroundColor: '#6750A4',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: '#E0E0E0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  utterdSection: {
    marginTop: 12,
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  logsContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: '#1e1e1e',
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
  },
  logText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});
