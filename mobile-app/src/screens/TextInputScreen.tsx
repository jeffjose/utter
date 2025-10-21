/**
 * Text Input Screen
 * Main screen for typing/voice input and sending encrypted messages
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useConnectionStore } from '../state/useConnectionStore';
import { encryptMessage } from '../services/crypto/MessageEncryption';
import { AUTO_SEND_DELAY_MS } from '../utils/constants';

interface Props {
  route: {
    params: {
      deviceId: string;
      deviceName: string;
      publicKey: string;
    };
  };
  navigation: any;
}

export default function TextInputScreen({ route, navigation }: Props) {
  const { deviceId, deviceName, publicKey } = route.params;
  const { send } = useConnectionStore();

  const [text, setText] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const textInputRef = useRef<TextInput>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      textInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Auto-send countdown
  useEffect(() => {
    if (text.trim() === '') {
      setCountdown(0);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }

    const startTime = Date.now();

    countdownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / AUTO_SEND_DELAY_MS, 1);
      setCountdown(progress);

      if (progress >= 1) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        sendMessage();
      }
    }, 50);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [text]);

  const sendMessage = async () => {
    if (!text.trim() || isSending) return;

    setIsSending(true);

    try {
      // Encrypt message
      console.log('Encrypting message:', text);
      console.log('Recipient public key:', publicKey);
      const encrypted = await encryptMessage(text, publicKey);
      console.log('Encrypted result:', {
        ciphertextLength: encrypted.ciphertext.length,
        nonceLength: encrypted.nonce.length,
        ephemeralPublicKeyLength: encrypted.ephemeral_public_key.length,
      });

      // Send to relay server
      const message = {
        type: 'message',
        to: deviceId,
        encrypted: true,
        content: encrypted.ciphertext,  // Relay server expects 'content' field
        nonce: encrypted.nonce,
        ephemeralPublicKey: encrypted.ephemeral_public_key,  // camelCase for relay server
        timestamp: Date.now(),
      };
      console.log('Sending message:', JSON.stringify(message, null, 2));
      send(message);

      // Clear text and reset
      setText('');
      setCountdown(0);
      console.log('Message sent successfully');
    } catch (error) {
      console.error('Failed to send message:', error);
      console.error('Error details:', error instanceof Error ? error.stack : String(error));
    } finally {
      setIsSending(false);
    }
  };

  const cancelSend = () => {
    setText('');
    setCountdown(0);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.deviceName}>{deviceName}</Text>
      </View>

      {/* Text Input */}
      <TextInput
        ref={textInputRef}
        style={styles.textInput}
        placeholder="Start typing or use keyboard voice input..."
        placeholderTextColor="#999"
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        keyboardType="default"
        returnKeyType="default"
      />

      {/* Countdown Progress */}
      {countdown > 0 && (
        <TouchableOpacity
          onPress={cancelSend}
          style={styles.countdownContainer}
          activeOpacity={0.7}
        >
          <Text style={styles.countdownText}>
            Sending in {Math.ceil((1 - countdown) * (AUTO_SEND_DELAY_MS / 1000))}s
          </Text>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${(1 - countdown) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.cancelHint}>Tap to cancel</Text>
        </TouchableOpacity>
      )}

      {/* Instructions */}
      {text === '' && (
        <View style={styles.instructions}>
          <Text style={styles.instructionsText}>
            Type or use {Platform.OS === 'ios' ? 'keyboard' : 'Google Keyboard'} voice input
          </Text>
          <Text style={styles.instructionsSubtext}>
            Messages auto-send after 2 seconds
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  backButton: {
    fontSize: 16,
    color: '#6750A4',
    fontWeight: '600',
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 16,
    color: '#333',
  },
  textInput: {
    flex: 1,
    fontSize: 18,
    padding: 20,
    textAlignVertical: 'top',
    color: '#333',
  },
  countdownContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: '#f9f9f9',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  countdownText: {
    fontSize: 16,
    color: '#6750A4',
    fontWeight: '600',
    marginBottom: 12,
  },
  progressBarContainer: {
    width: '70%',
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6750A4',
  },
  cancelHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  instructions: {
    alignItems: 'center',
    padding: 24,
  },
  instructionsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  instructionsSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
