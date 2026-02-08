import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TripPlannerScreen from "@/screens/TripPlannerScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type HomeStackParamList = {
  Home: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Home"
        component={TripPlannerScreen}
        options={{
          headerTitle: () => <HeaderTitle title="VibeTrip" showIcon />,
        }}
      />
    </Stack.Navigator>
  );
}
