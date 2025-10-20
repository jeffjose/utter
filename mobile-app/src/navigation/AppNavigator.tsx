/**
 * App Navigator
 * Main navigation structure
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SignInScreen from '../screens/SignInScreen';
import ServerConnectionScreen from '../screens/ServerConnectionScreen';
import DeviceListScreen from '../screens/DeviceListScreen';
import TextInputScreen from '../screens/TextInputScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="SignIn"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="ServerConnection" component={ServerConnectionScreen} />
        <Stack.Screen name="DeviceList" component={DeviceListScreen} />
        <Stack.Screen name="TextInput" component={TextInputScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
