import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import ModalScreen from "@/screens/ModalScreen";
import PlanModalScreen from "@/screens/PlanModalScreen";
import DestinationDetailScreen from "@/screens/DestinationDetailScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type RootStackParamList = {
  Main: undefined;
  Modal: undefined;
  PlanModal: undefined;
  DestinationDetail: { placeId: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Modal"
        component={ModalScreen}
        options={{
          presentation: "modal",
          headerTitle: "Modal",
        }}
      />
      <Stack.Screen
        name="PlanModal"
        component={PlanModalScreen}
        options={{
          presentation: "modal",
          headerShown: false,
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
    </Stack.Navigator>
  );
}
