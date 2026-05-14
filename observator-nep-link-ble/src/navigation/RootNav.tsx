
import React from 'react';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import IonIcon from '@react-native-vector-icons/ionicons';
import { lightColors } from '@rneui/themed';

// Import screens
import Devices from '../features/Devices';
import DeviceView from '../features/Devices/DeviceView';
import LoggingSessions from '../features/LoggingSessions';
import LoggingSessionView from '../features/LoggingSessions/LoggingSessionView';
import ImageCarousel from '../features/LoggingSessions/ImageCarousel';
import AboutScreen from '../features/About';

// Type definitions
export type DevicesStackParamList = {
  DevicesList: undefined;
  DeviceView: {
    deviceId?: string;
    deviceName?: string;
    deviceDataObj?: any;
    demoModeEnabled?: boolean;
  };
};

export type LoggingStackParamList = {
  LoggingSessionsList: undefined;
  LoggingSessionView: {
    loggingSessionId: string;
  };
  ImageCarousel: {
    images: Array<{
      imageType: 'map' | 'photo';
      path: string;
    }>;
    index: number;
  };
};

export type AboutStackParamList = {
  AboutScreen: undefined;
};

export type RootTabParamList = {
  DevicesTab: undefined;
  LoggingSessionsTab: undefined;
  AboutTab: undefined;
};

// Create navigators
const DevicesStack = createNativeStackNavigator<DevicesStackParamList>();
const LoggingStack = createNativeStackNavigator<LoggingStackParamList>();
const AboutStack = createNativeStackNavigator<AboutStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

// Stack Navigators
const DevicesNavigator: React.FC = () => {
  return (
    <DevicesStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: lightColors.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '500', color: '#fff' },
      }}
    >
      <DevicesStack.Screen
        name="DevicesList"
        component={Devices}
        options={{ title: 'Devices' }}
      />
      <DevicesStack.Screen
        name="DeviceView"
        component={DeviceView}
        options={({ route }) => ({
          title: route.params?.deviceName
            ? `Connected to ${route.params.deviceName}`
            : 'Device View',
        })}
      />
    </DevicesStack.Navigator>
  );
};

const LoggingNavigator: React.FC = () => {
  return (
    <LoggingStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: lightColors.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '500', color: '#fff' },
      }}
    >
      <LoggingStack.Screen
        name="LoggingSessions"
        component={LoggingSessions}
        options={{ title: 'Logging Sessions' }}
      />
      <LoggingStack.Screen
        name="LoggingSessionView"
        component={LoggingSessionView}
        options={({ route }) => ({
          title: route.params?.formattedDateTime
            ? `Session: ${route.params.formattedDateTime}`
            : 'Logging Session',
          headerTitleStyle: {
            fontWeight: '500',
            fontSize: 13,
            color: '#fff',
          },
        })}
      />
      <LoggingStack.Screen
        name="ImageCarousel"
        component={ImageCarousel}
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'fade',
        }}
      />
    </LoggingStack.Navigator>
  );
};

const AboutNavigator: React.FC = () => {
  return (
    <AboutStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: lightColors.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '500', color: '#fff' },
      }}
    >
      <AboutStack.Screen
        name="AboutScreen"
        component={AboutScreen}
        options={{ title: 'About' }}
      />
    </AboutStack.Navigator>
  );
};

// Tab bar icon component
const getTabBarIcon = (routeName: keyof RootTabParamList): string => {
  switch (routeName) {
    case 'DevicesTab':
      return 'thermometer';
    case 'LoggingSessionsTab':
      return 'list';
    case 'AboutTab':
      return 'information';
    default:
      return 'help';
  }
};

// Main Navigation Container
const NavContainer: React.FC = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            const iconName = getTabBarIcon(route.name);
            return <IonIcon name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.6)',
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarStyle: styles.tabBar,
          headerShown: false,
        })}
      >
        <Tab.Screen
          name="DevicesTab"
          component={DevicesNavigator}
          options={{ tabBarLabel: 'Devices' }}
        />
        <Tab.Screen
          name="LoggingSessionsTab"
          component={LoggingNavigator}
          options={{ tabBarLabel: 'Sessions' }}
        />
        <Tab.Screen
          name="AboutTab"
          component={AboutNavigator}
          options={{ tabBarLabel: 'About' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: lightColors.primary,
    borderTopWidth: 0,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default NavContainer;
