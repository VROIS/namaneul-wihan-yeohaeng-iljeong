import React from "react";
import { Platform, useColorScheme } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import DestinationDetailScreen from "@/screens/DestinationDetailScreen";
import OnboardingScreen from "@/screens/OnboardingScreen";
import VerificationRequestScreen from "@/screens/VerificationRequestScreen";
import SavedTripDetailScreen from "@/screens/SavedTripDetailScreen";
import AdminScreen from "@/screens/AdminScreen";
import { Colors } from "@/constants/theme";
import { Itinerary } from "@/types/trip";

export type RootStackParamList = {
  Main: undefined;
  Onboarding: undefined;
  DestinationDetail: { placeId: number };
  VerificationRequest: { itinerary: Itinerary };
  SavedTripDetail: { itineraryId: number };
  AdminModal: undefined;
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
      <Stack.Screen
        name="SavedTripDetail"
        component={SavedTripDetailScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
      {/* 관리자 대시보드 (전체화면 모달) */}
      <Stack.Screen
        name="AdminModal"
        component={AdminScreen}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          animation: "slide_from_bottom",
        }}
      />
    </Stack.Navigator>
  );
}
