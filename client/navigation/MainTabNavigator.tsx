import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import MapScreen from "@/screens/MapScreen";
import { useTheme } from "@/hooks/useTheme";
import { Brand, Spacing, Shadows } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

export type MainTabParamList = {
  DiscoverTab: undefined;
  MapTab: undefined;
  PlanPlaceholder: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function PlanFAB() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      onPress={() => navigation.navigate("PlanModal")}
      style={({ pressed }) => [
        styles.fab,
        { bottom: 56 + insets.bottom / 2 },
        pressed && styles.fabPressed,
      ]}
    >
      <LinearGradient
        colors={Brand.gradient as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fabGradient}
      >
        <Feather name="plus" size={28} color="#FFFFFF" />
      </LinearGradient>
    </Pressable>
  );
}

function EmptyScreen() {
  return <View />;
}

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        initialRouteName="DiscoverTab"
        screenOptions={{
          tabBarActiveTintColor: Brand.primary,
          tabBarInactiveTintColor: theme.tabIconDefault,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: Platform.select({
              ios: "transparent",
              android: theme.backgroundRoot,
            }),
            borderTopWidth: 0,
            elevation: 0,
            height: 56 + (Platform.OS === "ios" ? 34 : 0),
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "500",
          },
          tabBarBackground: () =>
            Platform.OS === "ios" ? (
              <BlurView
                intensity={100}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : null,
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="DiscoverTab"
          component={HomeStackNavigator}
          options={{
            title: "발견",
            tabBarIcon: ({ color, size }) => (
              <Feather name="compass" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="MapTab"
          component={MapScreen}
          options={{
            title: "지도",
            tabBarIcon: ({ color, size }) => (
              <Feather name="map" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="PlanPlaceholder"
          component={EmptyScreen}
          options={{
            title: "",
            tabBarButton: () => <View style={{ width: 70 }} />,
          }}
        />
        <Tab.Screen
          name="ProfileTab"
          component={ProfileStackNavigator}
          options={{
            title: "프로필",
            tabBarIcon: ({ color, size }) => (
              <Feather name="user" size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
      <PlanFAB />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 100,
    ...Shadows.fab,
  },
  fabPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  fabGradient: {
    width: Spacing.fabSize,
    height: Spacing.fabSize,
    borderRadius: Spacing.fabSize / 2,
    justifyContent: "center",
    alignItems: "center",
  },
});
