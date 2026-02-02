import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";

import { queryClient } from "@/lib/query-client";
import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MapToggleProvider } from "@/contexts/MapToggleContext";

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MapToggleProvider>
          <SafeAreaProvider>
            <GestureHandlerRootView style={styles.root}>
              <KeyboardProvider>
                <NavigationContainer>
                  <RootStackNavigator />
                </NavigationContainer>
                <StatusBar style="auto" />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </MapToggleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
