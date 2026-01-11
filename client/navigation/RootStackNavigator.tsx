import React from "react";
import { Platform, useColorScheme } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import DestinationDetailScreen from "@/screens/DestinationDetailScreen";
import OnboardingScreen from "@/screens/OnboardingScreen";
import VerificationRequestScreen from "@/screens/VerificationRequestScreen";
import { Colors } from "@/constants/theme";
import { Itinerary } from "@/types/trip";

export type RootStackParamList = {
  Main: undefined;
  Onboarding: undefined;
  DestinationDetail: { placeId: number };
  VerificationRequest: { itinerary: Itinerary };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "light"];

  return (
    <Stack.Navigator
      screenOptions={{
        headerTitleAlign: "center",
        headerTransparent: true,
        headerBlurEffect: isDark ? "dark" : "light",
        headerTintColor: theme.text,
        headerStyle: {
          backgroundColor: Platform.select({
            ios: undefined,
            android: theme.backgroundRoot,
            web: theme.backgroundRoot,
          }),
        },
        gestureEnabled: true,
        gestureDirection: "horizontal",
        fullScreenGestureEnabled: Platform.OS === "ios",
        contentStyle: {
          backgroundColor: theme.backgroundRoot,
        },
      }}
    >
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="DestinationDetail"
        component={DestinationDetailScreen}
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="VerificationRequest"
        component={VerificationRequestScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}
