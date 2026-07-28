import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from '../features/Auth/LoginScreen';
import SignUpScreen from '../features/Auth/SignUpScreen';
import ChangePasswordScreen from '../features/Auth/ChangePasswordScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ChangePassword: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

const AuthStack = () => {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="Login"
        component={LoginScreen}
      />

      <Stack.Screen
        name="Register"
        component={SignUpScreen}
      />

      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
      />
    </Stack.Navigator>
  );
};

export default AuthStack;